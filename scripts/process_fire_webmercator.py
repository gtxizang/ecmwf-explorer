#!/usr/bin/env python3
"""
Process fire burned area data from raw zip files to Web Mercator pyramid.

This script:
1. Extracts zip files containing monthly fire data
2. Loads NetCDF data for each month
3. Reprojects from lat/lon (EPSG:4326) to Web Mercator (EPSG:3857)
4. Creates multi-resolution pyramid matching soil_moisture format
"""

import xarray as xr
import numpy as np
import rioxarray
from rasterio.enums import Resampling
import zarr
from numcodecs import Blosc
import os
import glob
import shutil
import zipfile
import tempfile
from scipy.interpolate import RegularGridInterpolator

# Constants - MUST match soil_moisture projection exactly
WEB_MERCATOR_BOUNDS = 20037508.342789244  # meters
MAX_LAT = 85.051129  # Web Mercator latitude limit

RAW_DIR = '/Users/garfieldconnolly/Desktop/ECMWF-POC/data/raw/fire_burned_area'
OUTPUT_PATH = '/Users/garfieldconnolly/Desktop/ECMWF-POC/data/pyramids/fire_multiyear_webmercator'

# Pyramid levels - MUST match soil_moisture structure
PYRAMID_LEVELS = {
    0: 128,
    1: 256,
    2: 512,
    3: 1024,
    4: 2048,
}


def lat_to_webmercator_y(lat):
    """Convert latitude to Web Mercator Y coordinate in meters."""
    lat_rad = np.radians(np.clip(lat, -MAX_LAT, MAX_LAT))
    y = np.log(np.tan(np.pi/4 + lat_rad/2))
    return y * 6378137.0


def webmercator_y_to_lat(y):
    """Convert Web Mercator Y to latitude."""
    return np.degrees(2 * np.arctan(np.exp(y / 6378137.0)) - np.pi/2)


def lon_to_webmercator_x(lon):
    """Convert longitude to Web Mercator X coordinate in meters."""
    return lon * 6378137.0 * np.pi / 180.0


def reproject_to_webmercator(data_latlon, src_lats, src_lons, target_size):
    """
    Reproject data from lat/lon to Web Mercator using interpolation.

    Args:
        data_latlon: 2D array in lat/lon coordinates
        src_lats: Source latitude values (typically 89.875 to -89.875)
        src_lons: Source longitude values (typically -179.875 to 179.875)
        target_size: Output size (square)

    Returns:
        Reprojected data array
    """
    # Target Web Mercator coordinates (same as soil_moisture)
    target_x = np.linspace(-WEB_MERCATOR_BOUNDS, WEB_MERCATOR_BOUNDS, target_size)
    target_y = np.linspace(WEB_MERCATOR_BOUNDS, -WEB_MERCATOR_BOUNDS, target_size)

    # Convert Web Mercator to lat/lon for interpolation sampling
    target_lons = target_x * 180.0 / (6378137.0 * np.pi)
    target_lats = webmercator_y_to_lat(target_y)

    # Ensure source lats are in ascending order for interpolator
    if src_lats[0] > src_lats[-1]:
        src_lats_asc = src_lats[::-1]
        data_flipped = data_latlon[::-1, :]
    else:
        src_lats_asc = src_lats
        data_flipped = data_latlon

    # Handle NaN values - replace with 0 for fire data (no fire)
    data_clean = np.nan_to_num(data_flipped, nan=0.0)

    # Create interpolator
    interp = RegularGridInterpolator(
        (src_lats_asc, src_lons),
        data_clean,
        method='nearest',  # Nearest neighbor to preserve discrete fire values
        bounds_error=False,
        fill_value=0.0
    )

    # Sample at target locations
    target_lon_grid, target_lat_grid = np.meshgrid(target_lons, target_lats)
    target_points = np.column_stack([target_lat_grid.ravel(), target_lon_grid.ravel()])

    result = interp(target_points).reshape(target_size, target_size)

    return result.astype(np.float32)


def extract_and_load_fire_data():
    """Extract all zip files and load fire data."""
    zip_files = sorted(glob.glob(os.path.join(RAW_DIR, 'fire_burned_area_*.zip')))

    if not zip_files:
        raise FileNotFoundError(f"No fire zip files found in {RAW_DIR}")

    print(f"Found {len(zip_files)} monthly fire data files")

    # Parse years and months
    data_dict = {}  # {(year, month): data_array}
    src_lats = None
    src_lons = None

    for zf in zip_files:
        # Parse filename: fire_burned_area_YYYY_MM.zip
        basename = os.path.basename(zf)
        parts = basename.replace('.zip', '').split('_')
        year = int(parts[3])
        month = int(parts[4])

        # Extract to temp directory
        with tempfile.TemporaryDirectory() as tmpdir:
            with zipfile.ZipFile(zf, 'r') as z:
                z.extractall(tmpdir)

            # Find NetCDF file
            nc_files = glob.glob(os.path.join(tmpdir, '**/*.nc'), recursive=True)
            if not nc_files:
                print(f"  Warning: No NetCDF in {basename}")
                continue

            # Load data
            ds = xr.open_dataset(nc_files[0])

            # Get burned_area variable
            if 'burned_area' in ds:
                da = ds['burned_area']

                # Store coordinate info (same for all files)
                if src_lats is None:
                    src_lats = da.lat.values
                    src_lons = da.lon.values

                # Sum over vegetation classes if present
                if 'vegetation_class' in da.dims:
                    da = da.sum(dim='vegetation_class')

                # Squeeze time dimension
                if 'time' in da.dims:
                    da = da.isel(time=0)

                data_dict[(year, month)] = da.values
                print(f"  Loaded {year}-{month:02d}: shape={da.values.shape}, non-zero={np.count_nonzero(da.values)}")

            ds.close()

    return data_dict, src_lats, src_lons


def create_pyramid():
    """Create Web Mercator pyramid from fire data."""
    print("=" * 70)
    print("FIRE DATA -> WEB MERCATOR PYRAMID")
    print("=" * 70)

    # Load all data
    print("\nLoading fire data from zip files...")
    data_dict, src_lats, src_lons = extract_and_load_fire_data()

    # Get unique years
    years = sorted(set(y for y, m in data_dict.keys()))
    print(f"\nYears: {years}")
    print(f"Source: lat=[{src_lats[0]:.3f}, {src_lats[-1]:.3f}], lon=[{src_lons[0]:.3f}, {src_lons[-1]:.3f}]")

    # Clean output directory
    if os.path.exists(OUTPUT_PATH):
        shutil.rmtree(OUTPUT_PATH)
    os.makedirs(OUTPUT_PATH)

    # Root metadata
    import json
    with open(os.path.join(OUTPUT_PATH, '.zgroup'), 'w') as f:
        json.dump({"zarr_format": 2}, f)
    with open(os.path.join(OUTPUT_PATH, '.zattrs'), 'w') as f:
        json.dump({}, f)

    compressor = Blosc(cname='lz4', clevel=5, shuffle=Blosc.SHUFFLE)

    # Create each pyramid level
    for level, target_size in PYRAMID_LEVELS.items():
        print(f"\n{'='*50}")
        print(f"LEVEL {level}: {target_size}x{target_size}")
        print(f"{'='*50}")

        level_path = os.path.join(OUTPUT_PATH, str(level))
        os.makedirs(level_path)

        # .zgroup for level
        with open(os.path.join(level_path, '.zgroup'), 'w') as f:
            json.dump({"zarr_format": 2}, f)

        # Web Mercator coordinates - EXACTLY like soil_moisture
        x_vals = np.linspace(-WEB_MERCATOR_BOUNDS, WEB_MERCATOR_BOUNDS, target_size).astype(np.float64)
        y_vals = np.linspace(WEB_MERCATOR_BOUNDS, -WEB_MERCATOR_BOUNDS, target_size).astype(np.float64)

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
        year_arr[:] = np.array(years, dtype=np.int64)

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

        # Process each month
        for yi, year in enumerate(years):
            for month in range(1, 13):
                key = (year, month)
                if key in data_dict:
                    src_data = data_dict[key]

                    # Reproject to Web Mercator
                    reproj = reproject_to_webmercator(src_data, src_lats, src_lons, target_size)
                    data_arr[yi, month-1, :, :] = reproj
                else:
                    # No data - fill with NaN
                    data_arr[yi, month-1, :, :] = np.full((target_size, target_size), np.nan, dtype=np.float32)

            print(f"  {year} complete")

        print(f"  X: [{x_vals[0]:.2f}, {x_vals[-1]:.2f}] meters")
        print(f"  Y: [{y_vals[0]:.2f}, {y_vals[-1]:.2f}] meters")

    print("\n" + "=" * 70)
    print("COMPLETE!")
    print(f"Output: {OUTPUT_PATH}")
    print("=" * 70)


if __name__ == '__main__':
    create_pyramid()
