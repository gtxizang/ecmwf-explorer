"""
Pre-render static images for each time step.
Uses the exact same approach as the comparison images that looked good.
"""

import os
import numpy as np
from scipy import ndimage
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import cartopy.crs as ccrs
import cartopy.feature as cfeature
from pathlib import Path

from .data_loader import data_loader, DATASETS

OUTPUT_DIR = Path(__file__).parent.parent / "static_images"

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
}


def get_colormap(name):
    colorscale = COLORSCALES.get(name, COLORSCALES["RdYlBu_r"])
    colors = [c[1] for c in colorscale]
    positions = [c[0] for c in colorscale]
    rgb_colors = [mcolors.hex2color(c) for c in colors]
    return mcolors.LinearSegmentedColormap.from_list(name, list(zip(positions, rgb_colors)))


def render_static_image(dataset_id, variable, time_index, colormap="RdYlBu_r", sigma=1.0, interp="bilinear"):
    """
    Render a static image exactly like the comparison images.
    Returns the file path.
    """
    OUTPUT_DIR.mkdir(exist_ok=True)

    filename = f"{dataset_id}_{variable}_{time_index}_{colormap}_s{sigma}_{interp}.png"
    filepath = OUTPUT_DIR / filename

    # Check if already rendered
    if filepath.exists():
        return str(filepath)

    # Get data
    lons, lats, values, vmin, vmax = data_loader.get_data_for_time(
        dataset_id, variable, time_index, resolution=1
    )

    if len(lons) == 0:
        return None

    # Fill NaN and smooth
    values_filled = np.where(np.isnan(values), np.nanmean(values), values)
    if sigma > 0:
        values_smooth = ndimage.gaussian_filter(values_filled, sigma=sigma)
    else:
        values_smooth = values_filled

    # Create figure - large size for quality
    fig = plt.figure(figsize=(20, 10), dpi=150)
    ax = fig.add_axes([0, 0, 1, 1], projection=ccrs.PlateCarree())
    ax.set_global()
    ax.set_frame_on(False)

    cmap = get_colormap(colormap)
    extent = [lons.min(), lons.max(), lats.min(), lats.max()]

    # Render with imshow
    ax.imshow(
        values_smooth,
        origin='upper' if lats[0] > lats[-1] else 'lower',
        extent=extent,
        cmap=cmap,
        vmin=vmin,
        vmax=vmax,
        transform=ccrs.PlateCarree(),
        interpolation=interp,
    )

    # Ocean mask on top
    ax.add_feature(cfeature.OCEAN, facecolor='#1a1a2e', zorder=2)

    # Save
    fig.savefig(filepath, dpi=150, bbox_inches='tight', pad_inches=0, facecolor='#1a1a2e')
    plt.close(fig)

    print(f"Rendered: {filepath}")
    return str(filepath)


def prerender_all(dataset_id="era5_land", variable="2m_temperature", colormap="RdYlBu_r", sigma=1.0, interp="bilinear"):
    """Pre-render all time steps."""
    _, _, time_strings = data_loader.get_time_range(dataset_id)

    print(f"Pre-rendering {len(time_strings)} images...")
    for i, ts in enumerate(time_strings):
        render_static_image(dataset_id, variable, i, colormap, sigma, interp)
        if (i + 1) % 10 == 0:
            print(f"  {i + 1}/{len(time_strings)}")

    print("Done!")


if __name__ == "__main__":
    prerender_all()
