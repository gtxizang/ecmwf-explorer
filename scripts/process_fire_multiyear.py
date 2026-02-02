#!/usr/bin/env python3
"""
Process Fire Burned Area data (2019-2023) into a multi-year Zarr pyramid.
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
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Years to process
START_YEAR = 2019
END_YEAR = 2023

# Pyramid levels
LEVELS = {
    0: 256,
    1: 512,
    2: 1024,
    3: 2048,
}

def extract_and_load_nc(zip_path):
    """Extract NC file from zip and load it."""
    with tempfile.TemporaryDirectory() as tmpdir:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            # Find the NC file
            nc_files = [f for f in zf.namelist() if f.endswith('.nc')]
            if not nc_files:
                return None

            # Extract and load
            zf.extract(nc_files[0], tmpdir)
            nc_path = Path(tmpdir) / nc_files[0]
            ds = xr.open_dataset(nc_path)

            # Get burned_area and load into memory
            if 'burned_area' in ds:
                data = ds['burned_area'].values.copy()
                ds.close()
                return data

    return None

def load_all_years():
    """Load and stack all years/months of fire data."""
    print("Loading fire data files...")

    all_data = []
    years_loaded = []

    for year in range(START_YEAR, END_YEAR + 1):
        year_data = []

        for month in range(1, 13):
            zip_path = DATA_DIR / f"fire_burned_area_{year}_{month:02d}.zip"

            if not zip_path.exists():
                print(f"  SKIPPING: {zip_path} not found")
                # Add NaN placeholder
                year_data.append(None)
                continue

            data = extract_and_load_nc(zip_path)
            if data is not None:
                # Should be shape (1, 720, 1440) - squeeze to (720, 1440)
                if len(data.shape) == 3:
                    data = data[0]
                year_data.append(data)
            else:
                year_data.append(None)

        # Check if we have any valid data for this year
        valid_months = [d for d in year_data if d is not None]
        if valid_months:
            # Create year array with NaN for missing months
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

    print(f"Combined shape: {combined.shape}")
    print(f"Years: {min(years_loaded)} - {max(years_loaded)}")
    print(f"Data range: {np.nanmin(combined):.2f} - {np.nanmax(combined):.2f}")

    return combined, years_loaded

def create_pyramid_level(data, target_y, target_x):
    """Downsample data to target resolution."""
    current_y, current_x = data.shape[-2:]

    if current_y == target_y and current_x == target_x:
        return data

    # Calculate zoom factors
    zoom_y = target_y / current_y
    zoom_x = target_x / current_x

    # Create output array
    n_years, n_months = data.shape[:2]
    result = np.zeros((n_years, n_months, target_y, target_x), dtype=np.float32)

    # Downsample each slice
    total_slices = n_years * n_months
    done = 0
    for y_idx in range(n_years):
        for m_idx in range(n_months):
            slice_data = data[y_idx, m_idx]
            if np.isnan(slice_data).all():
                result[y_idx, m_idx] = np.nan
            else:
                result[y_idx, m_idx] = zoom(slice_data, (zoom_y, zoom_x), order=1)
            done += 1
            if done % 20 == 0:
                print(f"    Progress: {done}/{total_slices} slices")

    return result

def create_zarr_pyramid(data, years_list):
    """Create multi-resolution Zarr pyramid."""
    print("\nCreating Zarr pyramid...")

    # Ensure float32
    values = data.astype(np.float32)

    n_years, n_months, height, width = values.shape
    print(f"Input shape: {values.shape} (years, months, y, x)")

    # Calculate aspect ratio
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
        arr_path = level_dir / 'burned_area'
        if arr_path.exists():
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
    import json
    metadata = {
        'crs': 'EPSG:4326',
        'bounds': [-180, -90, 180, 90],
        'years': years_list,
        'n_years': n_years,
        'variable': 'burned_area',
        'unit': 'm²',
        'description': 'C3S/OLCI Fire Burned Area (2019-2023)',
    }

    with open(OUTPUT_DIR / '.zattrs', 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"\nPyramid saved to: {OUTPUT_DIR}")

def main():
    print("="*60)
    print("Fire Burned Area Multi-Year Pyramid Generation")
    print("="*60)

    # Load all years
    data, years_list = load_all_years()

    # Create pyramid
    create_zarr_pyramid(data, years_list)

    print("\n" + "="*60)
    print("COMPLETE!")
    print("="*60)

if __name__ == "__main__":
    main()
