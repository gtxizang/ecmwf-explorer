#!/usr/bin/env python3
"""Test tile seam fix by regenerating boundary tiles."""

import math
from pathlib import Path
import warnings
import numpy as np
import xarray as xr

warnings.filterwarnings('ignore')

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import cartopy.crs as ccrs
import cartopy.feature as cfeature

BASE_DIR = Path(__file__).parent.parent
TILES_DIR = BASE_DIR / "tiles_test"  # Output to test directory
DATA_PATH = BASE_DIR / "data" / "processed" / "era5_land.zarr"

COLORMAP = "RdYlBu_r"
DPI = 256

def tile_bounds(z, x, y):
    n = 2 ** z
    lon_min = x / n * 360.0 - 180.0
    lon_max = (x + 1) / n * 360.0 - 180.0
    lat_max = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat_min = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return lon_min, lon_max, lat_min, lat_max


def generate_tile(variable, time_idx, zoom, x, y, ds, use_buffer=True):
    """Generate a single tile."""
    data = ds[variable].isel(time=time_idx).values
    lons = ds.lon.values
    lats = ds.lat.values

    valid = data[~np.isnan(data)]
    vmin = float(np.percentile(valid, 2))
    vmax = float(np.percentile(valid, 98))
    values = np.where(np.isnan(data), vmin, data)

    lon_min, lon_max, lat_min, lat_max = tile_bounds(zoom, x, y)

    lat_min = max(lat_min, -84.9)
    lat_max = min(lat_max, 84.9)
    lon_min = max(lon_min, -179.9)
    lon_max = min(lon_max, 179.9)

    if use_buffer:
        # Add small buffer to eliminate tile seams
        buffer_lat = (lat_max - lat_min) * 0.01
        buffer_lon = (lon_max - lon_min) * 0.01
        ext_lon_min = max(-179.99, lon_min - buffer_lon)
        ext_lon_max = min(179.99, lon_max + buffer_lon)
        ext_lat_min = max(-84.9, lat_min - buffer_lat)
        ext_lat_max = min(84.9, lat_max + buffer_lat)
    else:
        ext_lon_min, ext_lon_max = lon_min, lon_max
        ext_lat_min, ext_lat_max = lat_min, lat_max

    fig = plt.figure(figsize=(1, 1), dpi=DPI)
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

    ax.add_feature(cfeature.OCEAN.with_scale('50m'), facecolor='#1a1a2e', zorder=5)
    ax.add_feature(cfeature.COASTLINE.with_scale('50m'), linewidth=0.4, edgecolor='#444', zorder=6)

    ax.set_frame_on(False)
    ax.patch.set_visible(False)
    ax.set_position([0, 0, 1, 1])

    suffix = "_buffered" if use_buffer else "_nobuffer"
    tile_path = TILES_DIR / f"{variable}_{time_idx}_z{zoom}_x{x}_y{y}{suffix}.png"
    tile_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(tile_path, dpi=DPI, pad_inches=0, transparent=False, facecolor='#1a1a2e')
    plt.close(fig)

    print(f"Generated: {tile_path.name}")
    return tile_path


def main():
    print("Loading data...")
    ds = xr.open_zarr(str(DATA_PATH))

    # Generate tiles at the seam (zoom 3, y=2 and y=3 boundary at ~40°N)
    zoom = 3
    time_idx = 36 + 10  # November 2023 (matches screenshot)
    variable = "2m_temperature"

    # Generate adjacent tiles at the boundary
    for x in [3, 4, 5]:  # Tiles covering Europe
        for y in [2, 3]:  # Above and below the seam
            # Generate with and without buffer for comparison
            generate_tile(variable, time_idx, zoom, x, y, ds, use_buffer=False)
            generate_tile(variable, time_idx, zoom, x, y, ds, use_buffer=True)

    print(f"\nTest tiles saved to: {TILES_DIR}")
    print("Compare _buffered vs _nobuffer versions to see if seam is fixed.")


if __name__ == "__main__":
    main()
