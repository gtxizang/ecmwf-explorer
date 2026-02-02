#!/usr/bin/env python3
"""
Process Fire Burned Area data into Zarr pyramids.
Real C3S data from CDS.
"""

import xarray as xr
import numpy as np
from pathlib import Path
import rioxarray
from rasterio.transform import from_bounds
import warnings

warnings.filterwarnings('ignore')

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
FIRE_FILE = DATA_DIR / "fire" / "20230101-C3S-L4_FIRE-BA-OLCI-fv1.1.nc"
OUTPUT_DIR = DATA_DIR / "pyramids" / "fire_burned_area"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Pyramid levels
PYRAMID_LEVELS = {
    0: 128,
    1: 256,
    2: 512,
    3: 1024,
}

XMIN, YMIN, XMAX, YMAX = -20037508.34, -20037508.34, 20037508.34, 20037508.34


def process_fire():
    print("="*60)
    print("PROCESSING FIRE BURNED AREA DATA")
    print("="*60)

    # Load fire data
    print(f"Loading {FIRE_FILE}...")
    ds = xr.open_dataset(FIRE_FILE)

    # Get burned_area variable
    data = ds['burned_area'].isel(time=0)  # First time step
    print(f"  Shape: {data.shape}")
    print(f"  Min: {float(data.min())}, Max: {float(data.max())}")

    # Set CRS and spatial dims
    data = data.rio.write_crs("EPSG:4326")
    data = data.rio.set_spatial_dims(x_dim='lon', y_dim='lat')

    # Create pyramid levels
    for level, size in PYRAMID_LEVELS.items():
        print(f"\n  Level {level}: {size}x{size}")
        level_dir = OUTPUT_DIR / str(level)

        # Create transform for target grid
        transform = from_bounds(XMIN, YMIN, XMAX, YMAX, size, size)

        # Reproject to Web Mercator
        reprojected = data.rio.reproject(
            "EPSG:3857",
            shape=(size, size),
            transform=transform,
            resampling=1,  # Bilinear
        )

        rp_data = reprojected.values

        # Create coordinates
        x = np.linspace(XMIN, XMAX, size)
        y = np.linspace(YMAX, YMIN, size)  # North to south

        # Create dataset with 12 "months" (repeat Jan data for demo)
        # This ensures compatibility with the existing time slider
        time_data = np.stack([rp_data] * 12, axis=0)

        result = xr.Dataset({
            'burned_area': (['time', 'y', 'x'], time_data.astype(np.float32))
        })

        result = result.assign_coords({
            'time': np.arange(12),
            'x': x,
            'y': y,
        })

        result['burned_area'].attrs = {
            'long_name': 'Burned Area',
            'units': 'm2',
            '_FillValue': np.nan,
        }
        result.attrs['crs'] = 'EPSG:3857'

        # Chunk and save
        result = result.chunk({'time': 1, 'y': min(128, size), 'x': min(128, size)})
        result.to_zarr(level_dir, mode='w', consolidated=True, zarr_format=2)
        print(f"    Saved to {level_dir}")

    print(f"\nFire pyramid complete: {OUTPUT_DIR}")


if __name__ == "__main__":
    process_fire()
