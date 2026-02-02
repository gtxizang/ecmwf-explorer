#!/usr/bin/env python3
"""
Download historical ERA5-Land data year by year, going backwards from 2019.
Downloads both soil moisture and radiation data.
"""

import cdsapi
from pathlib import Path
import sys
import time
import logging
import argparse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/Users/garfieldconnolly/Desktop/ECMWF-POC/data/raw/historical_download_log.txt')
    ]
)
logger = logging.getLogger(__name__)

SOIL_MOISTURE_DIR = Path("/Users/garfieldconnolly/Desktop/ECMWF-POC/data/raw/soil_moisture_multiyear")
RADIATION_DIR = Path("/Users/garfieldconnolly/Desktop/ECMWF-POC/data/raw/ceres_radiation")

SOIL_MOISTURE_DIR.mkdir(parents=True, exist_ok=True)
RADIATION_DIR.mkdir(parents=True, exist_ok=True)

MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']


def download_soil_moisture(client, year):
    """Download soil moisture data for a single year."""
    output_file = SOIL_MOISTURE_DIR / f"soil_moisture_{year}.nc"

    if output_file.exists():
        logger.info(f"Soil moisture {year} already exists, skipping...")
        return True

    logger.info(f"Downloading soil moisture for {year}...")

    try:
        client.retrieve(
            'reanalysis-era5-land-monthly-means',
            {
                'product_type': 'monthly_averaged_reanalysis',
                'variable': 'volumetric_soil_water_layer_1',
                'year': str(year),
                'month': MONTHS,
                'time': '00:00',
                'data_format': 'netcdf',
                'download_format': 'unarchived',
            },
            str(output_file)
        )

        if output_file.exists():
            size_mb = output_file.stat().st_size / 1024 / 1024
            logger.info(f"SUCCESS: Soil moisture {year} downloaded ({size_mb:.1f} MB)")
            return True
        else:
            logger.error(f"Download completed but file not found: {output_file}")
            return False

    except Exception as e:
        logger.error(f"FAILED soil moisture {year}: {e}")
        return False


def download_radiation(client, year):
    """Download ERA5 radiation data for a single year."""
    output_file = RADIATION_DIR / f"era5_radiation_{year}.nc"

    if output_file.exists():
        logger.info(f"Radiation {year} already exists, skipping...")
        return True

    logger.info(f"Downloading radiation for {year}...")

    try:
        client.retrieve(
            'reanalysis-era5-single-levels-monthly-means',
            {
                'product_type': 'monthly_averaged_reanalysis',
                'variable': [
                    'toa_incident_solar_radiation',
                    'surface_solar_radiation_downwards',
                    'surface_net_solar_radiation',
                    'surface_thermal_radiation_downwards',
                    'surface_net_thermal_radiation',
                    'top_net_solar_radiation',
                    'top_net_thermal_radiation',
                ],
                'year': str(year),
                'month': MONTHS,
                'time': '00:00',
                'data_format': 'netcdf',
                'download_format': 'unarchived',
            },
            str(output_file)
        )

        if output_file.exists():
            size_mb = output_file.stat().st_size / 1024 / 1024
            logger.info(f"SUCCESS: Radiation {year} downloaded ({size_mb:.1f} MB)")
            return True
        else:
            logger.error(f"Download completed but file not found: {output_file}")
            return False

    except Exception as e:
        logger.error(f"FAILED radiation {year}: {e}")
        return False


def download_year(year):
    """Download both soil moisture and radiation for a year."""
    logger.info(f"\n{'='*60}")
    logger.info(f"DOWNLOADING YEAR {year}")
    logger.info(f"{'='*60}")

    client = cdsapi.Client()

    soil_ok = download_soil_moisture(client, year)
    rad_ok = download_radiation(client, year)

    return soil_ok and rad_ok


def main():
    parser = argparse.ArgumentParser(description='Download historical ERA5 data')
    parser.add_argument('--start-year', type=int, default=2019,
                        help='Year to start from (default: 2019)')
    parser.add_argument('--end-year', type=int, default=1950,
                        help='Year to end at (default: 1950, ERA5 goes back to 1950)')
    parser.add_argument('--years', type=int, default=5,
                        help='Number of years to download in this run (default: 5)')

    args = parser.parse_args()

    logger.info("="*60)
    logger.info("HISTORICAL DATA DOWNLOAD")
    logger.info("="*60)
    logger.info(f"Starting from: {args.start_year}")
    logger.info(f"Will download {args.years} years going back")
    logger.info("="*60)

    start_time = time.time()
    years_downloaded = 0

    for year in range(args.start_year, args.end_year - 1, -1):
        if years_downloaded >= args.years:
            logger.info(f"\nReached limit of {args.years} years")
            break

        success = download_year(year)

        if success:
            years_downloaded += 1
            time.sleep(2)  # Be nice to the API
        else:
            logger.warning(f"Issues with year {year}, continuing...")

    elapsed = time.time() - start_time
    logger.info(f"\n{'='*60}")
    logger.info("DOWNLOAD COMPLETE")
    logger.info(f"{'='*60}")
    logger.info(f"Years downloaded: {years_downloaded}")
    logger.info(f"Total time: {elapsed/60:.1f} minutes")

    # List all downloaded files
    logger.info("\nSoil moisture files:")
    for f in sorted(SOIL_MOISTURE_DIR.glob("*.nc")):
        size_mb = f.stat().st_size / 1024 / 1024
        logger.info(f"  {f.name}: {size_mb:.1f} MB")

    logger.info("\nRadiation files:")
    for f in sorted(RADIATION_DIR.glob("era5_radiation_*.nc")):
        size_mb = f.stat().st_size / 1024 / 1024
        logger.info(f"  {f.name}: {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
