#!/usr/bin/env python3
"""
Process multi-year climate data into optimized Zarr pyramids.
Creates pyramids with year and month dimensions for efficient time-series access.
"""

import xarray as xr
import numpy as np
from pathlib import Path
import warnings
import logging
from typing import Optional, List, Dict
import rioxarray
from rasterio.transform import from_bounds

warnings.filterwarnings('ignore')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
PYRAMID_DIR = DATA_DIR / "pyramids"

# Pyramid configuration - optimized for web loading
PYRAMID_LEVELS = {
    0: 128,    # Fastest initial load
    1: 256,    # Quick overview
    2: 512,    # Medium detail
    3: 1024,   # Good detail
    4: 2048,   # High detail
    5: 4096,   # Full detail
}

# Web Mercator bounds
WEB_MERCATOR_BOUNDS = (-20037508.34, -20037508.34, 20037508.34, 20037508.34)

# Chunk sizes optimized for HTTP range requests (256KB-1MB per chunk)
CHUNK_SIZE_SPATIAL = 256
CHUNK_SIZE_TIME = 1  # One month per chunk for fast random access


def process_soil_moisture_multiyear():
    """Process all soil moisture years into a single optimized pyramid with Web Mercator projection."""
    logger.info("=" * 60)
    logger.info("PROCESSING SOIL MOISTURE MULTI-YEAR PYRAMID (Web Mercator)")
    logger.info("=" * 60)

    input_dir = RAW_DIR / "soil_moisture_multiyear"
    output_dir = PYRAMID_DIR / "soil_moisture_multiyear"

    # Web Mercator configuration
    WEB_MERCATOR_CRS = "EPSG:3857"
    # World bounds in Web Mercator (meters) - same as single-year data
    XMIN, YMIN, XMAX, YMAX = WEB_MERCATOR_BOUNDS

    # Find all yearly files
    files = sorted(input_dir.glob("soil_moisture_*.nc"))
    files = [f for f in files if "combined" not in f.name]

    if not files:
        logger.error("No soil moisture files found!")
        return False

    logger.info(f"Found {len(files)} yearly files")

    # Extract years and sort
    years = []
    for f in files:
        try:
            year = int(f.stem.split("_")[-1])
            years.append((year, f))
        except ValueError:
            continue

    years.sort(key=lambda x: x[0])
    logger.info(f"Years: {years[0][0]} to {years[-1][0]}")

    # Load all data with proper coordinates for reprojection
    all_year_data = []
    year_list = []

    for year, filepath in years:
        logger.info(f"  Loading {year}...")
        try:
            ds = xr.open_dataset(filepath, engine='h5netcdf')

            # Get soil moisture variable
            var_name = None
            for v in ['swvl1', 'volumetric_soil_water_layer_1', 'soil_moisture']:
                if v in ds.data_vars:
                    var_name = v
                    break

            if var_name is None:
                logger.warning(f"  No soil moisture variable found in {filepath}")
                continue

            data = ds[var_name]

            # Handle time dimension
            if 'valid_time' in data.dims:
                data = data.rename({'valid_time': 'time'})
            if 'time' not in data.dims:
                data = data.expand_dims('time')

            # Ensure 12 months
            if data.sizes.get('time', 0) != 12:
                logger.warning(f"  Year {year} has {data.sizes.get('time', 0)} months, skipping")
                continue

            # Get coordinates
            lat = ds['latitude'].values if 'latitude' in ds else ds['lat'].values
            lon = ds['longitude'].values if 'longitude' in ds else ds['lon'].values

            # Store each month as a DataArray with proper coordinates for reprojection
            year_months = []
            for month_idx in range(12):
                month_data = data.isel(time=month_idx).values

                # Create DataArray with coordinates for rioxarray
                da = xr.DataArray(
                    month_data,
                    dims=['y', 'x'],
                    coords={'y': lat, 'x': lon}
                )
                da = da.rio.write_crs("EPSG:4326")
                da = da.rio.set_spatial_dims(x_dim='x', y_dim='y')
                year_months.append(da)

            all_year_data.append(year_months)
            year_list.append(year)
            ds.close()

        except Exception as e:
            logger.error(f"  Error loading {year}: {e}")
            continue

    if not all_year_data:
        logger.error("No data loaded!")
        return False

    logger.info(f"Loaded {len(year_list)} years successfully")

    # Create pyramids with Web Mercator reprojection
    for level, size in PYRAMID_LEVELS.items():
        logger.info(f"\n{'='*40}")
        logger.info(f"Level {level}: {size}x{size} (Web Mercator)")
        logger.info(f"{'='*40}")

        level_dir = output_dir / str(level)
        transform = from_bounds(XMIN, YMIN, XMAX, YMAX, size, size)

        # Reproject each year and month to Web Mercator
        level_data = []

        for year_idx, year in enumerate(year_list):
            year_reprojected = []
            for month_idx in range(12):
                da = all_year_data[year_idx][month_idx]

                # Reproject to Web Mercator
                reprojected = da.rio.reproject(
                    WEB_MERCATOR_CRS,
                    shape=(size, size),
                    transform=transform,
                    resampling=1,  # Bilinear
                )
                year_reprojected.append(reprojected.values)

            level_data.append(np.stack(year_reprojected, axis=0))

        # Stack all years: [year, month, y, x]
        data_array = np.stack(level_data, axis=0).astype(np.float32)
        logger.info(f"  Data shape: {data_array.shape}")

        # Create Web Mercator coordinates (in meters)
        x = np.linspace(XMIN, XMAX, size)
        y = np.linspace(YMAX, YMIN, size)  # Y is inverted (north at top)
        months = np.arange(12)

        # Create dataset with Web Mercator coordinates
        result = xr.Dataset({
            'soil_moisture': (['year', 'month', 'y', 'x'], data_array)
        })

        result = result.assign_coords({
            'year': year_list,
            'month': months,
            'x': x,
            'y': y,
        })

        result['soil_moisture'].attrs = {
            'long_name': 'Volumetric Soil Water Layer 1',
            'units': 'm³/m³',
            '_FillValue': np.nan,
        }

        result.attrs['crs'] = WEB_MERCATOR_CRS
        result.attrs['bounds'] = [XMIN, YMIN, XMAX, YMAX]
        result.attrs['year_range'] = f"{year_list[0]}-{year_list[-1]}"

        # Chunk for optimal web access
        chunk_size = min(CHUNK_SIZE_SPATIAL, size)
        result = result.chunk({
            'year': 1,
            'month': 1,
            'y': chunk_size,
            'x': chunk_size
        })

        # Save
        result.to_zarr(level_dir, mode='w', consolidated=True, zarr_format=2)
        logger.info(f"  Saved to {level_dir}")

    logger.info(f"\n{'='*60}")
    logger.info(f"Soil Moisture multi-year pyramid complete: {output_dir}")
    logger.info(f"Years: {year_list[0]} to {year_list[-1]} ({len(year_list)} years)")
    logger.info(f"Projection: EPSG:3857 (Web Mercator)")
    logger.info(f"{'='*60}")

    return True


def process_sea_ice_multiyear():
    """Process all sea ice years into a multi-year polar pyramid."""
    logger.info("=" * 60)
    logger.info("PROCESSING SEA ICE MULTI-YEAR PYRAMID")
    logger.info("=" * 60)

    input_dir = DATA_DIR / "sea_ice"
    output_dir = PYRAMID_DIR / "sea_ice_polar_multiyear"

    # Polar stereographic configuration
    POLAR_CRS = "EPSG:3413"
    XMIN, YMIN, XMAX, YMAX = -3850000, -5350000, 3750000, 5850000

    POLAR_LEVELS = {
        0: 256,
        1: 512,
        2: 1024,
        3: 2048,
    }

    # Find all monthly files and organize by year
    files = sorted(input_dir.glob("*.nc"))

    # Parse filenames to get year-month info
    year_month_data = {}

    for f in files:
        # Try to extract year and month from filename
        name = f.name
        # Pattern: ice_conc_nh_ease2-250_icdr-v3p0_202301151200.nc
        # or: ice_conc_nh_202301.nc
        year = month = None

        for pattern_year in range(1979, 2030):
            for pattern_month in range(1, 13):
                ym_str = f"{pattern_year}{pattern_month:02d}"
                if ym_str in name:
                    year = pattern_year
                    month = pattern_month
                    break
            if year:
                break

        if year and month:
            if year not in year_month_data:
                year_month_data[year] = {}
            year_month_data[year][month] = f

    # Filter to complete years (all 12 months)
    complete_years = {y: months for y, months in year_month_data.items() if len(months) == 12}

    if not complete_years:
        logger.error("No complete years found!")
        return False

    logger.info(f"Found {len(complete_years)} complete years: {sorted(complete_years.keys())}")

    # Load all data
    all_data = []
    year_list = sorted(complete_years.keys())

    for year in year_list:
        logger.info(f"  Loading {year}...")
        year_data = []

        for month in range(1, 13):
            filepath = complete_years[year][month]
            try:
                ds = xr.open_dataset(filepath, engine='h5netcdf')

                # Get ice concentration
                var_name = None
                for v in ['ice_conc', 'ice_concentration', 'sic']:
                    if v in ds.data_vars:
                        var_name = v
                        break

                if var_name is None:
                    logger.warning(f"  No ice concentration variable in {filepath}")
                    continue

                data = ds[var_name]
                if 'time' in data.dims:
                    data = data.isel(time=0)

                # Get EASE2 coordinates
                xc = ds['xc'].values * 1000 if ds['xc'].values.max() < 10000 else ds['xc'].values
                yc = ds['yc'].values * 1000 if ds['yc'].values.max() < 10000 else ds['yc'].values

                # Create DataArray with coordinates
                da = xr.DataArray(
                    data.values,
                    dims=['y', 'x'],
                    coords={'y': yc, 'x': xc}
                )
                da = da.rio.write_crs("EPSG:6931")
                da = da.rio.set_spatial_dims(x_dim='x', y_dim='y')

                year_data.append(da)
                ds.close()

            except Exception as e:
                logger.error(f"  Error loading {year}-{month}: {e}")
                return False

        all_data.append(year_data)

    # Create pyramids
    for level, size in POLAR_LEVELS.items():
        logger.info(f"\n{'='*40}")
        logger.info(f"Level {level}: {size}x{size}")
        logger.info(f"{'='*40}")

        level_dir = output_dir / str(level)
        transform = from_bounds(XMIN, YMIN, XMAX, YMAX, size, size)

        # Process each year and month
        level_data = []

        for year_idx, year in enumerate(year_list):
            year_reprojected = []
            for month_idx in range(12):
                da = all_data[year_idx][month_idx]

                reprojected = da.rio.reproject(
                    POLAR_CRS,
                    shape=(size, size),
                    transform=transform,
                    resampling=1,
                )
                year_reprojected.append(reprojected.values)

            level_data.append(np.stack(year_reprojected, axis=0))

        # Stack all years
        data_array = np.stack(level_data, axis=0).astype(np.float32)
        logger.info(f"  Data shape: {data_array.shape}")

        # Create coordinates
        x = np.linspace(XMIN, XMAX, size)
        y = np.linspace(YMAX, YMIN, size)
        months = np.arange(12)

        result = xr.Dataset({
            'ice_concentration': (['year', 'month', 'y', 'x'], data_array)
        })

        result = result.assign_coords({
            'year': year_list,
            'month': months,
            'x': x,
            'y': y,
        })

        result['ice_concentration'].attrs = {
            'long_name': 'Sea Ice Concentration',
            'units': '%',
            '_FillValue': np.nan,
        }

        result.attrs['crs'] = POLAR_CRS
        result.attrs['bounds'] = [XMIN, YMIN, XMAX, YMAX]

        # Chunk
        result = result.chunk({
            'year': 1,
            'month': 1,
            'y': min(256, size),
            'x': min(256, size)
        })

        result.to_zarr(level_dir, mode='w', consolidated=True, zarr_format=2)
        logger.info(f"  Saved to {level_dir}")

    logger.info(f"\n{'='*60}")
    logger.info(f"Sea Ice multi-year pyramid complete: {output_dir}")
    logger.info(f"Years: {year_list[0]} to {year_list[-1]} ({len(year_list)} years)")
    logger.info(f"{'='*60}")

    return True


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        if sys.argv[1] == "soil_moisture":
            process_soil_moisture_multiyear()
        elif sys.argv[1] == "sea_ice":
            process_sea_ice_multiyear()
        else:
            print(f"Unknown dataset: {sys.argv[1]}")
            print("Usage: python process_multiyear_pyramids.py [soil_moisture|sea_ice]")
    else:
        # Process all
        process_soil_moisture_multiyear()
        process_sea_ice_multiyear()
