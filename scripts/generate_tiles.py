#!/usr/bin/env python3
"""
Tile Generation Pipeline for Climate Data Explorer

Generates XYZ map tiles for buttery smooth pan/zoom experience.
Uses cartopy for high-quality rendering with crisp coastlines.
Parallelized - each worker loads data independently to avoid serialization.

Output structure: tiles/{variable}/{time_index}/{z}/{x}/{y}.png
"""

import os
import sys
import math
import time
import logging
from pathlib import Path
from multiprocessing import Pool, cpu_count
import warnings

import numpy as np
import xarray as xr
from PIL import Image
from io import BytesIO

warnings.filterwarnings('ignore')

# Configuration
BASE_DIR = Path(__file__).parent.parent
TILES_DIR = BASE_DIR / "tiles"
DATA_PATH = BASE_DIR / "data" / "processed" / "era5_land.zarr"

ZOOM_LEVELS = list(range(0, 6))  # 0-5 for overnight, add 6-7 later
TIME_INDICES = list(range(36, 48))
OUTPUT_TIME_INDICES = list(range(0, 12))
VARIABLES = ["2m_temperature", "skin_temperature"]
COLORMAP = "RdYlBu_r"
DPI = 256

NUM_WORKERS = max(1, cpu_count() - 1)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(BASE_DIR / "tile_generation.log")
    ]
)
logger = logging.getLogger(__name__)


def tile_bounds(z, x, y):
    n = 2 ** z
    lon_min = x / n * 360.0 - 180.0
    lon_max = (x + 1) / n * 360.0 - 180.0
    lat_max = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat_min = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return lon_min, lon_max, lat_min, lat_max


def process_zoom_level(args):
    """Process all tiles for one zoom level of one timestep. Each worker loads data independently."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import cartopy.crs as ccrs
    import cartopy.feature as cfeature

    variable, src_idx, out_idx, zoom = args

    # Load data in worker
    ds = xr.open_zarr(str(DATA_PATH))
    data = ds[variable].isel(time=src_idx).values
    lons = ds.lon.values
    lats = ds.lat.values

    valid = data[~np.isnan(data)]
    vmin = float(np.percentile(valid, 2))
    vmax = float(np.percentile(valid, 98))

    # Fill NaN once
    values = np.where(np.isnan(data), vmin, data)

    # Feature resolution based on zoom
    if zoom >= 5:
        scale = '10m'
        lw = 0.5
    elif zoom >= 3:
        scale = '50m'
        lw = 0.4
    else:
        scale = '110m'
        lw = 0.3

    n = 2 ** zoom
    completed = 0
    skipped = 0

    for x in range(n):
        for y in range(n):
            tile_path = TILES_DIR / variable / str(out_idx) / str(zoom) / str(x) / f"{y}.png"

            if tile_path.exists():
                skipped += 1
                continue

            lon_min, lon_max, lat_min, lat_max = tile_bounds(zoom, x, y)

            if lat_min > 85 or lat_max < -85:
                skipped += 1
                continue

            lat_min = max(lat_min, -84.9)
            lat_max = min(lat_max, 84.9)
            lon_min = max(lon_min, -179.9)
            lon_max = min(lon_max, 179.9)

            if lon_min >= lon_max or lat_min >= lat_max:
                skipped += 1
                continue

            # Add buffer to eliminate tile seams - render beyond bounds, then figure clips to exact tile
            buffer_pct = 0.02  # 2% buffer
            lat_range = lat_max - lat_min
            lon_range = lon_max - lon_min
            ext_lat_min = max(-84.9, lat_min - lat_range * buffer_pct)
            ext_lat_max = min(84.9, lat_max + lat_range * buffer_pct)
            ext_lon_min = max(-179.99, lon_min - lon_range * buffer_pct)
            ext_lon_max = min(179.99, lon_max + lon_range * buffer_pct)

            try:
                # Create figure with extra size to accommodate buffer, then crop
                buffer_pixels = int(DPI * buffer_pct * 2)
                fig_size = (DPI + buffer_pixels) / DPI
                fig = plt.figure(figsize=(fig_size, fig_size), dpi=DPI)
                ax = fig.add_subplot(1, 1, 1, projection=ccrs.Mercator())
                ax.set_extent([ext_lon_min, ext_lon_max, ext_lat_min, ext_lat_max], crs=ccrs.PlateCarree())

                ax.pcolormesh(
                    lons, lats, values,
                    transform=ccrs.PlateCarree(),
                    cmap=COLORMAP,
                    vmin=vmin, vmax=vmax,
                    shading='gouraud',
                    rasterized=True,
                    zorder=1
                )

                ax.add_feature(cfeature.OCEAN.with_scale(scale), facecolor='#1a1a2e', zorder=5)
                ax.add_feature(cfeature.COASTLINE.with_scale(scale), linewidth=lw, edgecolor='#444', zorder=6)

                ax.set_frame_on(False)
                ax.patch.set_visible(False)
                ax.set_position([0, 0, 1, 1])

                tile_path.parent.mkdir(parents=True, exist_ok=True)

                # Save to temp, then crop to exact 256x256
                buf = BytesIO()
                fig.savefig(buf, dpi=DPI, pad_inches=0, transparent=False, facecolor='#1a1a2e', format='png')
                plt.close(fig)
                buf.seek(0)

                img = Image.open(buf)
                w, h = img.size
                # Crop center 256x256
                left = (w - 256) // 2
                top = (h - 256) // 2
                img_cropped = img.crop((left, top, left + 256, top + 256))
                img_cropped.save(tile_path)

                completed += 1

            except Exception as e:
                plt.close('all')
                skipped += 1

    return (variable, out_idx, zoom, completed, skipped)


def main():
    logger.info("=" * 60)
    logger.info("TILE GENERATION PIPELINE")
    logger.info("=" * 60)
    logger.info(f"Workers: {NUM_WORKERS}")

    total_tiles = sum(4 ** z for z in ZOOM_LEVELS) * len(VARIABLES) * len(TIME_INDICES)
    logger.info(f"Total tiles: {total_tiles:,}")
    logger.info(f"Output: {TILES_DIR}")

    TILES_DIR.mkdir(parents=True, exist_ok=True)

    # Build work units: (variable, src_idx, out_idx, zoom)
    work_units = []
    for variable in VARIABLES:
        for src_idx, out_idx in zip(TIME_INDICES, OUTPUT_TIME_INDICES):
            for zoom in ZOOM_LEVELS:
                work_units.append((variable, src_idx, out_idx, zoom))

    logger.info(f"Work units: {len(work_units)} (variable × time × zoom)")

    grand_completed = 0
    grand_skipped = 0
    start = time.time()

    with Pool(processes=NUM_WORKERS) as pool:
        for i, result in enumerate(pool.imap_unordered(process_zoom_level, work_units)):
            variable, out_idx, zoom, completed, skipped = result
            grand_completed += completed
            grand_skipped += skipped

            elapsed = time.time() - start
            rate = grand_completed / elapsed if elapsed > 0 else 0

            logger.info(
                f"[{i+1}/{len(work_units)}] {variable}/t{out_idx}/z{zoom}: "
                f"+{completed} tiles ({rate:.1f}/sec total)"
            )

    elapsed = time.time() - start
    logger.info("\n" + "=" * 60)
    logger.info("COMPLETE")
    logger.info("=" * 60)
    logger.info(f"New tiles: {grand_completed:,}")
    logger.info(f"Skipped: {grand_skipped:,}")
    logger.info(f"Time: {elapsed/3600:.2f} hours ({elapsed:.0f} seconds)")
    logger.info(f"Rate: {grand_completed/elapsed:.1f} tiles/sec")


if __name__ == "__main__":
    main()
