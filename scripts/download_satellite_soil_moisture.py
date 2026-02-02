#!/usr/bin/env python3
"""
Download Satellite Soil Moisture data from CDS API.
Downloads the satellite-derived product for 2020-2024.
This is the actual satellite product (ESA CCI / C3S) as specified in the tender.
"""

import cdsapi
from pathlib import Path
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/Users/garfieldconnolly/Desktop/ECMWF-POC/data/raw/download_satellite_log.txt')
    ]
)
logger = logging.getLogger(__name__)

DATA_DIR = Path("/Users/garfieldconnolly/Desktop/ECMWF-POC/data/raw/satellite_soil_moisture")
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Years to download (5-year period as specified)
YEARS = ['2020', '2021', '2022', '2023', '2024']

# All months
MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']


def download_year(client, year):
    """Download satellite soil moisture data for a single year."""
    output_file = DATA_DIR / f"satellite_soil_moisture_{year}.zip"

    if output_file.exists():
        logger.info(f"File already exists: {output_file}, skipping...")
        return True

    logger.info(f"Starting download for year {year}...")

    try:
        # Satellite soil moisture product
        # https://cds.climate.copernicus.eu/datasets/satellite-soil-moisture
        client.retrieve(
            'satellite-soil-moisture',
            {
                'variable': 'volumetric_surface_soil_moisture',
                'type_of_sensor': 'combined_passive_and_active',
                'time_aggregation': 'month_average',
                'year': year,
                'month': MONTHS,
                'day': '01',
                'type_of_record': 'cdr',
                'version': 'v202312',
            },
            str(output_file)
        )

        if output_file.exists():
            size_mb = output_file.stat().st_size / 1024 / 1024
            logger.info(f"SUCCESS: Downloaded {output_file} ({size_mb:.1f} MB)")
            return True
        else:
            logger.error(f"Download completed but file not found: {output_file}")
            return False

    except Exception as e:
        logger.error(f"FAILED to download year {year}: {e}")
        logger.info("Trying alternative parameters...")

        # Try with ICDR (interim CDR) for recent years
        try:
            output_file_icdr = DATA_DIR / f"satellite_soil_moisture_{year}_icdr.zip"
            client.retrieve(
                'satellite-soil-moisture',
                {
                    'variable': 'volumetric_surface_soil_moisture',
                    'type_of_sensor': 'combined_passive_and_active',
                    'time_aggregation': 'month_average',
                    'year': year,
                    'month': MONTHS,
                    'day': '01',
                    'type_of_record': 'icdr',  # Interim CDR for recent data
                    'version': 'v202312',
                },
                str(output_file_icdr)
            )

            if output_file_icdr.exists():
                size_mb = output_file_icdr.stat().st_size / 1024 / 1024
                logger.info(f"SUCCESS (ICDR): Downloaded {output_file_icdr} ({size_mb:.1f} MB)")
                return True

        except Exception as e2:
            logger.error(f"ICDR also failed: {e2}")

        return False


def download_all_years():
    """Download satellite soil moisture data for all years."""
    logger.info("=" * 60)
    logger.info("Satellite Soil Moisture Download (ESA CCI / C3S)")
    logger.info("=" * 60)
    logger.info(f"Years: {YEARS}")
    logger.info(f"Variable: volumetric_surface_soil_moisture")
    logger.info(f"Product: Combined passive+active sensors")
    logger.info(f"Resolution: 0.25 degrees (~25km)")
    logger.info(f"Output directory: {DATA_DIR}")
    logger.info("=" * 60)

    client = cdsapi.Client()

    success_count = 0
    for year in YEARS:
        if download_year(client, year):
            success_count += 1

    logger.info("=" * 60)
    logger.info(f"Download complete: {success_count}/{len(YEARS)} years successful")
    logger.info("=" * 60)

    return success_count == len(YEARS)


if __name__ == '__main__':
    download_all_years()
