#!/usr/bin/env python3
"""
Download climate data from the Copernicus Climate Data Store (CDS).

Updated parameters as of January 2026.
Primary: Earth Radiation Budget
Secondary: Soil Moisture (may have CDS backend issues)
"""

import os
import sys
from pathlib import Path

import cdsapi


def get_cds_client():
    """Initialize CDS API client with credentials from .cdsapirc or environment."""
    project_root = Path(__file__).parent.parent
    cdsapirc_path = project_root / ".cdsapirc"

    if cdsapirc_path.exists():
        os.environ.setdefault("CDSAPI_RC", str(cdsapirc_path))

    return cdsapi.Client()


def download_radiation_budget(client, output_dir: Path):
    """Download Earth radiation budget data - VERIFIED WORKING PARAMETERS."""
    output_file = output_dir / "earth_radiation_budget.nc"

    if output_file.exists():
        print(f"Radiation budget data already exists: {output_file}")
        return output_file

    print("=" * 60)
    print("Downloading Earth Radiation Budget data...")
    print("This may take 10-30 minutes depending on CDS queue...")
    print("=" * 60)

    client.retrieve(
        "satellite-earth-radiation-budget",
        {
            "product_family": "ceres_ebaf",
            "origin": "nasa",
            "variable": [
                "incoming_shortwave_radiation",
                "outgoing_longwave_radiation",
                "outgoing_shortwave_radiation",
            ],
            "climate_data_record_type": "thematic_climate_data_record",
            "time_aggregation": "monthly_mean",
            "year": ["2020", "2021", "2022", "2023", "2024"],
            "month": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"],
        },
        str(output_file),
    )

    print(f"Downloaded radiation budget data to: {output_file}")
    return output_file


def download_soil_moisture(client, output_dir: Path):
    """Download satellite soil moisture data - MAY HAVE CDS ISSUES."""
    output_file = output_dir / "soil_moisture.zip"

    if output_file.exists():
        print(f"Soil moisture data already exists: {output_file}")
        return output_file

    print("=" * 60)
    print("Downloading Soil Moisture data...")
    print("WARNING: CDS may have intermittent issues with this dataset")
    print("=" * 60)

    try:
        client.retrieve(
            "satellite-soil-moisture",
            {
                "variable": ["surface_soil_moisture_volumetric"],
                "type_of_sensor": ["passive"],
                "time_aggregation": ["daily"],
                "year": ["2020", "2021", "2022", "2023"],
                "month": ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"],
                "day": ["15"],  # Just mid-month to reduce size
                "type_of_record": ["cdr"],
                "version": ["v202505"],
            },
            str(output_file),
        )
        print(f"Downloaded soil moisture data to: {output_file}")
        return output_file
    except Exception as e:
        print(f"WARNING: Soil moisture download failed: {e}")
        print("Continuing with radiation data only...")
        return None


def main():
    """Main entry point for data download."""
    project_root = Path(__file__).parent.parent
    output_dir = project_root / "data" / "raw"
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("ECMWF ECV Explorer - Data Download")
    print("=" * 60)
    print(f"Output directory: {output_dir}")
    print("=" * 60)

    try:
        client = get_cds_client()
    except Exception as e:
        print(f"Error initializing CDS client: {e}")
        print("Please ensure .cdsapirc file exists with valid credentials")
        sys.exit(1)

    # Priority 1: Earth Radiation Budget (verified working)
    try:
        download_radiation_budget(client, output_dir)
    except Exception as e:
        print(f"Error downloading radiation data: {e}")
        sys.exit(1)

    # Priority 2: Soil Moisture (may fail - that's OK)
    # Uncomment if needed:
    # download_soil_moisture(client, output_dir)

    print("=" * 60)
    print("Download complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
