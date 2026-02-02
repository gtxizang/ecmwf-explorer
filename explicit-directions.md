# Claude Code Directive for ECMWF POC

**Project:** Climate ECV Visualisation POC for ECMWF tender CJS2_231

**Goal:** Build a working demo showing 2D map + 3D globe visualisation of climate data with time animation and click-to-query timeseries.

---

## Tech Stack – USE THESE

| Layer | Technology |
|-------|------------|
| **Backend** | Python (FastAPI or Flask) |
| **Frontend** | React with Mantine UI |
| **2D Map** | MapLibre GL JS or OpenLayers |
| **3D Globe** | Cesium, Deck.gl, or Globe.gl |
| **Data processing** | xarray, zarr |
| **Charts** | Plotly |
| **Containerisation** | Docker |

---

## Tech Stack – DO NOT USE

- ❌ Java
- ❌ earthkit
- ❌ Dash (use React instead)
- ❌ WMS/tile servers (read Zarr directly in browser)
- ❌ Any proprietary/non-open-source libraries

---

## Data

- Sample file: `data/radiation_test.nc` (Earth Radiation Budget, regular lat-lon 1° grid, WGS84)
- Convert to Zarr format for serving
- Variables: incoming shortwave, outgoing longwave, outgoing shortwave radiation

---

## Required Features (Priority Order)

1. **2D map** with data overlay (coloured grid cells)
2. **Time slider** to animate through months
3. **Click-to-query** – click a point, show timeseries chart
4. **Variable selector** dropdown
5. **Colourmap selector**
6. **3D globe toggle** (same data, globe view)
7. **Download button** (PNG of current view)

---

## Success Criteria

- Page loads in < 2 seconds
- Timeseries displays in < 2 seconds after click
- Professional appearance (match https://apps.climate.copernicus.eu/nec-explorer/ style)
- Runs in Docker container

---

## Reference

- UI style: https://apps.climate.copernicus.eu/nec-explorer/
- Data pipeline patterns: https://github.com/ecmwf-projects/c3s-atlas
