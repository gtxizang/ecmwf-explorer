#!/usr/bin/env python3
"""
Download Fire Burned Area data from CDS API.
Dataset: satellite-fire-burned-area
"""

import cdsapi
from pathlib import Path
import sys

DATA_DIR = Path(__file__).parent.parent / "data" / "raw" / "fire_burned_area"
DATA_DIR.mkdir(parents=True, exist_ok=True)

def download_fire_data():
    """Download MODIS Fire Burned Area data for 2023."""
    client = cdsapi.Client()

    print("="*60)
    print("DOWNLOADING FIRE BURNED AREA DATA")
    print("="*60)

    # Download each month separately (as per CDS documentation)
    months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

    for month in months:
        output_file = DATA_DIR / f"fire_burned_area_2023_{month}.zip"

        if output_file.exists():
            print(f"  Skipping {month} (already exists)")
            continue

        print(f"\nDownloading {month}/2023...")

        try:
            client.retrieve(
                'satellite-fire-burned-area',
                {
                    'origin': 'esa_cci',
                    'sensor': 'modis',
                    'version': '5_1_1cds',
                    'year': '2023',
                    'month': month,
                    'nominal_day': '01',
                    'format': 'zip',
                },
                str(output_file)
            )
            print(f"  Downloaded: {output_file}")
            print(f"  Size: {output_file.stat().st_size / 1024 / 1024:.1f} MB")
        except Exception as e:
            print(f"  FAILED: {e}")
            # Try alternative - C3S version
            try:
                print("  Trying C3S version...")
                client.retrieve(
                    'satellite-fire-burned-area',
                    {
                        'origin': 'c3s',
                        'sensor': 'modis',
                        'version': '1_1',
                        'year': '2023',
                        'month': month,
                        'nominal_day': '01',
                        'format': 'zip',
                    },
                    str(output_file)
                )
                print(f"  Downloaded (C3S): {output_file}")
            except Exception as e2:
                print(f"  C3S also failed: {e2}")
                continue

    print("\n" + "="*60)
    print("DOWNLOAD COMPLETE")
    print(f"Output directory: {DATA_DIR}")
    print("="*60)

    return 0

if __name__ == "__main__":
    sys.exit(download_fire_data())
