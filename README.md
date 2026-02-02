# ECMWF ECV Explorer - Proof of Concept

Interactive visualisation of satellite-derived Essential Climate Variables (ECVs) from the Copernicus Climate Data Store.

**Purpose:** Demonstration for ECMWF tender CJS2_231

## Quick Start

### 1. Setup Environment

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure CDS API

Copy the `.cdsapirc` file to your home directory:

```bash
cp .cdsapirc ~/.cdsapirc
```

Or set environment variables:
```bash
export CDSAPI_URL="https://cds.climate.copernicus.eu/api"
export CDSAPI_KEY="8f86b30c-87d9-40fb-8d34-6217ff1ee76a"
```

### 3. Download Data

```bash
python scripts/download_data.py
```

This will download ~500MB of climate data. Takes 10-30 minutes depending on CDS queue.

### 4. Process Data

```bash
python scripts/process_data.py
```

Converts NetCDF to optimised Zarr format.

### 5. Run the App

```bash
python app/main.py
```

Open http://localhost:8050 in your browser.

## Docker

```bash
docker-compose up --build
```

## Features

- 🌍 3D rotating globe with climate data overlay
- 📅 Time slider to animate through 2015-2023
- 📍 Click anywhere to see location timeseries
- 🎨 Multiple colourmap options
- 📥 Download images and data

## Tech Stack

- **Dash** - Web application framework
- **pydeck** - 3D globe visualisation (deck.gl)
- **Plotly** - Interactive charts
- **xarray + Zarr** - Climate data handling
- **FastAPI** - API layer (if needed)

## Project Structure

```
ECMWF-POC/
├── app/                    # Dash application
├── data/                   # Downloaded and processed data
├── scripts/                # Data download and processing
├── assets/                 # CSS, images
└── tests/                  # Unit tests
```

## Documentation

See `ECMWF-POC-SPECIFICATION.md` for full technical specification.

---

*Derilinx - Open Data Solutions*
