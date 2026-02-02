#!/usr/bin/env python3
"""
Process ERA5 radiation data (1950-2024) into a multi-year Zarr pyramid.
Uses ssrd (Surface Solar Radiation Downwards) as the primary variable.
"""

import xarray as xr
import numpy as np
from pathlib import Path
import zarr
from numcodecs import Blosc
import rioxarray
from pyproj import CRS
import warnings

warnings.filterwarnings('ignore')

# Configuration
DATA_DIR = Path(__file__).parent.parent / "data" / "raw" / "ceres_radiation"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "pyramids" / "radiation_multiyear"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Years to process (what we have downloaded)
START_YEAR = 1950
END_YEAR = 2024

# Pyramid levels (resolution pyramid)
# Level 0 = coarsest (256x256), Level 4 = finest (4096x4096)
LEVELS = {
    0: 256,
    1: 512,
    2: 1024,
    3: 2048,
}

def load_all_years():
    """Load and concatenate all years of radiation data."""
    print("Loading radiation data files...")

    all_data = []
    years_loaded = []

    for year in range(START_YEAR, END_YEAR + 1):
        file_path = DATA_DIR / f"era5_radiation_{year}.nc"

        if not file_path.exists():
            # Skip years not available as individual files
            if year >= 2020:
                continue  # Will load from combined file
            print(f"  SKIPPING: {file_path} not found")
            continue

        ds = xr.open_dataset(file_path)

        # Use surface solar radiation downwards (ssrd)
        if 'ssrd' in ds:
            data = ds['ssrd'].values  # Get numpy array directly
        elif 'tisr' in ds:
            data = ds['tisr'].values
        else:
            print(f"  SKIPPING: No radiation variable found in {file_path}")
            continue

        # Should be shape (12, 721, 1440) - 12 months
        if data.shape[0] != 12:
            print(f"  WARNING: {year} has {data.shape[0]} time steps, expected 12")
            continue

        all_data.append(data)
        years_loaded.append(year)

        if len(all_data) % 10 == 0:
            print(f"  Loaded {len(all_data)} years...")

    # Try loading combined file for recent years (2020-2024)
    combined_file = DATA_DIR / "era5_radiation_2020-2024.nc"
    if combined_file.exists():
        print(f"  Loading combined file for 2020-2024...")
        ds = xr.open_dataset(combined_file)
        if 'ssrd' in ds:
            data = ds['ssrd'].values

            # Split into years (60 months -> 5 years of 12 months)
            for i, year in enumerate(range(2020, 2025)):
                if year in years_loaded:
                    continue
                start_idx = i * 12
                end_idx = start_idx + 12
                if end_idx <= data.shape[0]:
                    year_data = data[start_idx:end_idx]
                    all_data.append(year_data)
                    years_loaded.append(year)
                    print(f"  Added {year} from combined file")

    if not all_data:
        raise ValueError("No radiation data found!")

    # Stack all years: shape (n_years, 12, 721, 1440)
    print(f"Stacking {len(all_data)} years of data...")
    combined = np.stack(all_data, axis=0)

    print(f"Combined shape: {combined.shape}")
    print(f"Years: {min(years_loaded)} - {max(years_loaded)}")
    print(f"Data range: {np.nanmin(combined):.2f} - {np.nanmax(combined):.2f}")

    # Return as xarray for easier reprojection
    ds = xr.DataArray(
        combined,
        dims=['year', 'month', 'latitude', 'longitude'],
        coords={
            'year': years_loaded,
            'month': np.arange(12),
            'latitude': np.linspace(90, -90, 721),
            'longitude': np.linspace(-180, 180, 1440),
        }
    )

    return ds

def reproject_to_mercator(data):
    """Reproject data from WGS84 to Web Mercator (EPSG:3857)."""
    print("Reprojecting to Web Mercator...")
    print(f"  Input dims: {data.dims}")
    print(f"  Input coords: {list(data.coords)}")

    # Set CRS if not already set
    if 'spatial_ref' not in data.coords:
        data = data.rio.write_crs("EPSG:4326")

    # Rename dims if needed
    if 'latitude' in data.dims:
        data = data.rename({'latitude': 'y', 'longitude': 'x'})
    elif 'lat' in data.dims:
        data = data.rename({'lat': 'y', 'lon': 'x'})

    # Set spatial dims
    data = data.rio.set_spatial_dims(x_dim='x', y_dim='y')

    print(f"  Reprojecting {data.shape} to EPSG:3857...")

    # Reproject to target resolution
    target_size = LEVELS[max(LEVELS.keys())]  # Use finest level as target
    data_mercator = data.rio.reproject(
        "EPSG:3857",
        shape=(target_size, target_size * 2),  # Global aspect ratio ~2:1
        resampling=1,  # Bilinear
    )

    print(f"  Output shape: {data_mercator.shape}")

    return data_mercator

def create_pyramid_level(data, target_y, target_x):
    """Downsample data to target resolution."""
    from scipy.ndimage import zoom

    current_y, current_x = data.shape[-2:]

    if current_y == target_y and current_x == target_x:
        return data

    # Calculate zoom factors for spatial dimensions only
    zoom_y = target_y / current_y
    zoom_x = target_x / current_x

    # Create output array
    n_years, n_months = data.shape[:2]
    result = np.zeros((n_years, n_months, target_y, target_x), dtype=np.float32)

    # Downsample each year/month slice
    total_slices = n_years * n_months
    done = 0
    for y_idx in range(n_years):
        for m_idx in range(n_months):
            slice_data = data[y_idx, m_idx]
            if hasattr(slice_data, 'values'):
                slice_data = slice_data.values
            if np.isnan(slice_data).all():
                result[y_idx, m_idx] = np.nan
            else:
                result[y_idx, m_idx] = zoom(slice_data, (zoom_y, zoom_x), order=1)
            done += 1
            if done % 100 == 0:
                print(f"    Progress: {done}/{total_slices} slices")

    return result

def create_zarr_pyramid(data, years_list):
    """Create multi-resolution Zarr pyramid."""
    print("\nCreating Zarr pyramid...")

    # Convert to numpy if needed
    if hasattr(data, 'values'):
        values = data.values
    else:
        values = data

    # Ensure float32 and handle NaN
    values = values.astype(np.float32)

    # Get shape info
    n_years, n_months, height, width = values.shape
    print(f"Input shape: {values.shape} (years, months, y, x)")

    compressor = Blosc(cname='lz4', clevel=5, shuffle=Blosc.SHUFFLE)

    # Calculate aspect ratio (global = 2:1)
    aspect = width / height

    for level, target_h in LEVELS.items():
        target_w = int(target_h * aspect)
        level_dir = OUTPUT_DIR / str(level)
        level_dir.mkdir(exist_ok=True)

        print(f"\nLevel {level}: {target_h}x{target_w}")

        # Downsample if needed
        if height != target_h:
            level_data = create_pyramid_level(values, target_h, target_w)
        else:
            level_data = values

        # Create Zarr array
        arr_path = level_dir / 'solar_radiation'
        if arr_path.exists():
            import shutil
            shutil.rmtree(arr_path)

        # Zarr 3.x compatible saving
        arr = zarr.open(
            str(arr_path),
            mode='w',
            shape=level_data.shape,
            chunks=(1, 1, target_h, target_w),
            dtype=np.float32,
        )
        arr[:] = level_data

        print(f"  Saved: {arr_path}")
        print(f"  Shape: {level_data.shape}")
        print(f"  Data range: {np.nanmin(level_data):.2f} - {np.nanmax(level_data):.2f}")

    # Write metadata
    metadata = {
        'crs': 'EPSG:4326',  # Keep in WGS84 for now
        'bounds': [-180, -90, 180, 90],
        'years': years_list,
        'n_years': n_years,
        'variable': 'solar_radiation',
        'unit': 'J/m²',
        'description': 'ERA5 Surface Solar Radiation Downwards (1950-2024)',
    }

    import json
    with open(OUTPUT_DIR / '.zattrs', 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"\nPyramid saved to: {OUTPUT_DIR}")

def main():
    print("="*60)
    print("ERA5 Radiation Multi-Year Pyramid Generation")
    print("="*60)

    # Load all years
    data = load_all_years()

    # Get years list
    years_list = list(data.coords['year'].values)

    # Convert to numpy array
    values = data.values

    # Create pyramid (no reprojection for speed - data is already in lat/lon)
    create_zarr_pyramid(values, years_list)

    print("\n" + "="*60)
    print("COMPLETE!")
    print("="*60)

if __name__ == "__main__":
    main()
