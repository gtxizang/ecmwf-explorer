#!/usr/bin/env python3
"""
Download Earth Radiation Budget data from CDS API.
Required for ECMWF tender CJS2_231.
"""

import cdsapi
from pathlib import Path
import sys

DATA_DIR = Path(__file__).parent.parent / "data" / "raw"
DATA_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_FILE = DATA_DIR / "radiation_budget_2023.nc"

def try_download(client, request_params, description):
    """Attempt a download with given parameters."""
    print(f"\n{'='*60}")
    print(f"Attempting: {description}")
    print(f"{'='*60}")
    print(f"Parameters: {request_params}")

    try:
        client.retrieve(
            request_params['dataset'],
            request_params['options'],
            str(OUTPUT_FILE)
        )
        print(f"SUCCESS: Downloaded to {OUTPUT_FILE}")
        return True
    except Exception as e:
        print(f"FAILED: {e}")
        return False

def main():
    client = cdsapi.Client()

    # List of parameter combinations to try
    attempts = [
        # Attempt 1: CERES-based Earth Radiation Budget
        {
            'description': 'CERES Earth Radiation Budget (monthly)',
            'dataset': 'satellite-earth-radiation-budget',
            'options': {
                'origin': 'nasa_ceres_ebaf',
                'variable': [
                    'total_solar_irradiance',
                    'mean_surface_downwelling_shortwave_flux',
                    'mean_top_of_atmosphere_outgoing_shortwave_flux',
                    'mean_top_of_atmosphere_outgoing_longwave_flux',
                ],
                'product_family': 'monthly_mean_of_the_daily_mean',
                'climate_data_record_type': 'thematic_climate_data_record',
                'year': ['2023'],
                'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
                'version': 'v2_8',
            }
        },
        # Attempt 2: ERA5 radiation budget
        {
            'description': 'ERA5 Monthly Radiation Budget',
            'dataset': 'reanalysis-era5-single-levels-monthly-means',
            'options': {
                'product_type': 'monthly_averaged_reanalysis',
                'variable': [
                    'surface_net_solar_radiation',
                    'surface_net_thermal_radiation',
                    'top_net_solar_radiation',
                    'top_net_thermal_radiation',
                    'toa_incident_solar_radiation',
                ],
                'year': ['2023'],
                'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
                'time': '00:00',
                'data_format': 'netcdf',
            }
        },
        # Attempt 3: ERA5-Land radiation (subset)
        {
            'description': 'ERA5-Land Monthly Radiation',
            'dataset': 'reanalysis-era5-land-monthly-means',
            'options': {
                'product_type': 'monthly_averaged_reanalysis',
                'variable': [
                    'surface_net_solar_radiation',
                    'surface_net_thermal_radiation',
                ],
                'year': ['2023'],
                'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
                'time': '00:00',
                'data_format': 'netcdf',
            }
        },
    ]

    for attempt in attempts:
        if try_download(client, attempt, attempt['description']):
            print(f"\n{'='*60}")
            print("DOWNLOAD COMPLETE!")
            print(f"File: {OUTPUT_FILE}")
            print(f"Size: {OUTPUT_FILE.stat().st_size / 1024 / 1024:.1f} MB")
            print(f"{'='*60}")
            return 0

    print("\n" + "="*60)
    print("ALL ATTEMPTS FAILED")
    print("="*60)
    return 1

if __name__ == "__main__":
    sys.exit(main())
