# ECMWF ECV Visualisation POC Specification

## For: Claude Code Implementation

**Project:** Proof of Concept for ECMWF Tender CJS2_231  
**Purpose:** Demonstrate capability to build interactive visualisation of satellite-derived Essential Climate Variables (ECVs)  
**Company:** Derilinx  
**Date:** 28 January 2026

---

## 1. Objective

Build a working proof-of-concept web application that demonstrates:

1. **3D globe visualisation** of climate data with data overlay
2. **Time-based animation** through historical climate records
3. **Interactive click-to-query** functionality showing timeseries for any location
4. **Professional UI** suitable for presentation to ECMWF evaluators

This POC will be included in a tender submission to demonstrate technical capability. It must be impressive, performant, and working with real data.

---

## 2. Data Sources

### 2.1 Copernicus Climate Data Store (CDS) API

**API Endpoint:** `https://cds.climate.copernicus.eu/api`  
**API Key:** `8f86b30c-87d9-40fb-8d34-6217ff1ee76a`

Create a `.cdsapirc` file in the project root (and user home) with:
```
url: https://cds.climate.copernicus.eu/api
key: 8f86b30c-87d9-40fb-8d34-6217ff1ee76a
```

### 2.2 Flagship Datasets (Required for POC)

#### Dataset 1: Soil Moisture
- **CDS Name:** `satellite-soil-moisture`
- **Documentation:** https://cds.climate.copernicus.eu/datasets/satellite-soil-moisture
- **Variables to include:**
  - Surface soil moisture (volumetric)
  - Root-zone soil moisture (volumetric) - 0-1m depth only
  - Freeze/Thaw classification
- **Sensor type:** Combined (passive and active)
- **Time aggregation:** Monthly average (daily for Freeze/Thaw)
- **Time range:** Download 2015-2023 for POC (full record is 1978-present)
- **Version:** Latest available (v202312 or newer)

**Sample download code:**
```python
import cdsapi

client = cdsapi.Client()

client.retrieve(
    'satellite-soil-moisture',
    {
        'variable': 'volumetric_surface_soil_moisture',
        'type_of_sensor': 'combined_passive_and_active',
        'time_aggregation': 'month_average',
        'year': ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023'],
        'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
        'day': '01',
        'version': 'v202312',
    },
    'data/soil_moisture_monthly_2015_2023.zip'
)
```

#### Dataset 2: Earth Radiation Budget
- **CDS Name:** `satellite-earth-radiation-budget`
- **Documentation:** https://cds.climate.copernicus.eu/datasets/satellite-earth-radiation-budget
- **Product family:** CERES EBAF (NASA) or ESA/C3S preferred
- **Variables:**
  - Total sky longwave flux at top of atmosphere
  - Total sky shortwave flux at top of atmosphere
  - (Optionally) Total Solar Irradiance
- **Time aggregation:** Monthly mean
- **Time range:** 2015-2023 for POC (full record is 1979-present)

**Sample download code:**
```python
client.retrieve(
    'satellite-earth-radiation-budget',
    {
        'origin': 'nasa_ceres_ebaf',
        'variable': [
            'total_sky_longwave_flux_at_top_of_atmosphere',
            'total_sky_shortwave_flux_at_top_of_atmosphere',
        ],
        'time_aggregation': 'monthly_mean',
        'year': ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023'],
        'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
    },
    'data/earth_radiation_budget_monthly_2015_2023.zip'
)
```

### 2.3 Data Format Notes

- Downloads arrive as **zipped NetCDF-4 files**
- Unzip and convert to **Zarr** format for performance
- Data is on a **regular lat-lon grid** (typically 0.25° resolution)
- Contains uncertainty/quality flags - display as hatching/transparency

---

## 3. Technology Stack

### 3.1 Required Technologies

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **App Framework** | Dash (Plotly) | Python-native, production-ready, ECMWF uses Plotly |
| **3D Globe** | pydeck with GlobeView | Python bindings for deck.gl, WebGL performance |
| **2D Maps** | pydeck or dash-leaflet | For flat map alternative view |
| **Charts** | Plotly | Native to Dash, ECMWF recommended |
| **Data Handling** | xarray + zarr + dask | Industry standard for NetCDF/climate data |
| **API (if needed)** | FastAPI | Modern async Python API |
| **Styling** | Dash Bootstrap Components | Professional look with minimal CSS |

### 3.2 Python Dependencies

Create `requirements.txt`:
```
# Core framework
dash>=2.14.0
dash-bootstrap-components>=1.5.0
plotly>=5.18.0

# 3D visualisation
pydeck>=0.8.0

# Data handling
xarray>=2024.1.0
zarr>=2.16.0
dask[complete]>=2024.1.0
netCDF4>=1.6.5
h5netcdf>=1.3.0

# Geospatial
rasterio>=1.3.9
geopandas>=0.14.0
pyproj>=3.6.0
shapely>=2.0.0

# CDS API
cdsapi>=0.6.1

# Utilities
numpy>=1.26.0
pandas>=2.1.0
scipy>=1.12.0
requests>=2.31.0

# Server
gunicorn>=21.2.0
uvicorn>=0.25.0

# Dev
pytest>=7.4.0
black>=23.12.0
```

### 3.3 Project Structure

```
ECMWF-POC/
├── ECMWF-POC-SPECIFICATION.md    # This file
├── README.md                      # Setup and run instructions
├── requirements.txt
├── .cdsapirc                      # CDS API credentials
├── Dockerfile
├── docker-compose.yml
│
├── app/
│   ├── __init__.py
│   ├── main.py                    # Dash app entry point
│   ├── layout.py                  # UI layout components
│   ├── callbacks.py               # Interactivity callbacks
│   ├── globe.py                   # 3D globe rendering with pydeck
│   ├── charts.py                  # Plotly chart generation
│   └── data_loader.py             # Data loading utilities
│
├── data/
│   ├── raw/                       # Downloaded NetCDF files
│   ├── processed/                 # Zarr format data
│   └── download_data.py           # Script to fetch from CDS
│
├── assets/
│   ├── styles.css                 # Custom CSS
│   └── logo.png                   # Derilinx/placeholder logo
│
├── scripts/
│   ├── download_data.py           # Download from CDS
│   ├── process_data.py            # Convert NetCDF to Zarr
│   └── precompute_metrics.py      # Calculate climatologies, trends
│
└── tests/
    ├── test_data_loader.py
    └── test_callbacks.py
```

---

## 4. Features to Implement

### 4.1 Core Features (Must Have)

#### F1: 3D Globe Visualisation
- Render Earth as a 3D rotatable globe
- Overlay selected climate variable as colour-coded layer
- Smooth rotation and zoom
- Display current date/time period on globe

#### F2: Dataset & Variable Selection
- Dropdown to select dataset (Soil Moisture / Earth Radiation Budget)
- Dropdown to select variable within dataset
- UI updates globe and charts when selection changes

#### F3: Time Navigation
- Slider to select time period (month/year)
- Play/pause button for animation through time
- Speed control for animation
- Display current date prominently

#### F4: Click-to-Query Timeseries
- Click anywhere on globe to select location
- Display marker at selected location
- Show timeseries chart for that location (full time range)
- Display coordinates and location name if available

#### F5: Colourmap Selection
- Dropdown to choose from predefined colourmaps
- Include colour-blind friendly options (viridis, cividis, plasma)
- Legend showing value range and colours

#### F6: Download Functionality
- Button to download current view as PNG image
- Button to download timeseries data as CSV
- Button to download current frame's data as GeoTIFF (optional)

### 4.2 Enhanced Features (Nice to Have)

#### F7: Side-by-Side Comparison
- Compare two time periods (e.g., Jan 2015 vs Jan 2023)
- Or compare two variables

#### F8: Pre-computed Metrics Display
- Show trend (change per decade)
- Show anomaly vs climatology (1991-2020 reference if available, else full period mean)
- Show percentiles

#### F9: Region Statistics
- Select a region (bounding box or country)
- Show aggregated statistics for region

#### F10: 2D Map Alternative
- Toggle between 3D globe and 2D flat map
- Useful for polar regions and accessibility

---

## 5. UI/UX Requirements

### 5.1 Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Logo]  ECV Explorer - Satellite Climate Data Visualisation   [?] │
├─────────────────────────────────────────────────────────────────────┤
│ Dataset: [Soil Moisture    ▼]  Variable: [Surface Moisture ▼]      │
│ Colourmap: [Viridis ▼]         View: [3D Globe ▼]                  │
├───────────────────────────────────────────┬─────────────────────────┤
│                                           │                         │
│                                           │  📍 Selected Location   │
│                                           │  Dublin, Ireland        │
│         🌍                                │  53.35°N, 6.26°W        │
│      3D GLOBE                             │                         │
│    (pydeck GlobeView)                     │  Current Value:         │
│                                           │  0.34 m³/m³             │
│                                           │                         │
│                                           ├─────────────────────────┤
│                                           │                         │
│                                           │   📈 TIMESERIES         │
├───────────────────────────────────────────┤      (Plotly)           │
│  ◀ ▶ [▶ Play]  Jan 2023                  │                         │
│  ════════════●══════════════════════════  │                         │
│  2015              2020              2023 │                         │
├───────────────────────────────────────────┴─────────────────────────┤
│  [📷 Download Image]  [📊 Download Data]  [ℹ️ About]               │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Styling Guidelines

- **Primary colour:** #003366 (Copernicus-style dark blue)
- **Accent colour:** #FF6600 (Copernicus orange)
- **Background:** White or very light grey
- **Font:** System fonts (Segoe UI, Roboto, Helvetica)
- **Professional, clean, minimal** - this is for scientists and policymakers

### 5.3 Responsive Design

- Minimum width: 1024px (desktop-first)
- Should work on tablet (1024x768)
- Mobile: simplified view acceptable (charts stack vertically)

---

## 6. Performance Requirements

| Metric | Target |
|--------|--------|
| Initial page load | < 3 seconds |
| Globe interaction (rotate/zoom) | 60 fps |
| Time slider response | < 500ms |
| Timeseries generation on click | < 2 seconds |
| Animation frame rate | Smooth 10+ fps |

### 6.1 Performance Strategy

1. **Pre-process data to Zarr** with appropriate chunking (chunk by time)
2. **Load data lazily** - only load what's needed for current view
3. **Pre-compute aggregations** (monthly means should be in the data already)
4. **Cache timeseries** for recently clicked locations
5. **Use WebGL** via pydeck for rendering (not server-side images)

---

## 7. Data Processing Pipeline

### 7.1 Download Script (`scripts/download_data.py`)

```python
#!/usr/bin/env python3
"""
Download ECV data from Copernicus Climate Data Store.
Run once to fetch the data needed for the POC.
"""

import cdsapi
import os
from pathlib import Path

# Ensure data directories exist
Path("data/raw").mkdir(parents=True, exist_ok=True)

client = cdsapi.Client()

# Download Soil Moisture (2015-2023, monthly)
print("Downloading Soil Moisture data...")
client.retrieve(
    'satellite-soil-moisture',
    {
        'variable': [
            'volumetric_surface_soil_moisture',
        ],
        'type_of_sensor': 'combined_passive_and_active',
        'time_aggregation': 'month_average',
        'year': ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023'],
        'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
        'day': '01',
        'version': 'v202312',
    },
    'data/raw/soil_moisture_monthly.zip'
)

# Download Earth Radiation Budget (2015-2023, monthly)
print("Downloading Earth Radiation Budget data...")
client.retrieve(
    'satellite-earth-radiation-budget',
    {
        'origin': 'nasa_ceres_ebaf',
        'variable': [
            'total_sky_longwave_flux_at_top_of_atmosphere',
            'total_sky_shortwave_flux_at_top_of_atmosphere',
        ],
        'time_aggregation': 'monthly_mean',
        'year': ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023'],
        'month': ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
    },
    'data/raw/radiation_budget_monthly.zip'
)

print("Downloads complete!")
```

### 7.2 Processing Script (`scripts/process_data.py`)

```python
#!/usr/bin/env python3
"""
Process downloaded NetCDF files into optimised Zarr format.
"""

import xarray as xr
import zipfile
from pathlib import Path

RAW_DIR = Path("data/raw")
PROCESSED_DIR = Path("data/processed")
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

def process_soil_moisture():
    """Extract and convert soil moisture data to Zarr."""
    print("Processing Soil Moisture...")
    
    # Unzip
    with zipfile.ZipFile(RAW_DIR / "soil_moisture_monthly.zip", 'r') as z:
        z.extractall(RAW_DIR / "soil_moisture")
    
    # Find NetCDF files and open with xarray
    nc_files = list((RAW_DIR / "soil_moisture").glob("*.nc"))
    ds = xr.open_mfdataset(nc_files, combine='by_coords', chunks={'time': 12})
    
    # Save as Zarr with good chunking for time-based access
    ds.to_zarr(PROCESSED_DIR / "soil_moisture.zarr", mode='w')
    print(f"Saved to {PROCESSED_DIR / 'soil_moisture.zarr'}")

def process_radiation_budget():
    """Extract and convert radiation budget data to Zarr."""
    print("Processing Earth Radiation Budget...")
    
    # Unzip
    with zipfile.ZipFile(RAW_DIR / "radiation_budget_monthly.zip", 'r') as z:
        z.extractall(RAW_DIR / "radiation_budget")
    
    # Find NetCDF files and open with xarray
    nc_files = list((RAW_DIR / "radiation_budget").glob("*.nc"))
    ds = xr.open_mfdataset(nc_files, combine='by_coords', chunks={'time': 12})
    
    # Save as Zarr
    ds.to_zarr(PROCESSED_DIR / "radiation_budget.zarr", mode='w')
    print(f"Saved to {PROCESSED_DIR / 'radiation_budget.zarr'}")

if __name__ == "__main__":
    process_soil_moisture()
    process_radiation_budget()
    print("Processing complete!")
```

---

## 8. Implementation Notes

### 8.1 pydeck GlobeView Example

```python
import pydeck as pdk
import xarray as xr
import numpy as np

def create_globe_layer(data_array, colormap='viridis'):
    """
    Create a pydeck layer for globe visualisation.
    
    Args:
        data_array: 2D xarray DataArray with lat/lon coordinates
        colormap: Name of colormap to use
    
    Returns:
        pdk.Deck object
    """
    # Convert to format pydeck expects
    # Create a grid of points with values
    lons, lats = np.meshgrid(data_array.lon.values, data_array.lat.values)
    values = data_array.values.flatten()
    
    # Remove NaN values
    mask = ~np.isnan(values)
    
    data = [
        {"position": [float(lon), float(lat)], "value": float(val)}
        for lon, lat, val in zip(lons.flatten()[mask], lats.flatten()[mask], values[mask])
    ]
    
    # Create the layer
    layer = pdk.Layer(
        "ScatterplotLayer",  # or GridLayer, HeatmapLayer
        data=data,
        get_position="position",
        get_fill_color="[value * 255, 100, 100, 200]",  # Simplified; use proper colormap
        get_radius=50000,  # Adjust based on resolution
    )
    
    # Create globe view
    view = pdk.View(type="GlobeView", controller=True)
    
    return pdk.Deck(
        layers=[layer],
        initial_view_state=pdk.ViewState(
            latitude=20,
            longitude=0,
            zoom=0,
        ),
        views=[view],
    )
```

### 8.2 Dash App Structure

```python
# app/main.py
import dash
from dash import html, dcc
import dash_bootstrap_components as dbc
from app.layout import create_layout
from app.callbacks import register_callbacks

# Initialise app
app = dash.Dash(
    __name__,
    external_stylesheets=[dbc.themes.BOOTSTRAP],
    title="ECV Explorer - Climate Data Visualisation"
)

# Set layout
app.layout = create_layout()

# Register callbacks
register_callbacks(app)

# For production
server = app.server

if __name__ == "__main__":
    app.run_server(debug=True, host="0.0.0.0", port=8050)
```

### 8.3 Handling Click Events in pydeck + Dash

pydeck in Dash uses `dash_deck` component. Click events can be captured:

```python
from dash import Input, Output, State
import dash_deck

@app.callback(
    Output("timeseries-chart", "figure"),
    Input("deck-gl", "clickInfo"),
    State("dataset-dropdown", "value"),
    State("variable-dropdown", "value"),
)
def update_timeseries(click_info, dataset, variable):
    if click_info is None:
        return empty_figure()
    
    lat = click_info["coordinate"][1]
    lon = click_info["coordinate"][0]
    
    # Load timeseries for this location
    ts = load_timeseries(dataset, variable, lat, lon)
    
    return create_timeseries_figure(ts, lat, lon)
```

---

## 9. Docker Deployment

### 9.1 Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libgdal-dev \
    libproj-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8050

# Run with gunicorn
CMD ["gunicorn", "-b", "0.0.0.0:8050", "app.main:server"]
```

### 9.2 docker-compose.yml

```yaml
version: '3.8'

services:
  ecv-explorer:
    build: .
    ports:
      - "8050:8050"
    volumes:
      - ./data:/app/data
    environment:
      - DASH_DEBUG=false
```

---

## 10. Testing Checklist

Before submission, verify:

- [ ] App loads without errors
- [ ] 3D globe renders and is interactive (rotate, zoom)
- [ ] Both datasets load correctly
- [ ] Variable dropdown updates visualisation
- [ ] Time slider changes displayed data
- [ ] Animation plays smoothly
- [ ] Click on globe shows location marker
- [ ] Timeseries chart appears for clicked location
- [ ] Colourmap changes work
- [ ] Download buttons function
- [ ] App runs in Docker container
- [ ] Response times meet targets (< 2 sec)
- [ ] No console errors in browser

---

## 11. Reference Links

- **Tender Documents:** ECMWF CJS2_231 (available on ECMWF procurement portal)
- **Dash Documentation:** https://dash.plotly.com/
- **pydeck Documentation:** https://pydeck.gl/
- **xarray Documentation:** https://docs.xarray.dev/
- **Zarr Documentation:** https://zarr.readthedocs.io/
- **CDS API:** https://cds.climate.copernicus.eu/how-to-api

### Example Applications (from ECMWF)
- Copernicus Interactive Climate Atlas: https://atlas.climate.copernicus.eu
- NEC Explorer: https://apps.climate.copernicus.eu/nec-explorer/
- MyOcean Viewer: https://myocean.marine.copernicus.eu/

---

## 12. Success Criteria

This POC will be considered successful if:

1. **Visually impressive** - Looks professional enough to include in a €300k+ tender
2. **Functionally complete** - All core features (F1-F6) working
3. **Real data** - Using actual ECV data from CDS, not mock data
4. **Performant** - Meets the < 2 second response time for interactions
5. **Deployable** - Runs in Docker, could be deployed to any cloud
6. **Demonstrable** - Can be shown to ECMWF evaluators as evidence of capability

---

## 13. Notes for Claude Code

1. **Start with data** - Download and process the data first. The app is useless without real data.

2. **Get the globe working early** - This is the "hero" feature. If pydeck GlobeView doesn't work well, consider Cesium via `dash-deck` or a different approach.

3. **Iterate on visuals** - The app needs to look good. Spend time on styling.

4. **Test with real data sizes** - The actual data is large. Make sure the app handles it.

5. **Document everything** - We'll need to explain our approach in the tender.

6. **Keep it simple** - Better to have 6 polished features than 10 buggy ones.

---

*Specification prepared for Derilinx tender submission to ECMWF CJS2_231*
