#!/usr/bin/env python3
"""
Download historical Sea Ice Concentration data year by year.
Goes back from 2022 until told to stop.
EUMETSAT OSI SAF data from CDS.
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
    ]
)
logger = logging.getLogger(__name__)

DATA_DIR = Path("/Users/garfieldconnolly/Desktop/ECMWF-POC/data/sea_ice")
DATA_DIR.mkdir(parents=True, exist_ok=True)

MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']


def get_sensor_cdr_version_for_year(year):
    """Get the correct sensor, CDR type, and version for a given year.

    Based on actual CDS API testing:
    - ICDR (Interim CDR): 2021-present only, version 3_0
    - CDR (Climate Data Record): 1978-2020, version 3_1

    The 'ssmis' sensor product actually combines data from:
    - SMMR (1979-1987)
    - SSM/I (1987-2006)
    - SSMIS (2005+)
    """
    year = int(year)

    if year >= 2021:
        return 'ssmis', 'icdr', '3_0'
    else:
        return 'ssmis', 'cdr', '3_1'


def download_year(client, year):
    """Download all 12 months of sea ice data for a given year."""
    logger.info(f"\n{'='*60}")
    logger.info(f"DOWNLOADING SEA ICE FOR YEAR {year}")
    logger.info(f"{'='*60}")

    sensor, cdr_type, version = get_sensor_cdr_version_for_year(year)
    logger.info(f"Using sensor: {sensor}, CDR type: {cdr_type}, version: {version}")

    success_count = 0

    for month in MONTHS:
        output_file = DATA_DIR / f"ice_conc_nh_{year}{month}.nc"

        # Also check for extracted files
        extracted_pattern = list(DATA_DIR.glob(f"*{year}{month}*.nc"))
        if output_file.exists() or extracted_pattern:
            logger.info(f"  Month {month}: Already exists, skipping")
            success_count += 1
            continue

        logger.info(f"  Month {month}: Downloading...")

        try:
            # Day 15 gives representative mid-month value
            day = '15'

            client.retrieve(
                'satellite-sea-ice-concentration',
                {
                    'sensor': sensor,
                    'region': 'northern_hemisphere',
                    'cdr_type': cdr_type,
                    'temporal_aggregation': 'daily',
                    'variable': 'all',
                    'year': str(year),
                    'month': month,
                    'day': day,
                    'version': version,
                },
                str(output_file)
            )

            if output_file.exists():
                size_mb = output_file.stat().st_size / 1024 / 1024
                logger.info(f"  Month {month}: SUCCESS ({size_mb:.1f} MB)")
                success_count += 1

                # Check if it's a ZIP file and extract
                with open(output_file, 'rb') as f:
                    header = f.read(4)
                if header[:4] == b'PK\x03\x04':
                    logger.info(f"  Month {month}: Extracting ZIP...")
                    import zipfile
                    import shutil

                    zip_path = output_file.with_suffix('.zip')
                    shutil.move(output_file, zip_path)

                    with zipfile.ZipFile(zip_path, 'r') as zf:
                        for name in zf.namelist():
                            if name.endswith('.nc'):
                                extracted = DATA_DIR / f"ice_conc_nh_ease2-250_icdr-v3p0_{year}{month}151200.nc"
                                with zf.open(name) as src, open(extracted, 'wb') as dst:
                                    dst.write(src.read())
                                logger.info(f"  Month {month}: Extracted to {extracted.name}")
                                break

                    zip_path.unlink()  # Remove ZIP
            else:
                logger.error(f"  Month {month}: Download completed but file not found")

        except Exception as e:
            logger.error(f"  Month {month}: FAILED - {e}")
            # Continue with other months even if one fails

    logger.info(f"\nYear {year}: {success_count}/12 months downloaded")
    return success_count == 12


def main():
    parser = argparse.ArgumentParser(description='Download historical sea ice data')
    parser.add_argument('--start-year', type=int, default=2022, help='Year to start from (going backwards)')
    parser.add_argument('--end-year', type=int, default=1979, help='Year to end at (earliest year)')
    args = parser.parse_args()

    logger.info("="*60)
    logger.info("HISTORICAL SEA ICE DATA DOWNLOAD")
    logger.info("="*60)
    logger.info(f"Starting from: {args.start_year}")
    logger.info(f"Going back to: {args.end_year}")
    logger.info(f"Output directory: {DATA_DIR}")
    logger.info("="*60)

    client = cdsapi.Client()

    # Download year by year going backwards
    for year in range(args.start_year, args.end_year - 1, -1):
        success = download_year(client, year)

        if success:
            logger.info(f"Year {year} complete!")
        else:
            logger.warning(f"Year {year} incomplete - some months may have failed")

        # Small delay between years
        time.sleep(2)

    logger.info("\n" + "="*60)
    logger.info("DOWNLOAD COMPLETE")
    logger.info("="*60)

    # List downloaded files by year
    files = sorted(DATA_DIR.glob("*.nc"))
    years_downloaded = set()
    for f in files:
        # Extract year from filename
        name = f.name
        for y in range(1979, 2025):
            if str(y) in name:
                years_downloaded.add(y)
                break

    logger.info(f"Years with data: {sorted(years_downloaded)}")


if __name__ == "__main__":
    main()
