"""
Simple PIL-based image renderer with Web Mercator projection.
Generates images that align correctly with Leaflet maps.
"""

import math
import hashlib
import numpy as np
from io import BytesIO
from PIL import Image
from scipy import ndimage
from scipy.interpolate import RegularGridInterpolator
from flask import Response, request
from functools import lru_cache
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

from .data_loader import data_loader
from .coastline_mask import get_land_mask

# Web Mercator latitude limits
MERCATOR_MAX_LAT = 85.051

# Simple in-memory cache for rendered images
_image_cache = {}
_cache_max_size = 100  # Max number of cached images

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
    "Viridis": [
        (0.0, "#440154"), (0.1, "#482475"), (0.2, "#414487"),
        (0.3, "#355f8d"), (0.4, "#2a788e"), (0.5, "#21918c"),
        (0.6, "#22a884"), (0.7, "#44bf70"), (0.8, "#7ad151"),
        (0.9, "#bddf26"), (1.0, "#fde725"),
    ],
}

# Dark color matching CARTO dark basemap
OCEAN_COLOR = (20, 20, 24, 255)  # #141418


def get_colormap(name):
    colorscale = COLORSCALES.get(name, COLORSCALES["RdYlBu_r"])
    colors = [c[1] for c in colorscale]
    positions = [c[0] for c in colorscale]
    rgb_colors = [mcolors.hex2color(c) for c in colors]
    return mcolors.LinearSegmentedColormap.from_list(name, list(zip(positions, rgb_colors)))


def lat_to_mercator_y(lat):
    """Convert latitude to Web Mercator Y coordinate (normalized 0-1, top to bottom)."""
    lat_rad = math.radians(np.clip(lat, -MERCATOR_MAX_LAT, MERCATOR_MAX_LAT))
    merc_y = np.log(np.tan(np.pi/4 + lat_rad/2))
    max_merc = math.log(math.tan(math.pi/4 + math.radians(MERCATOR_MAX_LAT)/2))
    # Normalize: 0 at top (north), 1 at bottom (south)
    return (max_merc - merc_y) / (2 * max_merc)


def mercator_y_to_lat(y_norm):
    """Convert normalized Y (0=north, 1=south) back to latitude."""
    max_merc = math.log(math.tan(math.pi/4 + math.radians(MERCATOR_MAX_LAT)/2))
    merc_y = max_merc - y_norm * 2 * max_merc
    lat_rad = 2 * np.arctan(np.exp(merc_y)) - np.pi/2
    return np.degrees(lat_rad)


def render_simple_image(dataset_id, variable, time_index, colormap, sigma, interp):
    """
    Render image in Web Mercator projection for correct Leaflet alignment.
    """
    lons, lats, values, vmin, vmax = data_loader.get_data_for_time(
        dataset_id, variable, time_index, resolution=1
    )

    if len(lons) == 0:
        return None

    # Data is (lat, lon) shaped, e.g., (360, 720) for 0.5 degree resolution
    # Lats typically go from 89.8 to -89.7 (north to south)
    # Lons go from -179.7 to 179.8

    # Get proper coastline mask from Natural Earth data (not data's NaN)
    land_mask = get_land_mask(lons, lats, resolution_name=dataset_id)

    # Use Natural Earth mask if available, otherwise fall back to data mask
    if land_mask is not None:
        # Flip vertically - rasterio produces mask with opposite row order
        has_data = np.flipud(land_mask)
    else:
        has_data = ~np.isnan(values)

    # Fill NaN with interpolated values for smooth rendering
    values_filled = np.where(np.isnan(values), np.nanmean(values), values)

    # Apply Gaussian smoothing in equirectangular space
    if sigma > 0:
        values_smooth = ndimage.gaussian_filter(values_filled, sigma=sigma)
    else:
        values_smooth = values_filled

    # Smooth the coastline mask for anti-aliased edges
    # Higher sigma = smoother coastlines
    mask_sigma = max(2.0, sigma + 1.0)
    has_data_smooth = ndimage.gaussian_filter(has_data.astype(float), sigma=mask_sigma)

    # Ensure lats are in descending order (north to south) for interpolation
    if lats[0] < lats[-1]:
        lats = lats[::-1]
        values_smooth = np.flipud(values_smooth)
        has_data_smooth = np.flipud(has_data_smooth)

    # Create interpolators for the equirectangular data
    # Note: RegularGridInterpolator expects ascending coordinates
    lats_asc = lats[::-1]  # ascending for interpolator
    values_for_interp = values_smooth[::-1]  # flip to match
    has_data_for_interp = has_data_smooth[::-1]

    value_interp = RegularGridInterpolator(
        (lats_asc, lons), values_for_interp,
        method='linear', bounds_error=False, fill_value=np.nan
    )
    mask_interp = RegularGridInterpolator(
        (lats_asc, lons), has_data_for_interp,
        method='linear', bounds_error=False, fill_value=0
    )

    # Output image dimensions (Web Mercator) - high resolution for crisp display
    out_width = len(lons) * 4  # 4x resolution for sharp image
    out_height = int(out_width / 2)  # Aspect ratio for world map

    # Create coordinate grids for output image
    # Y: 0 at top (north = +85.051), 1 at bottom (south = -85.051)
    y_norm = np.linspace(0, 1, out_height)
    x_norm = np.linspace(0, 1, out_width)

    # Convert to geographic coordinates
    out_lats = mercator_y_to_lat(y_norm)  # North to south
    out_lons = np.linspace(-180, 180, out_width)

    # Create meshgrid for sampling
    out_lon_grid, out_lat_grid = np.meshgrid(out_lons, out_lats)

    # Sample from equirectangular data
    points = np.stack([out_lat_grid.ravel(), out_lon_grid.ravel()], axis=-1)
    values_merc = value_interp(points).reshape(out_height, out_width)
    mask_merc = mask_interp(points).reshape(out_height, out_width)

    # Normalize to 0-1
    normalized = (values_merc - vmin) / (vmax - vmin + 1e-10)
    normalized = np.clip(normalized, 0, 1)

    # Apply colormap
    cmap = get_colormap(colormap)
    rgba = cmap(normalized)  # Returns (H, W, 4) float array

    # Convert to uint8
    rgba_uint8 = (rgba * 255).astype(np.uint8)

    # Blend ocean areas with dark color based on smoothed mask
    # mask_merc: 1 = land, 0 = ocean, values in between = coastline
    alpha = mask_merc[:, :, np.newaxis]
    ocean_rgba = np.array(OCEAN_COLOR, dtype=np.uint8)
    rgba_uint8 = (alpha * rgba_uint8 + (1 - alpha) * ocean_rgba).astype(np.uint8)

    # Create PIL image
    img = Image.fromarray(rgba_uint8, mode='RGBA')

    # No upscaling needed - already high resolution
    # But apply chosen interpolation method if user wants different resampling
    if interp == 'nearest':
        # For nearest, no resize needed - keep pixel-perfect
        pass
    else:
        # Apply slight sharpening via resize for other methods
        resample_method = {
            'bilinear': Image.Resampling.BILINEAR,
            'bicubic': Image.Resampling.BICUBIC,
            'lanczos': Image.Resampling.LANCZOS,
        }.get(interp, Image.Resampling.LANCZOS)

    # Save to buffer
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)

    return buffer.getvalue()


def get_cache_key(dataset_id, variable, time_index, colormap, sigma, interp):
    """Generate a unique cache key for the image parameters."""
    return f"{dataset_id}:{variable}:{time_index}:{colormap}:{sigma}:{interp}"


def get_cached_image(cache_key):
    """Get image from cache if available."""
    return _image_cache.get(cache_key)


def cache_image(cache_key, image_data):
    """Store image in cache, evicting old entries if needed."""
    global _image_cache
    if len(_image_cache) >= _cache_max_size:
        # Remove oldest entry (simple FIFO)
        oldest_key = next(iter(_image_cache))
        del _image_cache[oldest_key]
    _image_cache[cache_key] = image_data


def register_simple_routes(app):
    """Register simple image route."""

    @app.server.route('/simple/<dataset_id>/<variable>/<int:time_index>/<colormap>.png')
    def serve_simple(dataset_id, variable, time_index, colormap):
        try:
            sigma = float(request.args.get('sigma', 0))
            interp = request.args.get('interp', 'lanczos')

            # Check cache first
            cache_key = get_cache_key(dataset_id, variable, time_index, colormap, sigma, interp)
            cached = get_cached_image(cache_key)
            if cached:
                response = Response(cached, mimetype='image/png')
                response.headers['X-Cache'] = 'HIT'
                return response

            # Render new image
            image_data = render_simple_image(dataset_id, variable, time_index, colormap, sigma, interp)

            if image_data is None:
                return Response("No data", status=404)

            # Cache the result
            cache_image(cache_key, image_data)

            response = Response(image_data, mimetype='image/png')
            response.headers['X-Cache'] = 'MISS'
            return response

        except Exception as e:
            print(f"Simple image error: {e}")
            import traceback
            traceback.print_exc()
            return Response(str(e), status=500)
