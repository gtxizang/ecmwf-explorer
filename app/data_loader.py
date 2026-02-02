"""
Data loading utilities for ECMWF ECV Explorer.
Handles loading Zarr datasets and extracting data for visualization.
"""

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import xarray as xr

# Dataset configurations - Updated for real CDS data
DATASETS = {
    "radiation": {
        "name": "Earth Radiation Budget",
        "file": "radiation.zarr",
        "variables": {
            "incoming_shortwave_radiation": {
                "name": "Incoming Shortwave Radiation",
                "units": "W/m²",
                "colormap": "YlOrRd",
            },
            "outgoing_longwave_radiation": {
                "name": "Outgoing Longwave Radiation",
                "units": "W/m²",
                "colormap": "RdYlBu_r",
            },
            "outgoing_shortwave_radiation": {
                "name": "Outgoing Shortwave Radiation",
                "units": "W/m²",
                "colormap": "YlOrRd",
            },
        },
    },
    "era5_land": {
        "name": "ERA5-Land Temperature",
        "file": "era5_land.zarr",
        "variables": {
            "2m_temperature": {
                "name": "2m Temperature",
                "units": "°C",
                "colormap": "RdYlBu_r",
            },
            "skin_temperature": {
                "name": "Skin Temperature",
                "units": "°C",
                "colormap": "RdYlBu_r",
            },
        },
    },
    # Keep synthetic data as fallback
    "soil_moisture": {
        "name": "Satellite Soil Moisture (Synthetic)",
        "file": "soil_moisture.zarr",
        "variables": {
            "volumetric_surface_soil_moisture": {
                "name": "Volumetric Surface Soil Moisture",
                "units": "m³/m³",
                "colormap": "YlGnBu",
            },
            "surface_soil_moisture": {
                "name": "Surface Soil Moisture",
                "units": "m³/m³",
                "colormap": "YlGnBu",
            },
        },
    },
}

# Colormap options
COLORMAPS = [
    {"label": "Yellow-Orange-Red (YlOrRd)", "value": "YlOrRd"},
    {"label": "Red-Yellow-Blue (RdYlBu_r)", "value": "RdYlBu_r"},
    {"label": "Blue-Green (YlGnBu)", "value": "YlGnBu"},
    {"label": "Viridis (colorblind-friendly)", "value": "Viridis"},
    {"label": "Cividis (colorblind-friendly)", "value": "Cividis"},
    {"label": "Plasma", "value": "Plasma"},
    {"label": "Inferno", "value": "Inferno"},
]


class DataLoader:
    """Manages loading and caching of climate data from Zarr stores."""

    def __init__(self, data_dir: Optional[Path] = None):
        if data_dir is None:
            data_dir = Path(__file__).parent.parent / "data" / "processed"
        self.data_dir = Path(data_dir)
        self._datasets: dict[str, xr.Dataset] = {}

    def get_available_datasets(self) -> list[str]:
        """Get list of datasets that actually exist."""
        available = []
        for dataset_id, config in DATASETS.items():
            zarr_path = self.data_dir / config["file"]
            if zarr_path.exists():
                available.append(dataset_id)
        return available

    def get_dataset(self, dataset_id: str) -> Optional[xr.Dataset]:
        """Load a dataset by ID, caching for reuse."""
        if dataset_id not in DATASETS:
            return None

        if dataset_id not in self._datasets:
            zarr_path = self.data_dir / DATASETS[dataset_id]["file"]
            if not zarr_path.exists():
                return None
            self._datasets[dataset_id] = xr.open_zarr(str(zarr_path))

        return self._datasets[dataset_id]

    def get_time_range(self, dataset_id: str) -> tuple[str, str, list[str]]:
        """Get the time range for a dataset."""
        ds = self.get_dataset(dataset_id)
        if ds is None:
            return "", "", []

        times = pd.to_datetime(ds.time.values)
        time_strings = [t.strftime("%Y-%m") for t in times]
        return time_strings[0], time_strings[-1], time_strings

    def get_data_for_time(
        self,
        dataset_id: str,
        variable: str,
        time_index: int,
        resolution: int = 1,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, float, float]:
        """
        Get data grid for a specific time step.

        Args:
            dataset_id: Dataset identifier
            variable: Variable name
            time_index: Index into time dimension
            resolution: Downsampling factor for performance

        Returns:
            Tuple of (lons, lats, values, vmin, vmax)
        """
        ds = self.get_dataset(dataset_id)
        if ds is None or variable not in ds:
            return np.array([]), np.array([]), np.array([]), 0, 1

        data = ds[variable].isel(time=time_index)

        # Downsample for performance if needed
        if resolution > 1:
            data = data.coarsen(lat=resolution, lon=resolution, boundary="trim").mean()

        values = data.values
        lats = data.lat.values
        lons = data.lon.values

        # Convert longitude from 0-360 to -180 to 180 if needed
        if lons.max() > 180:
            # Find the index where longitude crosses 180
            split_idx = np.searchsorted(lons, 180)
            # Reorder longitudes: [180-360] becomes [-180-0], then [0-180]
            lons = np.concatenate([lons[split_idx:] - 360, lons[:split_idx]])
            # Reorder values array to match
            values = np.concatenate([values[:, split_idx:], values[:, :split_idx]], axis=1)

        # Handle NaN values
        valid_values = values[~np.isnan(values)]
        if len(valid_values) > 0:
            vmin = float(np.percentile(valid_values, 2))
            vmax = float(np.percentile(valid_values, 98))
        else:
            vmin, vmax = 0, 1

        return lons, lats, values, vmin, vmax

    def get_timeseries_at_point(
        self,
        dataset_id: str,
        variable: str,
        lat: float,
        lon: float,
    ) -> pd.DataFrame:
        """
        Extract timeseries data at a specific lat/lon point.

        Args:
            dataset_id: Dataset identifier
            variable: Variable name
            lat: Latitude
            lon: Longitude

        Returns:
            DataFrame with time and value columns
        """
        ds = self.get_dataset(dataset_id)
        if ds is None or variable not in ds:
            return pd.DataFrame({"time": [], "value": []})

        # Find nearest grid point
        data = ds[variable].sel(lat=lat, lon=lon, method="nearest")

        times = pd.to_datetime(data.time.values)
        values = data.values

        df = pd.DataFrame({"time": times, "value": values})
        df = df.dropna()

        return df

    def get_global_stats(
        self,
        dataset_id: str,
        variable: str,
        time_index: int,
    ) -> dict:
        """Get global statistics for a variable at a time step."""
        ds = self.get_dataset(dataset_id)
        if ds is None or variable not in ds:
            return {}

        data = ds[variable].isel(time=time_index).values
        valid = data[~np.isnan(data)]

        if len(valid) == 0:
            return {}

        return {
            "mean": float(np.mean(valid)),
            "std": float(np.std(valid)),
            "min": float(np.min(valid)),
            "max": float(np.max(valid)),
            "median": float(np.median(valid)),
        }


# Global data loader instance
data_loader = DataLoader()
