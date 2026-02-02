#!/usr/bin/env python3
"""
Process Sea Ice Concentration data into Zarr pyramids using Polar Stereographic projection.
EPSG:3413 - NSIDC Sea Ice Polar Stereographic North
Real EUMETSAT OSI SAF data from CDS.
"""

import xarray as xr
import numpy as np
from pathlib import Path
import rioxarray
from rasterio.transform import from_bounds
from rasterio.crs import CRS
import warnings

warnings.filterwarnings('ignore')

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
ICE_FILE = DATA_DIR / "sea_ice" / "ice_conc_nh_ease2-250_icdr-v3p0_202301151200.nc"
OUTPUT_DIR = DATA_DIR / "pyramids" / "sea_ice_polar"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Pyramid levels - smaller sizes work better for polar data
PYRAMID_LEVELS = {
    0: 256,
    1: 512,
    2: 1024,
    3: 2048,
}

# EPSG:3413 - NSIDC Sea Ice Polar Stereographic North
# Bounds are approximately -3850000 to 3850000 meters in both x and y
# Centered on North Pole
POLAR_CRS = "EPSG:3413"
# Standard bounds for NSIDC polar stereographic
XMIN, YMIN, XMAX, YMAX = -3850000, -5350000, 3750000, 5850000


def process_sea_ice_polar():
    print("=" * 60)
    print("PROCESSING SEA ICE - POLAR STEREOGRAPHIC (EPSG:3413)")
    print("=" * 60)

    # Load sea ice data
    print(f"Loading {ICE_FILE}...")
    ds = xr.open_dataset(ICE_FILE)

    # Get ice_conc variable
    ice_conc = ds['ice_conc'].isel(time=0)

    # The data has 2D lat/lon arrays - need to handle this specially
    lat = ds['lat'].values
    lon = ds['lon'].values
    data = ice_conc.values

    print(f"  Original shape: {data.shape}")
    print(f"  Data range: {np.nanmin(data):.1f} to {np.nanmax(data):.1f}")
    print(f"  Lat range: {np.nanmin(lat):.1f} to {np.nanmax(lat):.1f}")
    print(f"  Lon range: {np.nanmin(lon):.1f} to {np.nanmax(lon):.1f}")

    # The source data is on EASE2 grid (EPSG:6931)
    # We need to create a proper xarray with CRS info

    # Get the original projection info from the file
    # EASE2 North is EPSG:6931
    source_crs = "EPSG:6931"

    # The xc, yc coordinates are the EASE2 grid coordinates
    xc = ds['xc'].values * 1000  # Convert km to m
    yc = ds['yc'].values * 1000  # Convert km to m

    print(f"  EASE2 X range: {xc.min():.0f} to {xc.max():.0f} m")
    print(f"  EASE2 Y range: {yc.min():.0f} to {yc.max():.0f} m")

    # Create a proper DataArray with EASE2 coordinates
    da = xr.DataArray(
        data,
        dims=['y', 'x'],
        coords={'y': yc, 'x': xc}
    )

    # Set the CRS
    da = da.rio.write_crs(source_crs)
    da = da.rio.set_spatial_dims(x_dim='x', y_dim='y')

    # Create pyramid levels
    for level, size in PYRAMID_LEVELS.items():
        print(f"\n  Level {level}: {size}x{size}")
        level_dir = OUTPUT_DIR / str(level)

        # Create transform for target grid in polar stereographic
        transform = from_bounds(XMIN, YMIN, XMAX, YMAX, size, size)

        # Reproject from EASE2 to Polar Stereographic North
        reprojected = da.rio.reproject(
            POLAR_CRS,
            shape=(size, size),
            transform=transform,
            resampling=1,  # Bilinear
        )

        rp_data = reprojected.values
        valid_count = np.sum(~np.isnan(rp_data) & (rp_data > 0))
        print(f"    Valid pixels: {valid_count}")
        print(f"    Data range: {np.nanmin(rp_data):.1f} to {np.nanmax(rp_data):.1f}")

        # Create coordinates in polar stereographic
        x = np.linspace(XMIN, XMAX, size)
        y = np.linspace(YMAX, YMIN, size)  # North to south

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
        result.attrs['crs'] = POLAR_CRS
        result.attrs['bounds'] = [XMIN, YMIN, XMAX, YMAX]

        # Chunk and save
        result = result.chunk({'time': 1, 'y': min(256, size), 'x': min(256, size)})
        result.to_zarr(level_dir, mode='w', consolidated=True, zarr_format=2)
        print(f"    Saved to {level_dir}")

    print(f"\nSea Ice POLAR pyramid complete: {OUTPUT_DIR}")

    # Also save projection info for the frontend
    proj_info = {
        'crs': POLAR_CRS,
        'bounds': [XMIN, YMIN, XMAX, YMAX],
        'center': [0, 90],  # North Pole
    }
    print(f"Projection info: {proj_info}")


if __name__ == "__main__":
    process_sea_ice_polar()
