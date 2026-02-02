#!/usr/bin/env python3
"""
Process downloaded NetCDF data and convert to Zarr format for efficient access.
"""

import sys
from pathlib import Path

import numpy as np
import xarray as xr


def process_radiation_budget(raw_dir: Path, processed_dir: Path):
    """Process Earth Radiation Budget NetCDF files to Zarr."""
    extracted_dir = raw_dir / "radiation_extracted"
    output_path = processed_dir / "radiation.zarr"

    if not extracted_dir.exists():
        print(f"Extracted radiation data not found: {extracted_dir}")
        return None

    if output_path.exists():
        print(f"Radiation Zarr already exists: {output_path}")
        return output_path

    print(f"Processing radiation files from {extracted_dir}")

    # Find all NetCDF files
    nc_files = sorted(extracted_dir.glob("*.nc"))
    print(f"  Found {len(nc_files)} NetCDF files")

    if not nc_files:
        print("  No NetCDF files found!")
        return None

    # Open all files and combine
    print("  Loading and combining files...")
    ds = xr.open_mfdataset(
        nc_files,
        combine="nested",
        concat_dim="time",
        parallel=True,
    )

    print(f"  Original variables: {list(ds.data_vars)}")
    print(f"  Dimensions: {dict(ds.sizes)}")
    print(f"  Time range: {ds.time.values[0]} to {ds.time.values[-1]}")

    # Rename the solar_mon variable to something more descriptive
    # The CERES EBAF data uses different naming conventions
    rename_map = {}
    for var in ds.data_vars:
        if "solar" in var.lower():
            rename_map[var] = "incoming_shortwave_radiation"
        elif "lw" in var.lower() or "longwave" in var.lower():
            rename_map[var] = "outgoing_longwave_radiation"
        elif "sw" in var.lower() or "shortwave" in var.lower():
            rename_map[var] = "outgoing_shortwave_radiation"

    if rename_map:
        print(f"  Renaming variables: {rename_map}")
        ds = ds.rename(rename_map)

    # If only one variable, we still need all three for the app
    # Create derived variables if needed
    if len(ds.data_vars) == 1:
        var_name = list(ds.data_vars)[0]
        print(f"  Only one variable found: {var_name}")
        print("  Creating placeholder variables for demo...")

        # The solar_mon is incoming shortwave radiation
        if var_name != "incoming_shortwave_radiation":
            ds = ds.rename({var_name: "incoming_shortwave_radiation"})

        # Create approximate outgoing radiation (for demo purposes)
        # In reality these should come from different data products
        incoming = ds["incoming_shortwave_radiation"]

        # Outgoing longwave: roughly 240 W/m² globally, varies with temperature
        ds["outgoing_longwave_radiation"] = xr.DataArray(
            data=np.clip(incoming.values * 0.7 + 50, 150, 350).astype(np.float32),
            dims=incoming.dims,
            coords=incoming.coords,
            attrs={"units": "W/m²", "long_name": "Outgoing Longwave Radiation (derived)"},
        )

        # Outgoing shortwave: reflected solar, roughly 100 W/m² global average
        ds["outgoing_shortwave_radiation"] = xr.DataArray(
            data=np.clip(incoming.values * 0.3, 0, 400).astype(np.float32),
            dims=incoming.dims,
            coords=incoming.coords,
            attrs={"units": "W/m²", "long_name": "Outgoing Shortwave Radiation (derived)"},
        )

    # Ensure coordinate names are standard
    coord_rename = {}
    for coord in ds.coords:
        coord_lower = coord.lower()
        if "lat" in coord_lower and coord != "lat":
            coord_rename[coord] = "lat"
        elif "lon" in coord_lower and coord != "lon":
            coord_rename[coord] = "lon"

    if coord_rename:
        ds = ds.rename(coord_rename)

    # Chunking for efficient access
    chunks = {"time": 1, "lat": 180, "lon": 360}
    print(f"  Chunking: {chunks}")
    ds = ds.chunk(chunks)

    # Convert to float32
    for var in ds.data_vars:
        if ds[var].dtype == np.float64:
            ds[var] = ds[var].astype(np.float32)

    # Write to Zarr
    print(f"  Writing to {output_path}...")
    ds.to_zarr(str(output_path), mode="w", consolidated=True)

    print(f"Created Zarr store: {output_path}")
    print(f"  Variables: {list(ds.data_vars)}")
    print(f"  Time steps: {len(ds.time)}")

    ds.close()
    return output_path


def create_sample_data(output_dir: Path):
    """Create sample synthetic data for development/testing."""
    print("Creating sample synthetic data for development...")

    times = xr.date_range(start="2020-01-01", end="2024-12-01", freq="MS")
    lats = np.arange(-89.5, 90, 1.0)
    lons = np.arange(-179.5, 180, 1.0)

    np.random.seed(42)

    incoming_sw = []
    outgoing_lw = []
    outgoing_sw = []

    for t in range(len(times)):
        lat_factor = np.cos(np.radians(lats))[:, np.newaxis] * np.ones((1, len(lons)))
        month = t % 12
        seasonal = np.cos(2 * np.pi * (month - 6) / 12)

        isw = 340 + 100 * lat_factor + 30 * seasonal * lat_factor
        isw += 10 * np.random.randn(len(lats), len(lons))
        incoming_sw.append(isw.astype(np.float32))

        olw = 240 + 20 * lat_factor + 5 * seasonal
        olw += 5 * np.random.randn(len(lats), len(lons))
        outgoing_lw.append(olw.astype(np.float32))

        osw = 100 - 50 * lat_factor + 20 * (1 - lat_factor) + 10 * seasonal
        osw += 10 * np.random.randn(len(lats), len(lons))
        osw = np.clip(osw, 0, 400)
        outgoing_sw.append(osw.astype(np.float32))

    ds = xr.Dataset(
        {
            "incoming_shortwave_radiation": (["time", "lat", "lon"], np.stack(incoming_sw)),
            "outgoing_longwave_radiation": (["time", "lat", "lon"], np.stack(outgoing_lw)),
            "outgoing_shortwave_radiation": (["time", "lat", "lon"], np.stack(outgoing_sw)),
        },
        coords={"time": times, "lat": lats, "lon": lons},
        attrs={"title": "Sample Earth Radiation Budget Data (Synthetic)"},
    )

    radiation_path = output_dir / "radiation.zarr"
    ds.chunk({"time": 1, "lat": 180, "lon": 360}).to_zarr(str(radiation_path), mode="w", consolidated=True)
    print(f"Created sample radiation data: {radiation_path}")

    return radiation_path


def main():
    project_root = Path(__file__).parent.parent
    raw_dir = project_root / "data" / "raw"
    processed_dir = project_root / "data" / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("ECMWF ECV Explorer - Data Processing")
    print("=" * 60)

    extracted_dir = raw_dir / "radiation_extracted"

    if extracted_dir.exists() and list(extracted_dir.glob("*.nc")):
        print(f"Found real data: {extracted_dir}")
        process_radiation_budget(raw_dir, processed_dir)
    else:
        print("No downloaded data found. Creating sample data...")
        create_sample_data(processed_dir)

    print("=" * 60)
    print("Processing complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
