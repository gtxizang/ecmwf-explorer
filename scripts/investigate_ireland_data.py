#!/usr/bin/env python3
"""
Investigate soil moisture data coverage around Ireland.
Compare raw ERA5-Land data vs processed Zarr pyramids.
"""

import zarr
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
import math

# Ireland bounding box (approximate)
IRELAND_BOUNDS = {
    'lon_min': -10.5,
    'lon_max': -5.5,
    'lat_min': 51.4,
    'lat_max': 55.4
}

# Web Mercator bounds
WEB_MERCATOR_BOUNDS = [-20037508.34, -20037508.34, 20037508.34, 20037508.34]

def lat_lon_to_web_mercator(lon, lat):
    """Convert lat/lon to Web Mercator coordinates."""
    x = lon * 20037508.34 / 180
    y = math.log(math.tan((90 + lat) * math.pi / 360)) / (math.pi / 180)
    y = y * 20037508.34 / 180
    return x, y

def calculate_ireland_pixels(total_pixels):
    """Calculate which pixels correspond to Ireland in Web Mercator projection."""
    # Ireland corners in Web Mercator
    x_min, y_min = lat_lon_to_web_mercator(IRELAND_BOUNDS['lon_min'], IRELAND_BOUNDS['lat_min'])
    x_max, y_max = lat_lon_to_web_mercator(IRELAND_BOUNDS['lon_max'], IRELAND_BOUNDS['lat_max'])

    # Calculate pixel coordinates
    total_extent = WEB_MERCATOR_BOUNDS[2] - WEB_MERCATOR_BOUNDS[0]
    pixel_size = total_extent / total_pixels

    px_min = int((x_min - WEB_MERCATOR_BOUNDS[0]) / pixel_size)
    px_max = int((x_max - WEB_MERCATOR_BOUNDS[0]) / pixel_size)
    py_min = int((WEB_MERCATOR_BOUNDS[3] - y_max) / pixel_size)  # Y is inverted
    py_max = int((WEB_MERCATOR_BOUNDS[3] - y_min) / pixel_size)

    return px_min, px_max, py_min, py_max

def inspect_pyramid_level(level):
    """Inspect a single pyramid level."""
    base_path = Path('/Users/garfieldconnolly/Desktop/ECMWF-POC/data/pyramids/soil_moisture_multiyear')
    level_path = base_path / str(level)

    if not level_path.exists():
        print(f"Level {level} does not exist")
        return None

    print(f"\n{'='*60}")
    print(f"PYRAMID LEVEL {level}")
    print(f"{'='*60}")

    # List contents
    print(f"Path: {level_path}")
    print(f"Contents: {list(level_path.iterdir())}")

    # Open zarr store
    store = zarr.open(str(level_path), mode='r')

    # Print structure
    print(f"\nZarr structure:")
    for key in store.keys():
        item = store[key]
        if hasattr(item, 'shape'):
            print(f"  {key}: shape={item.shape}, dtype={item.dtype}")
        else:
            print(f"  {key}: (group)")

    # Check if we have the soil_moisture variable
    if 'soil_moisture' in store:
        data = store['soil_moisture']
        print(f"\nSoil moisture array:")
        print(f"  Shape: {data.shape}")
        print(f"  Dtype: {data.dtype}")
        print(f"  Chunks: {data.chunks if hasattr(data, 'chunks') else 'N/A'}")

        # Get spatial dimensions
        if len(data.shape) == 4:  # (year, time, y, x)
            spatial_size = data.shape[-1]
        elif len(data.shape) == 3:  # (time, y, x)
            spatial_size = data.shape[-1]
        else:
            spatial_size = data.shape[-1]

        print(f"  Spatial size: {spatial_size}x{spatial_size}")

        return store, data, spatial_size

    return None

def analyze_ireland_coverage():
    """Analyze Ireland coverage across all LOD levels."""

    lod_sizes = {
        0: 128,
        1: 256,
        2: 512,
        3: 1024,
        4: 2048
    }

    fig, axes = plt.subplots(2, 5, figsize=(20, 8))

    for lod in range(5):
        result = inspect_pyramid_level(lod)
        if result is None:
            continue

        store, data, spatial_size = result

        # Calculate Ireland pixels
        px_min, px_max, py_min, py_max = calculate_ireland_pixels(spatial_size)

        # Clamp to valid range
        px_min = max(0, px_min)
        px_max = min(spatial_size - 1, px_max)
        py_min = max(0, py_min)
        py_max = min(spatial_size - 1, py_max)

        print(f"\nIreland region:")
        print(f"  Pixel X: {px_min} to {px_max} (width: {px_max - px_min + 1})")
        print(f"  Pixel Y: {py_min} to {py_max} (height: {py_max - py_min + 1})")

        # Get data for a specific time (year 2020, month 0 = January)
        # Check array dimensions
        if len(data.shape) == 4:  # (year, time, y, x)
            # Find year 2020
            years = store['year'][:]
            year_idx = list(years).index(2020) if 2020 in years else 0
            sample = data[year_idx, 0, :, :]
        elif len(data.shape) == 3:  # (time, y, x)
            sample = data[0, :, :]
        else:
            sample = data[:]

        # Full array stats
        sample_array = np.array(sample)
        total_pixels = sample_array.size
        nan_pixels = np.sum(np.isnan(sample_array))
        valid_pixels = total_pixels - nan_pixels

        print(f"\nGlobal coverage:")
        print(f"  Total pixels: {total_pixels}")
        print(f"  Valid pixels: {valid_pixels} ({100*valid_pixels/total_pixels:.1f}%)")
        print(f"  NaN pixels: {nan_pixels} ({100*nan_pixels/total_pixels:.1f}%)")
        print(f"  Value range: {np.nanmin(sample_array):.4f} to {np.nanmax(sample_array):.4f}")

        # Ireland region
        ireland_data = sample_array[py_min:py_max+1, px_min:px_max+1]
        ireland_total = ireland_data.size
        ireland_nan = np.sum(np.isnan(ireland_data))
        ireland_valid = ireland_total - ireland_nan

        print(f"\nIreland coverage:")
        print(f"  Total pixels: {ireland_total}")
        print(f"  Valid pixels: {ireland_valid} ({100*ireland_valid/ireland_total:.1f}%)")
        print(f"  NaN pixels: {ireland_nan} ({100*ireland_nan/ireland_total:.1f}%)")
        if ireland_valid > 0:
            print(f"  Value range: {np.nanmin(ireland_data):.4f} to {np.nanmax(ireland_data):.4f}")

        # Plot top row: Ireland region
        ax = axes[0, lod]
        im = ax.imshow(ireland_data, cmap='YlGnBu', vmin=0, vmax=0.5)
        ax.set_title(f'LOD {lod} ({spatial_size}²)\n{ireland_data.shape[0]}x{ireland_data.shape[1]} px\n{100*ireland_valid/ireland_total:.0f}% valid')
        ax.set_aspect('equal')

        # Plot bottom row: NaN mask
        ax2 = axes[1, lod]
        nan_mask = np.isnan(ireland_data)
        ax2.imshow(nan_mask, cmap='Reds', vmin=0, vmax=1)
        ax2.set_title(f'NaN Mask\n(Red = No Data)')
        ax2.set_aspect('equal')

    plt.suptitle('Ireland Soil Moisture Coverage Across LOD Levels\n(Top: Values, Bottom: Missing Data)')
    plt.tight_layout()
    plt.savefig('/Users/garfieldconnolly/Desktop/ECMWF-POC/screenshots/ireland_data_analysis.png', dpi=150)
    print(f"\n\nSaved analysis to: screenshots/ireland_data_analysis.png")
    plt.close()

def check_x_y_coordinates():
    """Check the x/y coordinate arrays to understand the projection."""

    base_path = Path('/Users/garfieldconnolly/Desktop/ECMWF-POC/data/pyramids/soil_moisture_multiyear/4')
    store = zarr.open(str(base_path), mode='r')

    print("\n" + "="*60)
    print("X/Y COORDINATE ANALYSIS (LOD 4)")
    print("="*60)

    if 'x' in store:
        x = store['x'][:]
        print(f"\nX coordinates:")
        print(f"  Shape: {x.shape}")
        print(f"  Range: {x[0]:.0f} to {x[-1]:.0f}")
        print(f"  Expected Web Mercator: {WEB_MERCATOR_BOUNDS[0]:.0f} to {WEB_MERCATOR_BOUNDS[2]:.0f}")

    if 'y' in store:
        y = store['y'][:]
        print(f"\nY coordinates:")
        print(f"  Shape: {y.shape}")
        print(f"  Range: {y[0]:.0f} to {y[-1]:.0f}")
        print(f"  Expected Web Mercator: {WEB_MERCATOR_BOUNDS[1]:.0f} to {WEB_MERCATOR_BOUNDS[3]:.0f}")

    # Ireland in Web Mercator
    x_ire_min, y_ire_min = lat_lon_to_web_mercator(IRELAND_BOUNDS['lon_min'], IRELAND_BOUNDS['lat_min'])
    x_ire_max, y_ire_max = lat_lon_to_web_mercator(IRELAND_BOUNDS['lon_max'], IRELAND_BOUNDS['lat_max'])

    print(f"\nIreland in Web Mercator:")
    print(f"  X: {x_ire_min:.0f} to {x_ire_max:.0f}")
    print(f"  Y: {y_ire_min:.0f} to {y_ire_max:.0f}")

if __name__ == '__main__':
    analyze_ireland_coverage()
    check_x_y_coordinates()
