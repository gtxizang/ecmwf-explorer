#!/usr/bin/env python3
"""
Process NASA CERES EBAF satellite radiation data (2020-2024) into a Zarr pyramid.
This is true satellite-derived data as specified in the tender.
"""

import xarray as xr
import numpy as np
from pathlib import Path
import zarr
import warnings
import re

warnings.filterwarnings('ignore')

# Configuration
DATA_DIR = Path(__file__).parent.parent / "data" / "raw" / "satellite_radiation"
OUTPUT_DIR = Path(__file__).parent.parent / "data" / "pyramids" / "satellite_radiation"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Years we downloaded (full CERES EBAF availability)
START_YEAR = 2000
END_YEAR = 2025

# Pyramid levels - CERES is 1° (180x360), so we use smaller pyramids
LEVELS = {
    0: 128,   # Very coarse overview
    1: 256,   # Coarse
    2: 512,   # Medium (upscaled from native 360x180)
}


def load_all_data():
    """Load and combine all CERES monthly files."""
    print("Loading CERES EBAF satellite radiation data...")

    all_data = []
    years_loaded = []

    for year in range(START_YEAR, END_YEAR + 1):
        year_data = []

        for month in range(1, 13):
            # Find the file for this year/month
            pattern = f"*ceres-ebaf*{year}_{month:02d}.nc"
            files = list(DATA_DIR.glob(pattern))

            if not files:
                print(f"  WARNING: No file found for {year}-{month:02d}")
                continue

            ds = xr.open_dataset(files[0])

            # Variable is 'solar_mon' for incoming shortwave
            if 'solar_mon' in ds:
                data = ds['solar_mon'].values
                # Remove time dimension if present: (1, 180, 360) -> (180, 360)
                if data.ndim == 3:
                    data = data[0]
                year_data.append(data)
            else:
                print(f"  WARNING: solar_mon not found in {files[0]}")
                continue

            ds.close()

        if len(year_data) == 12:
            # Stack months: (12, 180, 360)
            year_stack = np.stack(year_data, axis=0)
            all_data.append(year_stack)
            years_loaded.append(year)
            print(f"  Loaded {year}: shape {year_stack.shape}")
        else:
            print(f"  WARNING: {year} only has {len(year_data)} months, skipping")

    if not all_data:
        raise ValueError("No satellite radiation data found!")

    # Stack all years: (n_years, 12, 180, 360)
    print(f"\nCombining {len(all_data)} years...")
    combined = np.stack(all_data, axis=0)
    print(f"Combined shape: {combined.shape}")
    print(f"Years: {years_loaded}")

    return combined, years_loaded


def create_pyramid_level(data, years, level, target_size):
    """Create a single pyramid level."""
    from scipy.ndimage import zoom

    n_years, n_months, src_lat, src_lon = data.shape

    # Calculate zoom factors (target is square)
    # CERES is 180x360, so we need to handle aspect ratio
    lat_factor = target_size / src_lat
    lon_factor = (target_size * 2) / src_lon  # 2:1 aspect for global

    print(f"\n  Level {level}: {src_lat}x{src_lon} -> {target_size}x{target_size*2}")
    print(f"  Zoom factors: lat={lat_factor:.2f}, lon={lon_factor:.2f}")

    level_dir = OUTPUT_DIR / str(level)
    level_dir.mkdir(parents=True, exist_ok=True)

    # Resample each year/month
    resampled = np.zeros((n_years, n_months, target_size, target_size * 2), dtype=np.float32)

    for y in range(n_years):
        for m in range(n_months):
            resampled[y, m] = zoom(data[y, m], (lat_factor, lon_factor), order=1)

    print(f"  Resampled shape: {resampled.shape}")
    print(f"  Value range: {np.nanmin(resampled):.1f} to {np.nanmax(resampled):.1f} W/m²")

    # Create Zarr store using zarr v2 format for compatibility
    store = zarr.open(str(level_dir), mode='w', zarr_format=2)

    # Save main data array
    store.create_dataset(
        'solar_radiation',
        shape=resampled.shape,
        data=resampled,
        chunks=(1, 1, target_size, target_size * 2),
        dtype=np.float32
    )

    # Save coordinate arrays
    store.create_dataset('year', shape=(len(years),), data=np.array(years))
    store.create_dataset('month', shape=(12,), data=np.arange(1, 13))

    # x/y coordinates in Web Mercator (EPSG:3857) for frontend compatibility
    # Web Mercator bounds: ±20037508.34 meters
    WEB_MERCATOR_MAX = 20037508.34
    y_coords = np.linspace(WEB_MERCATOR_MAX, -WEB_MERCATOR_MAX, target_size)
    x_coords = np.linspace(-WEB_MERCATOR_MAX, WEB_MERCATOR_MAX, target_size * 2)
    store.create_dataset('y', shape=(target_size,), data=y_coords)
    store.create_dataset('x', shape=(target_size * 2,), data=x_coords)

    # Metadata
    store.attrs['crs'] = 'EPSG:4326'
    store.attrs['bounds'] = [-180, -90, 180, 90]
    store.attrs['variable'] = 'solar_radiation'
    store.attrs['unit'] = 'W/m²'
    store.attrs['source'] = 'NASA CERES EBAF v4.2.1'
    store.attrs['description'] = f'Satellite Incoming Shortwave Radiation {START_YEAR}-{END_YEAR}'

    print(f"  Saved to {level_dir}")


def create_root_metadata(years):
    """Create root-level metadata."""
    metadata = {
        'crs': 'EPSG:4326',
        'bounds': [-180, -90, 180, 90],
        'years': years,
        'n_years': len(years),
        'variable': 'solar_radiation',
        'unit': 'W/m²',
        'source': 'NASA CERES EBAF v4.2.1',
        'description': f'Satellite Incoming Shortwave Radiation ({min(years)}-{max(years)})',
        'data_type': 'satellite'
    }

    # Write .zattrs
    import json
    with open(OUTPUT_DIR / '.zattrs', 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"\nRoot metadata saved to {OUTPUT_DIR / '.zattrs'}")


def main():
    print("=" * 60)
    print("Processing NASA CERES EBAF Satellite Radiation Data")
    print("=" * 60)

    # Load all data
    data, years = load_all_data()

    # Create pyramid levels
    print("\nCreating pyramid levels...")
    for level, size in LEVELS.items():
        create_pyramid_level(data, years, level, size)

    # Create root metadata
    create_root_metadata(years)

    print("\n" + "=" * 60)
    print("Processing complete!")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == '__main__':
    main()
