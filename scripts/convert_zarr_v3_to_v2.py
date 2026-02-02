"""
Convert Zarr v3 pyramids to Zarr v2 format for zarrita.js compatibility.

Zarr v3 uses:
- zarr.json for metadata
- c/0/1/2/3 chunk naming (directory-based)

Zarr v2 uses:
- .zarray for array metadata
- 0.1.2.3 chunk naming (dot-separated)
"""

import os
import json
import shutil
from pathlib import Path
import numpy as np

def convert_v3_to_v2(v3_path: Path, v2_path: Path, variable_name: str):
    """Convert a zarr v3 pyramid to v2 format."""

    print(f"Converting {v3_path} to v2 format...")

    # Read the top-level .zattrs if it exists
    top_zattrs = {}
    if (v3_path / ".zattrs").exists():
        with open(v3_path / ".zattrs") as f:
            top_zattrs = json.load(f)

    # Create output directory
    v2_path.mkdir(parents=True, exist_ok=True)

    # Copy top-level .zattrs
    with open(v2_path / ".zattrs", "w") as f:
        json.dump(top_zattrs, f, indent=2)

    # Find all pyramid levels
    levels = sorted([d for d in v3_path.iterdir() if d.is_dir() and d.name.isdigit()])

    for level_dir in levels:
        level = level_dir.name
        v2_level_dir = v2_path / level
        v2_level_dir.mkdir(exist_ok=True)

        print(f"  Processing level {level}...")

        # Find the variable directory
        var_dir = level_dir / variable_name
        if not var_dir.exists():
            print(f"    Variable {variable_name} not found in level {level}, skipping")
            continue

        # Read zarr.json (v3 metadata)
        zarr_json_path = var_dir / "zarr.json"
        if not zarr_json_path.exists():
            print(f"    No zarr.json found in {var_dir}, skipping")
            continue

        with open(zarr_json_path) as f:
            v3_meta = json.load(f)

        # Create v2 .zarray metadata
        shape = v3_meta["shape"]
        chunk_shape = v3_meta["chunk_grid"]["configuration"]["chunk_shape"]

        # Map v3 data types to v2
        dtype = v3_meta["data_type"]
        if dtype == "float32":
            dtype_v2 = "<f4"
        elif dtype == "float64":
            dtype_v2 = "<f8"
        elif dtype == "int32":
            dtype_v2 = "<i4"
        else:
            dtype_v2 = "<f4"

        # Map v3 codecs to v2 compressor
        compressor = None
        for codec in v3_meta.get("codecs", []):
            if codec["name"] == "zstd":
                compressor = {
                    "id": "zstd",
                    "level": codec["configuration"].get("level", 3)
                }
                break
            elif codec["name"] == "blosc":
                compressor = {
                    "id": "blosc",
                    "cname": codec["configuration"].get("cname", "zstd"),
                    "clevel": codec["configuration"].get("clevel", 5),
                    "shuffle": codec["configuration"].get("shuffle", 1)
                }
                break

        v2_zarray = {
            "zarr_format": 2,
            "shape": shape,
            "chunks": chunk_shape,
            "dtype": dtype_v2,
            "fill_value": v3_meta.get("fill_value", 0.0),
            "order": "C",
            "compressor": compressor,
            "filters": None
        }

        # Create output variable directory
        v2_var_dir = v2_level_dir / variable_name
        v2_var_dir.mkdir(exist_ok=True)

        # Write .zarray
        with open(v2_var_dir / ".zarray", "w") as f:
            json.dump(v2_zarray, f, indent=2)

        # Write .zattrs for variable
        v2_attrs = v3_meta.get("attributes", {})
        with open(v2_var_dir / ".zattrs", "w") as f:
            json.dump(v2_attrs, f, indent=2)

        # Convert chunks from c/a/b/c/d format to a.b.c.d format
        chunks_dir = var_dir / "c"
        if chunks_dir.exists():
            chunk_count = 0
            for root, dirs, files in os.walk(chunks_dir):
                for file in files:
                    # Get relative path from chunks_dir
                    chunk_path = Path(root) / file
                    rel_path = chunk_path.relative_to(chunks_dir)

                    # Convert path like 0/1/2/3 to 0.1.2.3
                    parts = list(rel_path.parts)
                    new_name = ".".join(parts)

                    # Copy chunk file
                    shutil.copy2(chunk_path, v2_var_dir / new_name)
                    chunk_count += 1

            print(f"    Converted {chunk_count} chunks")
        else:
            print(f"    No chunks directory found at {chunks_dir}")

        # Create .zgroup for level
        with open(v2_level_dir / ".zgroup", "w") as f:
            json.dump({"zarr_format": 2}, f)

        # Create .zattrs for level (empty or with level info)
        with open(v2_level_dir / ".zattrs", "w") as f:
            json.dump({"level": int(level)}, f)

        # Create coordinate arrays (year, month, x, y) if they exist in v3
        for coord in ["year", "month", "x", "y"]:
            coord_v3 = level_dir / coord
            if coord_v3.exists() and (coord_v3 / "zarr.json").exists():
                with open(coord_v3 / "zarr.json") as f:
                    coord_meta = json.load(f)

                coord_v2_dir = v2_level_dir / coord
                coord_v2_dir.mkdir(exist_ok=True)

                # Create .zarray for coordinate
                coord_shape = coord_meta["shape"]
                coord_chunks = coord_meta["chunk_grid"]["configuration"]["chunk_shape"]

                coord_zarray = {
                    "zarr_format": 2,
                    "shape": coord_shape,
                    "chunks": coord_chunks,
                    "dtype": "<f8" if coord in ["x", "y"] else "<i4",
                    "fill_value": 0,
                    "order": "C",
                    "compressor": None,
                    "filters": None
                }

                with open(coord_v2_dir / ".zarray", "w") as f:
                    json.dump(coord_zarray, f, indent=2)

                with open(coord_v2_dir / ".zattrs", "w") as f:
                    json.dump({}, f)

                # Copy coordinate chunks
                coord_chunks_dir = coord_v3 / "c"
                if coord_chunks_dir.exists():
                    for root, dirs, files in os.walk(coord_chunks_dir):
                        for file in files:
                            chunk_path = Path(root) / file
                            rel_path = chunk_path.relative_to(coord_chunks_dir)
                            parts = list(rel_path.parts)
                            new_name = ".".join(parts)
                            shutil.copy2(chunk_path, coord_v2_dir / new_name)

    # Create top-level .zgroup
    with open(v2_path / ".zgroup", "w") as f:
        json.dump({"zarr_format": 2}, f)

    print(f"Conversion complete: {v2_path}")


def main():
    base_dir = Path(__file__).parent.parent
    pyramid_dir = base_dir / "data" / "pyramids"

    # Convert radiation_multiyear
    radiation_v3 = pyramid_dir / "radiation_multiyear"
    radiation_v2 = pyramid_dir / "radiation_multiyear_v2"

    if radiation_v3.exists():
        # Remove old v2 if exists
        if radiation_v2.exists():
            shutil.rmtree(radiation_v2)

        convert_v3_to_v2(radiation_v3, radiation_v2, "solar_radiation")

        # Replace original with v2 version
        backup = pyramid_dir / "radiation_multiyear_v3_backup"
        if backup.exists():
            shutil.rmtree(backup)
        shutil.move(radiation_v3, backup)
        shutil.move(radiation_v2, radiation_v3)
        print("Replaced radiation_multiyear with v2 version")

    # Convert fire_multiyear
    fire_v3 = pyramid_dir / "fire_multiyear"
    fire_v2 = pyramid_dir / "fire_multiyear_v2"

    if fire_v3.exists():
        # Remove old v2 if exists
        if fire_v2.exists():
            shutil.rmtree(fire_v2)

        convert_v3_to_v2(fire_v3, fire_v2, "burned_area")

        # Replace original with v2 version
        backup = pyramid_dir / "fire_multiyear_v3_backup"
        if backup.exists():
            shutil.rmtree(backup)
        shutil.move(fire_v3, backup)
        shutil.move(fire_v2, fire_v3)
        print("Replaced fire_multiyear with v2 version")


if __name__ == "__main__":
    main()
