#!/usr/bin/env python3
"""
Process Fire Burned Area data (2019-2023) into a multi-year Zarr pyramid.
FIXED: Proper coordinate handling and land masking.
"""

import xarray as xr
import numpy as np
from pathlib import Path
import zarr
from scipy.ndimage import zoom
import zipfile
import tempfile
import shutil
import warnings

warnings.filterwarnings('ignore')

# Configuration
DATA_DIR = Path(__file__).parent.parent / "data" / "raw" / "fire_burned_area"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "pyramids" / "fire_multiyear"

# Years to process
START_YEAR = 2019
END_YEAR = 2023

# Pyramid levels - height values, width will be 2x
LEVELS = {
    0: 256,
    1: 512,
    2: 1024,
    3: 2048,
}

def extract_and_load_nc(zip_path):
    """Extract NC file from zip and load it with coordinates."""
    with tempfile.TemporaryDirectory() as tmpdir:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            nc_files = [f for f in zf.namelist() if f.endswith('.nc')]
            if not nc_files:
                return None, None, None

            zf.extract(nc_files[0], tmpdir)
            nc_path = Path(tmpdir) / nc_files[0]
            ds = xr.open_dataset(nc_path)

            if 'burned_area' in ds:
                data = ds['burned_area'].values.copy()
                # Get coordinates
                lats = ds['lat'].values if 'lat' in ds else ds['latitude'].values
                lons = ds['lon'].values if 'lon' in ds else ds['longitude'].values
                ds.close()
                return data, lats, lons

    return None, None, None


def create_land_mask(lats, lons):
    """Create a simple land mask based on known ocean regions.
    This is a rough approximation - ocean is generally:
    - Most areas below -60 lat (Antarctica/Southern Ocean)
    - Most areas above 85 lat (Arctic Ocean)
    - Specific ocean basins based on lon/lat combinations
    """
    height, width = len(lats), len(lons)
    mask = np.ones((height, width), dtype=bool)  # Start with all land

    # Create meshgrid for efficient masking
    lon_grid, lat_grid = np.meshgrid(lons, lats)

    # Antarctica - mostly ocean/ice
    mask[lat_grid < -60] = False

    # Arctic Ocean (rough approximation)
    mask[lat_grid > 85] = False

    # Atlantic Ocean (rough west/east bounds)
    atlantic_mask = (
        (lon_grid > -80) & (lon_grid < 0) &
        (lat_grid > -60) & (lat_grid < 60) &
        ~((lat_grid > 35) & (lat_grid < 45) & (lon_grid > -10))  # Not Mediterranean entrance
    )
    # Only mask where there's significant ocean
    mask[atlantic_mask & (lat_grid < 0) & (lon_grid < -30)] = False  # South Atlantic
    mask[atlantic_mask & (lat_grid > 45) & (lon_grid < -10)] = False  # North Atlantic

    # Pacific Ocean
    pacific_west = (lon_grid > 100) | (lon_grid < -100)
    pacific_mask = pacific_west & (lat_grid > -60) & (lat_grid < 60)
    # Be more conservative - only mask obvious ocean areas
    mask[pacific_mask & (np.abs(lon_grid) > 150)] = False

    # Indian Ocean
    indian_mask = (lon_grid > 40) & (lon_grid < 100) & (lat_grid < 0) & (lat_grid > -60)
    mask[indian_mask & (lat_grid < -10)] = False

    return mask


def load_all_years():
    """Load and stack all years/months of fire data."""
    print("Loading fire data files...")

    all_data = []
    years_loaded = []
    lats = None
    lons = None

    for year in range(START_YEAR, END_YEAR + 1):
        year_data = []

        for month in range(1, 13):
            zip_path = DATA_DIR / f"fire_burned_area_{year}_{month:02d}.zip"

            if not zip_path.exists():
                print(f"  SKIPPING: {zip_path} not found")
                year_data.append(None)
                continue

            data, file_lats, file_lons = extract_and_load_nc(zip_path)
            if data is not None:
                if lats is None:
                    lats = file_lats
                    lons = file_lons
                    print(f"  Coordinates: lat [{lats[0]:.2f} to {lats[-1]:.2f}], lon [{lons[0]:.2f} to {lons[-1]:.2f}]")

                # Should be shape (1, 720, 1440) - squeeze to (720, 1440)
                if len(data.shape) == 3:
                    data = data[0]
                year_data.append(data)
            else:
                year_data.append(None)

        # Check if we have any valid data for this year
        valid_months = [d for d in year_data if d is not None]
        if valid_months:
            height, width = valid_months[0].shape
            year_array = np.full((12, height, width), np.nan, dtype=np.float32)

            for i, d in enumerate(year_data):
                if d is not None:
                    year_array[i] = d

            all_data.append(year_array)
            years_loaded.append(year)
            print(f"  Loaded {year}: {sum(1 for d in year_data if d is not None)}/12 months")

    if not all_data:
        raise ValueError("No fire data found!")

    # Stack all years: shape (n_years, 12, 720, 1440)
    print(f"Stacking {len(all_data)} years of data...")
    combined = np.stack(all_data, axis=0)

    # Apply land mask to remove ocean artifacts
    print("Creating land mask...")
    land_mask = create_land_mask(lats, lons)
    print(f"  Land pixels: {land_mask.sum()} / {land_mask.size} ({100*land_mask.sum()/land_mask.size:.1f}%)")

    # Apply mask - set ocean pixels to 0
    print("Applying land mask...")
    for y_idx in range(combined.shape[0]):
        for m_idx in range(combined.shape[1]):
            combined[y_idx, m_idx][~land_mask] = 0

    print(f"Combined shape: {combined.shape}")
    print(f"Years: {min(years_loaded)} - {max(years_loaded)}")
    print(f"Data range: {np.nanmin(combined):.2f} - {np.nanmax(combined):.2f}")

    return combined, years_loaded, lats, lons


def create_pyramid_level(data, target_y, target_x):
    """Downsample data to target resolution."""
    current_y, current_x = data.shape[-2:]

    if current_y == target_y and current_x == target_x:
        return data

    zoom_y = target_y / current_y
    zoom_x = target_x / current_x

    n_years, n_months = data.shape[:2]
    result = np.zeros((n_years, n_months, target_y, target_x), dtype=np.float32)

    total_slices = n_years * n_months
    done = 0
    for y_idx in range(n_years):
        for m_idx in range(n_months):
            slice_data = data[y_idx, m_idx]
            if np.isnan(slice_data).all():
                result[y_idx, m_idx] = np.nan
            else:
                # Use order=0 (nearest neighbor) to avoid spreading values into ocean
                result[y_idx, m_idx] = zoom(slice_data, (zoom_y, zoom_x), order=0)
            done += 1
            if done % 20 == 0:
                print(f"    Progress: {done}/{total_slices} slices")

    return result


def create_zarr_pyramid(data, years_list, lats, lons):
    """Create multi-resolution Zarr pyramid."""
    print("\nCreating Zarr pyramid...")

    # Clear output directory
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    values = data.astype(np.float32)
    n_years, n_months, height, width = values.shape
    print(f"Input shape: {values.shape} (years, months, y, x)")

    aspect = width / height

    for level, target_h in LEVELS.items():
        target_w = int(target_h * aspect)
        level_dir = OUTPUT_DIR / str(level)
        level_dir.mkdir(exist_ok=True)

        print(f"\nLevel {level}: {target_h}x{target_w}")

        if height != target_h:
            level_data = create_pyramid_level(values, target_h, target_w)
        else:
            level_data = values

        # Create Zarr array with v2 format
        arr_path = level_dir / 'burned_area'
        if arr_path.exists():
            shutil.rmtree(arr_path)

        arr = zarr.open(
            str(arr_path),
            mode='w',
            shape=level_data.shape,
            chunks=(1, 1, target_h, target_w),
            dtype=np.float32,
        )
        arr[:] = level_data

        # Write level .zgroup and .zattrs
        import json
        with open(level_dir / '.zgroup', 'w') as f:
            json.dump({'zarr_format': 2}, f)
        with open(level_dir / '.zattrs', 'w') as f:
            json.dump({'level': level}, f)

        print(f"  Saved: {arr_path}")
        print(f"  Shape: {level_data.shape}")
        print(f"  Data range: {np.nanmin(level_data):.2f} - {np.nanmax(level_data):.2f}")

    # Write root metadata
    import json

    # Determine actual bounds from coordinates
    lat_min, lat_max = float(lats.min()), float(lats.max())
    lon_min, lon_max = float(lons.min()), float(lons.max())

    metadata = {
        'zarr_format': 2,
        'crs': 'EPSG:4326',
        'bounds': [lon_min, lat_min, lon_max, lat_max],
        'years': years_list,
        'n_years': n_years,
        'variable': 'burned_area',
        'unit': 'm²',
        'description': 'C3S/OLCI Fire Burned Area (2019-2023)',
    }

    with open(OUTPUT_DIR / '.zattrs', 'w') as f:
        json.dump(metadata, f, indent=2)
    with open(OUTPUT_DIR / '.zgroup', 'w') as f:
        json.dump({'zarr_format': 2}, f)

    print(f"\nPyramid saved to: {OUTPUT_DIR}")
    print(f"Bounds: {metadata['bounds']}")


def main():
    print("="*60)
    print("Fire Burned Area Multi-Year Pyramid Generation (FIXED)")
    print("="*60)

    data, years_list, lats, lons = load_all_years()
    create_zarr_pyramid(data, years_list, lats, lons)

    print("\n" + "="*60)
    print("COMPLETE!")
    print("="*60)


if __name__ == "__main__":
    main()
