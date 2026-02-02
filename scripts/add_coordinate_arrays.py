"""
Add coordinate arrays to zarr v2 pyramids that are missing them.
These are required by zarrita.js to properly load the data.
"""

import json
import numpy as np
from pathlib import Path
import blosc

def create_coordinate_array(output_dir: Path, name: str, data: np.ndarray, dtype: str = '<f8'):
    """Create a zarr v2 coordinate array."""
    coord_dir = output_dir / name
    coord_dir.mkdir(exist_ok=True)

    # Create .zarray metadata
    zarray = {
        "shape": list(data.shape),
        "chunks": list(data.shape),  # One chunk for coordinates
        "dtype": dtype,
        "fill_value": None if dtype.startswith('<i') else "NaN",
        "order": "C",
        "filters": None,
        "dimension_separator": ".",
        "compressor": {
            "id": "blosc",
            "cname": "lz4",
            "clevel": 5,
            "shuffle": 1,
            "blocksize": 0
        },
        "zarr_format": 2
    }

    with open(coord_dir / ".zarray", "w") as f:
        json.dump(zarray, f, indent=2)

    with open(coord_dir / ".zattrs", "w") as f:
        json.dump({}, f)

    # Compress and save data
    compressed = blosc.compress(
        data.astype(dtype.replace('<', '')).tobytes(),
        typesize=data.itemsize,
        cname='lz4',
        clevel=5,
        shuffle=blosc.SHUFFLE
    )

    with open(coord_dir / "0", "wb") as f:
        f.write(compressed)

    print(f"  Created {name} array: shape={data.shape}, dtype={dtype}")


def add_coordinates_to_pyramid(pyramid_path: Path, years: list, bounds: list):
    """Add coordinate arrays to all levels of a pyramid."""

    print(f"\nProcessing {pyramid_path.name}...")

    # Read the main array metadata to get shapes
    levels = sorted([d for d in pyramid_path.iterdir() if d.is_dir() and d.name.isdigit()])

    for level_dir in levels:
        level = level_dir.name
        print(f"  Level {level}:")

        # Find the variable directory to get shape
        var_dirs = [d for d in level_dir.iterdir() if d.is_dir()]
        if not var_dirs:
            print(f"    No variable directory found, skipping")
            continue

        var_dir = var_dirs[0]
        zarray_path = var_dir / ".zarray"
        if not zarray_path.exists():
            print(f"    No .zarray found in {var_dir.name}, skipping")
            continue

        with open(zarray_path) as f:
            zarray = json.load(f)

        shape = zarray["shape"]
        n_years, n_months, height, width = shape

        print(f"    Data shape: {shape} (years={n_years}, months={n_months}, h={height}, w={width})")

        # Create year array
        year_data = np.array(years, dtype=np.int64)
        create_coordinate_array(level_dir, "year", year_data, "<i8")

        # Create month array (1-12)
        month_data = np.arange(1, n_months + 1, dtype=np.int32)
        create_coordinate_array(level_dir, "month", month_data, "<i4")

        # Create x/y arrays (Web Mercator bounds)
        # bounds = [west, south, east, north] in EPSG:3857 meters
        x_min, y_min, x_max, y_max = bounds
        x_data = np.linspace(x_min, x_max, width, dtype=np.float64)
        y_data = np.linspace(y_max, y_min, height, dtype=np.float64)  # Y is flipped

        create_coordinate_array(level_dir, "x", x_data, "<f8")
        create_coordinate_array(level_dir, "y", y_data, "<f8")

        # Update level .zattrs
        level_attrs = {"level": int(level)}
        with open(level_dir / ".zattrs", "w") as f:
            json.dump(level_attrs, f)


def main():
    base_dir = Path(__file__).parent.parent
    pyramid_dir = base_dir / "data" / "pyramids"

    # Web Mercator bounds for global data
    WEB_MERCATOR_BOUNDS = [-20037508.34, -20037508.34, 20037508.34, 20037508.34]

    # Add coordinates to radiation pyramid
    radiation_path = pyramid_dir / "radiation_multiyear"
    if radiation_path.exists():
        with open(radiation_path / ".zattrs") as f:
            attrs = json.load(f)
        years = attrs.get("years", list(range(1950, 2025)))
        add_coordinates_to_pyramid(radiation_path, years, WEB_MERCATOR_BOUNDS)

    # Add coordinates to fire pyramid
    fire_path = pyramid_dir / "fire_multiyear"
    if fire_path.exists():
        with open(fire_path / ".zattrs") as f:
            attrs = json.load(f)
        years = attrs.get("years", list(range(2019, 2024)))
        add_coordinates_to_pyramid(fire_path, years, WEB_MERCATOR_BOUNDS)

    print("\nDone!")


if __name__ == "__main__":
    main()
