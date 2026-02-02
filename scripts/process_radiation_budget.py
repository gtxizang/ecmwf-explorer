#!/usr/bin/env python3
"""
Process Earth Radiation Budget data into Zarr pyramids for web visualization.
Merges monthly files, reprojects to EPSG:3857, and creates multi-resolution pyramids.
"""

import xarray as xr
import numpy as np
from pathlib import Path
import rioxarray  # For reprojection
from pyproj import Transformer
import warnings

warnings.filterwarnings('ignore')

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw" / "radiation_budget_extracted"
PYRAMIDS_DIR = DATA_DIR / "pyramids"
OUTPUT_DIR = PYRAMIDS_DIR / "radiation_budget_cp"  # _cp = Web Mercator projection

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Pyramid levels: coarsest to finest
# Native is 180x360 (1 degree), so we can go up to ~4x that
PYRAMID_LEVELS = {
    0: 128,   # Very coarse
    1: 256,
    2: 512,
    3: 1024,  # Finer than native
}


def load_and_merge_2023():
    """Load all 2023 monthly files and merge into single dataset."""
    print("Loading 2023 radiation budget data...")

    # Only load solar_mon files (not toa_lw_all_mon or toa_sw_all_mon)
    files = sorted(RAW_DIR.glob("*solar_mon_2023_*.nc"))
    if not files:
        print(f"No 2023 solar_mon files found in {RAW_DIR}")
        return None

    print(f"  Found {len(files)} solar_mon files")

    datasets = []
    for f in files:
        ds = xr.open_dataset(f, engine='scipy')
        # Extract month from filename
        month = int(f.stem.split('_')[-1])
        ds = ds.assign_coords(time=[month])
        datasets.append(ds)

    # Merge along time dimension
    merged = xr.concat(datasets, dim='time')
    merged = merged.sortby('time')

    print(f"  Merged shape: {dict(merged.sizes)}")
    print(f"  Variables: {list(merged.data_vars)}")

    return merged


def reproject_to_web_mercator(ds, target_size):
    """Reproject lat/lon data to Web Mercator (EPSG:3857)."""
    print(f"  Reprojecting to EPSG:3857 at {target_size}x{target_size}...")
    from rasterio.transform import from_bounds

    # Get the data variable
    data = ds['solar_mon']

    # Set CRS and spatial dims
    data = data.rio.write_crs("EPSG:4326")
    data = data.rio.set_spatial_dims(x_dim='lon', y_dim='lat')

    # Define target bounds in Web Mercator
    # World bounds: approximately -20037508.34 to 20037508.34 in both x and y
    xmin, ymin, xmax, ymax = -20037508.34, -20037508.34, 20037508.34, 20037508.34

    # Create the affine transform for the target grid
    # from_bounds(west, south, east, north, width, height)
    transform = from_bounds(xmin, ymin, xmax, ymax, target_size, target_size)

    # Reproject with explicit bounds
    reprojected = data.rio.reproject(
        "EPSG:3857",
        shape=(target_size, target_size),
        transform=transform,
        resampling=1,  # Bilinear
    )

    # Get the reprojected data - rioxarray outputs with y descending (north to south)
    # which is correct for image rendering where row 0 = top = north
    rp_data = reprojected.values

    # Create target coordinates
    # X goes west to east
    x = np.linspace(xmin, xmax, target_size)
    # Y goes north to south (row 0 = north = +ymax, row -1 = south = +ymin)
    y = np.linspace(ymax, ymin, target_size)

    # Create dataset
    result = xr.Dataset({
        'solar_mon': (['time', 'y', 'x'], rp_data)
    })

    # Add coordinates
    result = result.assign_coords({
        'time': ds['time'].values,
        'x': x,
        'y': y,
    })

    # Add metadata
    result['solar_mon'].attrs = {
        'long_name': 'Incoming Solar Flux, Monthly Means',
        'units': 'W m-2',
        '_FillValue': np.nan,
    }
    result.attrs['crs'] = 'EPSG:3857'

    return result


def create_pyramid(ds, output_dir, levels=PYRAMID_LEVELS):
    """Create multi-resolution Zarr pyramid."""
    print("Creating Zarr pyramid...")

    for level, size in levels.items():
        print(f"  Level {level}: {size}x{size}")

        level_dir = output_dir / str(level)

        # Reproject to target size
        level_ds = reproject_to_web_mercator(ds, size)

        # Rechunk for web access
        level_ds = level_ds.chunk({'time': 1, 'y': min(128, size), 'x': min(128, size)})

        # Save to Zarr (use v2 format for zarrita compatibility)
        level_ds.to_zarr(level_dir, mode='w', consolidated=True, zarr_format=2)

        print(f"    Saved to {level_dir}")

    print(f"Pyramid complete: {output_dir}")


def main():
    print("="*60)
    print("RADIATION BUDGET ZARR PYRAMID GENERATION")
    print("="*60)

    # Load and merge data
    ds = load_and_merge_2023()
    if ds is None:
        return 1

    # Create pyramid
    create_pyramid(ds, OUTPUT_DIR)

    print("\n" + "="*60)
    print("COMPLETE")
    print("="*60)
    print(f"Output: {OUTPUT_DIR}")
    print("\nNext: Add to backend mount and frontend UI")

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
