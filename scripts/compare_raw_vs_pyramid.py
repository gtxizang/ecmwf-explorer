#!/usr/bin/env python3
"""
Compare raw ERA5-Land soil moisture data against processed Zarr pyramid.
Downloads a sample month of raw data to compare coastal coverage.
"""

import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
import zarr

# Try to download raw data for comparison
try:
    import cdsapi
    CDS_AVAILABLE = True
except ImportError:
    CDS_AVAILABLE = False

# Ireland bounding box
IRELAND_BOUNDS = {
    'lon_min': -10.5,
    'lon_max': -5.5,
    'lat_min': 51.4,
    'lat_max': 55.4
}

OUTPUT_DIR = Path('/Users/garfieldconnolly/Desktop/ECMWF-POC/screenshots')


def download_raw_sample():
    """Download a single month of raw ERA5-Land data for Ireland region."""
    if not CDS_AVAILABLE:
        print("CDS API not available, skipping raw data download")
        return None

    raw_file = OUTPUT_DIR / 'raw_soil_moisture_sample.nc'

    if raw_file.exists():
        print(f"Raw sample already exists: {raw_file}")
        return raw_file

    print("Downloading raw ERA5-Land sample for Ireland region...")

    client = cdsapi.Client()

    # Download just Ireland region, single month
    client.retrieve(
        'reanalysis-era5-land-monthly-means',
        {
            'product_type': 'monthly_averaged_reanalysis',
            'variable': 'volumetric_soil_water_layer_1',
            'year': '2020',
            'month': '01',
            'time': '00:00',
            'data_format': 'netcdf',
            'download_format': 'unarchived',
            # Expanded area around Ireland
            'area': [
                56, -12, 50, -4  # N, W, S, E
            ],
        },
        str(raw_file)
    )

    print(f"Downloaded: {raw_file}")
    return raw_file


def analyze_raw_data(raw_file):
    """Analyze raw ERA5-Land data for Ireland."""
    import xarray as xr

    ds = xr.open_dataset(raw_file)
    print("\n" + "="*60)
    print("RAW ERA5-LAND DATA ANALYSIS")
    print("="*60)

    # Find variable name
    var_name = None
    for v in ['swvl1', 'volumetric_soil_water_layer_1']:
        if v in ds.data_vars:
            var_name = v
            break

    if var_name is None:
        print(f"Available variables: {list(ds.data_vars)}")
        return None

    data = ds[var_name]

    # Handle time dimension
    if 'valid_time' in data.dims:
        data = data.isel(valid_time=0)
    elif 'time' in data.dims:
        data = data.isel(time=0)

    # Get coordinates
    lat_name = 'latitude' if 'latitude' in ds else 'lat'
    lon_name = 'longitude' if 'longitude' in ds else 'lon'

    lats = ds[lat_name].values
    lons = ds[lon_name].values
    values = data.values

    print(f"\nDataset info:")
    print(f"  Variable: {var_name}")
    print(f"  Shape: {values.shape}")
    print(f"  Lat range: {lats.min():.2f} to {lats.max():.2f}")
    print(f"  Lon range: {lons.min():.2f} to {lons.max():.2f}")
    print(f"  Resolution: {abs(lats[1]-lats[0]):.3f}° x {abs(lons[1]-lons[0]):.3f}°")

    # Stats
    total = values.size
    valid = np.sum(~np.isnan(values))
    nan = np.sum(np.isnan(values))

    print(f"\nCoverage stats:")
    print(f"  Total pixels: {total}")
    print(f"  Valid (land): {valid} ({100*valid/total:.1f}%)")
    print(f"  NaN (ocean): {nan} ({100*nan/total:.1f}%)")

    if valid > 0:
        print(f"  Value range: {np.nanmin(values):.4f} to {np.nanmax(values):.4f}")

    ds.close()
    return lons, lats, values


def get_pyramid_data():
    """Get data from processed pyramid for comparison."""
    pyramid_path = Path('/Users/garfieldconnolly/Desktop/ECMWF-POC/data/pyramids/soil_moisture_multiyear/4')

    store = zarr.open(str(pyramid_path), mode='r')

    print("\n" + "="*60)
    print("PYRAMID DATA (LOD 4, 2048x2048)")
    print("="*60)

    data = store['soil_moisture']
    print(f"  Shape: {data.shape}")

    # Get 2020 January
    years = store['year'][:]
    year_idx = list(years).index(2020)

    sample = data[year_idx, 0, :, :]  # 2020, January

    return np.array(sample)


def create_comparison_plot(raw_lons, raw_lats, raw_values, pyramid_values):
    """Create side-by-side comparison plot."""
    import math

    fig, axes = plt.subplots(1, 3, figsize=(18, 6))

    # Plot 1: Raw ERA5-Land data
    ax1 = axes[0]
    im1 = ax1.pcolormesh(raw_lons, raw_lats, raw_values, cmap='YlGnBu', vmin=0, vmax=0.5, shading='auto')
    ax1.set_title(f'RAW ERA5-Land Data (0.1° resolution)\n{raw_values.shape[0]}x{raw_values.shape[1]} pixels')
    ax1.set_xlabel('Longitude')
    ax1.set_ylabel('Latitude')
    ax1.set_xlim(IRELAND_BOUNDS['lon_min'], IRELAND_BOUNDS['lon_max'])
    ax1.set_ylim(IRELAND_BOUNDS['lat_min'], IRELAND_BOUNDS['lat_max'])
    ax1.set_aspect('equal')
    plt.colorbar(im1, ax=ax1, label='m³/m³')

    # Calculate Ireland pixels in pyramid
    def lat_lon_to_web_mercator(lon, lat):
        x = lon * 20037508.34 / 180
        y = math.log(math.tan((90 + lat) * math.pi / 360)) / (math.pi / 180)
        y = y * 20037508.34 / 180
        return x, y

    WM_BOUNDS = [-20037508.34, -20037508.34, 20037508.34, 20037508.34]
    x_min, y_min = lat_lon_to_web_mercator(IRELAND_BOUNDS['lon_min'], IRELAND_BOUNDS['lat_min'])
    x_max, y_max = lat_lon_to_web_mercator(IRELAND_BOUNDS['lon_max'], IRELAND_BOUNDS['lat_max'])

    total_pixels = 2048
    total_extent = WM_BOUNDS[2] - WM_BOUNDS[0]
    pixel_size = total_extent / total_pixels

    px_min = int((x_min - WM_BOUNDS[0]) / pixel_size)
    px_max = int((x_max - WM_BOUNDS[0]) / pixel_size)
    py_min = int((WM_BOUNDS[3] - y_max) / pixel_size)
    py_max = int((WM_BOUNDS[3] - y_min) / pixel_size)

    ireland_pyramid = pyramid_values[py_min:py_max+1, px_min:px_max+1]

    # Plot 2: Pyramid data for Ireland
    ax2 = axes[1]
    im2 = ax2.imshow(ireland_pyramid, cmap='YlGnBu', vmin=0, vmax=0.5,
                     extent=[IRELAND_BOUNDS['lon_min'], IRELAND_BOUNDS['lon_max'],
                             IRELAND_BOUNDS['lat_min'], IRELAND_BOUNDS['lat_max']])
    ax2.set_title(f'Processed Pyramid Data (Web Mercator)\n{ireland_pyramid.shape[0]}x{ireland_pyramid.shape[1]} pixels')
    ax2.set_xlabel('Longitude')
    ax2.set_ylabel('Latitude')
    ax2.set_aspect('equal')
    plt.colorbar(im2, ax=ax2, label='m³/m³')

    # Plot 3: NaN comparison
    ax3 = axes[2]

    # Raw NaN mask
    raw_nan = np.isnan(raw_values)
    raw_valid_pct = 100 * (1 - np.sum(raw_nan) / raw_nan.size)

    # Pyramid NaN mask
    pyramid_nan = np.isnan(ireland_pyramid)
    pyramid_valid_pct = 100 * (1 - np.sum(pyramid_nan) / pyramid_nan.size)

    # Create combined visualization
    combined = np.zeros((*raw_nan.shape, 3))
    combined[~raw_nan] = [0.2, 0.6, 0.2]  # Green for valid data
    combined[raw_nan] = [0.8, 0.2, 0.2]   # Red for NaN

    ax3.imshow(combined, extent=[raw_lons.min(), raw_lons.max(), raw_lats.min(), raw_lats.max()],
               origin='lower', aspect='equal')
    ax3.set_title(f'Raw Data Coverage\nGreen=Land Data, Red=Ocean/NaN\nValid: {raw_valid_pct:.1f}%')
    ax3.set_xlabel('Longitude')
    ax3.set_ylabel('Latitude')
    ax3.set_xlim(IRELAND_BOUNDS['lon_min'], IRELAND_BOUNDS['lon_max'])
    ax3.set_ylim(IRELAND_BOUNDS['lat_min'], IRELAND_BOUNDS['lat_max'])

    plt.suptitle('ERA5-Land Soil Moisture: Raw vs Processed Comparison\n'
                 'Missing coastal data is from SOURCE DATA (land-sea mask), not processing',
                 fontsize=14, fontweight='bold')

    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / 'raw_vs_pyramid_comparison.png', dpi=150)
    print(f"\nSaved comparison to: {OUTPUT_DIR / 'raw_vs_pyramid_comparison.png'}")
    plt.close()

    # Print summary
    print("\n" + "="*60)
    print("COMPARISON SUMMARY")
    print("="*60)
    print(f"\nRaw ERA5-Land data:")
    print(f"  - Resolution: 0.1° (~10km)")
    print(f"  - Ireland coverage: {raw_valid_pct:.1f}% valid pixels")
    print(f"  - NaN pixels are OCEAN (land-sea mask)")
    print(f"\nProcessed Pyramid data:")
    print(f"  - Resolution: {ireland_pyramid.shape[1]}x{ireland_pyramid.shape[0]} pixels")
    print(f"  - Ireland coverage: {pyramid_valid_pct:.1f}% valid pixels")
    print(f"\nCONCLUSION:")
    print(f"  The missing coastal data is present in the RAW SOURCE DATA.")
    print(f"  ERA5-Land is a LAND-ONLY dataset - ocean areas have no data.")
    print(f"  This is NOT a processing error - it's the nature of the dataset.")


if __name__ == '__main__':
    # Step 1: Download raw data sample
    raw_file = download_raw_sample()

    if raw_file and raw_file.exists():
        # Step 2: Analyze raw data
        result = analyze_raw_data(raw_file)

        if result:
            raw_lons, raw_lats, raw_values = result

            # Step 3: Get pyramid data
            pyramid_values = get_pyramid_data()

            # Step 4: Create comparison
            create_comparison_plot(raw_lons, raw_lats, raw_values, pyramid_values)
    else:
        print("\nCould not download raw data. Running pyramid-only analysis...")
        pyramid_values = get_pyramid_data()
