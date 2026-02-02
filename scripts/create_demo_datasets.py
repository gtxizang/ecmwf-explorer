#!/usr/bin/env python3
"""
Create synthetic demo datasets for Fire Burned Area and Sea Ice.
These provide realistic-looking data for demos while real data downloads.
"""

import xarray as xr
import numpy as np
from pathlib import Path
import warnings

warnings.filterwarnings('ignore')

BASE_DIR = Path(__file__).parent.parent
PYRAMIDS_DIR = BASE_DIR / "data" / "pyramids"

# Pyramid levels for different resolutions
PYRAMID_LEVELS = {
    0: 128,
    1: 256,
    2: 512,
    3: 1024,
}

# Web Mercator bounds
XMIN, YMIN, XMAX, YMAX = -20037508.34, -20037508.34, 20037508.34, 20037508.34


def create_fire_burned_area():
    """
    Create synthetic Fire Burned Area data with realistic patchy patterns.
    ONLY places fires within defined land regions - no ocean fires.
    """
    print("="*60)
    print("CREATING FIRE BURNED AREA DEMO DATA")
    print("="*60)

    output_dir = PYRAMIDS_DIR / "fire_burned_area"
    output_dir.mkdir(parents=True, exist_ok=True)

    for level, size in PYRAMID_LEVELS.items():
        print(f"  Level {level}: {size}x{size}")

        level_dir = output_dir / str(level)

        # Create coordinate arrays
        x = np.linspace(XMIN, XMAX, size)
        y = np.linspace(YMAX, YMIN, size)  # North to south

        # Convert to lat/lon for creating realistic patterns
        lon = x * 180 / 20037508.34
        lat = np.arctan(np.sinh(y * np.pi / 20037508.34)) * 180 / np.pi

        # Create meshgrid
        LON, LAT = np.meshgrid(lon, lat)

        # Create 12 months of data
        time_data = []
        for month in range(12):
            # Start with zeros - NO fires by default
            burned = np.zeros((size, size), dtype=np.float32)

            # Create noise field for patchy texture
            np.random.seed(month * 1000 + level)  # Reproducible per month/level
            noise = np.random.rand(size, size)

            # Define fire-prone LAND regions only - tight bounding boxes
            # Format: [lon_min, lon_max, lat_min, lat_max, prob, peak_month]
            fire_regions = [
                # Sub-Saharan Africa savanna belt - peak Dec-Feb
                (-17, 40, -12, 12, 0.20, 1),
                # Southern Africa - peak Aug-Oct
                (15, 35, -25, -10, 0.12, 9),
                # Amazon basin - peak Aug-Oct
                (-73, -45, -18, 2, 0.15, 9),
                # Cerrado Brazil - peak Aug-Sep
                (-55, -42, -22, -8, 0.12, 8),
                # Northern Australia - peak Oct-Dec
                (120, 145, -20, -12, 0.10, 11),
                # Southeast Australia - peak Dec-Feb
                (140, 152, -38, -28, 0.08, 0),
                # Indonesia/Borneo - peak Aug-Oct
                (100, 120, -8, 6, 0.10, 9),
                # Myanmar/Thailand - peak Feb-Apr
                (94, 106, 12, 24, 0.08, 3),
                # Central America/Mexico - peak Apr-May
                (-105, -85, 14, 24, 0.06, 4),
                # Portugal/Spain - peak Jul-Sep
                (-9, 0, 37, 43, 0.05, 8),
                # Greece/Turkey - peak Jul-Aug
                (20, 35, 36, 42, 0.04, 7),
                # California - peak Aug-Oct
                (-124, -117, 34, 42, 0.05, 9),
                # Pacific Northwest - peak Jul-Sep
                (-124, -117, 42, 49, 0.04, 8),
                # Siberia taiga - peak Jun-Aug
                (80, 140, 55, 68, 0.06, 7),
                # Canada boreal - peak Jun-Aug
                (-130, -60, 52, 65, 0.05, 7),
            ]

            for region in fire_regions:
                lon_min, lon_max, lat_min, lat_max, base_prob, peak = region

                # Seasonal modulation
                month_diff = min(abs(month - peak), 12 - abs(month - peak))
                seasonal = np.exp(-month_diff**2 / 3)  # Narrower peak

                # Create strict mask for this region only
                mask = (LON >= lon_min) & (LON <= lon_max) & (LAT >= lat_min) & (LAT <= lat_max)

                # Fire probability threshold
                fire_threshold = 1.0 - (base_prob * seasonal)
                region_fires = mask & (noise > fire_threshold)

                # Variable fire intensity
                fire_intensity = np.random.rand(size, size) * 35 + 15  # 15-50%
                burned = np.where(region_fires, fire_intensity, burned)

            # NO random fires outside defined regions - this was causing ocean fires

            time_data.append(burned.astype(np.float32))

        # Create dataset
        ds = xr.Dataset({
            'burned_area': (['time', 'y', 'x'], np.array(time_data, dtype=np.float32))
        })

        ds = ds.assign_coords({
            'time': np.arange(12),
            'x': x,
            'y': y,
        })

        ds['burned_area'].attrs = {
            'long_name': 'Burned Area Fraction',
            'units': '%',
            '_FillValue': 0.0,
        }
        ds.attrs['crs'] = 'EPSG:3857'

        # Chunk and save
        ds = ds.chunk({'time': 1, 'y': min(128, size), 'x': min(128, size)})
        ds.to_zarr(level_dir, mode='w', consolidated=True, zarr_format=2)
        print(f"    Saved to {level_dir}")

    print(f"Fire Burned Area pyramid complete: {output_dir}")
    return output_dir


def create_sea_ice():
    """
    Create synthetic Sea Ice Concentration data.
    Realistic Arctic and Antarctic ice patterns with seasonal variation.
    """
    print("\n" + "="*60)
    print("CREATING SEA ICE DEMO DATA")
    print("="*60)

    output_dir = PYRAMIDS_DIR / "sea_ice"
    output_dir.mkdir(parents=True, exist_ok=True)

    for level, size in PYRAMID_LEVELS.items():
        print(f"  Level {level}: {size}x{size}")

        level_dir = output_dir / str(level)

        # Create coordinate arrays
        x = np.linspace(XMIN, XMAX, size)
        y = np.linspace(YMAX, YMIN, size)  # North to south

        # Convert to lat/lon
        lon = x * 180 / 20037508.34
        lat = np.arctan(np.sinh(y * np.pi / 20037508.34)) * 180 / np.pi

        LON, LAT = np.meshgrid(lon, lat)

        time_data = []
        for month in range(12):
            # Arctic ice (centered on North Pole)
            arctic_extent = 70 + 15 * np.cos((month + 3) * 2 * np.pi / 12)  # Min in Sep, max in Mar
            arctic_ice = np.exp(-((LAT - 90)**2 / (2 * (90 - arctic_extent)**2)))
            arctic_ice = np.where(LAT > arctic_extent - 20, arctic_ice, 0)

            # Antarctic ice (centered on South Pole)
            antarctic_extent = -65 - 10 * np.cos((month + 3) * 2 * np.pi / 12)  # Min in Feb, max in Sep
            antarctic_ice = np.exp(-((LAT + 90)**2 / (2 * (90 + antarctic_extent)**2)))
            antarctic_ice = np.where(LAT < antarctic_extent + 15, antarctic_ice, 0)

            # Combine and scale to percentage
            ice_concentration = (arctic_ice + antarctic_ice) * 100

            # Add realistic texture/noise
            noise = np.random.randn(size, size) * 5
            ice_concentration = ice_concentration + noise

            # Clip to valid range
            ice_concentration = np.clip(ice_concentration, 0, 100)

            # Sharp edges where ice meets water
            ice_concentration = np.where(ice_concentration > 15, ice_concentration, 0)

            time_data.append(ice_concentration.astype(np.float32))

        # Create dataset
        ds = xr.Dataset({
            'ice_concentration': (['time', 'y', 'x'], np.array(time_data, dtype=np.float32))
        })

        ds = ds.assign_coords({
            'time': np.arange(12),
            'x': x,
            'y': y,
        })

        ds['ice_concentration'].attrs = {
            'long_name': 'Sea Ice Concentration',
            'units': '%',
            '_FillValue': 0.0,
        }
        ds.attrs['crs'] = 'EPSG:3857'

        # Chunk and save
        ds = ds.chunk({'time': 1, 'y': min(128, size), 'x': min(128, size)})
        ds.to_zarr(level_dir, mode='w', consolidated=True, zarr_format=2)
        print(f"    Saved to {level_dir}")

    print(f"Sea Ice pyramid complete: {output_dir}")
    return output_dir


def main():
    print("="*60)
    print("CREATING DEMO DATASETS")
    print("="*60)
    print("These provide realistic-looking data for demos")
    print("while real data downloads from CDS complete.\n")

    create_fire_burned_area()
    create_sea_ice()

    print("\n" + "="*60)
    print("DEMO DATA COMPLETE")
    print("="*60)
    print(f"Output: {PYRAMIDS_DIR}")
    print("\nNow update frontend to include these datasets.")

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
