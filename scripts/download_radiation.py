#!/usr/bin/env python3
"""
Download CERES Solar Radiation data from CDS (Copernicus Climate Data Store).

This script downloads Earth Radiation Budget data including:
- Incoming solar flux (Total Solar Irradiance)
- Surface downwelling shortwave radiation
- TOA outgoing shortwave/longwave radiation

Uses the satellite-earth-radiation-budget dataset from CDS.
"""

import cdsapi
from pathlib import Path
import sys
import os
from datetime import datetime

# Configuration
DATA_DIR = Path(__file__).parent.parent / "data" / "raw" / "ceres_radiation"
DATA_DIR.mkdir(parents=True, exist_ok=True)

LOG_FILE = DATA_DIR / "download_log.txt"

# Years to download
YEARS = ['2020', '2021', '2022', '2023', '2024']
MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

def log(message):
    """Log to both console and file."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_msg = f"[{timestamp}] {message}"
    print(log_msg)
    with open(LOG_FILE, 'a') as f:
        f.write(log_msg + "\n")

def download_ceres_radiation(client):
    """
    Download CERES Earth Radiation Budget data.

    Variables available in satellite-earth-radiation-budget dataset:
    - total_solar_irradiance (incoming solar at TOA)
    - mean_surface_downwelling_shortwave_flux (solar reaching surface)
    - mean_surface_downwelling_longwave_flux
    - mean_surface_upwelling_shortwave_flux
    - mean_surface_upwelling_longwave_flux
    - mean_top_of_atmosphere_outgoing_shortwave_flux (reflected solar)
    - mean_top_of_atmosphere_outgoing_longwave_flux (thermal emission)
    """

    # Download surface radiation components (complement to existing TOA data)
    surface_vars = [
        'mean_surface_downwelling_shortwave_flux',
        'mean_surface_downwelling_longwave_flux',
        'mean_surface_upwelling_shortwave_flux',
        'mean_surface_upwelling_longwave_flux',
    ]

    output_file = DATA_DIR / "ceres_surface_radiation_2020-2024.nc"

    if output_file.exists():
        log(f"File already exists: {output_file}")
        log("Skipping download. Delete file to re-download.")
        return True

    log(f"Downloading CERES surface radiation data...")
    log(f"Variables: {surface_vars}")
    log(f"Years: {YEARS}")
    log(f"Output: {output_file}")

    try:
        client.retrieve(
            'satellite-earth-radiation-budget',
            {
                'origin': 'nasa_ceres_ebaf',
                'variable': surface_vars,
                'product_family': 'monthly_mean_of_the_daily_mean',
                'climate_data_record_type': 'thematic_climate_data_record',
                'year': YEARS,
                'month': MONTHS,
                'version': 'v4_2',  # Latest version
            },
            str(output_file)
        )
        log(f"SUCCESS: Downloaded to {output_file}")
        log(f"File size: {output_file.stat().st_size / 1024 / 1024:.1f} MB")
        return True
    except Exception as e:
        log(f"FAILED (CERES surface): {e}")
        return False


def download_era5_radiation(client):
    """
    Download ERA5 radiation data as alternative/complement.

    ERA5 provides high-resolution reanalysis radiation fields:
    - toa_incident_solar_radiation (incoming at TOA)
    - surface_solar_radiation_downwards
    - surface_net_solar_radiation
    - surface_thermal_radiation_downwards
    - surface_net_thermal_radiation
    - top_net_solar_radiation
    - top_net_thermal_radiation
    """

    output_file = DATA_DIR / "era5_radiation_2020-2024.nc"

    if output_file.exists():
        log(f"File already exists: {output_file}")
        log("Skipping download. Delete file to re-download.")
        return True

    log(f"Downloading ERA5 radiation data...")
    log(f"Years: {YEARS}")
    log(f"Output: {output_file}")

    variables = [
        'toa_incident_solar_radiation',
        'surface_solar_radiation_downwards',
        'surface_net_solar_radiation',
        'surface_thermal_radiation_downwards',
        'surface_net_thermal_radiation',
        'top_net_solar_radiation',
        'top_net_thermal_radiation',
    ]

    log(f"Variables: {variables}")

    try:
        client.retrieve(
            'reanalysis-era5-single-levels-monthly-means',
            {
                'product_type': 'monthly_averaged_reanalysis',
                'variable': variables,
                'year': YEARS,
                'month': MONTHS,
                'time': '00:00',
                'data_format': 'netcdf',
            },
            str(output_file)
        )
        log(f"SUCCESS: Downloaded to {output_file}")
        log(f"File size: {output_file.stat().st_size / 1024 / 1024:.1f} MB")
        return True
    except Exception as e:
        log(f"FAILED (ERA5): {e}")
        return False


def download_era5_hourly_sample(client):
    """
    Download a sample of ERA5 hourly radiation data for 2024.
    Useful for diurnal cycle analysis.
    """

    output_file = DATA_DIR / "era5_radiation_hourly_sample_2024.nc"

    if output_file.exists():
        log(f"File already exists: {output_file}")
        return True

    log("Downloading ERA5 hourly radiation sample (2024 summer months)...")

    try:
        client.retrieve(
            'reanalysis-era5-single-levels',
            {
                'product_type': 'reanalysis',
                'variable': [
                    'surface_solar_radiation_downwards',
                    'top_net_solar_radiation',
                ],
                'year': '2024',
                'month': ['06', '07', '08'],  # Summer months
                'day': ['01', '15'],  # Sample days
                'time': ['00:00', '06:00', '12:00', '18:00'],  # 4 times per day
                'data_format': 'netcdf',
            },
            str(output_file)
        )
        log(f"SUCCESS: Downloaded hourly sample to {output_file}")
        return True
    except Exception as e:
        log(f"FAILED (ERA5 hourly): {e}")
        return False


def check_existing_data():
    """Report on existing radiation data."""
    existing_dir = Path(__file__).parent.parent / "data" / "raw" / "radiation_budget_extracted"

    if existing_dir.exists():
        files = list(existing_dir.glob("*.nc"))
        log(f"Found {len(files)} existing radiation files in {existing_dir}")

        # Count by variable type
        var_counts = {}
        for f in files:
            name = f.name
            # Extract variable name
            if 'solar_mon' in name:
                var = 'solar_mon (TSI)'
            elif 'toa_lw_all' in name:
                var = 'toa_lw_all (outgoing LW)'
            elif 'toa_sw_all' in name:
                var = 'toa_sw_all (outgoing SW)'
            else:
                var = 'other'
            var_counts[var] = var_counts.get(var, 0) + 1

        log("Existing data breakdown:")
        for var, count in sorted(var_counts.items()):
            log(f"  - {var}: {count} files")
    else:
        log("No existing radiation_budget_extracted directory found")


def main():
    log("="*60)
    log("CERES/ERA5 Radiation Data Download Script")
    log("="*60)

    # Check what already exists
    check_existing_data()

    log("")
    log("Starting new downloads...")
    log("")

    # Initialize CDS API client
    try:
        client = cdsapi.Client()
        log("CDS API client initialized successfully")
    except Exception as e:
        log(f"Failed to initialize CDS API client: {e}")
        log("Make sure ~/.cdsapirc is configured correctly")
        return 1

    success_count = 0
    total_attempts = 0

    # Try CERES surface radiation
    total_attempts += 1
    if download_ceres_radiation(client):
        success_count += 1

    # Try ERA5 monthly radiation
    total_attempts += 1
    if download_era5_radiation(client):
        success_count += 1

    # Try ERA5 hourly sample (optional, for diurnal analysis)
    total_attempts += 1
    if download_era5_hourly_sample(client):
        success_count += 1

    log("")
    log("="*60)
    log(f"Download Summary: {success_count}/{total_attempts} successful")
    log("="*60)

    if success_count > 0:
        log("New files downloaded to:")
        log(f"  {DATA_DIR}")

        # List downloaded files
        for f in DATA_DIR.glob("*.nc"):
            size_mb = f.stat().st_size / 1024 / 1024
            log(f"  - {f.name} ({size_mb:.1f} MB)")

    return 0 if success_count > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
