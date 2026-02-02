#!/usr/bin/env python3
"""
Download Sea Ice Concentration data from CDS API.
Dataset: satellite-sea-ice-concentration
"""

import cdsapi
from pathlib import Path
import sys

DATA_DIR = Path(__file__).parent.parent / "data" / "raw" / "sea_ice"
DATA_DIR.mkdir(parents=True, exist_ok=True)

def download_sea_ice():
    """Download Sea Ice Concentration data for 2023."""
    client = cdsapi.Client()

    print("="*60)
    print("DOWNLOADING SEA ICE CONCENTRATION DATA")
    print("="*60)

    # Download monthly means for both hemispheres
    months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

    for region in ['northern_hemisphere', 'southern_hemisphere']:
        region_short = 'north' if 'northern' in region else 'south'

        for month in months:
            output_file = DATA_DIR / f"sea_ice_{region_short}_2023_{month}.zip"

            if output_file.exists():
                print(f"  Skipping {region_short}/{month} (already exists)")
                continue

            print(f"\nDownloading {region_short} {month}/2023...")

            try:
                client.retrieve(
                    'satellite-sea-ice-concentration',
                    {
                        'origin': 'eumetsat_osi_saf',
                        'region': region,
                        'cdr_type': 'cdr',
                        'year': '2023',
                        'month': month,
                        'day': '15',  # Mid-month representative
                        'version': 'v3',
                        'format': 'zip',
                    },
                    str(output_file)
                )
                print(f"  Downloaded: {output_file}")
                print(f"  Size: {output_file.stat().st_size / 1024 / 1024:.1f} MB")
            except Exception as e:
                print(f"  FAILED: {e}")
                # Try ICDR (Interim CDR)
                try:
                    print("  Trying ICDR version...")
                    client.retrieve(
                        'satellite-sea-ice-concentration',
                        {
                            'origin': 'eumetsat_osi_saf',
                            'region': region,
                            'cdr_type': 'icdr',
                            'year': '2023',
                            'month': month,
                            'day': '15',
                            'version': 'v3',
                            'format': 'zip',
                        },
                        str(output_file)
                    )
                    print(f"  Downloaded (ICDR): {output_file}")
                except Exception as e2:
                    print(f"  ICDR also failed: {e2}")
                    continue

    print("\n" + "="*60)
    print("DOWNLOAD COMPLETE")
    print(f"Output directory: {DATA_DIR}")
    print("="*60)

    return 0

if __name__ == "__main__":
    sys.exit(download_sea_ice())
