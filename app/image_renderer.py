"""
Render climate data as a simple image overlay with exact coordinate alignment.
"""

import numpy as np
from io import BytesIO
from PIL import Image
from scipy import ndimage
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

from .data_loader import data_loader

# Color schemes
COLORSCALES = {
    "YlOrRd": [
        (0.0, "#ffffcc"),
        (0.125, "#ffeda0"),
        (0.25, "#fed976"),
        (0.375, "#feb24c"),
        (0.5, "#fd8d3c"),
        (0.625, "#fc4e2a"),
        (0.75, "#e31a1c"),
        (0.875, "#bd0026"),
        (1.0, "#800026"),
    ],
    "RdYlBu_r": [
        (0.0, "#313695"),
        (0.1, "#4575b4"),
        (0.2, "#74add1"),
        (0.3, "#abd9e9"),
        (0.4, "#e0f3f8"),
        (0.5, "#ffffbf"),
        (0.6, "#fee090"),
        (0.7, "#fdae61"),
        (0.8, "#f46d43"),
        (0.9, "#d73027"),
        (1.0, "#a50026"),
    ],
    "Viridis": "viridis",
}


def get_colormap(colormap_name: str):
    """Get matplotlib colormap."""
    colorscale = COLORSCALES.get(colormap_name)
    if colorscale is None or isinstance(colorscale, str):
        return plt.get_cmap(colorscale or "YlOrRd")

    colors = [c[1] for c in colorscale]
    positions = [c[0] for c in colorscale]
    rgb_colors = [mcolors.hex2color(c) for c in colors]
    return mcolors.LinearSegmentedColormap.from_list(
        colormap_name, list(zip(positions, rgb_colors))
    )


def render_image(
    dataset_id: str,
    variable: str,
    time_index: int,
    colormap: str = "RdYlBu_r",
    sigma: float = 1.0,
    interp: str = "bilinear",
) -> tuple:
    """
    Render climate data as RGBA image with exact coordinate alignment.
    Uses data NaN values to mask ocean (transparent).
    """
    # Get data
    lons, lats, values, vmin, vmax = data_loader.get_data_for_time(
        dataset_id, variable, time_index, resolution=1
    )

    if len(lons) == 0:
        return None, None

    # Get actual data bounds
    west, east = float(lons.min()), float(lons.max())
    south, north = float(min(lats)), float(max(lats))

    # Track where data exists (not NaN = land for ERA5-Land)
    has_data = ~np.isnan(values)

    # Fill NaN with mean for smoothing
    values_filled = np.where(~has_data, np.nanmean(values), values)

    # Apply Gaussian smoothing
    if sigma > 0:
        values_smooth = ndimage.gaussian_filter(values_filled, sigma=sigma)
    else:
        values_smooth = values_filled

    # Normalize and apply colormap
    cmap = get_colormap(colormap)
    normalized = (values_smooth - vmin) / (vmax - vmin + 1e-10)
    normalized = np.clip(normalized, 0, 1)

    # Apply colormap to get RGBA
    rgba = cmap(normalized)

    # Set areas without data (ocean) to transparent
    rgba[~has_data, 3] = 0

    # Convert to uint8
    img_array = (rgba * 255).astype(np.uint8)

    # Image should have north at top (row 0 = north, last row = south)
    # Our data has lats[0]=89.8 (north), lats[-1]=-89.7 (south) - already correct
    # Only flip if data is south-to-north
    if lats[0] < lats[-1]:
        img_array = np.flipud(img_array)

    # Create PIL image
    img = Image.fromarray(img_array, mode='RGBA')

    # Apply interpolation by upscaling
    if interp != "nearest":
        scale = 4
        new_size = (img.width * scale, img.height * scale)
        resample = {
            "bilinear": Image.Resampling.BILINEAR,
            "bicubic": Image.Resampling.BICUBIC,
            "lanczos": Image.Resampling.LANCZOS,
        }.get(interp, Image.Resampling.BILINEAR)
        img = img.resize(new_size, resample=resample)

    # Save to buffer
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)

    return buffer.getvalue(), (west, south, east, north)


def register_image_routes(app):
    """Register image serving routes."""
    from flask import Response, request

    @app.server.route('/render/<dataset_id>/<variable>/<int:time_index>/<colormap>.png')
    def serve_image(dataset_id, variable, time_index, colormap):
        """Serve rendered image."""
        try:
            sigma = float(request.args.get('sigma', 1.0))
            interp = request.args.get('interp', 'bilinear')

            image_bytes, bounds = render_image(
                dataset_id=dataset_id,
                variable=variable,
                time_index=time_index,
                colormap=colormap,
                sigma=sigma,
                interp=interp,
            )

            if image_bytes is None:
                return Response("No data", status=404)

            response = Response(image_bytes, mimetype='image/png')
            response.headers['Cache-Control'] = 'no-cache'
            return response

        except Exception as e:
            print(f"Error rendering image: {e}")
            import traceback
            traceback.print_exc()
            return Response(str(e), status=500)
