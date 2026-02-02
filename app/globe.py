"""
Map visualization for ECMWF ECV Explorer.
Uses Leaflet CircleMarkers for proper geographic visualization.
"""

import numpy as np
import dash_leaflet as dl
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

from .data_loader import DATASETS

# Color schemes as matplotlib colormaps
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

# Europe bounds for clipping data
EUROPE_BOUNDS = {
    "west": -25,
    "east": 45,
    "south": 34,
    "north": 72,
}


def get_matplotlib_cmap(colormap_name: str):
    """Convert our colorscale definition to matplotlib colormap."""
    colorscale = COLORSCALES.get(colormap_name)
    if colorscale is None or isinstance(colorscale, str):
        return plt.get_cmap(colorscale or "YlOrRd")

    colors = [c[1] for c in colorscale]
    positions = [c[0] for c in colorscale]
    rgb_colors = [mcolors.hex2color(c) for c in colors]

    cmap = mcolors.LinearSegmentedColormap.from_list(
        colormap_name, list(zip(positions, rgb_colors))
    )
    return cmap


def rgba_to_hex(r, g, b, a=1.0):
    """Convert RGBA values (0-1) to hex color string."""
    return f"#{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}"


def create_leaflet_markers(
    lons: np.ndarray,
    lats: np.ndarray,
    values: np.ndarray,
    colormap: str = "YlOrRd",
    vmin: float = None,
    vmax: float = None,
    max_points: int = 5000,
) -> list:
    """
    Create Leaflet CircleMarker components for gridded data.

    Args:
        lons: 1D array of longitude values
        lats: 1D array of latitude values
        values: 2D array of data values (lat x lon)
        colormap: Name of colormap to use
        vmin, vmax: Value range for color normalization
        max_points: Maximum number of points to render (for performance)

    Returns:
        List of dl.CircleMarker components
    """
    if lons is None or lats is None or values is None:
        return []

    # Clip to Europe region
    lon_mask = (lons >= EUROPE_BOUNDS["west"]) & (lons <= EUROPE_BOUNDS["east"])
    lat_mask = (lats >= EUROPE_BOUNDS["south"]) & (lats <= EUROPE_BOUNDS["north"])

    europe_lons = lons[lon_mask]
    europe_lats = lats[lat_mask]

    lat_indices = np.where(lat_mask)[0]
    lon_indices = np.where(lon_mask)[0]

    if len(lat_indices) == 0 or len(lon_indices) == 0:
        return []

    europe_values = values[
        lat_indices[0]:lat_indices[-1]+1,
        lon_indices[0]:lon_indices[-1]+1
    ]

    # Create meshgrid
    lon_grid, lat_grid = np.meshgrid(europe_lons, europe_lats)

    # Flatten
    flat_lons = lon_grid.flatten()
    flat_lats = lat_grid.flatten()
    flat_values = europe_values.flatten()

    # Remove NaN values
    valid_mask = ~np.isnan(flat_values)
    flat_lons = flat_lons[valid_mask]
    flat_lats = flat_lats[valid_mask]
    flat_values = flat_values[valid_mask]

    # Downsample if too many points
    n_points = len(flat_values)
    if n_points > max_points:
        step = n_points // max_points
        flat_lons = flat_lons[::step]
        flat_lats = flat_lats[::step]
        flat_values = flat_values[::step]

    if len(flat_values) == 0:
        return []

    # Normalize values
    if vmin is None:
        vmin = np.nanmin(flat_values)
    if vmax is None:
        vmax = np.nanmax(flat_values)

    normalized = (flat_values - vmin) / (vmax - vmin + 1e-10)
    normalized = np.clip(normalized, 0, 1)

    # Get colormap
    cmap = get_matplotlib_cmap(colormap)

    # Calculate marker radius based on grid spacing
    lon_spacing = abs(float(lons[1] - lons[0])) if len(lons) > 1 else 1.0
    # Radius in meters - approximate degrees to meters at mid-latitude
    radius = max(5000, int(lon_spacing * 111000 * 0.4))  # ~40% of cell size

    # Create CircleMarkers
    markers = []
    for i in range(len(flat_values)):
        rgba = cmap(normalized[i])
        color = rgba_to_hex(rgba[0], rgba[1], rgba[2])

        markers.append(
            dl.CircleMarker(
                center=[float(flat_lats[i]), float(flat_lons[i])],
                radius=8,  # Pixel radius
                color=color,
                fillColor=color,
                fillOpacity=0.7,
                stroke=False,
                children=[
                    dl.Tooltip(f"Value: {flat_values[i]:.1f}")
                ],
            )
        )

    return markers


def create_data_layer(
    lons: np.ndarray = None,
    lats: np.ndarray = None,
    values: np.ndarray = None,
    colormap: str = "YlOrRd",
    vmin: float = None,
    vmax: float = None,
) -> list:
    """
    Create a list of Leaflet components for the data layer.

    Returns:
        List of Leaflet components to be added to the map
    """
    if values is None or lons is None or lats is None:
        return []

    return create_leaflet_markers(lons, lats, values, colormap, vmin, vmax)


# Keep old function names for compatibility
def create_europe_map(*args, **kwargs):
    """Deprecated: Use create_data_layer instead."""
    return create_data_layer(*args, **kwargs)


def create_empty_globe():
    """Create an empty data layer."""
    return []
