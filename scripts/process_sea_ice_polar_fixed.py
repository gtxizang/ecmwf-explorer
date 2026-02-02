#!/usr/bin/env python3
"""
Process Sea Ice Concentration data into Zarr pyramids using Polar Stereographic projection.
EPSG:3413 - NSIDC Sea Ice Polar Stereographic North
Processes all 12 months of 2023 data.
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
ICE_DIR = DATA_DIR / "sea_ice"
OUTPUT_DIR = DATA_DIR / "pyramids" / "sea_ice_polar"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Pyramid levels
PYRAMID_LEVELS = {
    0: 256,
    1: 512,
    2: 1024,
    3: 2048,
}

# EPSG:3413 - NSIDC Sea Ice Polar Stereographic North
POLAR_CRS = "EPSG:3413"
XMIN, YMIN, XMAX, YMAX = -3850000, -5350000, 3750000, 5850000

MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
YEAR = '2023'


def load_monthly_data():
    """Load all monthly sea ice files and return list of DataArrays."""
    monthly_data = []

    for month in MONTHS:
        # Try different file naming patterns
        patterns = [
            f"ice_conc_nh_{YEAR}{month}.nc",
            f"ice_conc_nh_ease2-250_icdr-v3p0_{YEAR}{month}151200.nc",
        ]

        file_found = None
        for pattern in patterns:
            f = ICE_DIR / pattern
            if f.exists():
                file_found = f
                break

        if file_found:
            print(f"  Month {month}: Loading {file_found.name}")
            ds = xr.open_dataset(file_found, engine='h5netcdf')

            # Get ice concentration
            if 'ice_conc' in ds:
                ice_conc = ds['ice_conc'].isel(time=0) if 'time' in ds['ice_conc'].dims else ds['ice_conc']
            else:
                # Try other variable names
                for var in ['ice_concentration', 'sic', 'sea_ice_concentration']:
                    if var in ds:
                        ice_conc = ds[var].isel(time=0) if 'time' in ds[var].dims else ds[var]
                        break
                else:
                    print(f"    WARNING: Could not find ice concentration variable")
                    monthly_data.append(None)
                    continue

            data = ice_conc.values

            # Get EASE2 coordinates
            xc = ds['xc'].values * 1000 if ds['xc'].values.max() < 10000 else ds['xc'].values
            yc = ds['yc'].values * 1000 if ds['yc'].values.max() < 10000 else ds['yc'].values

            # Create DataArray with proper coordinates
            da = xr.DataArray(
                data,
                dims=['y', 'x'],
                coords={'y': yc, 'x': xc}
            )
            da = da.rio.write_crs("EPSG:6931")  # EASE2 North
            da = da.rio.set_spatial_dims(x_dim='x', y_dim='y')

            monthly_data.append(da)

            valid_pct = 100 * np.sum(~np.isnan(data) & (data > 0)) / data.size
            print(f"    Data range: {np.nanmin(data):.1f} to {np.nanmax(data):.1f}, valid: {valid_pct:.1f}%")

            ds.close()
        else:
            print(f"  Month {month}: No file found, will interpolate")
            monthly_data.append(None)

    return monthly_data


def process_sea_ice_polar():
    print("=" * 60)
    print("PROCESSING SEA ICE - POLAR STEREOGRAPHIC (EPSG:3413)")
    print("=" * 60)

    # Load all monthly data
    print("\nLoading monthly data...")
    monthly_data = load_monthly_data()

    # Count available months
    available = [i for i, d in enumerate(monthly_data) if d is not None]
    print(f"\nAvailable months: {len(available)}/12")

    if len(available) == 0:
        print("ERROR: No data available!")
        return

    # If some months are missing, fill with nearest available
    for i in range(12):
        if monthly_data[i] is None:
            # Find nearest available month
            distances = [(abs(i - a), a) for a in available]
            nearest = min(distances)[1]
            monthly_data[i] = monthly_data[nearest]
            print(f"  Month {i+1}: Filled with month {nearest+1} data")

    # Create pyramid levels
    for level, size in PYRAMID_LEVELS.items():
        print(f"\n{'='*40}")
        print(f"Level {level}: {size}x{size}")
        print(f"{'='*40}")
        level_dir = OUTPUT_DIR / str(level)

        transform = from_bounds(XMIN, YMIN, XMAX, YMAX, size, size)

        # Process each month
        time_data = []
        for month_idx, da in enumerate(monthly_data):
            # Reproject
            reprojected = da.rio.reproject(
                POLAR_CRS,
                shape=(size, size),
                transform=transform,
                resampling=1,  # Bilinear
            )
            time_data.append(reprojected.values)

            if month_idx == 0 or month_idx == 6:  # Print Jan and Jul for comparison
                rp_data = reprojected.values
                valid = rp_data[~np.isnan(rp_data) & (rp_data > 0)]
                print(f"  Month {MONTHS[month_idx]}: mean={valid.mean():.1f}, valid={len(valid)} pixels")

        # Stack into time dimension
        time_data = np.stack(time_data, axis=0)

        # Create coordinates
        x = np.linspace(XMIN, XMAX, size)
        y = np.linspace(YMAX, YMIN, size)

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
        print(f"  Saved to {level_dir}")

    print(f"\n{'='*60}")
    print(f"Sea Ice POLAR pyramid complete: {OUTPUT_DIR}")
    print(f"{'='*60}")


if __name__ == "__main__":
    process_sea_ice_polar()
