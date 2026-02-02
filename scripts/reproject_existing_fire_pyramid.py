#!/usr/bin/env python3
"""
Reproject the existing fire pyramid from lat/lon to Web Mercator.

The current fire_multiyear pyramid has:
- 5 years of data (2019-2023)
- Correct data values
- WRONG projection (lat/lon instead of Web Mercator)

This script reads the existing pyramid and reprojects to match soil_moisture projection.
"""

import numpy as np
import zarr
from numcodecs import Blosc
import os
import shutil
from scipy.ndimage import zoom
import json

# Web Mercator bounds in meters
WEB_MERCATOR_BOUNDS = 20037508.342789244

INPUT_PATH = '/Users/garfieldconnolly/Desktop/ECMWF-POC/data/pyramids/fire_multiyear'
OUTPUT_PATH = '/Users/garfieldconnolly/Desktop/ECMWF-POC/data/pyramids/fire_multiyear_webmercator'

# Match soil_moisture pyramid structure
PYRAMID_LEVELS = {
    0: 128,
    1: 256,
    2: 512,
    3: 1024,
    4: 2048,
}

def lat_to_webmercator_y(lat):
    """Convert latitude to Web Mercator Y coordinate."""
    lat_rad = np.radians(lat)
    y = np.log(np.tan(np.pi/4 + lat_rad/2))
    return y * 6378137.0  # Earth radius in meters


def lon_to_webmercator_x(lon):
    """Convert longitude to Web Mercator X coordinate."""
    return lon * 6378137.0 * np.pi / 180.0


def reproject_slice_to_webmercator(data_latlon, src_lats, src_lons, target_size):
    """
    Reproject a 2D array from lat/lon to Web Mercator.

    Web Mercator can't represent latitudes beyond ~85.06 degrees,
    so we clip and interpolate.
    """
    from scipy.interpolate import RegularGridInterpolator

    # Target Web Mercator coordinates
    # Use slightly smaller bounds to avoid edge issues (equivalent to ~85 degrees)
    max_y = lat_to_webmercator_y(85.0)
    target_x = np.linspace(-WEB_MERCATOR_BOUNDS, WEB_MERCATOR_BOUNDS, target_size)
    target_y = np.linspace(max_y, -max_y, target_size)

    # Convert target Web Mercator back to lat/lon for interpolation
    target_lons = target_x * 180.0 / (6378137.0 * np.pi)
    target_lats = np.degrees(2 * np.arctan(np.exp(target_y / 6378137.0)) - np.pi/2)

    # Create interpolator from source lat/lon grid
    # Note: source lats go from 89.875 to -89.875 (north to south)
    # scipy expects ascending order, so we flip
    if src_lats[0] > src_lats[-1]:
        src_lats_asc = src_lats[::-1]
        data_flipped = data_latlon[::-1, :]
    else:
        src_lats_asc = src_lats
        data_flipped = data_latlon

    # Replace NaN with 0 for interpolation (fire data - 0 means no fire)
    data_clean = np.nan_to_num(data_flipped, nan=0.0)

    # Create interpolator
    interp = RegularGridInterpolator(
        (src_lats_asc, src_lons),
        data_clean,
        method='nearest',  # Use nearest to preserve fire locations
        bounds_error=False,
        fill_value=0.0
    )

    # Create mesh of target coordinates
    target_lon_grid, target_lat_grid = np.meshgrid(target_lons, target_lats)
    target_points = np.column_stack([target_lat_grid.ravel(), target_lon_grid.ravel()])

    # Interpolate
    result = interp(target_points).reshape(target_size, target_size)

    return result.astype(np.float32), target_x, target_y


def read_existing_pyramid_level(level):
    """Read data from existing fire pyramid."""
    level_path = os.path.join(INPUT_PATH, str(level))

    # Read coordinate arrays
    compressor = Blosc()

    with open(os.path.join(level_path, 'x', '0'), 'rb') as f:
        x = np.frombuffer(compressor.decode(f.read()), dtype='<f8')

    with open(os.path.join(level_path, 'y', '0'), 'rb') as f:
        y = np.frombuffer(compressor.decode(f.read()), dtype='<f8')

    with open(os.path.join(level_path, 'year', '0'), 'rb') as f:
        years = np.frombuffer(compressor.decode(f.read()), dtype='<i8')

    # Read data array metadata
    with open(os.path.join(level_path, 'burned_area', '.zarray')) as f:
        meta = json.load(f)

    print(f"  Level {level}: shape={meta['shape']}, x=[{x[0]:.2f}, {x[-1]:.2f}], y=[{y[0]:.2f}, {y[-1]:.2f}]")
    print(f"  Years: {years}")

    return {
        'x': x,
        'y': y,
        'years': years,
        'shape': meta['shape'],
        'path': level_path
    }


def read_chunk(level_path, year_idx, month_idx):
    """Read a single chunk from the pyramid."""
    chunk_path = os.path.join(level_path, 'burned_area', f'{year_idx}.{month_idx}.0.0')

    if not os.path.exists(chunk_path):
        return None

    with open(chunk_path, 'rb') as f:
        compressed = f.read()

    # Try to decompress
    try:
        compressor = Blosc()
        decompressed = compressor.decode(compressed)
    except:
        # Maybe not blosc compressed
        import zstd
        decompressed = zstd.decompress(compressed)

    return np.frombuffer(decompressed, dtype='<f4')


def create_output_level(level, target_size, years, src_info):
    """Create reprojected pyramid level."""
    level_path = os.path.join(OUTPUT_PATH, str(level))
    os.makedirs(level_path, exist_ok=True)

    # Write .zgroup
    with open(os.path.join(level_path, '.zgroup'), 'w') as f:
        json.dump({"zarr_format": 2}, f)

    compressor = Blosc(cname='lz4', clevel=5, shuffle=Blosc.SHUFFLE)

    # Create Web Mercator coordinate arrays
    max_y = lat_to_webmercator_y(85.0)
    x_vals = np.linspace(-WEB_MERCATOR_BOUNDS, WEB_MERCATOR_BOUNDS, target_size).astype(np.float64)
    y_vals = np.linspace(max_y, -max_y, target_size).astype(np.float64)

    # Save x
    x_arr = zarr.open(
        os.path.join(level_path, 'x'), mode='w',
        shape=(target_size,), chunks=(target_size,), dtype='float64',
        compressor=compressor, fill_value=float('nan'),
        dimension_separator='.', zarr_format=2
    )
    x_arr[:] = x_vals

    # Save y
    y_arr = zarr.open(
        os.path.join(level_path, 'y'), mode='w',
        shape=(target_size,), chunks=(target_size,), dtype='float64',
        compressor=compressor, fill_value=float('nan'),
        dimension_separator='.', zarr_format=2
    )
    y_arr[:] = y_vals

    # Save year
    year_arr = zarr.open(
        os.path.join(level_path, 'year'), mode='w',
        shape=(len(years),), chunks=(len(years),), dtype='int64',
        compressor=compressor, dimension_separator='.', zarr_format=2
    )
    year_arr[:] = years

    # Save month
    month_arr = zarr.open(
        os.path.join(level_path, 'month'), mode='w',
        shape=(12,), chunks=(12,), dtype='int32',
        compressor=compressor, dimension_separator='.', zarr_format=2
    )
    month_arr[:] = np.arange(1, 13, dtype=np.int32)

    # Create data array
    data_arr = zarr.open(
        os.path.join(level_path, 'burned_area'), mode='w',
        shape=(len(years), 12, target_size, target_size),
        chunks=(1, 1, target_size, target_size), dtype='float32',
        compressor=compressor, fill_value=float('nan'),
        dimension_separator='.', zarr_format=2
    )

    return data_arr, x_vals, y_vals


def main():
    print("=" * 70)
    print("REPROJECTING EXISTING FIRE PYRAMID TO WEB MERCATOR")
    print("=" * 70)

    # Clean output
    if os.path.exists(OUTPUT_PATH):
        shutil.rmtree(OUTPUT_PATH)
    os.makedirs(OUTPUT_PATH)

    # Root .zgroup
    with open(os.path.join(OUTPUT_PATH, '.zgroup'), 'w') as f:
        json.dump({"zarr_format": 2}, f)
    with open(os.path.join(OUTPUT_PATH, '.zattrs'), 'w') as f:
        json.dump({}, f)

    # Read source pyramid info (use level 3 as it has most detail available)
    print("\nReading source pyramid...")

    # Find highest available source level
    for src_level in [3, 2, 1, 0]:
        src_path = os.path.join(INPUT_PATH, str(src_level))
        if os.path.exists(src_path):
            break

    src_info = read_existing_pyramid_level(src_level)
    years = src_info['years']
    src_height = src_info['shape'][2]
    src_width = src_info['shape'][3]

    print(f"\nUsing source level {src_level} ({src_height}x{src_width})")

    # Read ALL source data into memory first
    print("\nLoading all source data...")

    # Open source array
    src_arr = zarr.open(os.path.join(src_info['path'], 'burned_area'), mode='r')
    all_data = src_arr[:]  # Load all into memory
    print(f"  Loaded shape: {all_data.shape}")

    # Create each output level
    for level, target_size in PYRAMID_LEVELS.items():
        print(f"\nCreating level {level} ({target_size}x{target_size})...")

        out_arr, out_x, out_y = create_output_level(level, target_size, years, src_info)

        for yi, year in enumerate(years):
            for mi in range(12):
                # Get source slice
                src_slice = all_data[yi, mi, :, :]

                # Reproject
                reproj, _, _ = reproject_slice_to_webmercator(
                    src_slice,
                    src_info['y'],  # lat coordinates (89.875 to -89.875)
                    src_info['x'],  # lon coordinates (-179.875 to 179.875)
                    target_size
                )

                out_arr[yi, mi, :, :] = reproj

            print(f"    {year} complete")

    print("\n" + "=" * 70)
    print("COMPLETE!")
    print(f"Output: {OUTPUT_PATH}")
    print("=" * 70)

    # Verify output coordinates
    print("\nVerification:")
    with open(os.path.join(OUTPUT_PATH, '0', 'x', '0'), 'rb') as f:
        x = np.frombuffer(Blosc().decode(f.read()), dtype='<f8')
        print(f"  Level 0 X: [{x[0]:.2f}, {x[-1]:.2f}] meters")
    with open(os.path.join(OUTPUT_PATH, '0', 'y', '0'), 'rb') as f:
        y = np.frombuffer(Blosc().decode(f.read()), dtype='<f8')
        print(f"  Level 0 Y: [{y[0]:.2f}, {y[-1]:.2f}] meters")


if __name__ == '__main__':
    main()
