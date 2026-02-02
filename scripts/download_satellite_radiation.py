#!/usr/bin/env python3
"""
Download Satellite Earth Radiation Budget data from CDS API.
Downloads NASA CERES EBAF product for 2020-2024.
This is the actual satellite product as specified in the tender.
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
        logging.FileHandler('/Users/garfieldconnolly/Desktop/ECMWF-POC/data/raw/download_satellite_radiation_log.txt')
    ]
)
logger = logging.getLogger(__name__)

DATA_DIR = Path("/Users/garfieldconnolly/Desktop/ECMWF-POC/data/raw/satellite_radiation")
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Years to download (full CERES EBAF availability)
YEARS = [
    '2000', '2001', '2002', '2003', '2004', '2005',
    '2006', '2007', '2008', '2009', '2010', '2011',
    '2012', '2013', '2014', '2015', '2016', '2017',
    '2018', '2019', '2020', '2021', '2022', '2023',
    '2024', '2025'
]

# All months
MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']


def download_all_years():
    """Download satellite radiation budget data for all years at once."""
    output_file = DATA_DIR / "satellite_radiation_2000_2025.zip"

    if output_file.exists():
        logger.info(f"File already exists: {output_file}")
        return True

    logger.info("=" * 60)
    logger.info("Satellite Earth Radiation Budget Download")
    logger.info("=" * 60)
    logger.info(f"Product: NASA CERES EBAF")
    logger.info(f"Variable: Incoming Shortwave Radiation")
    logger.info(f"Years: {YEARS}")
    logger.info(f"Resolution: 1.0 degrees")
    logger.info(f"Output: {output_file}")
    logger.info("=" * 60)

    client = cdsapi.Client()

    try:
        # Correct API parameters from CDS web interface
        client.retrieve(
            'satellite-earth-radiation-budget',
            {
                'product_family': 'ceres_ebaf',
                'origin': 'nasa',
                'variable': ['incoming_shortwave_radiation'],
                'climate_data_record_type': 'thematic_climate_data_record',
                'time_aggregation': 'monthly_mean',
                'year': YEARS,
                'month': MONTHS,
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
        logger.error(f"FAILED to download: {e}")
        return False


if __name__ == '__main__':
    download_all_years()
