#!/usr/bin/env python3
"""
Master Tile Generation Pipeline for Climate Data Explorer

Generates XYZ tiles for ALL datasets with:
- Zoom levels 0-7
- Buffer + crop for seamless edges
- Country borders
- Coastlines and ocean mask
- Parallelized across CPU cores

Output: tiles/{variable}/{time_index}/{z}/{x}/{y}.png
"""

import os
import sys
import math
import time
import logging
import warnings
from pathlib import Path
from multiprocessing import Pool, cpu_count
from io import BytesIO

import numpy as np
import xarray as xr
from PIL import Image

warnings.filterwarnings('ignore')

# Configuration
BASE_DIR = Path(__file__).parent.parent
TILES_DIR = BASE_DIR / "tiles"
DATA_DIR = BASE_DIR / "data"

# Tile generation parameters
ZOOM_LEVELS = list(range(0, 8))  # 0-7
TIME_COUNT = 12  # 12 months
DPI = 256
COLORMAP = "RdYlBu_r"
NUM_WORKERS = max(1, cpu_count() - 1)

# Dataset configurations
DATASETS = {
    '2m_temperature': {
        'source': DATA_DIR / 'processed' / 'era5_land.zarr',
        'type': 'zarr',
        'variable': '2m_temperature',
        'time_slice': slice(36, 48),  # 2023 (indices 36-47)
        'colormap': 'RdYlBu_r',
        'unit': '°C',
    },
    'skin_temperature': {
        'source': DATA_DIR / 'processed' / 'era5_land.zarr',
        'type': 'zarr',
        'variable': 'skin_temperature',
        'time_slice': slice(36, 48),
        'colormap': 'RdYlBu_r',
        'unit': '°C',
    },
    'solar_radiation': {
        'source': DATA_DIR / 'radiation_extracted' / 'data_312a_Lot1_ceres-ebaf_tcdr_v4.2.1_solar_mon_2024_06.nc',
        'type': 'netcdf',
        'variable': 'solar_mon',
        'time_slice': None,  # Only 1 time step, will repeat
        'colormap': 'YlOrRd',
        'unit': 'W/m²',
    },
    'soil_moisture': {
        'source': DATA_DIR / 'soil_moisture_extracted' / 'data_stream-moda.nc',
        'type': 'netcdf',
        'variable': 'swvl1',
        'time_slice': slice(0, 12),
        'time_dim': 'valid_time',
        'colormap': 'YlGnBu',
        'unit': 'm³/m³',
    },
}

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
    """Calculate Web Mercator bounds for a tile."""
    n = 2 ** z
    lon_min = x / n * 360.0 - 180.0
    lon_max = (x + 1) / n * 360.0 - 180.0
    lat_max = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat_min = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return lon_min, lon_max, lat_min, lat_max


def load_dataset(config):
    """Load a dataset based on its configuration."""
    source = config['source']
    if not source.exists():
        return None, None, None, None, None

    if config['type'] == 'zarr':
        ds = xr.open_zarr(str(source))
    else:
        ds = xr.open_dataset(str(source))

    var_name = config['variable']
    if var_name not in ds:
        logger.warning(f"Variable {var_name} not found in {source}")
        return None, None, None, None, None

    data = ds[var_name]

    # Handle time slicing
    time_dim = config.get('time_dim', 'time')
    if config['time_slice'] is not None and time_dim in data.dims:
        data = data.isel({time_dim: config['time_slice']})

    # Get coordinate arrays
    if 'lat' in ds.coords:
        lats = ds.lat.values
    elif 'latitude' in ds.coords:
        lats = ds.latitude.values
    else:
        lats = None

    if 'lon' in ds.coords:
        lons = ds.lon.values
    elif 'longitude' in ds.coords:
        lons = ds.longitude.values
    else:
        lons = None

    # Adjust longitude to -180 to 180 if needed
    if lons is not None and lons.max() > 180:
        lons = np.where(lons > 180, lons - 360, lons)

    return data, lons, lats, config['colormap'], config.get('unit', '')


def process_zoom_level(args):
    """Process all tiles for one dataset/time/zoom combination."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import cartopy.crs as ccrs
    import cartopy.feature as cfeature

    dataset_name, time_idx, zoom = args

    config = DATASETS[dataset_name]
    data_array, lons, lats, cmap, unit = load_dataset(config)

    if data_array is None:
        return (dataset_name, time_idx, zoom, 0, 0, "Dataset not available")

    # Get data for this time step
    time_dim = config.get('time_dim', 'time')
    if time_dim in data_array.dims:
        if time_idx < data_array.shape[0]:
            values = data_array.isel({time_dim: time_idx}).values
        else:
            # Repeat last available time step
            values = data_array.isel({time_dim: -1}).values
    else:
        # Single time step, use for all
        values = data_array.values
        if values.ndim == 3:
            values = values[0]  # Take first if there's a singleton dim

    # Calculate color range
    valid = values[~np.isnan(values)]
    if len(valid) == 0:
        return (dataset_name, time_idx, zoom, 0, 0, "No valid data")

    vmin = float(np.percentile(valid, 2))
    vmax = float(np.percentile(valid, 98))

    # Fill NaN with vmin (ocean will cover it)
    values = np.where(np.isnan(values), vmin, values)

    # Feature resolution based on zoom
    if zoom >= 5:
        scale = '10m'
        lw_coast = 0.5
        lw_border = 0.3
    elif zoom >= 3:
        scale = '50m'
        lw_coast = 0.4
        lw_border = 0.25
    else:
        scale = '110m'
        lw_coast = 0.3
        lw_border = 0.2

    n = 2 ** zoom
    completed = 0
    skipped = 0

    for x in range(n):
        for y in range(n):
            tile_path = TILES_DIR / dataset_name / str(time_idx) / str(zoom) / str(x) / f"{y}.png"

            # Skip if exists (for resume capability)
            # Comment out next 3 lines to regenerate all
            # if tile_path.exists():
            #     skipped += 1
            #     continue

            lon_min, lon_max, lat_min, lat_max = tile_bounds(zoom, x, y)

            # Skip extreme latitudes
            if lat_min > 85 or lat_max < -85:
                skipped += 1
                continue

            # Clamp to safe bounds
            lat_min = max(lat_min, -84.9)
            lat_max = min(lat_max, 84.9)
            lon_min = max(lon_min, -179.9)
            lon_max = min(lon_max, 179.9)

            if lon_min >= lon_max or lat_min >= lat_max:
                skipped += 1
                continue

            # Buffer for seam elimination
            buffer_pct = 0.02
            lat_range = lat_max - lat_min
            lon_range = lon_max - lon_min
            ext_lat_min = max(-84.9, lat_min - lat_range * buffer_pct)
            ext_lat_max = min(84.9, lat_max + lat_range * buffer_pct)
            ext_lon_min = max(-179.99, lon_min - lon_range * buffer_pct)
            ext_lon_max = min(179.99, lon_max + lon_range * buffer_pct)

            try:
                # Create figure with buffer
                buffer_pixels = int(DPI * buffer_pct * 2)
                fig_size = (DPI + buffer_pixels) / DPI

                fig = plt.figure(figsize=(fig_size, fig_size), dpi=DPI)
                ax = fig.add_subplot(1, 1, 1, projection=ccrs.Mercator())
                ax.set_extent([ext_lon_min, ext_lon_max, ext_lat_min, ext_lat_max], crs=ccrs.PlateCarree())

                # Plot data
                ax.pcolormesh(
                    lons, lats, values,
                    transform=ccrs.PlateCarree(),
                    cmap=cmap,
                    vmin=vmin, vmax=vmax,
                    shading='gouraud',
                    rasterized=True,
                    zorder=1
                )

                # Add features
                ax.add_feature(cfeature.OCEAN.with_scale(scale), facecolor='#1a1a2e', zorder=5)
                ax.add_feature(cfeature.COASTLINE.with_scale(scale), linewidth=lw_coast, edgecolor='#444', zorder=6)
                ax.add_feature(cfeature.BORDERS.with_scale(scale), linewidth=lw_border, edgecolor='#555', zorder=7)

                ax.set_frame_on(False)
                ax.patch.set_visible(False)
                ax.set_position([0, 0, 1, 1])

                # Save to buffer and crop
                buf = BytesIO()
                fig.savefig(buf, dpi=DPI, pad_inches=0, transparent=False, facecolor='#1a1a2e', format='png')
                plt.close(fig)
                buf.seek(0)

                # Crop center 256x256
                img = Image.open(buf)
                w, h = img.size
                left = (w - 256) // 2
                top = (h - 256) // 2
                img_cropped = img.crop((left, top, left + 256, top + 256))

                # Save tile
                tile_path.parent.mkdir(parents=True, exist_ok=True)
                img_cropped.save(tile_path, optimize=True)
                completed += 1

            except Exception as e:
                plt.close('all')
                skipped += 1

    return (dataset_name, time_idx, zoom, completed, skipped, None)


def main():
    logger.info("=" * 60)
    logger.info("MASTER TILE GENERATION PIPELINE")
    logger.info("=" * 60)
    logger.info(f"Workers: {NUM_WORKERS}")
    logger.info(f"Zoom levels: {ZOOM_LEVELS}")
    logger.info(f"Datasets: {list(DATASETS.keys())}")

    # Check which datasets are available
    available_datasets = []
    for name, config in DATASETS.items():
        if config['source'].exists():
            available_datasets.append(name)
            logger.info(f"  ✓ {name}: {config['source']}")
        else:
            logger.warning(f"  ✗ {name}: {config['source']} NOT FOUND")

    if not available_datasets:
        logger.error("No datasets available!")
        return 1

    # Build work units
    work_units = []
    for dataset_name in available_datasets:
        for time_idx in range(TIME_COUNT):
            for zoom in ZOOM_LEVELS:
                work_units.append((dataset_name, time_idx, zoom))

    total_units = len(work_units)
    logger.info(f"Work units: {total_units}")

    # Estimate total tiles
    total_tiles_estimate = sum(4 ** z for z in ZOOM_LEVELS) * len(available_datasets) * TIME_COUNT
    logger.info(f"Estimated tiles: {total_tiles_estimate:,}")
    logger.info(f"Output: {TILES_DIR}")
    logger.info("=" * 60)

    TILES_DIR.mkdir(parents=True, exist_ok=True)

    grand_completed = 0
    grand_skipped = 0
    start = time.time()

    with Pool(processes=NUM_WORKERS) as pool:
        for i, result in enumerate(pool.imap_unordered(process_zoom_level, work_units)):
            dataset_name, time_idx, zoom, completed, skipped, error = result
            grand_completed += completed
            grand_skipped += skipped

            elapsed = time.time() - start
            rate = grand_completed / elapsed if elapsed > 0 else 0
            pct = (i + 1) / total_units * 100

            if error:
                logger.warning(f"[{i+1}/{total_units}] {dataset_name}/t{time_idx}/z{zoom}: {error}")
            else:
                logger.info(
                    f"[{i+1}/{total_units}] ({pct:.1f}%) {dataset_name}/t{time_idx}/z{zoom}: "
                    f"+{completed} tiles ({rate:.1f}/sec)"
                )

    elapsed = time.time() - start
    logger.info("\n" + "=" * 60)
    logger.info("COMPLETE")
    logger.info("=" * 60)
    logger.info(f"New tiles: {grand_completed:,}")
    logger.info(f"Skipped: {grand_skipped:,}")
    logger.info(f"Time: {elapsed/3600:.2f} hours ({elapsed:.0f} seconds)")
    if elapsed > 0:
        logger.info(f"Rate: {grand_completed/elapsed:.1f} tiles/sec")

    return 0


if __name__ == "__main__":
    sys.exit(main())
