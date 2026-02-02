#!/usr/bin/env python3
"""
Create Zarr pyramids for browser-native visualization.
Uses ndpyramid to generate multi-resolution pyramids suitable for @carbonplan/maps.
"""

import xarray as xr
import numpy as np
from pathlib import Path
import warnings

warnings.filterwarnings('ignore')

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
PYRAMIDS_DIR = DATA_DIR / "pyramids"
PYRAMIDS_DIR.mkdir(parents=True, exist_ok=True)


def create_pyramid_simple(ds, var_name, output_path, levels=5):
    """
    Create a simple multi-resolution pyramid by coarsening.
    This is a simpler approach than ndpyramid for datasets that don't need reprojection.
    """
    print(f"Creating pyramid for {var_name} with {levels} levels...")

    data = ds[var_name]

    # Ensure we have lat/lon coordinates
    lat_dim = 'latitude' if 'latitude' in data.dims else 'lat'
    lon_dim = 'longitude' if 'longitude' in data.dims else 'lon'

    pyramids = {}

    for level in range(levels):
        factor = 2 ** level
        print(f"  Level {level}: factor {factor}x...")

        if level == 0:
            level_data = data
        else:
            # Coarsen by averaging
            level_data = data.coarsen(
                {lat_dim: factor, lon_dim: factor},
                boundary='trim'
            ).mean()

        # Rechunk for web access (small chunks)
        chunk_size = min(128, level_data.sizes.get(lat_dim, 128))
        chunks = {lat_dim: chunk_size, lon_dim: chunk_size}
        if 'time' in level_data.dims:
            chunks['time'] = 1
        if 'valid_time' in level_data.dims:
            chunks['valid_time'] = 1

        level_data = level_data.chunk(chunks)
        pyramids[level] = level_data

    # Save each level
    for level, level_data in pyramids.items():
        level_path = output_path / str(level)
        print(f"  Saving level {level} to {level_path}...")

        # Create dataset with proper metadata
        level_ds = level_data.to_dataset(name=var_name)

        # Add metadata for @carbonplan/maps
        level_ds.attrs['multiscales'] = [{
            'datasets': [{'path': str(i)} for i in range(levels)],
            'type': 'reduce',
            'method': 'mean'
        }]

        level_ds.to_zarr(level_path, mode='w', consolidated=True)

    print(f"  Done! Pyramid saved to {output_path}")
    return pyramids


def process_sea_ice():
    """Process Sea Ice data (polar stereographic → needs special handling)."""
    print("\n" + "="*60)
    print("Processing SEA ICE")
    print("="*60)

    nc_path = DATA_DIR / "sea_ice" / "ice_conc_nh_ease2-250_icdr-v3p0_202301151200.nc"
    if not nc_path.exists():
        print(f"  File not found: {nc_path}")
        return

    ds = xr.open_dataset(nc_path)
    print(f"  Variables: {list(ds.data_vars)}")
    print(f"  Dims: {dict(ds.sizes)}")

    # Sea ice is in Lambert Azimuthal Equal Area projection
    # For now, save the raw data as Zarr - reprojection can be done later
    output_path = PYRAMIDS_DIR / "sea_ice"

    # Get ice concentration
    ice_conc = ds['ice_conc']

    # Save as single-level Zarr for now (projection handling needed for full pyramid)
    print(f"  Saving to {output_path}...")
    ice_ds = ice_conc.to_dataset(name='ice_conc')

    # Add projection info for frontend
    ice_ds.attrs['projection'] = 'lambert_azimuthal_equal_area'
    ice_ds.attrs['proj4'] = '+proj=laea +lon_0=0 +lat_0=90 +datum=WGS84'
    ice_ds.attrs['note'] = 'Polar stereographic - requires reprojection for web mercator display'

    # Chunk for web
    ice_ds = ice_ds.chunk({'xc': 128, 'yc': 128, 'time': 1})
    ice_ds.to_zarr(output_path / "0", mode='w', consolidated=True)

    print(f"  Sea ice saved (single level, needs reprojection for web)")


def process_fire():
    """Process Fire Burned Area data."""
    print("\n" + "="*60)
    print("Processing FIRE BURNED AREA")
    print("="*60)

    nc_path = DATA_DIR / "fire" / "20230101-C3S-L4_FIRE-BA-OLCI-fv1.1.nc"
    if not nc_path.exists():
        print(f"  File not found: {nc_path}")
        return

    ds = xr.open_dataset(nc_path)
    print(f"  Variables: {list(ds.data_vars)}")
    print(f"  Dims: {dict(ds.sizes)}")

    output_path = PYRAMIDS_DIR / "fire_burned_area"

    # Get burned area variable
    burned_area = ds['burned_area']
    print(f"  burned_area shape: {burned_area.shape}")

    # Create pyramid
    create_pyramid_simple(ds, 'burned_area', output_path, levels=4)


def process_soil_moisture():
    """Process Soil Moisture data as example of regular grid."""
    print("\n" + "="*60)
    print("Processing SOIL MOISTURE")
    print("="*60)

    nc_path = DATA_DIR / "soil_moisture_extracted" / "data_stream-moda.nc"
    if not nc_path.exists():
        print(f"  File not found: {nc_path}")
        return

    ds = xr.open_dataset(nc_path)
    print(f"  Variables: {list(ds.data_vars)}")
    print(f"  Dims: {dict(ds.sizes)}")

    output_path = PYRAMIDS_DIR / "soil_moisture"

    # Create pyramid for swvl1 (volumetric soil water layer 1)
    create_pyramid_simple(ds, 'swvl1', output_path, levels=4)


def main():
    print("="*60)
    print("ZARR PYRAMID GENERATION")
    print("="*60)
    print(f"Output directory: {PYRAMIDS_DIR}")

    # Process each dataset
    process_fire()
    process_soil_moisture()
    process_sea_ice()

    print("\n" + "="*60)
    print("COMPLETE")
    print("="*60)
    print(f"Pyramids saved to: {PYRAMIDS_DIR}")
    print("\nNext steps:")
    print("1. Serve pyramids: python -m http.server 8080 -d data/pyramids")
    print("2. Use @carbonplan/maps in frontend")


if __name__ == "__main__":
    main()
