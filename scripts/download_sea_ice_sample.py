#!/usr/bin/env python3
"""
Download a single Sea Ice file to inspect available variables.
"""

import cdsapi
from pathlib import Path
import xarray as xr

DATA_DIR = Path(__file__).parent.parent / "data" / "sea_ice_test"
DATA_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_FILE = DATA_DIR / "ice_conc_sample_2023_01.nc"

def download_sample():
    """Download one month of sea ice data with ALL variables."""
    print("Downloading sea ice sample (2023-01)...")

    if OUTPUT_FILE.exists():
        print(f"File already exists: {OUTPUT_FILE}")
    else:
        client = cdsapi.Client()

        client.retrieve(
            'satellite-sea-ice-concentration',
            {
                'sensor': 'ssmis',
                'region': 'northern_hemisphere',
                'cdr_type': 'icdr',
                'temporal_aggregation': 'daily',
                'variable': 'all',  # Get ALL variables including quality/uncertainty
                'year': '2023',
                'month': '01',
                'day': '15',
                'version': '3_0',
            },
            str(OUTPUT_FILE)
        )

        # Handle ZIP if needed
        with open(OUTPUT_FILE, 'rb') as f:
            header = f.read(4)
        if header[:4] == b'PK\x03\x04':
            print("Extracting ZIP...")
            import zipfile
            import shutil

            zip_path = OUTPUT_FILE.with_suffix('.zip')
            shutil.move(OUTPUT_FILE, zip_path)

            with zipfile.ZipFile(zip_path, 'r') as zf:
                for name in zf.namelist():
                    if name.endswith('.nc'):
                        extracted = DATA_DIR / "ice_conc_sample.nc"
                        with zf.open(name) as src, open(extracted, 'wb') as dst:
                            dst.write(src.read())
                        print(f"Extracted: {extracted}")
                        zip_path.unlink()
                        return extracted

    return OUTPUT_FILE


def inspect_variables(nc_file):
    """Inspect all variables in the NetCDF file."""
    print(f"\n{'='*60}")
    print("INSPECTING SEA ICE NETCDF VARIABLES")
    print(f"{'='*60}")

    # Find the actual NC file
    if not nc_file.exists():
        nc_files = list(DATA_DIR.glob("*.nc"))
        if nc_files:
            nc_file = nc_files[0]
        else:
            print("No NetCDF file found!")
            return

    print(f"File: {nc_file}")

    ds = xr.open_dataset(nc_file)

    print(f"\n--- DATA VARIABLES ({len(ds.data_vars)}) ---")
    for var_name in ds.data_vars:
        var = ds[var_name]
        print(f"\n  {var_name}:")
        print(f"    Shape: {var.shape}")
        print(f"    Dtype: {var.dtype}")
        if 'long_name' in var.attrs:
            print(f"    Long name: {var.attrs['long_name']}")
        if 'units' in var.attrs:
            print(f"    Units: {var.attrs['units']}")
        if 'flag_meanings' in var.attrs:
            print(f"    Flag meanings: {var.attrs['flag_meanings']}")

    print(f"\n--- COORDINATES ({len(ds.coords)}) ---")
    for coord_name in ds.coords:
        coord = ds[coord_name]
        print(f"  {coord_name}: shape={coord.shape}, dtype={coord.dtype}")

    print(f"\n--- QUALITY/UNCERTAINTY VARIABLES ---")
    quality_vars = [v for v in ds.data_vars if any(q in v.lower() for q in ['quality', 'flag', 'status', 'uncert', 'error', 'mask'])]
    if quality_vars:
        for v in quality_vars:
            print(f"  FOUND: {v}")
    else:
        print("  None found with standard naming")

    ds.close()
    return ds


if __name__ == "__main__":
    nc_file = download_sample()
    inspect_variables(nc_file)
