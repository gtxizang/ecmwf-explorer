# RegexFlow ECV Explorer - Welcome Screen Content

## ECMWF CJS2_231 Proof of Concept

---

### The Challenge

ECMWF's tender seeks interactive visualization of Essential Climate Variables (ECVs) from the Copernicus Climate Data Store. The requirement: browser-based exploration of multi-decadal satellite datasets.

---

### Our Approach For This Proof Of Concept (POC)

We connected to the Climate Data Store API and downloaded source NetCDF files for:
- Soil Moisture (ERA5-Land 2023)
- Soil Moisture 75-Year Archive (1950-2024)
- Solar Radiation (CERES)
- Fire Burned Area (C3S)
- Sea Ice Concentration (OSI SAF)

---

### Reprojection

Where necessary, we first reprojected data to Web Mercator (EPSG:3857) for seamless web map integration. For example, sea ice data arrives in a polar EASE2 grid — we transformed it to polar stereographic (EPSG:3413) for accurate Arctic visualization. We used bilinear interpolation as it produces smooth results appropriate for continuous climate variables without creating impossible values (unlike bicubic, which can overshoot).

---

### Pyramid Generation

From the reprojected data, we built multi-resolution pyramids in Zarr format — multiple Levels of Detail (LOD) that let users zoom smoothly from global to regional views without downloading full-resolution data at every zoom level.

---

### Efficient Pipeline

This processing pipeline runs once when new data is published — not when users view visualizations. Data is converted to Zarr, pyramids are built, and files are stored ready to serve. No per-request processing means efficient, cost-effective scaling to any number of users.

---

### Deployment Flexibility

For this demo, we host processed Zarr files on our servers. However, both processing and storage could run on any cloud infrastructure — including Copernicus' existing infrastructure. Browsers fetch data directly via HTTP; no intermediate rendering servers required.

---

### What's Loading Now

While you read this, we're preloading 75 years of soil moisture data (1950-2024), sea ice concentrations, and solar radiation measurements. Multiple resolution levels are being cached for smooth zoom interactions.

---

## Technology Stack

| Technology | Description |
|------------|-------------|
| Zarr | Cloud-optimized array format with chunked storage |
| zarrita.js | Browser-native Zarr reader via HTTP range requests |
| deck.gl | WebGL-powered map rendering at 60fps |
| xarray | Python processing pipeline with rioxarray |
| React 18 | Modern UI framework |

---

---

## Dataset Loading Visuals

Visual cards showing preloading progress for each dataset:

| Icon | Dataset | Description |
|------|---------|-------------|
| 💧 | Soil Moisture 2023 | ERA5-Land single year |
| 🌍 | Soil Moisture 75yr | ERA5-Land 1950-2024 archive |
| ☀️ | Solar Radiation | CERES incoming solar flux |
| 🔥 | Fire Burned Area | C3S burned area |
| ❄️ | Sea Ice | OSI SAF concentration (polar view) |

Each card shows:
- Dataset icon and name
- LOD levels loaded (e.g., "2/3 LOD")
- Visual state: pending (dim) → loading (normal) → complete (cyan highlight)

---

## Footer

*Yes, this welcome screen is buying us time to preload your data. Transparency is a feature.*

---

## Rotating Facts (shown during preloading)

### Technical Facts
- Loading data directly in your browser via HTTP range requests
- Zarr format enables efficient partial reads of massive datasets
- No server-side processing required — pure client-side rendering
- 16+ million pixels rendered using WebGL acceleration
- Multi-resolution pyramids enable smooth zooming from global to local
- Data chunks are ~256KB each — optimized for network transfer

### Climate Facts
- Soil moisture affects 40% of global food production
- Arctic sea ice has declined 13% per decade since 1979
- ERA5-Land reanalysis combines observations with physics models
- This dataset spans 75 years of continuous climate monitoring
- Sea ice concentration is measured from satellite microwave sensors
- Soil moisture data comes from the ECMWF ERA5-Land reanalysis

### Data Facts
- ERA5-Land covers 1950-2024 at 9km global resolution
- Sea ice data spans 36 years from 1988-2023
- Each monthly layer contains ~1 million land pixels
- The full soil moisture archive is 900+ data points per location
- Original data: 0.1° latitude × 0.1° longitude grid
- Pyramids range from 128×128 to 2048×2048 pixels
