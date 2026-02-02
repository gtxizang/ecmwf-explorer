#!/usr/bin/env python3
"""
Reproject fire burned area data from lat/lon (EPSG:4326) to Web Mercator (EPSG:3857).

This ensures the fire data matches the projection used by other datasets (soil moisture, radiation)
which are already in Web Mercator with coordinates in meters.

Web Mercator bounds:
  x: [-20037508.34, 20037508.34] meters
  y: [-20037508.34, 20037508.34] meters (but we clip to ~[-85, 85] latitude equivalent)
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

# Constants
WEB_MERCATOR_BOUNDS = 20037508.342789244  # meters
OUTPUT_PATH = '/Users/garfieldconnolly/Desktop/ECMWF-POC/data/pyramids/fire_multiyear_webmercator'

# Pyramid levels - match soil moisture structure
PYRAMID_LEVELS = {
    0: 128,   # Coarsest
    1: 256,
    2: 512,
    3: 1024,
    4: 2048,  # Finest
}

def load_fire_data():
    """Load all fire NetCDF files and combine into a single dataset."""
    fire_dir = '/Users/garfieldconnolly/Desktop/ECMWF-POC/data/fire'
    files = sorted(glob.glob(f'{fire_dir}/*.nc'))

    if not files:
        raise FileNotFoundError(f"No fire NetCDF files found in {fire_dir}")

    print(f"Found {len(files)} fire data files")

    datasets = []
    for f in files:
        ds = xr.open_dataset(f)
        # Extract burned_area variable
        da = ds['burned_area']
        # Add time coordinate if not present
        if 'time' in ds.coords:
            da = da.assign_coords(time=ds['time'])
        datasets.append(da)

    # Combine all time steps
    combined = xr.concat(datasets, dim='time')
    print(f"Combined data shape: {combined.shape}")
    print(f"Time range: {combined.time.values[0]} to {combined.time.values[-1]}")
    print(f"Lat range: {float(combined.lat.min())} to {float(combined.lat.max())}")
    print(f"Lon range: {float(combined.lon.min())} to {float(combined.lon.max())}")

    return combined


def reproject_to_webmercator(da, target_size):
    """Reproject data array from EPSG:4326 to EPSG:3857."""
    # Set CRS for input data
    da = da.rio.write_crs("EPSG:4326")
    da = da.rio.set_spatial_dims(x_dim='lon', y_dim='lat')

    # Reproject to Web Mercator
    # Note: Web Mercator can't represent latitudes beyond ~85.06 degrees
    da_reproj = da.rio.reproject(
        "EPSG:3857",
        shape=(target_size, target_size),
        resampling=Resampling.sum,  # Sum for area data (burned area should be summed when aggregating)
    )

    return da_reproj


def create_pyramid_level(data, level, size, output_path):
    """Create a single pyramid level with proper Web Mercator coordinates."""
    level_path = os.path.join(output_path, str(level))
    os.makedirs(level_path, exist_ok=True)

    # Write .zgroup
    with open(os.path.join(level_path, '.zgroup'), 'w') as f:
        import json
        json.dump({"zarr_format": 2}, f)

    compressor = Blosc(cname='lz4', clevel=5, shuffle=Blosc.SHUFFLE)

    # Create coordinate arrays in Web Mercator meters
    x_vals = np.linspace(-WEB_MERCATOR_BOUNDS, WEB_MERCATOR_BOUNDS, size).astype(np.float64)
    y_vals = np.linspace(WEB_MERCATOR_BOUNDS, -WEB_MERCATOR_BOUNDS, size).astype(np.float64)

    # Save x coordinates
    x_arr = zarr.open(
        os.path.join(level_path, 'x'),
        mode='w',
        shape=(size,),
        chunks=(size,),
        dtype='float64',
        compressor=compressor,
        fill_value=float('nan'),
        dimension_separator='.',
        zarr_format=2
    )
    x_arr[:] = x_vals

    # Save y coordinates
    y_arr = zarr.open(
        os.path.join(level_path, 'y'),
        mode='w',
        shape=(size,),
        chunks=(size,),
        dtype='float64',
        compressor=compressor,
        fill_value=float('nan'),
        dimension_separator='.',
        zarr_format=2
    )
    y_arr[:] = y_vals

    # Get unique years
    years = sorted(set([int(str(t)[:4]) for t in data.time.values]))
    n_years = len(years)

    # Save year array
    year_arr = zarr.open(
        os.path.join(level_path, 'year'),
        mode='w',
        shape=(n_years,),
        chunks=(n_years,),
        dtype='int64',
        compressor=compressor,
        dimension_separator='.',
        zarr_format=2
    )
    year_arr[:] = np.array(years, dtype=np.int64)

    # Save month array
    month_arr = zarr.open(
        os.path.join(level_path, 'month'),
        mode='w',
        shape=(12,),
        chunks=(12,),
        dtype='int32',
        compressor=compressor,
        dimension_separator='.',
        zarr_format=2
    )
    month_arr[:] = np.arange(1, 13, dtype=np.int32)

    # Create data array [year, month, y, x]
    data_arr = zarr.open(
        os.path.join(level_path, 'burned_area'),
        mode='w',
        shape=(n_years, 12, size, size),
        chunks=(1, 1, size, size),
        dtype='float32',
        compressor=compressor,
        fill_value=float('nan'),
        dimension_separator='.',
        zarr_format=2
    )

    print(f"  Processing {n_years} years x 12 months...")

    for yi, year in enumerate(years):
        for month in range(1, 13):
            # Find data for this year/month
            time_str = f"{year}-{month:02d}"
            matching = [i for i, t in enumerate(data.time.values)
                       if str(t)[:7] == time_str]

            if matching:
                slice_data = data.isel(time=matching[0])

                # Reproject this slice
                reproj = reproject_to_webmercator(slice_data, size)

                # Store
                data_arr[yi, month-1, :, :] = reproj.values.astype(np.float32)
            else:
                # No data for this month - fill with NaN
                data_arr[yi, month-1, :, :] = np.full((size, size), np.nan, dtype=np.float32)

        print(f"    Year {year} complete")

    return data_arr


def main():
    print("=" * 70)
    print("FIRE DATA REPROJECTION TO WEB MERCATOR (EPSG:3857)")
    print("=" * 70)

    # Clean output directory
    if os.path.exists(OUTPUT_PATH):
        shutil.rmtree(OUTPUT_PATH)
    os.makedirs(OUTPUT_PATH)

    # Write root .zgroup
    with open(os.path.join(OUTPUT_PATH, '.zgroup'), 'w') as f:
        import json
        json.dump({"zarr_format": 2}, f)
    with open(os.path.join(OUTPUT_PATH, '.zattrs'), 'w') as f:
        import json
        json.dump({}, f)

    # Load source data
    print("\nLoading fire source data...")
    data = load_fire_data()

    # Create each pyramid level
    for level, size in PYRAMID_LEVELS.items():
        print(f"\nCreating pyramid level {level} ({size}x{size})...")
        create_pyramid_level(data, level, size, OUTPUT_PATH)

    print("\n" + "=" * 70)
    print("COMPLETE!")
    print(f"Output: {OUTPUT_PATH}")
    print("=" * 70)


if __name__ == '__main__':
    main()
