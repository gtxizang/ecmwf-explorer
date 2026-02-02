"""
3D Globe visualization using pydeck GlobeView.
Per specification: WebGL client-side rendering, not server-side images.
"""

import pydeck as pdk
import numpy as np
import base64
from io import BytesIO
from PIL import Image
from scipy import ndimage
import matplotlib.colors as mcolors

from .data_loader import data_loader
from .coastline_mask import get_land_mask

# Colorscales
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

# Natural Earth GeoJSON for layers
LAND_GEOJSON = "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_land.geojson"
OCEAN_GEOJSON = "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_ocean.geojson"
COUNTRIES_GEOJSON = "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_scale_rank.geojson"
COASTLINE_GEOJSON = "https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_coastline.geojson"


def get_colormap(name):
    """Get matplotlib colormap from our colorscale definition."""
    colorscale = COLORSCALES.get(name, COLORSCALES["RdYlBu_r"])
    colors = [c[1] for c in colorscale]
    positions = [c[0] for c in colorscale]
    rgb_colors = [mcolors.hex2color(c) for c in colors]
    return mcolors.LinearSegmentedColormap.from_list(name, list(zip(positions, rgb_colors)))


def create_data_texture(dataset_id, variable, time_index, colormap, sigma=1.0):
    """
    Create a texture image from climate data for use with BitmapLayer.

    Returns:
        Base64-encoded PNG data URL
    """
    lons, lats, values, vmin, vmax = data_loader.get_data_for_time(
        dataset_id, variable, time_index, resolution=1
    )

    if len(lons) == 0:
        return None

    # Track where we have data (land) vs NaN (ocean)
    has_data = ~np.isnan(values)

    # Fill NaN with mean for smoothing
    values_filled = np.where(~has_data, np.nanmean(values), values)

    # Apply Gaussian smoothing
    if sigma > 0:
        values_smooth = ndimage.gaussian_filter(values_filled, sigma=sigma)
        has_data_smooth = ndimage.gaussian_filter(has_data.astype(float), sigma=sigma)
    else:
        values_smooth = values_filled
        has_data_smooth = has_data.astype(float)

    # Normalize to 0-1
    normalized = (values_smooth - vmin) / (vmax - vmin + 1e-10)
    normalized = np.clip(normalized, 0, 1)

    # Apply colormap
    cmap = get_colormap(colormap)
    rgba = cmap(normalized)  # Returns (H, W, 4) float array

    # Convert to uint8
    rgba_uint8 = (rgba * 255).astype(np.uint8)

    # Make ocean transparent (alpha = 0)
    rgba_uint8[~has_data, 3] = 0

    # Smooth the alpha channel for anti-aliased coastlines
    if sigma > 0:
        alpha_smooth = (has_data_smooth * 255).astype(np.uint8)
        rgba_uint8[:, :, 3] = alpha_smooth

    # Flip vertically if needed
    # Image origin is top-left, so row 0 = north (lat 90)
    # If data has lats from -90 to 90 (south to north), flip it
    if lats[0] < lats[-1]:
        rgba_uint8 = np.flipud(rgba_uint8)

    # Create PIL image
    img = Image.fromarray(rgba_uint8, mode='RGBA')

    # Convert to base64
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    return f"data:image/png;base64,{img_base64}"


def create_point_data(dataset_id, variable, time_index, colormap, sigma=1.0):
    """
    Create point data for ScatterplotLayer from climate data.
    (Legacy - kept for reference)
    """
    lons, lats, values, vmin, vmax = data_loader.get_data_for_time(
        dataset_id, variable, time_index, resolution=1
    )

    if len(lons) == 0:
        return []

    # Apply smoothing if needed
    if sigma > 0:
        values_smooth = ndimage.gaussian_filter(
            np.where(np.isnan(values), np.nanmean(values), values),
            sigma=sigma
        )
        values_smooth = np.where(np.isnan(values), np.nan, values_smooth)
    else:
        values_smooth = values

    cmap = get_colormap(colormap)
    normalized = (values_smooth - vmin) / (vmax - vmin + 1e-10)
    normalized = np.clip(normalized, 0, 1)

    points = []
    for i in range(len(lats)):
        for j in range(len(lons)):
            val = values_smooth[i, j]
            if np.isnan(val):
                continue
            norm_val = normalized[i, j]
            rgba = cmap(norm_val)
            color = [int(rgba[0] * 255), int(rgba[1] * 255), int(rgba[2] * 255), 255]
            points.append({
                "position": [float(lons[j]), float(lats[i])],
                "color": color,
            })
    return points


def create_cell_polygons(dataset_id, variable, time_index, colormap, sigma=1.0):
    """
    Create rectangular polygon data for each grid cell.
    Uses high-resolution land mask to filter out cells that would bleed into ocean.
    Cells are shrunk slightly to avoid bleeding at edges.

    Returns:
        List of dicts with polygon coordinates and fill color for each land cell.
    """
    lons, lats, values, vmin, vmax = data_loader.get_data_for_time(
        dataset_id, variable, time_index, resolution=1
    )

    if len(lons) == 0:
        return []

    # Calculate cell size (half the grid spacing)
    lon_step = abs(lons[1] - lons[0]) if len(lons) > 1 else 0.5
    lat_step = abs(lats[1] - lats[0]) if len(lats) > 1 else 0.5

    # Shrink cells by 15% to reduce coastal bleeding
    shrink_factor = 0.85
    half_lon = (lon_step / 2) * shrink_factor
    half_lat = (lat_step / 2) * shrink_factor

    # Create a higher-resolution grid for land mask (4x resolution)
    hi_res_lons = np.linspace(lons.min(), lons.max(), len(lons) * 4)
    hi_res_lats = np.linspace(lats.min(), lats.max(), len(lats) * 4)
    hi_res_mask = get_land_mask(hi_res_lons, hi_res_lats, "globe_viz_hires")

    # Apply smoothing if needed
    if sigma > 0:
        values_smooth = ndimage.gaussian_filter(
            np.where(np.isnan(values), np.nanmean(values), values),
            sigma=sigma
        )
        values_smooth = np.where(np.isnan(values), np.nan, values_smooth)
    else:
        values_smooth = values

    cmap = get_colormap(colormap)
    normalized = (values_smooth - vmin) / (vmax - vmin + 1e-10)
    normalized = np.clip(normalized, 0, 1)

    def is_cell_on_land(lat, lon, half_lat, half_lon):
        """Check if all corners of a cell are on land using hi-res mask."""
        if hi_res_mask is None:
            return True  # No mask, allow all

        corners = [
            (lat - half_lat, lon - half_lon),
            (lat - half_lat, lon + half_lon),
            (lat + half_lat, lon - half_lon),
            (lat + half_lat, lon + half_lon),
        ]

        for clat, clon in corners:
            # Find nearest index in hi-res grid
            lat_idx = np.argmin(np.abs(hi_res_lats - clat))
            lon_idx = np.argmin(np.abs(hi_res_lons - clon))

            if not hi_res_mask[lat_idx, lon_idx]:
                return False  # Corner is in ocean

        return True  # All corners on land

    polygons = []
    for i in range(len(lats)):
        for j in range(len(lons)):
            val = values_smooth[i, j]
            if np.isnan(val):
                continue  # Skip ocean/NaN cells

            lat = float(lats[i])
            lon = float(lons[j])

            # Skip cells where any corner would be in ocean
            if not is_cell_on_land(lat, lon, half_lat, half_lon):
                continue

            # Create rectangle corners (closed polygon)
            polygon = [
                [lon - half_lon, lat - half_lat],
                [lon + half_lon, lat - half_lat],
                [lon + half_lon, lat + half_lat],
                [lon - half_lon, lat + half_lat],
                [lon - half_lon, lat - half_lat],  # Close the polygon
            ]

            norm_val = normalized[i, j]
            rgba = cmap(norm_val)
            color = [int(rgba[0] * 255), int(rgba[1] * 255), int(rgba[2] * 255), 200]

            polygons.append({
                "polygon": polygon,
                "color": color,
            })

    return polygons


def create_globe_deck(
    dataset_id="era5_land",
    variable="2m_temperature",
    time_index=0,
    colormap="RdYlBu_r",
    sigma=1.0,
    latitude=20,
    longitude=0,
    zoom=1,
):
    """
    Create a pydeck Deck object with GlobeView showing climate data.

    Returns:
        pdk.Deck object configured for globe visualization
    """
    # Create rectangular cell polygons for visualization
    cell_data = create_cell_polygons(dataset_id, variable, time_index, colormap, sigma)

    layers = []

    # Base layer: land polygons (dark background)
    land_layer = pdk.Layer(
        "GeoJsonLayer",
        id="land-base",
        data=LAND_GEOJSON,
        stroked=False,
        filled=True,
        get_fill_color=[30, 30, 35, 255],  # Dark grey land
    )
    layers.append(land_layer)

    # Data layer: climate data as filled rectangular cells
    if cell_data:
        data_layer = pdk.Layer(
            "PolygonLayer",
            id="climate-data",
            data=cell_data,
            get_polygon="polygon",
            get_fill_color="color",
            get_line_color=[0, 0, 0, 0],  # No border
            filled=True,
            stroked=False,
            pickable=True,
            auto_highlight=True,
        )
        layers.append(data_layer)

    # Ocean mask layer - covers any data bleeding into the sea
    ocean_layer = pdk.Layer(
        "GeoJsonLayer",
        id="ocean-mask",
        data=OCEAN_GEOJSON,
        stroked=False,
        filled=True,
        get_fill_color=[20, 24, 31, 255],  # Match globe ocean color
    )
    layers.append(ocean_layer)

    # Coastlines (on top)
    coastline_layer = pdk.Layer(
        "GeoJsonLayer",
        id="coastlines",
        data=COASTLINE_GEOJSON,
        stroked=True,
        filled=False,
        get_line_color=[40, 40, 45, 255],
        line_width_min_pixels=1,
    )
    layers.append(coastline_layer)

    # Country borders (on top)
    borders_layer = pdk.Layer(
        "GeoJsonLayer",
        id="borders",
        data=COUNTRIES_GEOJSON,
        stroked=True,
        filled=False,
        get_line_color=[60, 60, 65, 180],
        line_width_min_pixels=0.5,
    )
    layers.append(borders_layer)

    # View state - constrained for stable globe interaction
    view_state = pdk.ViewState(
        latitude=latitude,
        longitude=longitude,
        zoom=zoom,
        min_zoom=0.5,  # Don't allow zooming out too far
        max_zoom=6,    # Limit max zoom
    )

    # Globe view (experimental feature)
    view = pdk.View(
        type="_GlobeView",
        controller={
            "scrollZoom": True,
            "dragPan": True,
            "dragRotate": True,
            "doubleClickZoom": True,
            "touchZoom": True,
            "touchRotate": True,
            "keyboard": True,
            "inertia": 300,  # Smooth deceleration
        },
    )

    # Create deck
    deck = pdk.Deck(
        layers=layers,
        initial_view_state=view_state,
        views=[view],
        map_provider=None,  # No base map for globe view
        parameters={
            "cull": True,      # Make globe opaque
            "depthTest": True, # Proper depth rendering
        },
    )

    return deck


def create_globe_html(
    dataset_id="era5_land",
    variable="2m_temperature",
    time_index=0,
    colormap="RdYlBu_r",
    sigma=1.0,
    latitude=20,
    longitude=0,
    zoom=1,
    height="100%",
    width="100%",
):
    """
    Create HTML string for embedding the globe in Dash.

    Returns:
        HTML string with embedded pydeck visualization
    """
    deck = create_globe_deck(
        dataset_id, variable, time_index, colormap, sigma,
        latitude, longitude, zoom
    )

    # Generate HTML with custom styling
    html = deck.to_html(
        as_string=True,
        css_background_color="#141418",  # Match CARTO dark theme
        notebook_display=False,
    )

    return html


def get_deck_json(
    dataset_id="era5_land",
    variable="2m_temperature",
    time_index=0,
    colormap="RdYlBu_r",
    sigma=1.0,
    latitude=20,
    longitude=0,
    zoom=1,
):
    """
    Get the deck.gl JSON specification for use with dash-deck.

    Returns:
        Dict containing the deck.gl spec
    """
    deck = create_globe_deck(
        dataset_id, variable, time_index, colormap, sigma,
        latitude, longitude, zoom
    )

    return deck.to_json()
