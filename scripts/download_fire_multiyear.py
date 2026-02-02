#!/usr/bin/env python3
"""
Download Fire Burned Area data for multiple years from CDS API.
Dataset: satellite-fire-burned-area
"""

import cdsapi
from pathlib import Path
import sys
from datetime import datetime

DATA_DIR = Path(__file__).parent.parent / "data" / "raw" / "fire_burned_area"
DATA_DIR.mkdir(parents=True, exist_ok=True)

LOG_FILE = DATA_DIR / "download_log.txt"

# Download 2019-2023 (5 years of data)
YEARS = ['2019', '2020', '2021', '2022', '2023']
MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

def log(message):
    """Log to both console and file."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_msg = f"[{timestamp}] {message}"
    print(log_msg)
    with open(LOG_FILE, 'a') as f:
        f.write(log_msg + "\n")

def download_fire_data():
    """Download Fire Burned Area data for multiple years."""
    client = cdsapi.Client()

    log("="*60)
    log("DOWNLOADING FIRE BURNED AREA DATA (Multi-Year)")
    log(f"Years: {YEARS}")
    log("="*60)

    success_count = 0
    fail_count = 0

    for year in YEARS:
        for month in MONTHS:
            output_file = DATA_DIR / f"fire_burned_area_{year}_{month}.zip"

            if output_file.exists():
                log(f"  Skipping {year}-{month} (already exists)")
                success_count += 1
                continue

            log(f"\nDownloading {month}/{year}...")

            # Try C3S/OLCI (works with variable parameter)
            try:
                client.retrieve(
                    'satellite-fire-burned-area',
                    {
                        'origin': 'c3s',
                        'sensor': 'olci',
                        'version': '1_1',
                        'variable': 'grid_variables',  # Required!
                        'year': year,
                        'month': month,
                        'nominal_day': '01',
                    },
                    str(output_file)
                )
                log(f"  Downloaded: {output_file.name}")
                log(f"  Size: {output_file.stat().st_size / 1024 / 1024:.1f} MB")
                success_count += 1
                continue
            except Exception as e:
                log(f"  C3S OLCI failed: {e}")

            # Try ESA CCI MODIS as fallback
            try:
                log("  Trying ESA CCI MODIS...")
                client.retrieve(
                    'satellite-fire-burned-area',
                    {
                        'origin': 'esa_cci',
                        'sensor': 'modis',
                        'version': '5_1_1cds',
                        'variable': 'grid_variables',
                        'year': year,
                        'month': month,
                        'nominal_day': '01',
                    },
                    str(output_file)
                )
                log(f"  Downloaded (ESA CCI): {output_file.name}")
                log(f"  Size: {output_file.stat().st_size / 1024 / 1024:.1f} MB")
                success_count += 1
            except Exception as e2:
                log(f"  ESA CCI also failed: {e2}")
                fail_count += 1

    log("\n" + "="*60)
    log(f"DOWNLOAD COMPLETE: {success_count} succeeded, {fail_count} failed")
    log(f"Output directory: {DATA_DIR}")
    log("="*60)

    return 0 if fail_count < len(YEARS) * len(MONTHS) else 1

if __name__ == "__main__":
    sys.exit(download_fire_data())
