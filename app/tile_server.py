"""
Tile server using matplotlib imshow + cartopy ocean mask.
Matches the quality of the comparison images that looked good.
"""

import math
import numpy as np
from io import BytesIO
from PIL import Image
from flask import Response, request
from scipy import ndimage
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import cartopy.crs as ccrs
import cartopy.feature as cfeature

from .data_loader import data_loader

# Color schemes
COLORSCALES = {
    "YlOrRd": [
        (0.0, "#ffffcc"), (0.125, "#ffeda0"), (0.25, "#fed976"),
        (0.375, "#feb24c"), (0.5, "#fd8d3c"), (0.625, "#fc4e2a"),
        (0.75, "#e31a1c"), (0.875, "#bd0026"), (1.0, "#800026"),
    ],
    "RdYlBu_r": [
        (0.0, "#313695"), (0.1, "#4575b4"), (0.2, "#74add1"),
        (0.3, "#abd9e9"), (0.4, "#e0f3f8"), (0.5, "#ffffbf"),
        (0.6, "#fee090"), (0.7, "#fdae61"), (0.8, "#f46d43"),
        (0.9, "#d73027"), (1.0, "#a50026"),
    ],
    "Viridis": "viridis",
}

TILE_SIZE = 256

_cmap_cache = {}
_data_cache = {}


def get_colormap(name):
    if name in _cmap_cache:
        return _cmap_cache[name]
    colorscale = COLORSCALES.get(name)
    if colorscale is None or isinstance(colorscale, str):
        cmap = plt.get_cmap(colorscale or "YlOrRd")
    else:
        colors = [c[1] for c in colorscale]
        positions = [c[0] for c in colorscale]
        rgb_colors = [mcolors.hex2color(c) for c in colors]
        cmap = mcolors.LinearSegmentedColormap.from_list(name, list(zip(positions, rgb_colors)))
    _cmap_cache[name] = cmap
    return cmap


def tile_to_bbox(x, y, z):
    """Convert tile coordinates to lat/lon bounding box."""
    n = 2 ** z
    west = x / n * 360.0 - 180.0
    east = (x + 1) / n * 360.0 - 180.0
    north_rad = math.atan(math.sinh(math.pi * (1 - 2 * y / n)))
    south_rad = math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n)))
    north = math.degrees(north_rad)
    south = math.degrees(south_rad)
    return west, south, east, north


def get_processed_data(dataset_id, variable, time_index, sigma):
    """Get smoothed data with caching."""
    cache_key = (dataset_id, variable, time_index, sigma)
    if cache_key in _data_cache:
        return _data_cache[cache_key]

    lons, lats, values, vmin, vmax = data_loader.get_data_for_time(
        dataset_id, variable, time_index, resolution=1
    )

    if len(lons) == 0:
        return None, None, None, None, None

    # Fill NaN and smooth
    values_filled = np.where(np.isnan(values), np.nanmean(values), values)
    if sigma > 0:
        values_smooth = ndimage.gaussian_filter(values_filled, sigma=sigma)
    else:
        values_smooth = values_filled

    result = (lons, lats, values_smooth, vmin, vmax)
    _data_cache[cache_key] = result
    return result


def render_tile_imshow(dataset_id, variable, time_index, z, x, y, colormap, sigma, interp):
    """
    Render tile using matplotlib imshow + cartopy ocean mask.
    This matches the comparison images that looked good.
    """
    west, south, east, north = tile_to_bbox(x, y, z)

    # Get processed data
    data = get_processed_data(dataset_id, variable, time_index, sigma)
    if data[0] is None:
        return create_transparent_tile()

    lons, lats, values_smooth, vmin, vmax = data

    # Create figure with cartopy
    dpi = 100
    fig = plt.figure(figsize=(TILE_SIZE/dpi, TILE_SIZE/dpi), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1], projection=ccrs.PlateCarree())
    ax.set_extent([west, east, south, north], crs=ccrs.PlateCarree())
    ax.set_frame_on(False)
    ax.patch.set_alpha(0)

    # Get colormap
    cmap = get_colormap(colormap)

    # Data extent
    extent = [lons.min(), lons.max(), lats.min(), lats.max()]

    # Render with imshow - this gives smooth interpolation like comparison images
    ax.imshow(
        values_smooth,
        origin='upper' if lats[0] > lats[-1] else 'lower',
        extent=extent,
        cmap=cmap,
        vmin=vmin,
        vmax=vmax,
        transform=ccrs.PlateCarree(),
        interpolation=interp,  # bilinear, bicubic, lanczos
    )

    # Ocean mask ON TOP - use exact basemap color so no transparency needed
    # CARTO dark basemap color is approximately #1a1a2e
    ax.add_feature(cfeature.OCEAN, facecolor='#141418', zorder=2)

    # Save to buffer - no transparency, ocean matches basemap
    buffer = BytesIO()
    fig.savefig(buffer, format='png', dpi=dpi, transparent=False,
                pad_inches=0, facecolor='#141418')
    plt.close(fig)
    buffer.seek(0)

    img = Image.open(buffer)
    img = img.convert('RGBA')

    # Ensure exact tile size
    if img.size != (TILE_SIZE, TILE_SIZE):
        img = img.resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)

    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return buffer.getvalue()


def create_transparent_tile():
    """Create a fully transparent tile."""
    img = Image.new('RGBA', (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    return buffer.getvalue()


def register_tile_routes(app):
    """Register tile serving routes."""

    @app.server.route('/tiles/<dataset_id>/<variable>/<int:time_index>/<colormap>/<int:z>/<int:x>/<int:y>.png')
    def serve_tile(dataset_id, variable, time_index, colormap, z, x, y):
        try:
            sigma = float(request.args.get('sigma', 1.0))
            interp = request.args.get('interp', 'bilinear')

            tile_data = render_tile_imshow(
                dataset_id, variable, time_index, z, x, y, colormap, sigma, interp
            )

            response = Response(tile_data, mimetype='image/png')
            response.headers['Cache-Control'] = 'no-cache'
            return response

        except Exception as e:
            print(f"Tile error z={z} x={x} y={y}: {e}")
            import traceback
            traceback.print_exc()
            return Response(create_transparent_tile(), mimetype='image/png')
