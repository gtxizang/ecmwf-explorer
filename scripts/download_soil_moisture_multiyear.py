#!/usr/bin/env python3
"""
Download ERA5-Land Soil Moisture data from CDS API for multiple years.
Downloads volumetric_soil_water_layer_1 monthly means for 2020-2024.
Global coverage.
"""

import cdsapi
from pathlib import Path
import sys
import time
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/Users/garfieldconnolly/Desktop/ECMWF-POC/data/raw/download_log.txt')
    ]
)
logger = logging.getLogger(__name__)

DATA_DIR = Path("/Users/garfieldconnolly/Desktop/ECMWF-POC/data/raw/soil_moisture_multiyear")
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Years to download
YEARS = ['2020', '2021', '2022', '2023', '2024']

# All months
MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']


def download_year(client, year):
    """Download soil moisture data for a single year."""
    output_file = DATA_DIR / f"soil_moisture_{year}.nc"

    if output_file.exists():
        logger.info(f"File already exists: {output_file}, skipping...")
        return True

    logger.info(f"Starting download for year {year}...")

    try:
        client.retrieve(
            'reanalysis-era5-land-monthly-means',
            {
                'product_type': 'monthly_averaged_reanalysis',
                'variable': 'volumetric_soil_water_layer_1',
                'year': year,
                'month': MONTHS,
                'time': '00:00',
                'data_format': 'netcdf',
                'download_format': 'unarchived',
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
        return False


def download_all_years():
    """Download soil moisture data for all years."""
    logger.info("=" * 60)
    logger.info("ERA5-Land Soil Moisture Multi-Year Download")
    logger.info("=" * 60)
    logger.info(f"Years: {YEARS}")
    logger.info(f"Variable: volumetric_soil_water_layer_1")
    logger.info(f"Output directory: {DATA_DIR}")
    logger.info("=" * 60)

    client = cdsapi.Client()

    results = {}

    for year in YEARS:
        success = download_year(client, year)
        results[year] = success

        if success:
            # Small delay between successful downloads to be nice to the API
            time.sleep(2)

    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("DOWNLOAD SUMMARY")
    logger.info("=" * 60)

    successful = [y for y, s in results.items() if s]
    failed = [y for y, s in results.items() if not s]

    logger.info(f"Successful: {successful}")
    logger.info(f"Failed: {failed}")

    # List downloaded files
    logger.info("\nDownloaded files:")
    for f in sorted(DATA_DIR.glob("*.nc")):
        size_mb = f.stat().st_size / 1024 / 1024
        logger.info(f"  {f.name}: {size_mb:.1f} MB")

    return len(failed) == 0


def combine_years():
    """Optionally combine all years into a single file."""
    try:
        import xarray as xr

        files = sorted(DATA_DIR.glob("soil_moisture_*.nc"))
        if len(files) < 2:
            logger.info("Not enough files to combine")
            return

        logger.info(f"\nCombining {len(files)} files...")

        datasets = []
        for f in files:
            ds = xr.open_dataset(f)
            datasets.append(ds)

        combined = xr.concat(datasets, dim='valid_time')
        combined_file = DATA_DIR / "soil_moisture_2020_2024_combined.nc"
        combined.to_netcdf(combined_file)

        size_mb = combined_file.stat().st_size / 1024 / 1024
        logger.info(f"Combined file saved: {combined_file} ({size_mb:.1f} MB)")

        # Close datasets
        for ds in datasets:
            ds.close()
        combined.close()

    except ImportError:
        logger.warning("xarray not available, skipping file combination")
    except Exception as e:
        logger.error(f"Failed to combine files: {e}")


if __name__ == "__main__":
    start_time = time.time()

    success = download_all_years()

    # Try to combine files after download
    if success:
        combine_years()

    elapsed = time.time() - start_time
    logger.info(f"\nTotal time: {elapsed/60:.1f} minutes")

    sys.exit(0 if success else 1)
