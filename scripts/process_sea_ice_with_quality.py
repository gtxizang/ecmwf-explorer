#!/usr/bin/env python3
"""
Process Sea Ice Concentration data WITH QUALITY/UNCERTAINTY variables.
Creates Zarr pyramids in Polar Stereographic projection (EPSG:3413).
Includes: ice_concentration, total_uncertainty, status_flag

This demonstrates the POC requirement for "Visual Indications of Uncertainty,
Flagged Data and Gaps in Coverage" (Requirement 27).
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
ICE_DIR = DATA_DIR / "sea_ice_test"  # Use test directory with sample file
OUTPUT_DIR = DATA_DIR / "pyramids" / "sea_ice_with_quality"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Pyramid levels
PYRAMID_LEVELS = {
    0: 256,
    1: 512,
    2: 1024,
}

# EPSG:3413 - NSIDC Sea Ice Polar Stereographic North
POLAR_CRS = "EPSG:3413"
XMIN, YMIN, XMAX, YMAX = -3850000, -5350000, 3750000, 5850000


def load_sea_ice_with_quality(nc_file):
    """Load sea ice data including quality/uncertainty variables."""
    print(f"Loading {nc_file.name}...")
    ds = xr.open_dataset(nc_file, engine='h5netcdf')

    # Get EASE2 coordinates (convert km to m if needed)
    xc = ds['xc'].values * 1000 if ds['xc'].values.max() < 10000 else ds['xc'].values
    yc = ds['yc'].values * 1000 if ds['yc'].values.max() < 10000 else ds['yc'].values

    result = {}

    # 1. Ice concentration (main variable)
    if 'ice_conc' in ds:
        data = ds['ice_conc'].isel(time=0).values if 'time' in ds['ice_conc'].dims else ds['ice_conc'].values
        da = xr.DataArray(data, dims=['y', 'x'], coords={'y': yc, 'x': xc})
        da = da.rio.write_crs("EPSG:6931")
        da = da.rio.set_spatial_dims(x_dim='x', y_dim='y')
        result['ice_concentration'] = da
        print(f"  ice_concentration: {np.nanmin(data):.1f} to {np.nanmax(data):.1f}%")

    # 2. Total uncertainty
    if 'total_standard_uncertainty' in ds:
        data = ds['total_standard_uncertainty'].isel(time=0).values if 'time' in ds['total_standard_uncertainty'].dims else ds['total_standard_uncertainty'].values
        da = xr.DataArray(data, dims=['y', 'x'], coords={'y': yc, 'x': xc})
        da = da.rio.write_crs("EPSG:6931")
        da = da.rio.set_spatial_dims(x_dim='x', y_dim='y')
        result['total_uncertainty'] = da
        print(f"  total_uncertainty: {np.nanmin(data):.1f} to {np.nanmax(data):.1f}%")

    # 3. Status flag (quality indicators)
    if 'status_flag' in ds:
        data = ds['status_flag'].isel(time=0).values if 'time' in ds['status_flag'].dims else ds['status_flag'].values
        da = xr.DataArray(data, dims=['y', 'x'], coords={'y': yc, 'x': xc})
        da = da.rio.write_crs("EPSG:6931")
        da = da.rio.set_spatial_dims(x_dim='x', y_dim='y')
        result['status_flag'] = da
        unique_flags = np.unique(data[~np.isnan(data)])
        print(f"  status_flag: unique values = {unique_flags[:10]}...")

    ds.close()
    return result


def process_with_quality():
    """Process sea ice data including quality variables into Zarr pyramid."""
    print("=" * 60)
    print("PROCESSING SEA ICE WITH QUALITY/UNCERTAINTY")
    print("=" * 60)

    # Find the sample file
    nc_files = list(ICE_DIR.glob("*.nc"))
    if not nc_files:
        print(f"ERROR: No NetCDF files found in {ICE_DIR}")
        print("Run download_sea_ice_sample.py first")
        return

    nc_file = nc_files[0]

    # Load all variables
    data_arrays = load_sea_ice_with_quality(nc_file)

    if 'ice_concentration' not in data_arrays:
        print("ERROR: Could not load ice concentration data")
        return

    # Create pyramid levels
    for level, size in PYRAMID_LEVELS.items():
        print(f"\n{'='*40}")
        print(f"Level {level}: {size}x{size}")
        print(f"{'='*40}")

        level_dir = OUTPUT_DIR / str(level)
        transform = from_bounds(XMIN, YMIN, XMAX, YMAX, size, size)

        processed = {}

        for var_name, da in data_arrays.items():
            # Reproject to polar stereographic
            if var_name == 'status_flag':
                # Use nearest neighbor for categorical data
                reprojected = da.rio.reproject(
                    POLAR_CRS,
                    shape=(size, size),
                    transform=transform,
                    resampling=0,  # Nearest neighbor for flags
                )
            else:
                # Use bilinear for continuous data
                reprojected = da.rio.reproject(
                    POLAR_CRS,
                    shape=(size, size),
                    transform=transform,
                    resampling=1,  # Bilinear
                )

            # Expand to 12 "months" for compatibility with existing viewer
            rp_data = reprojected.values
            time_data = np.stack([rp_data] * 12, axis=0)
            processed[var_name] = time_data

            valid = rp_data[~np.isnan(rp_data)]
            if len(valid) > 0:
                print(f"  {var_name}: mean={valid.mean():.2f}, valid={len(valid)} pixels")

        # Create coordinates
        x = np.linspace(XMIN, XMAX, size)
        y = np.linspace(YMAX, YMIN, size)

        # Build dataset with all variables
        data_vars = {}
        for var_name, time_data in processed.items():
            data_vars[var_name] = (['time', 'y', 'x'], time_data.astype(np.float32))

        result = xr.Dataset(data_vars)

        result = result.assign_coords({
            'time': np.arange(12),
            'x': x,
            'y': y,
        })

        # Add metadata
        result['ice_concentration'].attrs = {
            'long_name': 'Sea Ice Concentration',
            'units': '%',
            '_FillValue': np.nan,
        }

        if 'total_uncertainty' in result:
            result['total_uncertainty'].attrs = {
                'long_name': 'Total Standard Uncertainty',
                'units': '%',
                '_FillValue': np.nan,
            }

        if 'status_flag' in result:
            result['status_flag'].attrs = {
                'long_name': 'Status Flag',
                'flag_meanings': 'land lake open_water_filtered land_spill_over high_t2m spatial_interp temporal_interp max_ice_climo',
                '_FillValue': np.nan,
            }

        result.attrs['crs'] = POLAR_CRS
        result.attrs['bounds'] = [XMIN, YMIN, XMAX, YMAX]
        result.attrs['has_quality_layers'] = True

        # Chunk and save
        result = result.chunk({'time': 1, 'y': min(256, size), 'x': min(256, size)})
        result.to_zarr(level_dir, mode='w', consolidated=True, zarr_format=2)
        print(f"  Saved to {level_dir}")

    print(f"\n{'='*60}")
    print("SEA ICE WITH QUALITY PYRAMID COMPLETE")
    print(f"{'='*60}")
    print(f"Output: {OUTPUT_DIR}")
    print(f"\nVariables included:")
    for var_name in data_arrays.keys():
        print(f"  - {var_name}")
    print(f"\nFrontend can now visualize:")
    print("  - ice_concentration (main data)")
    print("  - total_uncertainty (uncertainty layer)")
    print("  - status_flag (quality flags for hatching/masking)")


if __name__ == "__main__":
    process_with_quality()
