"""
Simple WMS-like tile server for climate data.
"""

from flask import Response, request
from PIL import Image
import numpy as np
from scipy import ndimage
from io import BytesIO
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

from .data_loader import data_loader

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


def get_colormap(name):
    colorscale = COLORSCALES.get(name)
    if colorscale is None or isinstance(colorscale, str):
        return plt.get_cmap(colorscale or "YlOrRd")
    colors = [c[1] for c in colorscale]
    positions = [c[0] for c in colorscale]
    rgb_colors = [mcolors.hex2color(c) for c in colors]
    return mcolors.LinearSegmentedColormap.from_list(name, list(zip(positions, rgb_colors)))


def register_wms_routes(app):
    """Register WMS-like routes."""

    @app.server.route('/wms')
    def wms_handler():
        """Handle WMS-like GetMap requests."""
        # Parse WMS parameters
        bbox = request.args.get('BBOX', '-180,-90,180,90')
        width = int(request.args.get('WIDTH', 256))
        height = int(request.args.get('HEIGHT', 256))
        layers = request.args.get('LAYERS', 'era5_land/2m_temperature/0')
        styles = request.args.get('STYLES', 'RdYlBu_r')
        sigma = float(request.args.get('SIGMA', 1.0))

        try:
            # Parse bbox: minx,miny,maxx,maxy = west,south,east,north
            west, south, east, north = map(float, bbox.split(','))

            # Parse layers: dataset/variable/time_index
            parts = layers.split('/')
            dataset_id = parts[0] if len(parts) > 0 else 'era5_land'
            variable = parts[1] if len(parts) > 1 else '2m_temperature'
            time_index = int(parts[2]) if len(parts) > 2 else 0

            colormap = styles

            # Get full data
            lons, lats, values, vmin, vmax = data_loader.get_data_for_time(
                dataset_id, variable, time_index, resolution=1
            )

            if len(lons) == 0:
                return Response("No data", status=404)

            # Find indices for the requested bbox
            lon_mask = (lons >= west) & (lons <= east)
            lat_mask = (lats >= south) & (lats <= north)

            if not np.any(lon_mask) or not np.any(lat_mask):
                # Return transparent tile
                img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
                buffer = BytesIO()
                img.save(buffer, format='PNG')
                buffer.seek(0)
                return Response(buffer.getvalue(), mimetype='image/png')

            # Extract subset
            lons_sub = lons[lon_mask]
            lats_sub = lats[lat_mask]
            values_sub = values[np.ix_(lat_mask, lon_mask)]

            # Track where data exists
            has_data = ~np.isnan(values_sub)

            # Fill NaN and smooth
            values_filled = np.where(~has_data, np.nanmean(values_sub), values_sub)
            if sigma > 0:
                values_smooth = ndimage.gaussian_filter(values_filled, sigma=sigma)
            else:
                values_smooth = values_filled

            # Apply colormap
            cmap = get_colormap(colormap)
            normalized = (values_smooth - vmin) / (vmax - vmin + 1e-10)
            normalized = np.clip(normalized, 0, 1)
            rgba = cmap(normalized)
            rgba[~has_data, 3] = 0

            # Convert to image
            img_array = (rgba * 255).astype(np.uint8)

            # Flip if needed (north at top)
            if lats_sub[0] < lats_sub[-1]:
                img_array = np.flipud(img_array)

            img = Image.fromarray(img_array, mode='RGBA')

            # Resize to requested dimensions
            img = img.resize((width, height), Image.Resampling.BILINEAR)

            buffer = BytesIO()
            img.save(buffer, format='PNG')
            buffer.seek(0)

            response = Response(buffer.getvalue(), mimetype='image/png')
            response.headers['Cache-Control'] = 'no-cache'
            return response

        except Exception as e:
            print(f"WMS Error: {e}")
            import traceback
            traceback.print_exc()
            return Response(str(e), status=500)
