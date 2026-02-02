"""
High-resolution coastline mask using Natural Earth data via cartopy.
Pre-computes a land/ocean mask for fast rendering.
"""

import numpy as np
from pathlib import Path
import pickle

# Try to import cartopy for coastline geometry
try:
    import cartopy.feature as cfeature
    from shapely.geometry import Point
    from shapely.prepared import prep
    CARTOPY_AVAILABLE = True
except ImportError:
    CARTOPY_AVAILABLE = False
    print("Warning: cartopy not available. Using data-based mask.")


CACHE_DIR = Path(__file__).parent.parent / "data" / "cache"
MASK_CACHE_FILE = CACHE_DIR / "land_mask_{resolution}.pkl"


def get_land_geometry():
    """Get land geometry from Natural Earth via cartopy."""
    if not CARTOPY_AVAILABLE:
        return None

    # Use 50m resolution Natural Earth land
    land_feature = cfeature.NaturalEarthFeature(
        'physical', 'land', '50m',
        edgecolor='none',
        facecolor='none'
    )

    # Get all land geometries and union them
    from shapely.ops import unary_union
    land_geoms = list(land_feature.geometries())
    land_union = unary_union(land_geoms)

    return prep(land_union)  # Prepared geometry for fast contains checks


def create_land_mask(lons, lats, resolution_name="default"):
    """
    Create a high-resolution land mask using Natural Earth coastlines.

    Args:
        lons: 1D array of longitudes
        lats: 1D array of latitudes
        resolution_name: Name for caching

    Returns:
        2D boolean array where True = land, False = ocean
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"land_mask_{resolution_name}_{len(lats)}x{len(lons)}.pkl"

    # Check cache
    if cache_file.exists():
        print(f"Loading cached land mask from {cache_file}")
        with open(cache_file, 'rb') as f:
            return pickle.load(f)

    print(f"Creating land mask ({len(lats)} x {len(lons)})... This may take a minute.")

    if not CARTOPY_AVAILABLE:
        print("Cartopy not available - returning None (will use data mask)")
        return None

    land_geom = get_land_geometry()
    if land_geom is None:
        return None

    # Create mask
    mask = np.zeros((len(lats), len(lons)), dtype=bool)

    total = len(lats) * len(lons)
    count = 0

    for i, lat in enumerate(lats):
        for j, lon in enumerate(lons):
            # Normalize longitude to -180 to 180
            lon_norm = ((lon + 180) % 360) - 180
            point = Point(lon_norm, lat)
            mask[i, j] = land_geom.contains(point)
            count += 1

        if i % 50 == 0:
            print(f"  Progress: {i}/{len(lats)} rows ({100*count/total:.1f}%)")

    # Cache the result
    with open(cache_file, 'wb') as f:
        pickle.dump(mask, f)
    print(f"Cached land mask to {cache_file}")

    return mask


def create_land_mask_fast(lons, lats, resolution_name="default"):
    """
    Faster land mask creation using vectorized operations.
    Uses rasterio/geopandas for efficient rasterization.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"land_mask_{resolution_name}_{len(lats)}x{len(lons)}.pkl"

    # Check cache
    if cache_file.exists():
        print(f"Loading cached land mask from {cache_file}")
        with open(cache_file, 'rb') as f:
            return pickle.load(f)

    print(f"Creating land mask ({len(lats)} x {len(lons)}) using rasterization...")

    try:
        import geopandas as gpd
        from rasterio import features
        from rasterio.transform import from_bounds
        from affine import Affine
        import cartopy.io.shapereader as shpreader

        # Get Natural Earth land shapefile
        shpfilename = shpreader.natural_earth(
            resolution='50m',
            category='physical',
            name='land'
        )
        land_gdf = gpd.read_file(shpfilename)

        # Create transform for rasterization
        # lons go from min to max, lats from max to min (image convention)
        lon_min, lon_max = lons.min(), lons.max()
        lat_min, lat_max = lats.min(), lats.max()

        # Determine if lats are north-to-south or south-to-north
        if lats[0] > lats[-1]:
            # North to south (image convention)
            transform = from_bounds(lon_min, lat_min, lon_max, lat_max, len(lons), len(lats))
        else:
            # South to north - flip
            transform = from_bounds(lon_min, lat_max, lon_max, lat_min, len(lons), len(lats))

        # Rasterize land polygons
        shapes = [(geom, 1) for geom in land_gdf.geometry]
        mask = features.rasterize(
            shapes,
            out_shape=(len(lats), len(lons)),
            transform=transform,
            fill=0,
            dtype=np.uint8,
            all_touched=True  # Include pixels that touch polygon edges
        )
        mask = mask.astype(bool)

        # DEBUG: Print mask stats to verify orientation
        print(f"Land mask stats: land pixels = {mask.sum()}, ocean pixels = {(~mask).sum()}")

        # Cache the result
        with open(cache_file, 'wb') as f:
            pickle.dump(mask, f)
        print(f"Cached land mask to {cache_file}")

        return mask

    except Exception as e:
        print(f"Fast rasterization failed: {e}")
        print("Falling back to slow point-by-point method...")
        return create_land_mask(lons, lats, resolution_name)


# Global cache for the mask
_land_mask_cache = {}


def get_land_mask(lons, lats, resolution_name="default"):
    """
    Get land mask, using cache if available.
    """
    cache_key = (len(lons), len(lats), resolution_name)

    if cache_key in _land_mask_cache:
        return _land_mask_cache[cache_key]

    mask = create_land_mask_fast(lons, lats, resolution_name)
    _land_mask_cache[cache_key] = mask

    return mask
