#!/usr/bin/env python3
"""
ECV Explorer Remote MCP Server

A remotely-hosted MCP server using Streamable HTTP transport.
Run with: uvicorn ecv_mcp_server_remote:app --host 0.0.0.0 --port 8001

Evaluators connect via Claude Desktop:
  Settings → Connectors → Add custom connector → https://ecmwf.regexflow.com/mcp
"""

import json
import math
import os
import logging
from contextlib import asynccontextmanager

import httpx
import numpy as np
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from mcp.server.fastmcp import FastMCP

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ecv-mcp-remote")

# Base URL for the Zarr data store
BASE_URL = os.environ.get("ECV_DATA_URL", "https://ecmwf.regexflow.com/zarr")

# Dataset configurations
DATASETS = {
    "soil_moisture": {
        "id": "soil_moisture_multiyear",
        "name": "Soil Moisture ERA5 (75 Years)",
        "path": "/soil_moisture_multiyear",
        "variable": "soil_moisture",
        "unit": "m³/m³",
        "description": "ERA5-Land Reanalysis — Volumetric Soil Water Layer 1 — 1950-2024",
        "year_range": {"start": 1950, "end": 2024},
        "projection": "EPSG:3857",
        "source": {
            "name": "Copernicus Climate Data Store",
            "provider": "ECMWF",
            "dataset": "ERA5-Land monthly averaged data",
        },
        "resolution": "0.1° × 0.1° (~9km)",
        "spatial_coverage": "Global land areas",
    },
    "solar_radiation_era5": {
        "id": "radiation_budget",
        "name": "Solar Radiation ERA5 (75 Years)",
        "path": "/radiation_multiyear",
        "variable": "solar_radiation",
        "unit": "J/m²",
        "description": "ERA5 Reanalysis — Surface Solar Radiation Downwards — 1950-2024",
        "year_range": {"start": 1950, "end": 2024},
        "projection": "EPSG:3857",
        "source": {
            "name": "Copernicus Climate Data Store",
            "provider": "ECMWF",
            "dataset": "ERA5 monthly averaged reanalysis",
        },
        "resolution": "0.25° × 0.25° (~28km)",
        "spatial_coverage": "Global",
    },
    "fire_burned_area": {
        "id": "fire_burned_area",
        "name": "Fire Burned Area Satellite (5 Years)",
        "path": "/fire_multiyear",
        "variable": "burned_area",
        "unit": "km²",
        "description": "Satellite-Derived — C3S Fire Burned Area — 2019-2023",
        "year_range": {"start": 2019, "end": 2023},
        "projection": "EPSG:3857",
        "source": {
            "name": "Copernicus Climate Data Store",
            "provider": "C3S / OLCI",
            "dataset": "Fire burned area from 2001 to present",
        },
        "resolution": "0.25° × 0.25° (~25km)",
        "spatial_coverage": "Global land areas",
    },
    "sea_ice": {
        "id": "sea_ice",
        "name": "Sea Ice Satellite (36 Years)",
        "path": "/sea_ice_polar_multiyear",
        "variable": "ice_concentration",
        "unit": "%",
        "description": "Satellite-Derived — Arctic Sea Ice Concentration — 1988-2023",
        "year_range": {"start": 1988, "end": 2023},
        "projection": "EPSG:3413",
        "source": {
            "name": "Copernicus Climate Data Store",
            "provider": "EUMETSAT OSI SAF",
            "dataset": "Sea ice concentration from 1979 to present",
        },
        "resolution": "25km (EASE2 Grid)",
        "spatial_coverage": "Northern Hemisphere (Arctic)",
    },
    "solar_radiation_satellite": {
        "id": "satellite_radiation",
        "name": "Solar Radiation Satellite (24 Years)",
        "path": "/satellite_radiation",
        "variable": "solar_radiation",
        "unit": "W/m²",
        "description": "Satellite-Derived — NASA CERES EBAF Incoming Shortwave — 2001-2024",
        "year_range": {"start": 2001, "end": 2024},
        "projection": "EPSG:3857",
        "source": {
            "name": "Copernicus Climate Data Store",
            "provider": "NASA/CERES",
            "dataset": "NASA CERES EBAF v4.2.1",
        },
        "resolution": "1.0° × 1.0° (~100km)",
        "spatial_coverage": "Global",
    },
}

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def lon_lat_to_web_mercator(lon: float, lat: float) -> tuple[float, float]:
    """Convert longitude/latitude to Web Mercator (EPSG:3857) coordinates."""
    lat = max(-85.051, min(85.051, lat))
    x = lon * 20037508.34 / 180.0
    y = math.log(math.tan((90 + lat) * math.pi / 360.0)) / (math.pi / 180.0)
    y = y * 20037508.34 / 180.0
    return x, y


def lon_lat_to_polar_stereographic(lon: float, lat: float) -> tuple[float, float]:
    """Convert longitude/latitude to Polar Stereographic North (EPSG:3413) coordinates."""
    lat_ts = 70.0
    lon_0 = -45.0
    a = 6378137.0
    e = 0.0818191908426

    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)
    lon_0_rad = math.radians(lon_0)
    lat_ts_rad = math.radians(lat_ts)

    t = math.tan(math.pi / 4 - lat_rad / 2) / pow((1 - e * math.sin(lat_rad)) / (1 + e * math.sin(lat_rad)), e / 2)
    t_c = math.tan(math.pi / 4 - lat_ts_rad / 2) / pow((1 - e * math.sin(lat_ts_rad)) / (1 + e * math.sin(lat_ts_rad)), e / 2)
    m_c = math.cos(lat_ts_rad) / math.sqrt(1 - e * e * math.sin(lat_ts_rad) ** 2)

    rho = a * m_c * t / t_c

    x = rho * math.sin(lon_rad - lon_0_rad)
    y = -rho * math.cos(lon_rad - lon_0_rad)

    return x, y


# Create the MCP server
mcp = FastMCP("ecv-explorer")


# Branding for tool responses
BRANDING = {
    "source": "RegexFlow ECV Explorer",
    "url": "https://ecmwf.regexflow.com",
    "attribution": "Data provided by RegexFlow ECV Explorer — ecmwf.regexflow.com"
}


@mcp.tool()
def list_datasets() -> str:
    """List all available climate datasets in the ECV Explorer.

    Returns dataset names, descriptions, temporal coverage, and data sources.
    """
    logger.info("list_datasets called")
    result = {
        "datasets": [],
        "source": BRANDING["attribution"]
    }
    for key, dataset in DATASETS.items():
        result["datasets"].append({
            "id": key,
            "name": dataset["name"],
            "description": dataset["description"],
            "years": f"{dataset['year_range']['start']}-{dataset['year_range']['end']}",
            "unit": dataset["unit"],
            "provider": dataset["source"]["provider"]
        })
    return json.dumps(result, indent=2)


@mcp.tool()
def get_dataset_info(dataset: str) -> str:
    """Get detailed information about a specific climate dataset.

    Args:
        dataset: Dataset identifier. One of: soil_moisture, solar_radiation_era5,
                 fire_burned_area, sea_ice, solar_radiation_satellite

    Returns:
        Detailed metadata including temporal range, spatial resolution,
        data source, and projection information.
    """
    logger.info(f"get_dataset_info called for {dataset}")
    if dataset not in DATASETS:
        return json.dumps({"error": f"Unknown dataset '{dataset}'. Available: {', '.join(DATASETS.keys())}"})
    result = {**DATASETS[dataset], "source_attribution": BRANDING["attribution"]}
    return json.dumps(result, indent=2)


@mcp.tool()
def get_timeseries(dataset: str, longitude: float, latitude: float, year: int) -> str:
    """Extract a 12-month timeseries of climate data at a specific geographic location.

    Args:
        dataset: Dataset identifier (e.g., 'soil_moisture', 'sea_ice')
        longitude: Longitude in degrees (-180 to 180)
        latitude: Latitude in degrees (-90 to 90)
        year: Year to extract data for (must be within dataset's temporal range)

    Returns:
        Monthly values for the entire year at the specified location.
    """
    logger.info(f"get_timeseries called: {dataset}, lon={longitude}, lat={latitude}, year={year}")

    if dataset not in DATASETS:
        return json.dumps({"error": f"Unknown dataset '{dataset}'"})

    ds = DATASETS[dataset]
    year_range = ds["year_range"]

    if year < year_range["start"] or year > year_range["end"]:
        return json.dumps({
            "error": f"Year {year} out of range [{year_range['start']}-{year_range['end']}]"
        })

    # Convert coordinates
    if ds["projection"] == "EPSG:3413":
        x, y = lon_lat_to_polar_stereographic(longitude, latitude)
    else:
        x, y = lon_lat_to_web_mercator(longitude, latitude)

    try:
        import blosc

        # Use highest resolution level for accuracy
        level = 4 if "soil" in dataset or "radiation" in dataset else 3
        url = f"{BASE_URL}{ds['path']}/{level}"

        with httpx.Client(timeout=60.0) as client:
            # Load coordinate arrays
            coords = {}
            for coord_name in ['x', 'y', 'year']:
                zarray_resp = client.get(f"{url}/{coord_name}/.zarray")
                if zarray_resp.status_code == 200:
                    meta = json.loads(zarray_resp.content)
                    data_resp = client.get(f"{url}/{coord_name}/0")
                    if data_resp.status_code == 200:
                        try:
                            decompressed = blosc.decompress(data_resp.content)
                            coords[coord_name] = np.frombuffer(decompressed, dtype=np.dtype(meta['dtype']))
                        except Exception:
                            coords[coord_name] = np.frombuffer(data_resp.content, dtype=np.dtype(meta['dtype']))

            if 'x' not in coords or 'y' not in coords:
                return json.dumps({"error": "Could not load coordinate arrays"})

            # Find nearest pixel
            x_idx = int(np.argmin(np.abs(coords['x'] - x)))
            y_idx = int(np.argmin(np.abs(coords['y'] - y)))

            # Find year index
            if 'year' in coords:
                year_matches = np.where(coords['year'] == year)[0]
                if len(year_matches) == 0:
                    return json.dumps({"error": f"Year {year} not found in data"})
                year_idx = int(year_matches[0])
            else:
                year_idx = year - year_range["start"]

            # Load variable metadata
            variable = ds["variable"]
            zarray_resp = client.get(f"{url}/{variable}/.zarray")
            if zarray_resp.status_code != 200:
                return json.dumps({"error": f"Could not load variable {variable}"})

            var_meta = json.loads(zarray_resp.content)
            chunks = var_meta["chunks"]
            dtype = np.dtype(var_meta["dtype"])

            # Extract 12 months of data
            timeseries = []
            for month_idx in range(12):
                try:
                    chunk_y = y_idx // chunks[2]
                    chunk_x = x_idx // chunks[3]
                    chunk_key = f"{year_idx}.{month_idx}.{chunk_y}.{chunk_x}"
                    chunk_resp = client.get(f"{url}/{variable}/{chunk_key}")

                    if chunk_resp.status_code == 200:
                        try:
                            decompressed = blosc.decompress(chunk_resp.content)
                            chunk_data = np.frombuffer(decompressed, dtype=dtype).reshape(chunks)
                        except Exception:
                            chunk_data = np.frombuffer(chunk_resp.content, dtype=dtype).reshape(chunks)

                        local_y = y_idx % chunks[2]
                        local_x = x_idx % chunks[3]
                        value = float(chunk_data[0, 0, local_y, local_x])

                        if np.isnan(value) or value < -1e30:
                            value = None
                    else:
                        value = None
                except Exception as e:
                    logger.warning(f"Error loading month {month_idx}: {e}")
                    value = None

                timeseries.append({
                    "month": MONTH_NAMES[month_idx],
                    "month_index": month_idx,
                    "value": value,
                    "unit": ds["unit"]
                })

        result = {
            "dataset": ds["name"],
            "location": {"longitude": longitude, "latitude": latitude},
            "year": year,
            "unit": ds["unit"],
            "timeseries": timeseries,
            "source": BRANDING["attribution"]
        }
        return json.dumps(result, indent=2)

    except Exception as e:
        logger.error(f"Error in get_timeseries: {e}")
        return json.dumps({"error": str(e)})


@mcp.tool()
def get_value(dataset: str, longitude: float, latitude: float, year: int, month: int) -> str:
    """Get a single climate data value at a specific location, year, and month.

    Args:
        dataset: Dataset identifier
        longitude: Longitude in degrees (-180 to 180)
        latitude: Latitude in degrees (-90 to 90)
        year: Year
        month: Month (1-12)

    Returns:
        The data value at the specified location and time.
    """
    logger.info(f"get_value called: {dataset}, lon={longitude}, lat={latitude}, year={year}, month={month}")

    if month < 1 or month > 12:
        return json.dumps({"error": "Month must be between 1 and 12"})

    # Get full timeseries and extract the month
    timeseries_json = get_timeseries(dataset, longitude, latitude, year)
    timeseries_data = json.loads(timeseries_json)

    if "error" in timeseries_data:
        return timeseries_json

    month_data = timeseries_data["timeseries"][month - 1]

    result = {
        "dataset": timeseries_data["dataset"],
        "location": timeseries_data["location"],
        "year": year,
        "month": MONTH_NAMES[month - 1],
        "value": month_data["value"],
        "unit": timeseries_data["unit"],
        "source": BRANDING["attribution"]
    }
    return json.dumps(result, indent=2)


# Create FastAPI wrapper app
from fastapi import FastAPI
from starlette.routing import Mount

# Get the MCP Starlette app - it has a route at /mcp internally
mcp_app = mcp.streamable_http_app()

# Create FastAPI app
app = FastAPI(title="ECV Explorer MCP Server")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for MCP
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "server": "ecv-explorer-mcp"}


@app.get("/")
async def root():
    """Root endpoint with usage info."""
    return {
        "service": "ECV Explorer MCP Server",
        "mcp_endpoint": "/mcp",
        "health_endpoint": "/health",
        "docs": "Connect via Claude Desktop: Settings → Connectors → Add custom connector → URL"
    }


# Mount MCP app LAST at root - it handles /mcp internally
app.mount("/", mcp_app)


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting ECV MCP Remote Server...")
    uvicorn.run(app, host="0.0.0.0", port=8001)
