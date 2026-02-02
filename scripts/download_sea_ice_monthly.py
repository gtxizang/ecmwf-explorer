#!/usr/bin/env python3
"""
Download all 12 months of Sea Ice Concentration data for 2023.
EUMETSAT OSI SAF data from CDS.
"""

import cdsapi
from pathlib import Path
import sys

DATA_DIR = Path("/Users/garfieldconnolly/Desktop/ECMWF-POC/data/sea_ice")
DATA_DIR.mkdir(parents=True, exist_ok=True)

MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
YEAR = '2023'

def download_all_months():
    print("=" * 60)
    print("DOWNLOADING SEA ICE DATA - ALL 2023 MONTHS")
    print("=" * 60)

    client = cdsapi.Client()

    for month in MONTHS:
        output_file = DATA_DIR / f"ice_conc_nh_{YEAR}{month}.nc"

        if output_file.exists():
            print(f"Month {month} already exists, skipping...")
            continue

        print(f"\nDownloading {YEAR}-{month}...")

        try:
            # Request sea ice concentration data
            # Day 15 of each month gives representative mid-month value
            day = '15'

            client.retrieve(
                'satellite-sea-ice-concentration',
                {
                    'sensor': 'ssmis',
                    'region': 'northern_hemisphere',
                    'cdr_type': 'icdr',  # Interim CDR for 2016 onward
                    'temporal_aggregation': 'daily',
                    'variable': 'all',
                    'year': YEAR,
                    'month': month,
                    'day': day,
                    'version': '3_0',
                },
                str(output_file)
            )

            if output_file.exists():
                size_mb = output_file.stat().st_size / 1024 / 1024
                print(f"  SUCCESS: {output_file.name} ({size_mb:.1f} MB)")
            else:
                print(f"  WARNING: Download completed but file not found")

        except Exception as e:
            print(f"  FAILED: {e}")

    print("\n" + "=" * 60)
    print("DOWNLOAD COMPLETE")
    print("=" * 60)

    # List downloaded files
    print("\nDownloaded files:")
    for f in sorted(DATA_DIR.glob("*.nc")):
        size_mb = f.stat().st_size / 1024 / 1024
        print(f"  {f.name}: {size_mb:.1f} MB")


if __name__ == "__main__":
    download_all_months()
