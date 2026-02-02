#!/usr/bin/env python3
"""
Process Sea Ice Concentration data into Zarr pyramids.
Real EUMETSAT OSI SAF data from CDS.
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
ICE_FILE = DATA_DIR / "sea_ice" / "ice_conc_nh_ease2-250_icdr-v3p0_202301151200.nc"
OUTPUT_DIR = DATA_DIR / "pyramids" / "sea_ice"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Pyramid levels
PYRAMID_LEVELS = {
    0: 128,
    1: 256,
    2: 512,
    3: 1024,
}

XMIN, YMIN, XMAX, YMAX = -20037508.34, -20037508.34, 20037508.34, 20037508.34


def process_sea_ice():
    print("="*60)
    print("PROCESSING SEA ICE CONCENTRATION DATA")
    print("="*60)

    # Load sea ice data
    print(f"Loading {ICE_FILE}...")
    ds = xr.open_dataset(ICE_FILE)

    # Get ice_conc variable and lat/lon arrays
    data_array = ds['ice_conc'].isel(time=0).values
    lat = ds['lat'].values  # 2D array
    lon = ds['lon'].values  # 2D array

    print(f"  Shape: {data_array.shape}")
    print(f"  Data range: {np.nanmin(data_array):.1f} to {np.nanmax(data_array):.1f}")
    print(f"  Valid points: {np.sum(~np.isnan(data_array) & (data_array > 0))}")

    # Create pyramid levels using direct lat/lon mapping
    for level, size in PYRAMID_LEVELS.items():
        print(f"\n  Level {level}: {size}x{size}")
        level_dir = OUTPUT_DIR / str(level)

        # Create target Web Mercator grid
        x_target = np.linspace(XMIN, XMAX, size)
        y_target = np.linspace(YMAX, YMIN, size)

        # Convert target coords to lat/lon
        lon_target = x_target * 180 / 20037508.34
        lat_target = np.arctan(np.sinh(y_target * np.pi / 20037508.34)) * 180 / np.pi

        LON_T, LAT_T = np.meshgrid(lon_target, lat_target)

        # Initialize output
        rp_data = np.full((size, size), np.nan, dtype=np.float32)

        # Map source data to target grid
        # For each source pixel, find nearest target pixel
        valid_count = 0
        for i in range(data_array.shape[0]):
            for j in range(data_array.shape[1]):
                src_lat = lat[i, j]
                src_lon = lon[i, j]
                val = data_array[i, j]

                # Skip invalid
                if np.isnan(src_lat) or np.isnan(src_lon) or np.isnan(val):
                    continue
                if val <= 0:
                    continue

                # Skip if outside Web Mercator lat limits
                if src_lat > 85 or src_lat < -85:
                    continue

                # Find nearest target pixel
                lon_idx = np.argmin(np.abs(lon_target - src_lon))
                lat_idx = np.argmin(np.abs(lat_target - src_lat))

                if 0 <= lat_idx < size and 0 <= lon_idx < size:
                    # Use max value if multiple source pixels map to same target
                    if np.isnan(rp_data[lat_idx, lon_idx]) or val > rp_data[lat_idx, lon_idx]:
                        rp_data[lat_idx, lon_idx] = val
                        valid_count += 1

        print(f"    Mapped {valid_count} pixels")

        # Create coordinates
        x = np.linspace(XMIN, XMAX, size)
        y = np.linspace(YMAX, YMIN, size)

        # Create dataset with 12 "months" (repeat Jan data)
        time_data = np.stack([rp_data] * 12, axis=0)

        result = xr.Dataset({
            'ice_concentration': (['time', 'y', 'x'], time_data.astype(np.float32))
        })

        result = result.assign_coords({
            'time': np.arange(12),
            'x': x,
            'y': y,
        })

        result['ice_concentration'].attrs = {
            'long_name': 'Sea Ice Concentration',
            'units': '%',
            '_FillValue': np.nan,
        }
        result.attrs['crs'] = 'EPSG:3857'

        # Chunk and save
        result = result.chunk({'time': 1, 'y': min(128, size), 'x': min(128, size)})
        result.to_zarr(level_dir, mode='w', consolidated=True, zarr_format=2)
        print(f"    Saved to {level_dir}")

    print(f"\nSea Ice pyramid complete: {OUTPUT_DIR}")


if __name__ == "__main__":
    process_sea_ice()
