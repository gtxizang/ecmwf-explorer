#!/usr/bin/env python3
"""
Download Soil Moisture data from CDS API.
Tries multiple parameter combinations if initial attempt fails.
"""

import cdsapi
from pathlib import Path
import sys

DATA_DIR = Path(__file__).parent.parent / "data" / "raw"
DATA_DIR.mkdir(parents=True, exist_ok=True)

OUTPUT_FILE = DATA_DIR / "soil_moisture.nc"

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
        # Attempt 1: Satellite soil moisture - active/passive combined
        {
            'description': 'Satellite Soil Moisture (Combined Active-Passive)',
            'dataset': 'satellite-soil-moisture',
            'options': {
                'variable': 'volumetric_surface_soil_moisture',
                'type_of_sensor': 'combined_passive_and_active',
                'time_aggregation': 'month_average',
                'year': ['2023'],
                'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
                'day': '01',
                'type_of_record': 'cdr',
                'version': 'v202212',
                'format': 'netcdf',
            }
        },
        # Attempt 2: Satellite soil moisture - passive only
        {
            'description': 'Satellite Soil Moisture (Passive)',
            'dataset': 'satellite-soil-moisture',
            'options': {
                'variable': 'volumetric_surface_soil_moisture',
                'type_of_sensor': 'passive',
                'time_aggregation': 'month_average',
                'year': ['2023'],
                'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
                'day': '01',
                'type_of_record': 'cdr',
                'version': 'v202212',
                'format': 'netcdf',
            }
        },
        # Attempt 3: Satellite soil moisture - active only
        {
            'description': 'Satellite Soil Moisture (Active)',
            'dataset': 'satellite-soil-moisture',
            'options': {
                'variable': 'volumetric_surface_soil_moisture',
                'type_of_sensor': 'active',
                'time_aggregation': 'month_average',
                'year': ['2023'],
                'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
                'day': '01',
                'type_of_record': 'cdr',
                'version': 'v202212',
                'format': 'netcdf',
            }
        },
        # Attempt 4: Try ICDR instead of CDR
        {
            'description': 'Satellite Soil Moisture (ICDR - Interim)',
            'dataset': 'satellite-soil-moisture',
            'options': {
                'variable': 'volumetric_surface_soil_moisture',
                'type_of_sensor': 'combined_passive_and_active',
                'time_aggregation': 'month_average',
                'year': ['2023'],
                'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
                'day': '01',
                'type_of_record': 'icdr',
                'version': 'v202212',
                'format': 'netcdf',
            }
        },
        # Attempt 5: ERA5-Land volumetric soil water
        {
            'description': 'ERA5-Land Soil Moisture (reanalysis fallback)',
            'dataset': 'reanalysis-era5-land-monthly-means',
            'options': {
                'product_type': 'monthly_averaged_reanalysis',
                'variable': ['volumetric_soil_water_layer_1', 'volumetric_soil_water_layer_2'],
                'year': ['2023'],
                'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
                'time': '00:00',
                'format': 'netcdf',
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
