/**
 * RegexFlow ECV Explorer - Proof of Concept for ECMWF CJS2_231
 *
 * Interactive Visualisation of Satellite Essential Climate Variables
 *
 * Key features:
 * - Loads Zarr pyramid data client-side using zarrita.js
 * - Correct LOD selection based on zoom level
 * - Client-side colormap application
 * - Beautiful UI with smooth transitions
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { BitmapLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { MapView } from '@deck.gl/core';
import {
  Paper,
  Text,
  Select,
  Slider,
  Group,
  Stack,
  Badge,
  CloseButton,
  ActionIcon,
  Anchor,
  Divider,
  Collapse,
  Box,
  Transition,
  Notification,
  Tooltip as MantineTooltip,
} from '@mantine/core';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// Zarr loading with zarrita
import * as zarr from 'zarrita';

// Data loading optimizations (caching, deduplication, preloading)
import {
  dataCache,
  imageCache as dataImageCache,
  fetchDataDeduplicated,
  preloadAdjacentTimeSlices,
  getCacheStats,
} from '../utils/dataOptimizations';

// Settings panel and feature flags
import { SettingsPanel } from './SettingsPanel';
import { getFeatureFlags } from '../config/featureFlags';

// Region computation
import {
  useRegionComputation,
  RegionResultCallout,
  DrawingInstructions,
} from './RegionComputation';

// CSS for animations
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 20px rgba(79, 209, 197, 0.3); }
    50% { box-shadow: 0 0 40px rgba(79, 209, 197, 0.6); }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes fade-in-up {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes draw-line {
    from { stroke-dashoffset: 1000; }
    to { stroke-dashoffset: 0; }
  }
  .ecv-control:hover {
    transform: scale(1.02);
    box-shadow: 0 0 20px rgba(79, 209, 197, 0.3);
  }
  .ecv-control {
    transition: all 0.2s ease;
  }
  .ecv-button:hover {
    transform: scale(1.05);
  }
  .ecv-button {
    transition: all 0.15s ease;
  }
  .pulse-loading {
    animation: pulse-glow 1.5s ease-in-out infinite;
  }
  .shimmer-loading {
    background: linear-gradient(90deg, transparent 0%, rgba(79, 209, 197, 0.1) 50%, transparent 100%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }
  .fade-in {
    animation: fade-in-up 0.5s ease-out forwards;
  }
  @keyframes welcome-fade {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes fact-slide {
    0% { opacity: 0; transform: translateY(10px); }
    10% { opacity: 1; transform: translateY(0); }
    90% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-10px); }
  }
  @keyframes progress-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
  @keyframes border-glow {
    0%, 100% { border-color: rgba(79, 209, 197, 0.3); }
    50% { border-color: rgba(79, 209, 197, 0.8); }
  }
  .welcome-overlay {
    animation: welcome-fade 0.5s ease-out;
  }
  .fact-rotate {
    animation: fact-slide 5s ease-in-out;
  }
  .loading-progress {
    animation: progress-pulse 1.5s ease-in-out infinite;
  }
  .bounds-glow {
    animation: border-glow 2s ease-in-out infinite;
  }
`;
document.head.appendChild(styleSheet);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Loading facts - rotated during dataset loading
const LOADING_FACTS = {
  technical: [
    "Loading data directly in your browser via HTTP range requests",
    "Zarr format enables efficient partial reads of massive datasets",
    "No server-side processing required - pure client-side rendering",
    "16+ million pixels rendered using WebGL acceleration",
    "Multi-resolution pyramids enable smooth zooming from global to local",
    "Data chunks are ~256KB each - optimized for network transfer",
  ],
  climate: [
    "Soil moisture affects 40% of global food production",
    "Arctic sea ice has declined 13% per decade since 1979",
    "ERA5-Land reanalysis combines observations with physics models",
    "This dataset spans 75 years of continuous climate monitoring",
    "Sea ice concentration is measured from satellite microwave sensors",
    "Soil moisture data comes from the ECMWF ERA5-Land reanalysis",
  ],
  data: [
    "ERA5-Land covers 1950-2024 at 9km global resolution",
    "Sea ice data spans 36 years from 1988-2023 with 432 monthly snapshots",
    "Each monthly layer contains ~1 million land pixels",
    "The full soil moisture archive is 900+ data points per location",
    "Original data: 0.1° latitude × 0.1° longitude grid",
    "Pyramids range from 128×128 to 2048×2048 pixels",
  ],
};

// Welcome screen content - Internal/Technical view
const WELCOME_CONTENT = {
  title: "RegexFlow ECV Explorer",
  subtitle: "ECMWF CJS2_231 Proof of Concept",
  sections: [
    {
      heading: "The Challenge",
      content: "ECMWF's tender seeks interactive visualization of Essential Climate Variables (ECVs) from the Copernicus Climate Data Store. The requirement: browser-based exploration of multi-decadal climate datasets from both reanalysis and satellite sources.",
    },
    {
      heading: "Our Approach For This Proof Of Concept (POC)",
      content: "We connected to the Climate Data Store API and downloaded two types of data. ERA5 Reanalysis: Soil Moisture (ERA5-Land 1950-2024 at 0.1 degree) and Solar Radiation (ERA5 1950-2024 at 0.25 degree). Satellite-Derived: Solar Radiation (NASA CERES 2001-2024 at 1.0 degree), Fire Burned Area (C3S/OLCI 2019-2023), and Sea Ice Concentration (OSI SAF 1988-2023).",
    },
    {
      heading: "Satellite Soil Moisture Unavailable",
      content: "On 1 Feb 2026, we attempted to download satellite-soil-moisture from CDS but received: 'Due to a technical issue, downloads from this dataset are closed until further notice.' URL: cds.climate.copernicus.eu/datasets/satellite-soil-moisture",
    },
    {
      heading: "Reprojection",
      content: "Where necessary, we first reprojected data to Web Mercator (EPSG:3857) for seamless web map integration. For example, sea ice data arrives in a polar EASE2 grid — we transformed it to polar stereographic (EPSG:3413) for accurate Arctic visualization. We used bilinear interpolation as it produces smooth results appropriate for continuous climate variables without creating impossible values (unlike bicubic, which can overshoot).",
    },
    {
      heading: "Pyramid Generation",
      content: "From the reprojected data, we built multi-resolution pyramids in Zarr format — multiple Levels of Detail (LOD) that let users zoom smoothly from global to regional views without downloading full-resolution data at every zoom level.",
    },
    {
      heading: "Efficient Pipeline",
      content: "This processing pipeline runs once when new data is published — not when users view visualizations. Data is converted to Zarr, pyramids are built, and files are stored ready to serve. No per-request processing means efficient, cost-effective scaling to any number of users.",
    },
    {
      heading: "Deployment Flexibility",
      content: "For this demo, we host processed Zarr files on our servers. However, both processing and storage could run on any cloud infrastructure — including Copernicus' existing infrastructure. Browsers fetch data directly via HTTP; no intermediate rendering servers required.",
    },
    {
      heading: "What's Loading Now",
      content: "While you read this, we're preloading 75 years of soil moisture data (1950-2024), sea ice concentrations, and solar radiation measurements. Multiple resolution levels are being cached for smooth zoom interactions.",
    },
  ],
  techStack: [
    { name: "Zarr", desc: "Cloud-optimized array format with chunked storage" },
    { name: "zarrita.js", desc: "Browser-native Zarr reader via HTTP range requests" },
    { name: "deck.gl", desc: "WebGL-powered map rendering at 60fps" },
    { name: "xarray", desc: "Python processing pipeline with rioxarray" },
    { name: "React 18", desc: "Modern UI framework" },
  ],
  // Dataset visuals for loading display
  datasets: [
    { id: 'soil_moisture_multiyear', icon: '🌍', name: 'Soil Moisture ERA5 75yr', color: '#4A90A4', levels: 3, source: 'reanalysis' },
    { id: 'radiation_budget', icon: '☀️', name: 'Solar Radiation ERA5 75yr', color: '#F4A460', levels: 3, source: 'reanalysis' },
    { id: 'satellite_radiation', icon: '🛰️', name: 'Solar Radiation Sat 24yr', color: '#FFD700', levels: 3, source: 'satellite' },
    { id: 'fire_burned_area', icon: '🔥', name: 'Fire Burned Area Sat 5yr', color: '#CD5C5C', levels: 3, source: 'satellite' },
    { id: 'sea_ice', icon: '❄️', name: 'Sea Ice Sat 36yr', color: '#87CEEB', levels: 3, source: 'satellite' },
  ],
  footer: "Yes, this welcome screen is buying us time to preload your data. Transparency is a feature.",
};

// Welcome screen content - Evaluator view (focused on tender requirements)
const EVALUATOR_CONTENT = {
  title: "RegexFlow ECV Explorer",
  subtitle: "ECMWF CJS2_231 Proof of Concept",
  sections: [
    {
      heading: "What This POC Demonstrates",
      content: "Interactive visualization of Essential Climate Variables (ECVs) from the Copernicus Climate Data Store, using browser-based Zarr loading as specified in the tender clarifications.",
    },
    {
      heading: "Two Data Sources: Reanalysis + Satellite",
      content: "ERA5 Reanalysis provides 75 years of Soil Moisture and Solar Radiation (1950-2024). Satellite products deliver Solar Radiation (NASA CERES, 2001-2024), Fire Burned Area (C3S/OLCI, 2019-2023), and Sea Ice (OSI SAF, 1988-2023) as direct observations.",
    },
    {
      heading: "Why Reanalysis + Satellite?",
      content: "ERA5 reanalysis combines observations with physics models to provide consistent, gap-free global coverage back to 1950. Satellite products offer direct observations at the instrument's native resolution. Both are essential for climate science.",
    },
    {
      heading: "Data Availability Note",
      content: "We attempted to include satellite-derived soil moisture (satellite-soil-moisture dataset) on 1 Feb 2026, but CDS returned: 'Due to a technical issue, downloads from this dataset are closed until further notice.' See: cds.climate.copernicus.eu/datasets/satellite-soil-moisture",
    },
    {
      heading: "Client-Side Data Loading",
      content: "No server-side rendering required. Zarr data is loaded directly in the browser via HTTP range requests. The viewer can scale to thousands of concurrent users with simple static file hosting.",
    },
    {
      heading: "Interactive Features",
      content: "75-year time slider animation, multiple colormaps, region presets (Europe, Arctic, Sahel), click-anywhere time series extraction, shareable URLs, and full-screen presentation mode.",
    },
    {
      heading: "Polar Projection Support",
      content: "Sea Ice data is displayed with correct polar stereographic projection, demonstrating handling of non-standard coordinate systems common in climate data.",
    },
    {
      heading: "Production-Ready Architecture",
      content: "Processing pipeline converts source NetCDF to Zarr pyramids once at publish time. Ready for deployment on Copernicus infrastructure or any cloud platform.",
    },
  ],
  highlights: [
    { icon: "📊", label: "5 ECVs", desc: "Soil moisture, radiation (ERA5+Satellite), fire, sea ice" },
    { icon: "📅", label: "75 Years", desc: "Temporal coverage 1950-2025" },
    { icon: "🌐", label: "Global", desc: "Full Earth coverage with polar support" },
    { icon: "⚡", label: "Client-Side", desc: "Browser-based Zarr loading" },
    { icon: "🔗", label: "Shareable", desc: "URL state for collaboration" },
    { icon: "📱", label: "Responsive", desc: "Works on desktop and mobile" },
  ],
  footer: "Built by RegexFlow for the ECMWF CJS2_231 tender evaluation.",
};

// Dataset configurations with full technical metadata and intro facts
const DATASETS = {
  soil_moisture_multiyear: {
    name: 'Soil Moisture ERA5 (75 Years)',
    path: '/zarr/soil_moisture_multiyear',
    variable: 'soil_moisture',
    maxLevel: 4,
    unit: 'm³/m³',
    colorRange: { vmin: 0, vmax: 0.8 },
    description: 'ERA5-Land Reanalysis — Volumetric Soil Water Layer 1 — 1950-2024',
    defaultColormap: 'soil',
    defaultSmoothing: 3, // Higher smoothing for multi-year data
    introFact: '75 years of data reveals long-term soil moisture trends under climate change',
    isMultiYear: true,
    yearRange: { start: 1950, end: 2024 },
    source: {
      name: 'Copernicus Climate Data Store',
      url: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land-monthly-means',
      dataset: 'ERA5-Land monthly averaged data 1950-2024',
      provider: 'ECMWF',
    },
    rawData: {
      resolution: '0.1° × 0.1° (~9km)',
      projection: 'EPSG:4326 (WGS84 Geographic)',
      temporalCoverage: '1950-2024 (75 years × 12 months)',
      spatialCoverage: 'Global land areas',
    },
    processing: {
      reprojection: 'EPSG:4326 → EPSG:3857 (Web Mercator)',
      pyramid: '5 levels (128px to 2048px)',
      resampling: 'Bilinear interpolation',
      format: 'Zarr v2 with Blosc compression',
      chunking: '1 × 1 × 256 × 256 (year × month × y × x)',
    },
  },
  radiation_budget: {
    name: 'Solar Radiation ERA5 (75 Years)',
    path: '/zarr/radiation_multiyear',
    variable: 'solar_radiation',
    maxLevel: 3,
    unit: 'J/m²',
    colorRange: { vmin: 0, vmax: 30000000 },
    description: 'ERA5 Reanalysis — Surface Solar Radiation Downwards — 1950-2024',
    defaultColormap: 'inferno',
    defaultSmoothing: 2,
    introFact: "Earth's energy imbalance is currently ~1 W/m² — driving global warming",
    isMultiYear: true,
    yearRange: { start: 1950, end: 2024 },
    source: {
      name: 'Copernicus Climate Data Store',
      url: 'https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels-monthly-means',
      dataset: 'ERA5 monthly averaged reanalysis 1950-2024',
      provider: 'ECMWF',
    },
    rawData: {
      resolution: '0.25° × 0.25° (~28km)',
      projection: 'EPSG:4326 (WGS84 Geographic)',
      temporalCoverage: '1950-2024 (75 years × 12 months)',
      spatialCoverage: 'Global',
    },
    processing: {
      reprojection: 'None (native lat/lon)',
      pyramid: '4 levels (256px to 2048px)',
      resampling: 'Bilinear interpolation',
      format: 'Zarr v2 with Blosc compression',
      chunking: '1 × 1 × 256 × 256 (year × month × y × x)',
    },
  },
  fire_burned_area: {
    name: 'Fire Burned Area Satellite (5 Years)',
    path: '/zarr/fire_multiyear',
    variable: 'burned_area',
    maxLevel: 4,  // Matches soil_moisture pyramid structure
    unit: 'km²',
    colorRange: { vmin: 0, vmax: 500000000 },  // m² - will display as km²
    description: 'Satellite-Derived — C3S Fire Burned Area — 2019-2023',
    defaultColormap: 'fire',
    defaultSmoothing: 1,
    minThreshold: 0, // No threshold - source data is land-only
    fillValue: NaN, // NaN for no-data pixels (same as other Web Mercator datasets)
    introFact: 'Wildfires release ~8 billion tonnes of CO₂ annually',
    isMultiYear: true,
    yearRange: { start: 2019, end: 2023 },
    // Now in Web Mercator projection - no lat/lon bounds needed
    source: {
      name: 'Copernicus Climate Data Store',
      url: 'https://cds.climate.copernicus.eu/datasets/satellite-fire-burned-area',
      dataset: 'Fire burned area from 2001 to present',
      provider: 'C3S / OLCI',
    },
    rawData: {
      resolution: '0.25° × 0.25° (~25km)',
      projection: 'EPSG:4326 (WGS84 Geographic)',
      temporalCoverage: '2019-2023 (5 years × 12 months)',
      spatialCoverage: 'Global land areas',
    },
    processing: {
      reprojection: 'None (native lat/lon)',
      pyramid: '4 levels (256px to 2048px)',
      resampling: 'Bilinear interpolation',
      format: 'Zarr v2 with Blosc compression',
      chunking: '1 × 1 × 256 × 256 (year × month × y × x)',
    },
  },
  sea_ice: {
    name: 'Sea Ice Satellite (36 Years)',
    path: '/zarr/sea_ice_polar_multiyear',
    variable: 'ice_concentration',
    maxLevel: 3,
    unit: '%',
    colorRange: { vmin: 0, vmax: 100 },
    description: 'Satellite-Derived — Arctic Sea Ice Concentration — 1988-2023',
    defaultColormap: 'ice',
    defaultSmoothing: 2,
    introFact: 'Arctic sea ice has declined 13% per decade since 1979',
    isMultiYear: true,
    yearRange: { start: 1988, end: 2023 },
    source: {
      name: 'Copernicus Climate Data Store',
      url: 'https://cds.climate.copernicus.eu/datasets/satellite-sea-ice-concentration',
      dataset: 'Sea ice concentration from 1979 to present',
      provider: 'EUMETSAT OSI SAF',
    },
    rawData: {
      resolution: '25km (EASE2 Grid)',
      projection: 'EPSG:6931 (Lambert Azimuthal)',
      temporalCoverage: '1988-2023 (36 years × 12 months)',
      spatialCoverage: 'Northern Hemisphere',
    },
    processing: {
      reprojection: 'EASE2 → EPSG:3413 (Polar Stereographic)',
      pyramid: '4 levels (256px to 2048px)',
      resampling: 'Bilinear interpolation',
      format: 'Zarr v2 with Blosc compression',
      chunking: '1 × 1 × 256 × 256 (year × month × y × x)',
    },
  },
  sea_ice_with_quality: {
    name: 'Sea Ice with Uncertainty (2023)',
    path: '/zarr/sea_ice_with_quality',
    variable: 'ice_concentration',
    uncertaintyVariable: 'total_uncertainty',
    maxLevel: 2,
    unit: '%',
    colorRange: { vmin: 0, vmax: 100 },
    description: 'Sea Ice Concentration with Quality/Uncertainty Data — 2023',
    defaultColormap: 'ice',
    defaultSmoothing: 2,
    introFact: 'Uncertainty quantification enables confidence assessment in climate data',
    isMultiYear: false,
    isPolar: true,
    hasUncertainty: true,
    source: {
      name: 'Copernicus Climate Data Store',
      url: 'https://cds.climate.copernicus.eu/datasets/satellite-sea-ice-concentration',
      dataset: 'Sea ice concentration with quality layers',
      provider: 'EUMETSAT OSI SAF',
    },
    rawData: {
      resolution: '25km (EASE2 Grid)',
      projection: 'EPSG:6931 (Lambert Azimuthal)',
      temporalCoverage: '2023 (12 months)',
      spatialCoverage: 'Northern Hemisphere',
    },
    processing: {
      reprojection: 'EASE2 → EPSG:3413 (Polar Stereographic)',
      pyramid: '3 levels (256px to 1024px)',
      resampling: 'Bilinear interpolation',
      format: 'Zarr v2 with Blosc compression',
      chunking: '1 × 256 × 256 (time × y × x)',
      qualityLayers: 'total_uncertainty, status_flag',
    },
  },
  satellite_radiation: {
    name: 'Solar Radiation Satellite (24 Years)',
    path: '/zarr/satellite_radiation',
    variable: 'solar_radiation',
    maxLevel: 2,
    unit: 'W/m²',
    colorRange: { vmin: 0, vmax: 500 },
    description: 'Satellite-Derived — NASA CERES EBAF Incoming Shortwave — 2001-2024',
    defaultColormap: 'inferno',
    defaultSmoothing: 2,
    introFact: 'CERES satellites measure Earth\'s radiation budget directly from space',
    isMultiYear: true,
    yearRange: { start: 2001, end: 2024 },
    source: {
      name: 'Copernicus Climate Data Store',
      url: 'https://cds.climate.copernicus.eu/datasets/satellite-earth-radiation-budget',
      dataset: 'NASA CERES EBAF v4.2.1',
      provider: 'NASA/CERES',
    },
    rawData: {
      resolution: '1.0° × 1.0° (~100km)',
      projection: 'EPSG:4326 (WGS84 Geographic)',
      temporalCoverage: '2001-2024 (24 years × 12 months)',
      spatialCoverage: 'Global',
    },
    processing: {
      reprojection: 'None (native lat/lon)',
      pyramid: '3 levels (128px to 512px)',
      resampling: 'Bilinear interpolation',
      format: 'Zarr v2',
      chunking: '1 × 1 × height × width (year × month × y × x)',
    },
  },
};

// Technology stack information
const TECH_STACK = {
  browser: {
    visualization: 'deck.gl v9 (WebGL2)',
    zarrLoader: 'zarrita.js',
    ui: 'React 18 + Mantine v7',
    charts: 'Recharts',
    colorMapping: 'Client-side RGBA generation',
  },
  backend: {
    framework: 'FastAPI (Python)',
    dataServing: 'Static file serving of Zarr stores',
    processing: 'xarray + rioxarray',
    compression: 'Blosc (LZ4)',
  },
  basemap: {
    provider: 'CARTO',
    style: 'Dark Matter (dark_all)',
    url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '© CARTO, © OpenStreetMap contributors',
  },
};

// Default pyramid level (use dataset's maxLevel)
const MAX_PYRAMID_LEVEL = 5;

// Default world bounds in longitude/latitude (Web Mercator limits)
// deck.gl's BitmapLayer expects [west, south, east, north] in degrees
const WORLD_BOUNDS = [-180, -85.051, 180, 85.051];
// Full geographic bounds for datasets not limited to Web Mercator
const FULL_BOUNDS = [-180, -90, 180, 90];

const COLORMAPS = {
  viridis: [
    [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142],
    [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89],
    [180, 222, 44], [253, 231, 37]
  ],
  inferno: [
    [0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99],
    [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164]
  ],
  plasma: [
    [13, 8, 135], [75, 3, 161], [125, 3, 168], [168, 34, 150],
    [203, 70, 121], [229, 107, 93], [248, 148, 65], [253, 195, 40],
    [240, 249, 33]
  ],
  rdylbu: [
    [165, 0, 38], [215, 48, 39], [244, 109, 67], [253, 174, 97],
    [254, 224, 144], [255, 255, 191], [224, 243, 248], [171, 217, 233],
    [116, 173, 209], [69, 117, 180], [49, 54, 149]
  ],
  // Fire colormap - bright orange/red/yellow (visible on dark basemap)
  fire: [
    [80, 30, 10], [140, 45, 5], [180, 60, 0], [210, 80, 0],
    [235, 110, 0], [250, 140, 10], [255, 170, 30], [255, 200, 60],
    [255, 225, 100], [255, 250, 160]
  ],
  // Ice colormap - dark blue to white
  ice: [
    [10, 20, 40], [20, 40, 80], [40, 80, 140], [60, 120, 180],
    [100, 160, 210], [140, 190, 230], [180, 215, 245], [210, 235, 255],
    [240, 250, 255], [255, 255, 255]
  ],
  browns: [
    [255, 247, 236], [254, 232, 200], [253, 212, 158], [253, 187, 132],
    [252, 141, 89], [239, 101, 72], [215, 48, 31], [179, 0, 0], [127, 39, 4]
  ],
  // Soil moisture: brown (dry) to blue (wet)
  soil: [
    [139, 90, 43], [166, 118, 66], [191, 146, 91], [214, 175, 121],
    [232, 205, 162], [217, 228, 211], [166, 206, 200], [103, 174, 181],
    [56, 141, 161], [28, 107, 140], [8, 69, 106]
  ],
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format legend values for display
// Fire data: stored in m², display in km² (divide by 1e6)
function formatLegendValue(value, datasetKey) {
  if (datasetKey === 'fire_burned_area') {
    // Convert m² to km² and format
    const km2 = value / 1000000;
    if (km2 >= 1000) {
      return `${(km2/1000).toFixed(0)}k`;
    }
    return km2.toFixed(0);
  }
  // Default formatting for other datasets
  if (value >= 1000) {
    return value.toFixed(0);
  }
  return value.toFixed(1);
}

// Calculate pyramid level from map zoom
// Higher zoom = more detail = higher pyramid level
// More aggressive: bump up LOD sooner for better quality
function getPyramidLevel(mapZoom) {
  // More aggressive mapping - use higher LOD sooner
  // zoom 0 -> level 1, zoom 1 -> level 2, zoom 2 -> level 3, etc.
  const level = Math.min(MAX_PYRAMID_LEVEL, Math.max(0, Math.floor(mapZoom) + 1));
  return level;
}

// Apply colormap to flat data array (more efficient for large data)
// Apply 3x3 box blur to smooth grid cell edges
function applySmoothing(flatData, width, height, fillValue = -9999) {
  const smoothed = new Float32Array(flatData.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const centerVal = flatData[idx];

      // Skip fill values
      if (centerVal === fillValue || isNaN(centerVal)) {
        smoothed[idx] = centerVal;
        continue;
      }

      // 3x3 weighted average (Gaussian-like kernel)
      let sum = 0;
      let weight = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;

          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const nidx = ny * width + nx;
            const nval = flatData[nidx];

            if (nval !== fillValue && !isNaN(nval)) {
              // Weight: center=4, edges=2, corners=1
              const w = (dx === 0 && dy === 0) ? 4 : (dx === 0 || dy === 0) ? 2 : 1;
              sum += nval * w;
              weight += w;
            }
          }
        }
      }

      smoothed[idx] = weight > 0 ? sum / weight : centerVal;
    }
  }

  return smoothed;
}

function applyColormap(flatData, width, height, colormapName, vmin, vmax, fillValue = -9999, smoothingLevel = 2, minThreshold = 0) {
  // Apply smoothing to reduce blocky appearance
  // smoothingLevel: 0=none, 1=light (1 pass), 2=medium (2 passes), 3=strong (4 passes)
  const passes = smoothingLevel === 3 ? 4 : smoothingLevel; // Level 3 gets extra pass
  let dataToUse = flatData;
  for (let i = 0; i < passes; i++) {
    dataToUse = applySmoothing(dataToUse, width, height, fillValue);
  }

  const colormap = COLORMAPS[colormapName] || COLORMAPS.viridis;
  const range = vmax - vmin;
  const numColors = colormap.length;

  const rgba = new Uint8ClampedArray(width * height * 4);
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const value = dataToUse[i];

    // Handle fill values (ocean/missing data) and values below threshold
    if (value === fillValue || isNaN(value) || value === null || value <= minThreshold) {
      rgba[idx] = 0;
      rgba[idx + 1] = 0;
      rgba[idx + 2] = 0;
      rgba[idx + 3] = 0; // Transparent
      continue;
    }

    // Normalize value to 0-1
    const normalized = Math.max(0, Math.min(1, (value - vmin) / range));

    // Map to colormap index
    const colorIdx = Math.floor(normalized * (numColors - 1));
    const color = colormap[colorIdx];

    rgba[idx] = color[0];
    rgba[idx + 1] = color[1];
    rgba[idx + 2] = color[2];
    rgba[idx + 3] = 200; // Semi-transparent
  }

  return { data: rgba, width, height };
}

// Efficient min/max for large arrays (avoids stack overflow)
function getMinMax(arr, fillValue = -9999) {
  let min = Infinity;
  let max = -Infinity;
  let validCount = 0;

  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v !== fillValue && !isNaN(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
      validCount++;
    }
  }

  return { min, max, validCount, totalCount: arr.length };
}

// Create ImageData from RGBA array
function createImageBitmap2(rgba, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = new ImageData(rgba, width, height);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

// Convert lon/lat to Web Mercator (EPSG:3857)
function lonLatToWebMercator(lon, lat) {
  const x = lon * 20037508.34 / 180;
  let y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
  y = y * 20037508.34 / 180;
  return { x, y };
}

// Find nearest pixel index in coordinate array
function findNearestIndex(coords, target) {
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < coords.length; i++) {
    const dist = Math.abs(coords[i] - target);
    if (dist < minDist) {
      minDist = dist;
      minIdx = i;
    }
  }
  return minIdx;
}

export function ZarrMap({ onPolarView, onGlobeView }) {
  // Start centred on Europe (ECMWF is in Reading)
  const [viewState, setViewState] = useState({
    longitude: 5,
    latitude: 50,
    zoom: 4,
    minZoom: 0,
    maxZoom: 6,
    pitch: 0,
    bearing: 0,
  });

  const [timeIndex, setTimeIndex] = useState(0);
  const [selectedYear, setSelectedYear] = useState(2020); // For multi-year datasets
  const [colormapName, setColormapName] = useState('browns');
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [prevImageUrl, setPrevImageUrl] = useState(null); // Double-buffer to prevent flash
  const [currentLOD, setCurrentLOD] = useState(0);
  const [dataStats, setDataStats] = useState(null);
  const [colorRange, setColorRange] = useState({ vmin: 0, vmax: 0.5 });

  // Click-to-timeseries state
  const [clickedPoint, setClickedPoint] = useState(null); // { lng, lat }
  const [timeseries, setTimeseries] = useState(null); // [{ month, value }, ...]
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);

  // Tech Info panel state
  const [techInfoOpen, setTechInfoOpen] = useState(false);
  const [smoothingLevel, setSmoothingLevel] = useState(2); // 0=none, 1=light, 2=medium, 3=strong

  // Load timer state (for demonstrating <2s render requirement)
  const [loadStartTime, setLoadStartTime] = useState(null);
  const [loadEndTime, setLoadEndTime] = useState(null);
  const [loadDuration, setLoadDuration] = useState(null); // in milliseconds

  // Autoplay state
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef(null);

  // UI animation state
  const [mapReady, setMapReady] = useState(false);
  const [dataOpacity, setDataOpacity] = useState(0);
  const [userOpacity, setUserOpacity] = useState(0.7); // User-controllable opacity (0.3-1.0)
  const [showNotification, setShowNotification] = useState(true);
  const [notificationMessage, setNotificationMessage] = useState('');
  const prevDatasetRef = useRef(selectedDataset);

  // Full-screen mode
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Settings panel state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [colourPalette, setColourPalette] = useState('default');

  // Region presets for quick navigation
  const REGION_PRESETS = {
    global: { latitude: 20, longitude: 0, zoom: 1, label: 'Global' },
    europe: { latitude: 50, longitude: 10, zoom: 3.5, label: 'Europe' },
    arctic: { latitude: 75, longitude: 0, zoom: 2.5, label: 'Arctic' },
    sahel: { latitude: 15, longitude: 10, zoom: 3.5, label: 'Sahel' },
    australia: { latitude: -25, longitude: 135, zoom: 3, label: 'Australia' },
  };

  // Welcome screen state
  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomeTab, setWelcomeTab] = useState('evaluator'); // 'evaluator' or 'internal'
  const [currentFact, setCurrentFact] = useState({ text: '', category: 'technical' });
  const [preloadProgress, setPreloadProgress] = useState({ loaded: 0, total: 20 });
  const [datasetLoadStatus, setDatasetLoadStatus] = useState({
    soil_moisture_multiyear: { status: 'pending', loaded: 0, total: 4 }, // LOD 0-4
    radiation_budget: { status: 'pending', loaded: 0, total: 4 }, // LOD 0-3
    satellite_radiation: { status: 'pending', loaded: 0, total: 3 }, // LOD 0-2
    fire_burned_area: { status: 'pending', loaded: 0, total: 5 }, // LOD 0-4
    sea_ice: { status: 'pending', loaded: 0, total: 4 }, // LOD 0-3 (polar)
  });
  const factIndexRef = useRef(0);
  const preloadedDatasetsRef = useRef(new Set());
  const showWelcomeRef = useRef(showWelcome); // Track showWelcome for async preload

  const abortControllerRef = useRef(null);
  const lastLoadRef = useRef({ level: -1, time: -1, colormap: '', dataset: '' });

  // Image cache for faster switching (caches rendered images by key)
  const imageCacheRef = useRef(new Map());
  const MAX_CACHE_SIZE = 24; // Cache up to 24 images (2 datasets × 12 months)

  // Store current raw data for region computation
  const currentDataRef = useRef({
    rawData: null,
    width: 0,
    height: 0,
    xCoords: [],
    yCoords: [],
  });

  // Get current dataset config
  const datasetConfig = DATASETS[selectedDataset];

  // Compute mean over a polygon region
  const computeRegionMean = useCallback(async (polygon) => {
    const { rawData, width, height, xCoords, yCoords } = currentDataRef.current;

    console.log('[Region] Computing mean for polygon with', polygon.length, 'vertices');
    console.log('[Region] Data dimensions:', width, 'x', height);
    console.log('[Region] xCoords range:', xCoords[0], 'to', xCoords[xCoords.length - 1]);
    console.log('[Region] yCoords range:', yCoords[0], 'to', yCoords[yCoords.length - 1]);

    if (!rawData || !xCoords.length || !yCoords.length) {
      return { mean: null, error: 'No data loaded' };
    }

    // Convert polygon from lon/lat to Web Mercator (data is in EPSG:3857)
    const polygonMercator = polygon.map(([lon, lat]) => {
      const mercator = lonLatToWebMercator(lon, lat);
      return [mercator.x, mercator.y];
    });

    console.log('[Region] Polygon in Mercator:', polygonMercator[0], '...');

    // Get bounding box of polygon in Mercator
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const [x, y] of polygonMercator) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    console.log('[Region] Bounding box:', { minX, maxX, minY, maxY });

    // Data coordinate ranges
    const dataXMin = Math.min(xCoords[0], xCoords[xCoords.length - 1]);
    const dataXMax = Math.max(xCoords[0], xCoords[xCoords.length - 1]);
    const dataYMin = Math.min(yCoords[0], yCoords[yCoords.length - 1]);
    const dataYMax = Math.max(yCoords[0], yCoords[yCoords.length - 1]);

    const pixelValues = [];

    // Iterate through pixels and check if they're inside the polygon
    for (let yi = 0; yi < height; yi++) {
      for (let xi = 0; xi < width; xi++) {
        // Get the Mercator coordinates of this pixel
        const px = xCoords[xi] !== undefined ? xCoords[xi] : (dataXMin + (xi / (width - 1)) * (dataXMax - dataXMin));
        const py = yCoords[yi] !== undefined ? yCoords[yi] : (dataYMax - (yi / (height - 1)) * (dataYMax - dataYMin));

        // Quick bounding box check
        if (px < minX || px > maxX || py < minY || py > maxY) continue;

        // Point in polygon check (ray casting) in Mercator coordinates
        let inside = false;
        for (let i = 0, j = polygonMercator.length - 1; i < polygonMercator.length; j = i++) {
          const [xi2, yi2] = polygonMercator[i];
          const [xj, yj] = polygonMercator[j];
          if (((yi2 > py) !== (yj > py)) && (px < (xj - xi2) * (py - yi2) / (yj - yi2) + xi2)) {
            inside = !inside;
          }
        }

        if (inside) {
          const idx = yi * width + xi;
          const value = rawData[idx];
          // Skip fill values and NaN
          if (value !== undefined && !isNaN(value) && value !== -9999 && value > 0) {
            pixelValues.push(value);
          }
        }
      }
    }

    console.log('[Region] Found', pixelValues.length, 'valid pixels');

    if (pixelValues.length === 0) {
      return { mean: null, count: 0, error: 'No valid pixels in region' };
    }

    // Compute statistics
    let sum = 0, min = Infinity, max = -Infinity;
    for (const v of pixelValues) {
      sum += v;
      if (v < min) min = v;
      if (v > max) max = v;
    }

    return {
      mean: sum / pixelValues.length,
      min,
      max,
      count: pixelValues.length,
    };
  }, []);

  // Region computation hook
  const regionComputation = useRegionComputation({
    enabled: getFeatureFlags().enableComputation && selectedDataset !== null,
    onComputeMean: computeRegionMean,
  });

  // Keep showWelcomeRef in sync for async preload function
  useEffect(() => {
    showWelcomeRef.current = showWelcome;
  }, [showWelcome]);

  // URL State: Read initial state from URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlDataset = params.get('dataset');
    const urlYear = params.get('year');
    const urlMonth = params.get('month');
    const urlLat = params.get('lat');
    const urlLon = params.get('lon');
    const urlZoom = params.get('zoom');
    const urlColormap = params.get('colormap');

    if (urlDataset && DATASETS[urlDataset]) {
      setSelectedDataset(urlDataset);
      setShowWelcome(false); // Skip welcome if coming from shared link
    }
    if (urlYear) setSelectedYear(parseInt(urlYear));
    if (urlMonth) setTimeIndex(parseInt(urlMonth));
    if (urlColormap && COLORMAPS[urlColormap]) setColormapName(urlColormap);
    if (urlLat && urlLon && urlZoom) {
      setViewState(prev => ({
        ...prev,
        latitude: parseFloat(urlLat),
        longitude: parseFloat(urlLon),
        zoom: parseFloat(urlZoom),
      }));
    }
  }, []); // Only on mount

  // URL State: Update URL when state changes (debounced)
  useEffect(() => {
    if (showWelcome) return; // Don't update URL while welcome screen is showing

    const params = new URLSearchParams();
    params.set('dataset', selectedDataset);
    params.set('year', selectedYear.toString());
    params.set('month', timeIndex.toString());
    params.set('lat', viewState.latitude.toFixed(2));
    params.set('lon', viewState.longitude.toFixed(2));
    params.set('zoom', viewState.zoom.toFixed(1));
    params.set('colormap', colormapName);

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newUrl);
  }, [selectedDataset, selectedYear, timeIndex, viewState.latitude, viewState.longitude, viewState.zoom, colormapName, showWelcome]);

  // Rotate facts during welcome screen
  useEffect(() => {
    if (!showWelcome) return;

    const allFacts = [
      ...LOADING_FACTS.technical.map(t => ({ text: t, category: 'technical' })),
      ...LOADING_FACTS.climate.map(t => ({ text: t, category: 'climate' })),
      ...LOADING_FACTS.data.map(t => ({ text: t, category: 'data' })),
    ];

    // Set initial fact
    setCurrentFact(allFacts[0]);

    const interval = setInterval(() => {
      factIndexRef.current = (factIndexRef.current + 1) % allFacts.length;
      setCurrentFact(allFacts[factIndexRef.current]);
    }, 4000); // Rotate every 4 seconds

    return () => clearInterval(interval);
  }, [showWelcome]);

  // Background preloading during welcome screen - actually download data
  useEffect(() => {
    if (!showWelcome) return;

    const preloadDatasets = async () => {
      // Progressive preloading: coarse LODs first (fast), then finer LODs
      // This ensures quick initial display while higher detail loads in background
      const toPreload = [
        // === PHASE 1: Coarsest LODs for all datasets (fast initial load) ===
        { dataset: 'soil_moisture_multiyear', level: 0, time: 0, year: 2020 },
        { dataset: 'radiation_budget', level: 0, time: 0, year: 2020 },
        { dataset: 'satellite_radiation', level: 0, time: 0, year: 2020 }, // Satellite solar radiation
        { dataset: 'fire_burned_area', level: 0, time: 7, year: 2020 }, // August for fires
        { dataset: 'sea_ice', level: 0, time: 2, year: 2020, polar: true }, // March for ice

        // === PHASE 2: Medium LODs ===
        { dataset: 'soil_moisture_multiyear', level: 2, time: 0, year: 2020 },
        { dataset: 'radiation_budget', level: 1, time: 0, year: 2020 },
        { dataset: 'satellite_radiation', level: 1, time: 0, year: 2020 },
        { dataset: 'fire_burned_area', level: 1, time: 7, year: 2020 },
        { dataset: 'sea_ice', level: 1, time: 2, year: 2020, polar: true },

        // === PHASE 3: Higher LODs ===
        { dataset: 'soil_moisture_multiyear', level: 3, time: 0, year: 2020 },
        { dataset: 'radiation_budget', level: 2, time: 0, year: 2020 },
        { dataset: 'satellite_radiation', level: 2, time: 0, year: 2020 }, // Max level for satellite
        { dataset: 'fire_burned_area', level: 2, time: 7, year: 2020 },
        { dataset: 'sea_ice', level: 2, time: 2, year: 2020, polar: true },

        // === PHASE 4: Finest LODs for detailed zoom ===
        { dataset: 'soil_moisture_multiyear', level: 4, time: 0, year: 2020 },
        { dataset: 'radiation_budget', level: 3, time: 0, year: 2020 },
        { dataset: 'fire_burned_area', level: 3, time: 7, year: 2020 },
        { dataset: 'sea_ice', level: 3, time: 2, year: 2020, polar: true },

        // === PHASE 5: Maximum detail where available ===
        { dataset: 'fire_burned_area', level: 4, time: 7, year: 2020 },
      ];

      // Track per-dataset progress (matches actual LOD levels available)
      // soil_moisture: 0-4, radiation: 0-3, satellite: 0-2, fire: 0-4, sea_ice: 0-3
      const datasetProgress = {
        soil_moisture_multiyear: { loaded: 0, total: 4 },
        radiation_budget: { loaded: 0, total: 4 },
        satellite_radiation: { loaded: 0, total: 3 },
        fire_burned_area: { loaded: 0, total: 5 },
        sea_ice: { loaded: 0, total: 4 },
      };

      let loaded = 0;
      setPreloadProgress({ loaded: 0, total: toPreload.length });

      // Run preloads sequentially to avoid overwhelming the browser/network
      for (const item of toPreload) {
        // Stop preloading if welcome screen was dismissed (use ref for current value in async)
        if (!showWelcomeRef.current) {
          console.log('[PRELOAD] Welcome dismissed, stopping preload');
          break;
        }

        // Update status to loading for this dataset
        const datasetKey = item.polar ? 'sea_ice' : item.dataset;
        setDatasetLoadStatus(prev => ({
          ...prev,
          [datasetKey]: { ...prev[datasetKey], status: 'loading' }
        }));

        const cacheKey = `${item.dataset}-${item.level}-${item.year || ''}-${item.time}`;
        if (preloadedDatasetsRef.current.has(cacheKey)) {
          loaded++;
          datasetProgress[item.dataset].loaded++;
          setPreloadProgress({ loaded, total: toPreload.length });
          continue;
        }

        try {
          let storeUrl, variableName, isMultiYear;

          // Handle polar sea ice separately (different path and variable)
          if (item.polar) {
            storeUrl = `${API_URL}/zarr/sea_ice_polar_multiyear/${item.level}`;
            variableName = 'ice_concentration';
            isMultiYear = true;
            console.log(`[PRELOAD] Fetching sea_ice (polar) L${item.level}...`);
          } else {
            const config = DATASETS[item.dataset];
            if (!config) {
              console.log(`[PRELOAD] Skipping unknown dataset: ${item.dataset}`);
              loaded++;
              setPreloadProgress({ loaded, total: toPreload.length });
              continue;
            }
            storeUrl = `${API_URL}${config.path}/${item.level}`;
            variableName = config.variable;
            isMultiYear = config.isMultiYear;
            console.log(`[PRELOAD] Fetching ${item.dataset} L${item.level}...`);
          }

          const store = new zarr.FetchStore(storeUrl);
          const root = zarr.root(store);

          // First fetch coordinate arrays (small)
          const xArr = await zarr.open(root.resolve('x'), { kind: 'array' });
          const yArr = await zarr.open(root.resolve('y'), { kind: 'array' });
          await zarr.get(xArr);
          await zarr.get(yArr);

          // Then fetch the data array
          const arr = await zarr.open(root.resolve(variableName), { kind: 'array' });
          let dataSize = 0;

          if (isMultiYear) {
            // Multi-year: [year, month, y, x]
            const yearArr = await zarr.open(root.resolve('year'), { kind: 'array' });
            const yearResult = await zarr.get(yearArr);
            const years = Array.from(yearResult.data).map(y => Number(y));
            const yearIndex = years.indexOf(item.year);
            if (yearIndex >= 0) {
              const rawData = await zarr.get(arr, [yearIndex, item.time, null, null]);
              dataSize = rawData.data.length;
              console.log(`[PRELOAD] ✓ ${item.dataset} L${item.level} ${item.year}/${MONTHS[item.time]} (${dataSize.toLocaleString()} values)`);
            }
          } else {
            // Single year: [time, y, x]
            const rawData = await zarr.get(arr, [item.time, null, null]);
            dataSize = rawData.data.length;
            console.log(`[PRELOAD] ✓ ${item.dataset} L${item.level} ${MONTHS[item.time]} (${dataSize.toLocaleString()} values)`);
          }

          preloadedDatasetsRef.current.add(cacheKey);
          const datasetKey = item.polar ? 'sea_ice' : item.dataset;
          if (datasetProgress[datasetKey]) {
            datasetProgress[datasetKey].loaded++;

            // Update per-dataset status
            const dp = datasetProgress[datasetKey];
            setDatasetLoadStatus(prev => ({
              ...prev,
              [datasetKey]: {
                status: dp.loaded >= dp.total ? 'complete' : 'loading',
                loaded: dp.loaded,
                total: dp.total,
                lastSize: dataSize,
              }
            }));
          }

        } catch (err) {
          console.log(`[PRELOAD] ✗ ${item.dataset} L${item.level}: ${err.message}`);
          // Continue to next item even if this one fails
        }

        loaded++;
        setPreloadProgress({ loaded, total: toPreload.length });
        // Small delay between preloads
        await new Promise(r => setTimeout(r, 150));
      }

      console.log(`[PRELOAD] Complete: ${loaded}/${toPreload.length} datasets`);
    };

    // Small delay before starting preload to let initial render settle
    const timer = setTimeout(preloadDatasets, 500);
    return () => clearTimeout(timer);
  }, [showWelcome]);

  // Auto-switch colormap when dataset changes
  useEffect(() => {
    if (datasetConfig?.defaultColormap) {
      setColormapName(datasetConfig.defaultColormap);
    }
    // Apply dataset-specific smoothing if defined
    if (datasetConfig?.defaultSmoothing !== undefined) {
      setSmoothingLevel(datasetConfig.defaultSmoothing);
    }
  }, [selectedDataset, datasetConfig]);

  // Show intro notification on dataset change
  useEffect(() => {
    if (datasetConfig?.introFact) {
      // Fade out old data for crossfade effect
      if (prevDatasetRef.current !== selectedDataset) {
        setDataOpacity(0);
      }

      setNotificationMessage(`${datasetConfig.name} — ${MONTHS[timeIndex]} 2023`);
      setShowNotification(true);

      // Auto-hide after 4 seconds
      const timer = setTimeout(() => {
        setShowNotification(false);
      }, 4000);

      prevDatasetRef.current = selectedDataset;
      return () => clearTimeout(timer);
    }
  }, [selectedDataset, datasetConfig]);

  // Initial map ready animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setMapReady(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Fade in data layer when image loads (skip during autoplay to avoid flashing)
  useEffect(() => {
    let fadeInterval = null;

    if (imageUrl && !loading) {
      if (isPlaying) {
        // During autoplay, set full opacity immediately to avoid flashing
        setDataOpacity(1);
      } else {
        // Smooth fade-in for data layer on manual changes
        let opacity = 0;
        fadeInterval = setInterval(() => {
          opacity += 0.05;
          if (opacity >= 1) {
            setDataOpacity(1);
            clearInterval(fadeInterval);
            fadeInterval = null;
          } else {
            setDataOpacity(opacity);
          }
        }, 20); // 20ms × 20 steps = 400ms fade
      }
    }

    // Cleanup: clear interval if component unmounts or deps change
    return () => {
      if (fadeInterval) {
        clearInterval(fadeInterval);
      }
    };
  }, [imageUrl, loading, isPlaying]);

  // Autoplay effect - cycle through time steps
  useEffect(() => {
    if (isPlaying && datasetConfig) {
      playIntervalRef.current = setInterval(() => {
        if (datasetConfig.isMultiYear) {
          // Multi-year: cycle through all year+month combinations
          setTimeIndex(prevMonth => {
            if (prevMonth >= 11) {
              // Move to next year
              setSelectedYear(prevYear => {
                const maxYear = datasetConfig.yearRange.end;
                const minYear = datasetConfig.yearRange.start;
                return prevYear >= maxYear ? minYear : prevYear + 1;
              });
              return 0;
            }
            return prevMonth + 1;
          });
        } else {
          // Single year: just cycle months
          setTimeIndex(prev => (prev + 1) % 12);
        }
      }, 1000); // 1 second interval - gives time for data to load
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, datasetConfig]);

  // Calculate target LOD from current zoom (limited by dataset's max level)
  const targetLOD = useMemo(() => {
    const maxLevel = datasetConfig?.maxLevel || MAX_PYRAMID_LEVEL;
    const level = Math.min(maxLevel, Math.max(0, Math.floor(viewState.zoom) + 1));
    return level;
  }, [viewState.zoom, datasetConfig]);

  // Predictive preloading: prefetch adjacent months, years, AND LOD levels
  useEffect(() => {
    if (showWelcome || !datasetConfig) return;

    const preloadAdjacent = async () => {
      const isMultiYear = datasetConfig.isMultiYear;
      const maxLevel = datasetConfig.maxLevel || MAX_PYRAMID_LEVEL;

      // === 1. Preload adjacent LOD levels (for zoom) ===
      const lodLevels = [];
      if (targetLOD > 0) lodLevels.push(targetLOD - 1); // Zoom out
      if (targetLOD < maxLevel) lodLevels.push(targetLOD + 1); // Zoom in

      for (const level of lodLevels) {
        const lodCacheKey = isMultiYear
          ? `${selectedDataset}-${level}-${selectedYear}-${timeIndex}-${colormapName}-s${smoothingLevel}`
          : `${selectedDataset}-${level}-${timeIndex}-${colormapName}-s${smoothingLevel}`;

        if (!imageCacheRef.current.has(lodCacheKey)) {
          preloadDataSlice(selectedYear, timeIndex, level).catch(() => {});
        }
      }

      // === 2. Preload adjacent months/years at CURRENT LOD ===
      const toPreload = [];

      // Preload next/previous months
      const nextMonth = (timeIndex + 1) % 12;
      const prevMonth = (timeIndex + 11) % 12;
      toPreload.push({ month: nextMonth, year: selectedYear });
      toPreload.push({ month: prevMonth, year: selectedYear });

      if (isMultiYear) {
        // Preload adjacent years (same month)
        const { start, end } = datasetConfig.yearRange;
        if (selectedYear < end) {
          toPreload.push({ month: timeIndex, year: selectedYear + 1 });
        }
        if (selectedYear > start) {
          toPreload.push({ month: timeIndex, year: selectedYear - 1 });
        }
      }

      // Preload in background (don't await, fire-and-forget)
      for (const item of toPreload) {
        const cacheKey = isMultiYear
          ? `${selectedDataset}-${targetLOD}-${item.year}-${item.month}-${colormapName}-s${smoothingLevel}`
          : `${selectedDataset}-${targetLOD}-${item.month}-${colormapName}-s${smoothingLevel}`;

        // Skip if already cached
        if (imageCacheRef.current.has(cacheKey)) continue;

        // Background fetch (no await - fire and forget)
        preloadDataSlice(item.year, item.month, targetLOD).catch(() => {});
      }
    };

    // Debounce preloading to avoid overwhelming during rapid changes
    const timer = setTimeout(preloadAdjacent, 300); // Reduced delay for faster preload
    return () => clearTimeout(timer);
  }, [selectedYear, timeIndex, targetLOD, selectedDataset, colormapName, smoothingLevel, showWelcome, datasetConfig]);

  // Helper to preload a single data slice
  const preloadDataSlice = async (year, month, level) => {
    if (!datasetConfig) return;

    try {
      const storeUrl = `${API_URL}${datasetConfig.path}/${level}`;
      const store = new zarr.FetchStore(storeUrl);
      const root = zarr.root(store);
      const arr = await zarr.open(root.resolve(datasetConfig.variable), { kind: 'array' });

      if (datasetConfig.isMultiYear) {
        const yearArr = await zarr.open(root.resolve('year'), { kind: 'array' });
        const yearResult = await zarr.get(yearArr);
        const years = Array.from(yearResult.data).map(y => Number(y));
        const yearIndex = years.indexOf(year);
        if (yearIndex >= 0) {
          await zarr.get(arr, [yearIndex, month, null, null]);
          // console.log(`[PRELOAD] Adjacent ${year}/${MONTHS[month]} cached`);
        }
      } else {
        await zarr.get(arr, [month, null, null]);
      }
    } catch (e) {
      // Silent fail for preloading
    }
  };

  // Load data when LOD, time, or dataset changes
  useEffect(() => {
    const loadData = async () => {
      // Skip loading while welcome screen is showing or no dataset selected
      if (showWelcome || !datasetConfig) {
        return;
      }

      // Skip if already loading this exact configuration
      if (lastLoadRef.current.level === targetLOD &&
          lastLoadRef.current.time === timeIndex &&
          lastLoadRef.current.colormap === colormapName &&
          lastLoadRef.current.dataset === selectedDataset) {
        return;
      }

      // Cancel any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      // Check cache first
      const isMultiYear = datasetConfig.isMultiYear;
      const cacheKey = isMultiYear
        ? `${selectedDataset}-${targetLOD}-${selectedYear}-${timeIndex}-${colormapName}-s${smoothingLevel}`
        : `${selectedDataset}-${targetLOD}-${timeIndex}-${colormapName}-s${smoothingLevel}`;
      const cached = imageCacheRef.current.get(cacheKey);
      if (cached) {
        // console.log(`[CACHE] Hit for ${cacheKey}`);
        const cacheStart = performance.now();
        if (isPlaying) setPrevImageUrl(imageUrl); // Save previous for double-buffer
        setImageUrl(cached.url);
        setCurrentLOD(targetLOD);
        setDataStats(cached.stats);
        setColorRange(cached.colorRange);
        lastLoadRef.current = { level: targetLOD, time: timeIndex, year: selectedYear, colormap: colormapName, dataset: selectedDataset };
        // Show cache hit time (should be <10ms)
        const cacheDuration = performance.now() - cacheStart;
        setLoadDuration(cacheDuration);
        setLoadStartTime(null);
        return;
      }

      // Don't show loading indicator during autoplay to avoid flashing
      if (!isPlaying) {
        setLoading(true);
      }
      setError(null);

      // Start load timer for this fetch (not from cache)
      const fetchStartTime = performance.now();
      setLoadStartTime(fetchStartTime);
      setLoadDuration(null); // Clear previous while loading

      // Reduced logging for cleaner demo console
      if (!isPlaying) {
        console.log(`[LOD] Loading level ${targetLOD}`);
      }

      try {
        // Open the Zarr store at the correct pyramid level
        const storeUrl = `${API_URL}${datasetConfig.path}/${targetLOD}`;

        // Cache key for coordinates (same for all time slices at this level)
        const coordCacheKey = `${selectedDataset}-${targetLOD}-coords`;

        // Cache key for data slice
        const dataCacheKey = isMultiYear
          ? `${selectedDataset}-${targetLOD}-${selectedYear}-${timeIndex}-data`
          : `${selectedDataset}-${targetLOD}-${timeIndex}-data`;

        let height, width, rawData, xCoords, yCoords;

        // Fetch coordinates with caching (same for all time slices)
        const coords = await fetchDataDeduplicated(coordCacheKey, async () => {
          console.log(`[CACHE] Fetching coordinates for ${selectedDataset} L${targetLOD}`);
          const store = new zarr.FetchStore(storeUrl);
          const root = zarr.root(store);

          const xArr = await zarr.open(root.resolve('x'), { kind: 'array' });
          const yArr = await zarr.open(root.resolve('y'), { kind: 'array' });
          const xResult = await zarr.get(xArr);
          const yResult = await zarr.get(yArr);

          let years = null;
          if (isMultiYear) {
            const yearArr = await zarr.open(root.resolve('year'), { kind: 'array' });
            const yearResult = await zarr.get(yearArr);
            years = Array.from(yearResult.data).map(y => Number(y));
          }

          // Also get array shape
          const arr = await zarr.open(root.resolve(datasetConfig.variable), { kind: 'array' });

          return {
            x: Array.from(xResult.data),
            y: Array.from(yResult.data),
            years,
            shape: arr.shape,
          };
        });

        xCoords = coords.x;
        yCoords = coords.y;

        if (isMultiYear) {
          height = coords.shape[2];
          width = coords.shape[3];

          const yearIndex = coords.years.indexOf(selectedYear);
          if (yearIndex === -1) {
            throw new Error(`Year ${selectedYear} not found in dataset. Available: ${coords.years[0]}-${coords.years[coords.years.length-1]}`);
          }

          // Fetch data slice with caching
          rawData = await fetchDataDeduplicated(dataCacheKey, async () => {
            console.log(`[CACHE] Fetching data slice ${selectedDataset} L${targetLOD} ${selectedYear}/${timeIndex}`);
            const store = new zarr.FetchStore(storeUrl);
            const root = zarr.root(store);
            const arr = await zarr.open(root.resolve(datasetConfig.variable), { kind: 'array' });
            const result = await zarr.get(arr, [yearIndex, timeIndex, null, null]);
            return result.data;
          });
        } else {
          height = coords.shape[1];
          width = coords.shape[2];

          // Fetch data slice with caching
          rawData = await fetchDataDeduplicated(dataCacheKey, async () => {
            console.log(`[CACHE] Fetching data slice ${selectedDataset} L${targetLOD} ${timeIndex}`);
            const store = new zarr.FetchStore(storeUrl);
            const root = zarr.root(store);
            const arr = await zarr.open(root.resolve(datasetConfig.variable), { kind: 'array' });
            const result = await zarr.get(arr, [timeIndex, null, null]);
            return result.data;
          });
        }

        // Calculate bounds from coordinates
        const xMin = Math.min(...xCoords);
        const xMax = Math.max(...xCoords);
        const yMin = Math.min(...yCoords);
        const yMax = Math.max(...yCoords);

        // console.log(`[ZARR] Bounds: x=[${xMin}, ${xMax}], y=[${yMin}, ${yMax}]`);

        // Calculate data stats efficiently (no stack overflow)
        // Use dataset-specific fill value for stats calculation
        const statsFillValue = datasetConfig.fillValue !== undefined
          ? datasetConfig.fillValue
          : (isMultiYear ? NaN : -9999);
        const stats = getMinMax(rawData, statsFillValue);
        // console.log(`[ZARR] Data stats: min=${stats.min.toFixed(3)}, max=${stats.max.toFixed(3)}, valid=${stats.validCount}/${stats.totalCount}, fillValue=${statsFillValue}`);

        setDataStats({
          min: stats.min.toFixed(3),
          max: stats.max.toFixed(3),
          validPixels: stats.validCount,
          totalPixels: stats.totalCount,
        });

        // Store raw data for region computation
        currentDataRef.current = {
          rawData: rawData,
          width,
          height,
          xCoords,
          yCoords,
        };

        // Apply colormap directly to flat array (much more efficient)
        // Use dataset-specific color range
        const vmin = datasetConfig.colorRange.vmin;
        const vmax = Math.max(datasetConfig.colorRange.vmax, stats.max * 0.8);
        setColorRange({ vmin, vmax });
        // Use dataset-specific fill value, or default based on type
        // Fire data uses 0 as fill_value in zarr, others use NaN for multi-year or -9999
        const fillValue = datasetConfig.fillValue !== undefined
          ? datasetConfig.fillValue
          : ((isMultiYear || selectedDataset === 'radiation_budget') ? NaN : -9999);
        // Use dataset-specific threshold to filter noise (e.g., fire data over ocean)
        const minThreshold = datasetConfig.minThreshold || 0;
        const { data: rgba, width: w, height: h } = applyColormap(rawData, width, height, colormapName, vmin, vmax, fillValue, smoothingLevel, minThreshold);

        // Create image URL
        const url = createImageBitmap2(rgba, w, h);

        if (isPlaying) setPrevImageUrl(imageUrl); // Save previous for double-buffer
        setImageUrl(url);
        setCurrentLOD(targetLOD);
        lastLoadRef.current = { level: targetLOD, time: timeIndex, year: selectedYear, colormap: colormapName, dataset: selectedDataset };
        setLoading(false);

        // Stop load timer and calculate duration (only for initial dataset load)
        if (loadStartTime) {
          const endTime = performance.now();
          const duration = endTime - loadStartTime;
          setLoadEndTime(endTime);
          setLoadDuration(duration);
          setLoadStartTime(null); // Reset so LOD changes don't keep updating timer
          console.log(`[TIMER] Dataset loaded in ${duration.toFixed(0)}ms`);
        }

        // Store in cache (must match lookup key format including smoothingLevel)
        const storeCacheKey = isMultiYear
          ? `${selectedDataset}-${targetLOD}-${selectedYear}-${timeIndex}-${colormapName}-s${smoothingLevel}`
          : `${selectedDataset}-${targetLOD}-${timeIndex}-${colormapName}-s${smoothingLevel}`;
        imageCacheRef.current.set(storeCacheKey, {
          url,
          stats: { min: stats.min.toFixed(3), max: stats.max.toFixed(3), validPixels: stats.validCount, totalPixels: stats.totalCount },
          colorRange: { vmin, vmax },
        });
        // Limit cache size
        if (imageCacheRef.current.size > MAX_CACHE_SIZE) {
          const firstKey = imageCacheRef.current.keys().next().value;
          imageCacheRef.current.delete(firstKey);
        }

        // console.log(`[LOD] Successfully loaded level ${targetLOD} (cached)`);

        // Preload adjacent time slices in background
        preloadAdjacentTimeSlices(datasetConfig, timeIndex, targetLOD, {
          lookahead: 2,
          lookbehind: 1,
          year: isMultiYear ? selectedYear : null,
        });

      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('[ZARR] Request aborted');
          return;
        }
        console.error('[ZARR] Error loading data:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    loadData();
  }, [targetLOD, timeIndex, selectedYear, colormapName, selectedDataset, datasetConfig, smoothingLevel, showWelcome]);

  // Debounced view state change
  const handleViewStateChange = useCallback(({ viewState: vs }) => {
    setViewState(vs);
  }, []);

  // Load timeseries for clicked point
  const loadTimeseries = useCallback(async (lng, lat) => {
    setTimeseriesLoading(true);
    setClickedPoint({ lng, lat });

    try {
      const config = datasetConfig;
      const isMultiYear = config.isMultiYear;
      const level = config.maxLevel;
      const storeUrl = `${API_URL}${config.path}/${level}`;
      const store = new zarr.FetchStore(storeUrl);
      const root = zarr.root(store);

      const arr = await zarr.open(root.resolve(config.variable), { kind: 'array' });

      let xCoords, yCoords, xIdx, yIdx;

      if (isMultiYear) {
        // Multi-year now uses Web Mercator x/y coordinates (same as single-year)
        const xArr = await zarr.open(root.resolve('x'), { kind: 'array' });
        const yArr = await zarr.open(root.resolve('y'), { kind: 'array' });
        const xResult = await zarr.get(xArr);
        const yResult = await zarr.get(yArr);
        xCoords = Array.from(xResult.data);
        yCoords = Array.from(yResult.data);

        // Convert click coordinates to Web Mercator
        const { x, y } = lonLatToWebMercator(lng, lat);
        xIdx = findNearestIndex(xCoords, x);
        yIdx = findNearestIndex(yCoords, y);

        console.log(`[Timeseries] ${config.name}: (${lng.toFixed(2)}, ${lat.toFixed(2)}) -> pixel (${xIdx}, ${yIdx})`);
      } else {
        // Single-year uses Web Mercator x/y coordinates
        const xArr = await zarr.open(root.resolve('x'), { kind: 'array' });
        const yArr = await zarr.open(root.resolve('y'), { kind: 'array' });
        const xResult = await zarr.get(xArr);
        const yResult = await zarr.get(yArr);
        xCoords = Array.from(xResult.data);
        yCoords = Array.from(yResult.data);

        const { x, y } = lonLatToWebMercator(lng, lat);
        xIdx = findNearestIndex(xCoords, x);
        yIdx = findNearestIndex(yCoords, y);

        console.log(`[Timeseries] ${config.name}: (${lng.toFixed(2)}, ${lat.toFixed(2)}) -> pixel (${xIdx}, ${yIdx})`);
      }

      // Load timeseries data
      let timeseriesData = [];
      const fillValue = (isMultiYear || selectedDataset === 'radiation_budget') ? NaN : -9999;

      if (isMultiYear) {
        // Multi-year: load data for selected year, all months
        // Array shape: [year, month, lat, lon]
        const yearArr = await zarr.open(root.resolve('year'), { kind: 'array' });
        const yearResult = await zarr.get(yearArr);
        const years = Array.from(yearResult.data).map(v => Number(v));
        const yearIndex = years.indexOf(selectedYear);

        if (yearIndex === -1) {
          throw new Error(`Year ${selectedYear} not found`);
        }

        // Load all 12 months for this year at this location
        const result = await zarr.get(arr, [yearIndex, null, yIdx, xIdx]);
        const monthValues = result.data;

        for (let m = 0; m < 12; m++) {
          const value = monthValues[m];
          timeseriesData.push({
            month: MONTHS[m],
            monthIdx: m,
            value: (value === fillValue || isNaN(value) || value === 0) ? null : Number(value),
          });
        }

        console.log(`[Timeseries] Multi-year ${selectedYear}:`, timeseriesData.map(d => d.value?.toFixed(3)));
      } else {
        // Single-year: load all time steps
        const result = await zarr.get(arr, [null, yIdx, xIdx]);
        const allValues = result.data;

        for (let t = 0; t < Math.min(allValues.length, 12); t++) {
          const value = allValues[t];
          timeseriesData.push({
            month: MONTHS[t % 12],
            monthIdx: t,
            value: (value === fillValue || isNaN(value)) ? null : value,
          });
        }

        console.log('[Timeseries] Data:', timeseriesData);
      }

      // Check if we have any valid data
      const hasValidData = timeseriesData.some(d => d.value !== null);
      if (hasValidData) {
        setTimeseries(timeseriesData);
      } else {
        setTimeseries(null);
      }
    } catch (err) {
      console.error('[Timeseries] Error:', err);
      setTimeseries(null);
    } finally {
      setTimeseriesLoading(false);
    }
  }, [datasetConfig, selectedDataset, selectedYear]);

  // Handle map click
  const handleClick = useCallback((info, event) => {
    // Check if region computation should handle this click
    if (regionComputation.handleClick(info, event)) {
      return; // Region computation handled the click
    }

    if (info.coordinate) {
      const [lng, lat] = info.coordinate;
      // Only load if clicking on land (valid coordinates)
      if (lng >= -180 && lng <= 180 && lat >= -85 && lat <= 85) {
        loadTimeseries(lng, lat);
      }
    }
  }, [loadTimeseries, regionComputation]);

  // Create the layers (basemap + data + marker)
  const layers = useMemo(() => {
    const layerList = [];

    // Basemap with labels
    layerList.push(new TileLayer({
      id: 'basemap',
      data: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: props => {
        const { boundingBox } = props.tile;
        return new BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
        });
      },
    }));

    // Use dataset-specific bounds if available, otherwise default
    const dataBounds = datasetConfig?.bounds || WORLD_BOUNDS;

    // NEVER BLANK SCREENS: Always show previous data while loading
    // Previous layer stays at 0.7 opacity during loading, giving visual continuity
    if (prevImageUrl && prevImageUrl !== imageUrl) {
      layerList.push(new BitmapLayer({
        id: 'climate-data-prev',
        image: prevImageUrl,
        bounds: dataBounds,
        // Dim while loading, use user-controlled opacity
        opacity: loading ? userOpacity * 0.7 : userOpacity,
        pickable: false,
        textureParameters: {
          minFilter: 'linearMipmapLinear',
          magFilter: 'linear',
          mipmaps: true,
        },
        transitions: { opacity: 300 },
      }));
    }

    // Climate data layer with smooth 300ms transitions
    if (imageUrl) {
      layerList.push(new BitmapLayer({
        id: 'climate-data',
        image: imageUrl,
        bounds: dataBounds,
        opacity: dataOpacity * userOpacity,
        pickable: true,
        textureParameters: {
          minFilter: 'linearMipmapLinear',
          magFilter: 'linear',
          mipmaps: true,
        },
        // Always use 300ms transitions for buttery smooth UX
        transitions: { opacity: 300 },
      }));
    }

    // Clicked point marker
    if (clickedPoint) {
      layerList.push(new ScatterplotLayer({
        id: 'click-marker',
        data: [clickedPoint],
        getPosition: d => [d.lng, d.lat],
        getFillColor: [79, 209, 197, 200], // Cyan
        getLineColor: [255, 255, 255, 255],
        getRadius: 8,
        radiusMinPixels: 8,
        radiusMaxPixels: 12,
        stroked: true,
        lineWidthMinPixels: 2,
        pickable: false,
      }));
    }

    // Add region computation layers
    layerList.push(...regionComputation.layers);

    return layerList;
  }, [imageUrl, prevImageUrl, clickedPoint, dataOpacity, userOpacity, loading, isPlaying, datasetConfig, regionComputation.layers]);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: '#1a1a2e',
      opacity: mapReady ? 1 : 0,
      transition: 'opacity 0.5s ease-out',
    }}>
      {/* Skip to content link for keyboard navigation */}
      <a
        href="#main-controls"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 'auto',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          zIndex: 9999,
        }}
        onFocus={(e) => {
          e.target.style.left = '10px';
          e.target.style.top = '10px';
          e.target.style.width = 'auto';
          e.target.style.height = 'auto';
          e.target.style.padding = '8px 16px';
          e.target.style.background = '#4fd1c5';
          e.target.style.color = '#000';
          e.target.style.borderRadius = '4px';
          e.target.style.textDecoration = 'none';
        }}
        onBlur={(e) => {
          e.target.style.left = '-9999px';
          e.target.style.width = '1px';
          e.target.style.height = '1px';
        }}
      >
        Skip to controls
      </a>

      {/* Screen reader live region for loading announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
      >
        {loading ? `Loading ${datasetConfig?.name || 'data'}...` :
         loadDuration ? `${datasetConfig?.name || 'Data'} loaded in ${(loadDuration / 1000).toFixed(2)} seconds` : ''}
      </div>

      <DeckGL
        views={new MapView({ repeat: true })}
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        onClick={handleClick}
        controller={regionComputation.isDrawing ? { dragPan: false, dragRotate: false } : true}
        layers={layers}
        style={{ width: '100%', height: '100%' }}
        getCursor={() => regionComputation.isDrawing ? 'crosshair' : 'grab'}
      />

      {/* Welcome Screen Overlay */}
      <Transition mounted={showWelcome} transition="fade" duration={500}>
        {(styles) => (
          <div
            className="welcome-overlay"
            style={{
              ...styles,
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(10, 10, 20, 0.97)',
              zIndex: 2000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 40,
            }}
          >
            <Paper
              p="xl"
              radius="lg"
              style={{
                background: 'rgba(26, 26, 46, 0.98)',
                border: '1px solid rgba(79, 209, 197, 0.3)',
                maxWidth: 700,
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                backdropFilter: 'blur(20px)',
              }}
            >
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <Text
                  size="xl"
                  fw={800}
                  style={{
                    background: 'linear-gradient(135deg, #4fd1c5 0%, #63b3ed 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    fontSize: 32,
                    letterSpacing: '-1px',
                  }}
                >
                  {welcomeTab === 'evaluator' ? EVALUATOR_CONTENT.title : WELCOME_CONTENT.title}
                </Text>
                <Text size="md" c="dimmed" mt={4}>
                  {welcomeTab === 'evaluator' ? EVALUATOR_CONTENT.subtitle : WELCOME_CONTENT.subtitle}
                </Text>
              </div>

              {/* Tab Switcher */}
              <Group justify="center" mb="lg">
                <Group
                  gap={0}
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: 8,
                    padding: 4,
                    border: '1px solid rgba(79, 209, 197, 0.2)',
                  }}
                >
                  <ActionIcon
                    size="lg"
                    variant={welcomeTab === 'evaluator' ? 'gradient' : 'subtle'}
                    gradient={{ from: 'cyan', to: 'blue', deg: 135 }}
                    color="cyan"
                    onClick={() => setWelcomeTab('evaluator')}
                    style={{
                      width: 140,
                      height: 36,
                      borderRadius: 6,
                    }}
                  >
                    <Text size="sm" fw={welcomeTab === 'evaluator' ? 600 : 400}>
                      For Evaluators
                    </Text>
                  </ActionIcon>
                  <ActionIcon
                    size="lg"
                    variant={welcomeTab === 'internal' ? 'gradient' : 'subtle'}
                    gradient={{ from: 'cyan', to: 'blue', deg: 135 }}
                    color="cyan"
                    onClick={() => setWelcomeTab('internal')}
                    style={{
                      width: 140,
                      height: 36,
                      borderRadius: 6,
                    }}
                  >
                    <Text size="sm" fw={welcomeTab === 'internal' ? 600 : 400}>
                      Technical Details
                    </Text>
                  </ActionIcon>
                </Group>
              </Group>

              {/* Content Sections - changes based on tab */}
              <Stack gap="md" mb="xl">
                {(welcomeTab === 'evaluator' ? EVALUATOR_CONTENT : WELCOME_CONTENT).sections.map((section, idx) => (
                  <Box key={`${welcomeTab}-${idx}`} className="fade-in" style={{ animationDelay: `${idx * 0.1}s` }}>
                    <Text size="sm" fw={600} c="cyan" mb={4}>
                      {section.heading}
                    </Text>
                    <Text size="sm" c="gray.4" style={{ lineHeight: 1.6 }}>
                      {section.content}
                    </Text>
                  </Box>
                ))}
              </Stack>

              {/* Highlights (Evaluator tab) or Tech Stack (Internal tab) */}
              {welcomeTab === 'evaluator' ? (
                <Box mb="xl">
                  <Text size="xs" fw={600} c="dimmed" mb={12} tt="uppercase" style={{ letterSpacing: 1 }}>
                    Key Capabilities
                  </Text>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {EVALUATOR_CONTENT.highlights.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(79, 209, 197, 0.08)',
                          borderRadius: 8,
                          padding: '12px 10px',
                          textAlign: 'center',
                          border: '1px solid rgba(79, 209, 197, 0.2)',
                        }}
                      >
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{item.icon}</div>
                        <Text size="xs" fw={600} c="cyan">{item.label}</Text>
                        <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>{item.desc}</Text>
                      </div>
                    ))}
                  </div>
                </Box>
              ) : (
                <Box mb="xl">
                  <Text size="xs" fw={600} c="dimmed" mb={8} tt="uppercase" style={{ letterSpacing: 1 }}>
                    Technology Stack
                  </Text>
                  <Group gap="sm">
                    {WELCOME_CONTENT.techStack.map((tech, idx) => (
                      <MantineTooltip key={idx} label={tech.desc} position="top">
                        <Badge
                          variant="outline"
                          color="cyan"
                          size="md"
                          style={{
                            cursor: 'default',
                            borderColor: 'rgba(79, 209, 197, 0.4)',
                          }}
                        >
                          {tech.name}
                        </Badge>
                      </MantineTooltip>
                    ))}
                  </Group>
                </Box>
              )}

              {/* Dataset Loading Visuals */}
              <Box
                mb="lg"
                p="md"
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: 8,
                  border: '1px solid rgba(79, 209, 197, 0.2)',
                }}
              >
                <Group justify="space-between" mb={12}>
                  <Text size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>
                    Preloading Datasets
                  </Text>
                  <Text size="xs" c="cyan" className="loading-progress">
                    {preloadProgress.loaded}/{preloadProgress.total} LOD levels
                  </Text>
                </Group>

                {/* Dataset cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 12 }}>
                  {WELCOME_CONTENT.datasets.map((ds) => {
                    const status = datasetLoadStatus[ds.id] || { status: 'pending', loaded: 0, total: 0 };
                    const isComplete = status.status === 'complete' || status.status === 'ready';
                    const isLoading = status.status === 'loading';

                    return (
                      <div
                        key={ds.id}
                        style={{
                          background: isComplete
                            ? 'rgba(79, 209, 197, 0.15)'
                            : isLoading
                              ? 'rgba(79, 209, 197, 0.08)'
                              : 'rgba(255, 255, 255, 0.03)',
                          borderRadius: 6,
                          padding: '8px 4px',
                          textAlign: 'center',
                          border: isComplete
                            ? '1px solid rgba(79, 209, 197, 0.4)'
                            : '1px solid rgba(255, 255, 255, 0.1)',
                          transition: 'all 0.3s ease',
                        }}
                      >
                        <div style={{
                          fontSize: 20,
                          marginBottom: 4,
                          opacity: isComplete ? 1 : isLoading ? 0.8 : 0.4,
                          filter: isLoading ? 'none' : 'none',
                        }}>
                          {ds.icon}
                        </div>
                        <Text size="xs" c={isComplete ? 'cyan' : 'dimmed'} fw={500} style={{ fontSize: 10 }}>
                          {ds.name}
                        </Text>
                        {status.total > 0 && (
                          <Text size="xs" c="dimmed" style={{ fontSize: 9, marginTop: 2 }}>
                            {status.loaded}/{status.total} LOD
                          </Text>
                        )}
                        {status.status === 'ready' && (
                          <Text size="xs" c="dimmed" style={{ fontSize: 9, marginTop: 2 }}>
                            ready
                          </Text>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Overall progress bar */}
                <div
                  style={{
                    height: 3,
                    background: 'rgba(79, 209, 197, 0.1)',
                    borderRadius: 2,
                    overflow: 'hidden',
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      width: `${(preloadProgress.loaded / preloadProgress.total) * 100}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #4fd1c5, #63b3ed)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>

                {/* Rotating fact */}
                <div
                  key={currentFact.text}
                  className="fact-rotate"
                  style={{ minHeight: 36 }}
                >
                  <Group gap={8} align="flex-start">
                    <Badge
                      size="xs"
                      variant="light"
                      color={
                        currentFact.category === 'technical' ? 'blue' :
                        currentFact.category === 'climate' ? 'green' : 'orange'
                      }
                      style={{ flexShrink: 0, marginTop: 2 }}
                    >
                      {currentFact.category}
                    </Badge>
                    <Text size="xs" c="gray.5" style={{ lineHeight: 1.5 }}>
                      {currentFact.text}
                    </Text>
                  </Group>
                </div>
              </Box>

              {/* Footer & CTA */}
              <div style={{ textAlign: 'center' }}>
                <Text size="xs" c="dimmed" mb={16} style={{ fontStyle: 'italic' }}>
                  {welcomeTab === 'evaluator' ? EVALUATOR_CONTENT.footer : WELCOME_CONTENT.footer}
                </Text>

                <ActionIcon
                  size="xl"
                  radius="xl"
                  variant="gradient"
                  gradient={{ from: 'cyan', to: 'blue', deg: 135 }}
                  onClick={() => setShowWelcome(false)}
                  style={{
                    width: 140,
                    height: 44,
                    borderRadius: 22,
                  }}
                >
                  <Text size="sm" fw={600}>Explore Data</Text>
                </ActionIcon>
              </div>
            </Paper>
          </div>
        )}
      </Transition>

      {/* Elegant notification toast - top center */}
      <Transition mounted={showNotification} transition="slide-down" duration={400}>
        {(styles) => (
          <div style={{
            ...styles,
            position: 'absolute',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1100,
          }}>
            <Paper
              p="sm"
              radius="lg"
              style={{
                background: 'rgba(26, 26, 46, 0.95)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(79, 209, 197, 0.3)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              }}
            >
              <Group gap="md">
                <Box
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#4fd1c5',
                    boxShadow: '0 0 10px #4fd1c5',
                  }}
                />
                <div>
                  <Text size="sm" fw={600} c="white">{notificationMessage}</Text>
                  <Text size="xs" c="dimmed" mt={2}>{datasetConfig?.introFact}</Text>
                </div>
              </Group>
            </Paper>
          </div>
        )}
      </Transition>

      {/* Tech Info Panel - Top Right (hidden in full-screen mode) */}
      <Transition mounted={!isFullScreen} transition="slide-left" duration={300}>
        {(techStyles) => (
      <Paper
        p="xs"
        radius="md"
        style={{
          ...techStyles,
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'rgba(0,0,0,0.95)',
          zIndex: 1000,
          minWidth: techInfoOpen ? 340 : 200,
          maxWidth: 380,
          border: '1px solid #4fd1c5',
          transition: 'all 0.2s ease',
        }}
      >
        {/* Header with toggle */}
        <Group justify="space-between" mb={techInfoOpen ? 'xs' : 0}>
          <Group gap={8}>
            <Text size="sm" fw={700} c="cyan">Tech Info</Text>
            <Badge color={loading ? 'yellow' : 'green'} size="sm" variant="filled">
              LOD {currentLOD}
            </Badge>
            <Badge color="blue" size="sm" variant="light">
              Zoom {viewState.zoom.toFixed(1)}
            </Badge>
            {/* Load timer - always visible */}
            {loadDuration !== null && (
              <Badge
                color={loadDuration < 2000 ? 'green' : 'red'}
                size="sm"
                variant="filled"
                style={{
                  fontFamily: 'monospace',
                  minWidth: 70,
                }}
              >
                {loadDuration < 1000
                  ? `${loadDuration.toFixed(0)}ms`
                  : `${(loadDuration / 1000).toFixed(2)}s`}
              </Badge>
            )}
            {loading && loadStartTime && (
              <Badge
                color="yellow"
                size="sm"
                variant="filled"
                style={{
                  fontFamily: 'monospace',
                  animation: 'pulse 1s infinite',
                }}
              >
                Loading...
              </Badge>
            )}
          </Group>
          <ActionIcon
            variant="subtle"
            color="cyan"
            size="sm"
            onClick={() => setTechInfoOpen(!techInfoOpen)}
          >
            <Text size="xs">{techInfoOpen ? '▼' : '▶'}</Text>
          </ActionIcon>
        </Group>

        <Collapse in={techInfoOpen}>
          <Stack gap="xs" mt="xs">
            {/* Current View Section */}
            <Box>
              <Text size="xs" fw={600} c="cyan" mb={4}>Current View</Text>
              <Group gap={4}>
                <Text size="xs" c="dimmed">LOD Level:</Text>
                <Text size="xs" c="white">{currentLOD} of {datasetConfig?.maxLevel}</Text>
                {targetLOD !== currentLOD && <Badge size="xs" color="yellow">loading {targetLOD}...</Badge>}
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Resolution:</Text>
                <Text size="xs" c="white">{Math.pow(2, currentLOD + 7)}×{Math.pow(2, currentLOD + 7)} px</Text>
              </Group>
              {dataStats && (
                <>
                  <Group gap={4}>
                    <Text size="xs" c="dimmed">Data Range:</Text>
                    <Text size="xs" c="white">{dataStats.min} – {dataStats.max} {datasetConfig?.unit}</Text>
                  </Group>
                  <Group gap={4}>
                    <Text size="xs" c="dimmed">Coverage:</Text>
                    <Text size="xs" c="white">
                      {dataStats.totalPixels > 0 ? ((dataStats.validPixels / dataStats.totalPixels) * 100).toFixed(1) : 0}% valid
                    </Text>
                  </Group>
                </>
              )}
            </Box>

            {/* Smoothing Control */}
            <Box>
              <Text size="xs" fw={600} c="cyan" mb={4}>Smoothing</Text>
              <Group gap="xs" align="center">
                <Text size="xs" c="dimmed" style={{ minWidth: 40 }}>
                  {smoothingLevel === 0 ? 'None' : smoothingLevel === 1 ? 'Light' : smoothingLevel === 2 ? 'Medium' : 'Strong'}
                </Text>
                <input
                  type="range"
                  min="0"
                  max="3"
                  value={smoothingLevel}
                  onChange={(e) => setSmoothingLevel(parseInt(e.target.value))}
                  style={{
                    flex: 1,
                    accentColor: '#4fd1c5',
                    cursor: 'pointer',
                  }}
                />
              </Group>
              <Text size="xs" c="dimmed" mt={2}>
                Blur passes: {smoothingLevel} (reduces grid cell edges)
              </Text>
            </Box>

            <Divider color="dark.5" />

            {/* Data Source Section */}
            <Box>
              <Text size="xs" fw={600} c="cyan" mb={4}>Data Source</Text>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Dataset:</Text>
                <Text size="xs" c="white">{datasetConfig?.source?.dataset}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Provider:</Text>
                <Text size="xs" c="white">{datasetConfig?.source?.provider}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Source:</Text>
                <Anchor
                  href={datasetConfig?.source?.url}
                  target="_blank"
                  size="xs"
                  c="cyan"
                  style={{ wordBreak: 'break-all' }}
                >
                  {datasetConfig?.source?.name} ↗
                </Anchor>
              </Group>
            </Box>

            <Divider color="dark.5" />

            {/* Raw Data Section */}
            <Box>
              <Text size="xs" fw={600} c="cyan" mb={4}>Raw Data</Text>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Resolution:</Text>
                <Text size="xs" c="white">{datasetConfig?.rawData?.resolution}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Projection:</Text>
                <Text size="xs" c="white">{datasetConfig?.rawData?.projection}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Coverage:</Text>
                <Text size="xs" c="white">{datasetConfig?.rawData?.spatialCoverage}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Period:</Text>
                <Text size="xs" c="white">{datasetConfig?.rawData?.temporalCoverage}</Text>
              </Group>
            </Box>

            <Divider color="dark.5" />

            {/* Processing Section */}
            <Box>
              <Text size="xs" fw={600} c="cyan" mb={4}>Data Processing</Text>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Reprojection:</Text>
                <Text size="xs" c="white">{datasetConfig?.processing?.reprojection}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Pyramid:</Text>
                <Text size="xs" c="white">{datasetConfig?.processing?.pyramid}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Resampling:</Text>
                <Text size="xs" c="white">{datasetConfig?.processing?.resampling}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Format:</Text>
                <Text size="xs" c="white">{datasetConfig?.processing?.format}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Chunking:</Text>
                <Text size="xs" c="white">{datasetConfig?.processing?.chunking}</Text>
              </Group>
            </Box>

            <Divider color="dark.5" />

            {/* Basemap Section */}
            <Box>
              <Text size="xs" fw={600} c="cyan" mb={4}>Basemap</Text>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Provider:</Text>
                <Text size="xs" c="white">{TECH_STACK.basemap.provider}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Style:</Text>
                <Text size="xs" c="white">{TECH_STACK.basemap.style}</Text>
              </Group>
              <Text size="xs" c="dimmed" mt={2}>{TECH_STACK.basemap.attribution}</Text>
            </Box>

            <Divider color="dark.5" />

            {/* Technology Stack Section */}
            <Box>
              <Text size="xs" fw={600} c="cyan" mb={4}>Browser Technologies</Text>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Visualization:</Text>
                <Text size="xs" c="white">{TECH_STACK.browser.visualization}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Zarr Loader:</Text>
                <Text size="xs" c="white">{TECH_STACK.browser.zarrLoader}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">UI Framework:</Text>
                <Text size="xs" c="white">{TECH_STACK.browser.ui}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Colormap:</Text>
                <Text size="xs" c="white">{TECH_STACK.browser.colorMapping}</Text>
              </Group>
            </Box>

            <Box>
              <Text size="xs" fw={600} c="cyan" mb={4}>Backend Technologies</Text>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Framework:</Text>
                <Text size="xs" c="white">{TECH_STACK.backend.framework}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Data Serving:</Text>
                <Text size="xs" c="white">{TECH_STACK.backend.dataServing}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Processing:</Text>
                <Text size="xs" c="white">{TECH_STACK.backend.processing}</Text>
              </Group>
            </Box>

            {/* Current Zarr URL */}
            <Box>
              <Text size="xs" fw={600} c="cyan" mb={4}>Current Data URL</Text>
              <Anchor
                href={`${API_URL}${datasetConfig?.path}/${currentLOD}/`}
                target="_blank"
                size="xs"
                c="cyan"
                style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}
              >
                {API_URL}{datasetConfig?.path}/{currentLOD}/ ↗
              </Anchor>
            </Box>

            {error && (
              <Text size="xs" c="red" mt={4}>
                Error: {error}
              </Text>
            )}
          </Stack>
        </Collapse>
      </Paper>
        )}
      </Transition>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsOpen && !isFullScreen}
        onClose={() => setSettingsOpen(false)}
        currentPalette={colourPalette}
        onPaletteChange={setColourPalette}
      />

      {/* Control Panel - Top Left (hidden in full-screen mode) */}
      <Transition mounted={!isFullScreen} transition="slide-right" duration={300}>
        {(styles) => (
      <Paper
        id="main-controls"
        role="region"
        aria-label="Dataset controls"
        shadow="lg"
        p="md"
        radius="md"
        className="ecv-control"
        tabIndex={-1}
        style={{
          ...styles,
          position: 'absolute',
          top: 20,
          left: 20,
          background: 'rgba(26, 26, 46, 0.95)',
          backdropFilter: 'blur(20px)',
          width: 300,
          zIndex: 1000,
          border: '1px solid rgba(79, 209, 197, 0.2)',
        }}
      >
        {/* App Title - clickable to return to basemap (home) */}
        <div style={{ marginBottom: 16 }}>
          <Text
            size="lg"
            fw={700}
            onClick={() => {
              setImageUrl(null);  // Clear data overlay
              setSelectedDataset(null);  // Reset dataset selector
              setShowWelcome(true);  // Show welcome screen
            }}
            style={{
              background: 'linear-gradient(135deg, #4fd1c5 0%, #63b3ed 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.5px',
              cursor: 'pointer',
              transition: 'opacity 0.2s ease',
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            RegexFlow ECV Explorer
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Proof of Concept — ECMWF CJS2_231
          </Text>
          <Text size="xs" c="dimmed" style={{ opacity: 0.6, fontStyle: 'italic' }}>
            Interactive Visualisation of Essential Climate Variables
          </Text>
        </div>

        <Stack gap="sm">
          <Select
            label="Dataset"
            size="xs"
            placeholder="Select dataset"
            value={selectedDataset}
            aria-label="Select climate dataset to visualise"
            onChange={(value) => {
              if (!value) return; // Guard against null
              console.log('[DATASET] Switching to:', value);
              // Start load timer
              setLoadStartTime(performance.now());
              setLoadEndTime(null);
              setLoadDuration(null);
              setShowWelcome(false); // Dismiss welcome when dataset selected
              if ((value === 'sea_ice' || value === 'sea_ice_with_quality') && onPolarView) {
                // Switch to polar view for sea ice datasets
                onPolarView(value);
              } else {
                setSelectedDataset(value);
                // Reset year to valid range for new dataset
                const newConfig = DATASETS[value];
                if (newConfig?.yearRange) {
                  const currentYear = selectedYear;
                  if (currentYear < newConfig.yearRange.start || currentYear > newConfig.yearRange.end) {
                    setSelectedYear(newConfig.yearRange.end); // Default to most recent year
                  }
                }
              }
            }}
            data={Object.entries(DATASETS).map(([key, cfg]) => ({
              value: key,
              label: (key === 'sea_ice' || key === 'sea_ice_with_quality') ? `${cfg.name} (Polar View)` : cfg.name,
            }))}
            styles={{
              input: { background: 'rgba(255,255,255,0.05)' },
              dropdown: { zIndex: 10000 }
            }}
            comboboxProps={{ zIndex: 10000 }}
          />

          <Select
            label="Colormap"
            size="xs"
            value={colormapName}
            onChange={setColormapName}
            aria-label="Select colour palette for data visualisation"
            data={Object.keys(COLORMAPS).map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
            styles={{
              input: { background: 'rgba(255,255,255,0.05)' },
              dropdown: { zIndex: 10000 }
            }}
            comboboxProps={{ zIndex: 10000 }}
          />

          {/* Data Opacity Slider */}
          <div role="group" aria-labelledby="opacity-label">
            <Text size="xs" c="dimmed" mb={4} id="opacity-label">Data Opacity: {Math.round(userOpacity * 100)}%</Text>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(userOpacity * 100)}
              onChange={(e) => setUserOpacity(parseInt(e.target.value) / 100)}
              aria-label="Adjust data layer opacity"
              aria-valuenow={Math.round(userOpacity * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{
                width: '100%',
                accentColor: '#4fd1c5',
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Region Presets - Quick navigation */}
          <div role="group" aria-label="Quick navigation views">
            <Text size="xs" c="dimmed" mb={4}>Quick Views</Text>
            <Group gap={4}>
              {Object.entries(REGION_PRESETS).map(([key, preset]) => (
                <MantineTooltip key={key} label={`Fly to ${preset.label}`} position="top" zIndex={10001}>
                  <ActionIcon
                    variant="light"
                    color="cyan"
                    size="sm"
                    onClick={() => setViewState(prev => ({
                      ...prev,
                      latitude: preset.latitude,
                      longitude: preset.longitude,
                      zoom: preset.zoom,
                      transitionDuration: 1000,
                    }))}
                    aria-label={`Navigate to ${preset.label} view`}
                  >
                    <Text size="xs" fw={600}>
                      {key === 'global' ? '🌍' : key === 'europe' ? '🇪🇺' : key === 'arctic' ? '❄️' : key === 'sahel' ? '🏜️' : '🦘'}
                    </Text>
                  </ActionIcon>
                </MantineTooltip>
              ))}
              <MantineTooltip label={isFullScreen ? 'Exit Full Screen' : 'Full Screen (hide controls)'} position="top" zIndex={10001}>
                <ActionIcon
                  variant={isFullScreen ? 'filled' : 'light'}
                  color="gray"
                  size="sm"
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  aria-label={isFullScreen ? 'Exit full screen' : 'Enter full screen'}
                >
                  <Text size="xs" fw={600}>{isFullScreen ? '⊠' : '⛶'}</Text>
                </ActionIcon>
              </MantineTooltip>
              {/* Globe View button - only show if feature enabled and onGlobeView provided */}
              {getFeatureFlags().enableGlobe && onGlobeView && (
                <MantineTooltip label="3D Globe View" position="top" zIndex={10001}>
                  <ActionIcon
                    variant="light"
                    color="teal"
                    size="sm"
                    onClick={() => onGlobeView({
                      imageUrl,
                      bounds: [-180, -85, 180, 85], // Web Mercator bounds
                      datasetName: datasetConfig?.name || 'Climate Data',
                      loading,
                      loadDuration,
                    })}
                    aria-label="Switch to 3D globe view"
                  >
                    <Text size="xs" fw={600}>🌐</Text>
                  </ActionIcon>
                </MantineTooltip>
              )}
              <MantineTooltip label="Settings" position="top" zIndex={10001}>
                <ActionIcon
                  variant={settingsOpen ? 'filled' : 'light'}
                  color="cyan"
                  size="sm"
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  aria-label="Open settings panel"
                >
                  <Text size="xs" fw={600}>⚙</Text>
                </ActionIcon>
              </MantineTooltip>
              {/* Draw Region button - show when dataset is loaded */}
              {selectedDataset && (
                <MantineTooltip
                  label={regionComputation.isDrawing ? 'Cancel drawing (Esc)' : 'Draw region to compute mean'}
                  position="top"
                  zIndex={10001}
                >
                  <ActionIcon
                    variant={regionComputation.isDrawing ? 'filled' : 'light'}
                    color={regionComputation.isDrawing ? 'yellow' : 'orange'}
                    size="sm"
                    onClick={() => {
                      if (regionComputation.isDrawing) {
                        regionComputation.clearRegion();
                      } else {
                        regionComputation.startDrawing();
                      }
                    }}
                    aria-label={regionComputation.isDrawing ? 'Cancel region drawing' : 'Start drawing region'}
                  >
                    <Text size="xs" fw={600}>{regionComputation.isDrawing ? '✕' : '⬡'}</Text>
                  </ActionIcon>
                </MantineTooltip>
              )}
            </Group>
          </div>

          {/* Time slider - unified for multi-year, simple for single-year */}
          <div>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={600} c="white">
                {datasetConfig?.isMultiYear
                  ? `${MONTHS[timeIndex]} ${selectedYear}`
                  : `${MONTHS[timeIndex]} 2023`}
              </Text>
              <Group gap={4}>
                {datasetConfig?.isMultiYear && (
                  <Badge size="xs" variant="light" color="teal">
                    {datasetConfig.yearRange.end - datasetConfig.yearRange.start + 1} years
                  </Badge>
                )}
                <MantineTooltip label={isPlaying ? 'Pause' : 'Play animation'} position="top" zIndex={10001}>
                  <ActionIcon
                    variant={isPlaying ? 'filled' : 'light'}
                    color="cyan"
                    size="sm"
                    onClick={() => setIsPlaying(!isPlaying)}
                    aria-label={isPlaying ? 'Pause time animation' : 'Play time animation'}
                  >
                    <Text size="xs" fw={700}>{isPlaying ? '⏸' : '▶'}</Text>
                  </ActionIcon>
                </MantineTooltip>
              </Group>
            </Group>

            {datasetConfig?.isMultiYear ? (
              /* Combined year+month slider for multi-year: 0-899 (75 years × 12 months) */
              <Slider
                value={(selectedYear - datasetConfig.yearRange.start) * 12 + timeIndex}
                onChange={(val) => {
                  const yearOffset = Math.floor(val / 12);
                  const monthOffset = val % 12;
                  setSelectedYear(datasetConfig.yearRange.start + yearOffset);
                  setTimeIndex(monthOffset);
                  if (isPlaying) setIsPlaying(false);
                }}
                min={0}
                max={(datasetConfig.yearRange.end - datasetConfig.yearRange.start + 1) * 12 - 1}
                step={1}
                marks={[
                  { value: 0, label: '1950' },
                  { value: 30 * 12, label: '1980' },
                  { value: 50 * 12, label: '2000' },
                  { value: 70 * 12, label: '2020' },
                ]}
                color="cyan"
                size="sm"
                aria-label="Time period selector: use arrow keys to change month and year"
              />
            ) : (
              /* Simple month slider for single-year datasets */
              <Slider
                value={timeIndex}
                onChange={(val) => {
                  setTimeIndex(val);
                  if (isPlaying) setIsPlaying(false);
                }}
                min={0}
                max={11}
                step={1}
                marks={[
                  { value: 0, label: 'Jan' },
                  { value: 6, label: 'Jul' },
                  { value: 11, label: 'Dec' },
                ]}
                color="cyan"
                size="sm"
                aria-label="Month selector: use arrow keys to change month"
              />
            )}
          </div>
        </Stack>

        {/* Footer info */}
        <div style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}>
          <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
            {datasetConfig?.description || 'Climate Data'}
          </Text>
          <Group gap={8} mt={8}>
            <Badge
              size="xs"
              variant="dot"
              color="cyan"
              style={{ background: 'rgba(79, 209, 197, 0.1)' }}
            >
              {datasetConfig?.maxLevel + 1} LOD levels
            </Badge>
            <Badge
              size="xs"
              variant="dot"
              color="blue"
              style={{ background: 'rgba(99, 179, 237, 0.1)' }}
            >
              Zarr v2
            </Badge>
          </Group>
        </div>
      </Paper>
        )}
      </Transition>

      {/* Legend - Beautiful vertical gradient (hidden in full-screen mode) */}
      <Transition mounted={!isFullScreen} transition="slide-up" duration={300}>
        {(legendStyles) => (
      <Paper
        shadow="xl"
        p="md"
        radius="md"
        className="ecv-control"
        style={{
          ...legendStyles,
          position: 'absolute',
          bottom: 20,
          right: 20,
          background: 'rgba(26, 26, 46, 0.95)',
          backdropFilter: 'blur(20px)',
          zIndex: 1000,
          border: '1px solid rgba(79, 209, 197, 0.2)',
        }}
      >
        <Text size="xs" fw={600} c="cyan" mb={8}>{datasetConfig?.name}</Text>
        <Group gap={8} align="flex-start">
          <Stack gap={0} align="center">
            <Text size="xs" c="white" fw={500}>{formatLegendValue(colorRange.vmax, selectedDataset)}</Text>
            <div style={{
              width: 16,
              height: 100,
              background: `linear-gradient(to bottom, ${
                [...(COLORMAPS[colormapName] || COLORMAPS.viridis)].reverse()
                  .map((c, i, arr) => `rgb(${c[0]},${c[1]},${c[2]}) ${i/(arr.length-1)*100}%`)
                  .join(', ')
              })`,
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              margin: '4px 0',
            }} />
            <Text size="xs" c="white" fw={500}>{formatLegendValue(colorRange.vmin, selectedDataset)}</Text>
          </Stack>
          <Text size="xs" c="dimmed" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            {datasetConfig?.unit}
          </Text>
        </Group>
      </Paper>
        )}
      </Transition>

      {/* Full-screen exit button (only shown in full-screen mode) */}
      <Transition mounted={isFullScreen} transition="fade" duration={200}>
        {(exitStyles) => (
          <ActionIcon
            style={{
              ...exitStyles,
              position: 'absolute',
              top: 20,
              right: 20,
              zIndex: 1100,
            }}
            variant="filled"
            color="dark"
            size="lg"
            radius="md"
            onClick={() => setIsFullScreen(false)}
          >
            <Text size="sm" fw={700}>✕</Text>
          </ActionIcon>
        )}
      </Transition>

      {/* Elegant loading indicator - thin progress line */}
      <Transition mounted={loading} transition="fade" duration={200}>
        {(styles) => (
          <div style={{
            ...styles,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            zIndex: 1200,
            overflow: 'hidden',
          }}>
            <div
              className="shimmer-loading"
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, transparent, #4fd1c5, transparent)',
                backgroundSize: '200% 100%',
              }}
            />
          </div>
        )}
      </Transition>

      {/* Timeseries Chart Panel - Slides in smoothly */}
      <Transition mounted={clickedPoint !== null || timeseriesLoading} transition="slide-right" duration={300}>
        {(styles) => (
          <Paper
            shadow="xl"
            p="md"
            radius="md"
            className="ecv-control"
            style={{
              ...styles,
              position: 'absolute',
              bottom: 20,
              left: 20,
              width: 420,
              height: 300,
              background: 'rgba(26, 26, 46, 0.95)',
              backdropFilter: 'blur(20px)',
              zIndex: 1000,
              border: '1px solid rgba(79, 209, 197, 0.3)',
            }}
          >
            <Group justify="space-between" mb="xs">
              <div>
                <Text size="sm" fw={600} c="cyan">
                  {datasetConfig?.name} Timeseries{datasetConfig?.isMultiYear && ` (${selectedYear})`}
                </Text>
                {clickedPoint && (
                  <Text size="xs" c="dimmed">
                    {clickedPoint.lat.toFixed(2)}°N, {clickedPoint.lng.toFixed(2)}°E
                  </Text>
                )}
              </div>
              <CloseButton
                size="sm"
                className="ecv-button"
                onClick={() => {
                  setClickedPoint(null);
                  setTimeseries(null);
                }}
                style={{ color: '#666' }}
              />
            </Group>

            {timeseriesLoading ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: 200,
              }}>
                <div className="pulse-loading" style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'rgba(79, 209, 197, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#4fd1c5',
                  }} />
                </div>
                <Text size="xs" c="dimmed" mt={12}>Loading timeseries...</Text>
              </div>
            ) : timeseries ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timeseries} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#888', fontSize: 10 }}
                  axisLine={{ stroke: '#444' }}
                />
                <YAxis
                  domain={[0, 'auto']}
                  tick={{ fill: '#888', fontSize: 10 }}
                  axisLine={{ stroke: '#444' }}
                  tickFormatter={(v) => v.toFixed(selectedDataset === 'radiation_budget' ? 0 : 2)}
                  label={{
                    value: datasetConfig?.unit || '',
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#888',
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(0,0,0,0.9)',
                    border: '1px solid #4fd1c5',
                    borderRadius: 4,
                  }}
                  labelStyle={{ color: '#4fd1c5' }}
                  formatter={(value) => [
                    value != null ? `${value.toFixed(selectedDataset === 'radiation_budget' ? 1 : 4)} ${datasetConfig?.unit}` : 'N/A',
                    datasetConfig?.name
                  ]}
                />
                <ReferenceLine x={MONTHS[timeIndex]} stroke="#4fd1c5" strokeDasharray="5 5" />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#4fd1c5"
                  strokeWidth={2}
                  dot={{ fill: '#4fd1c5', r: 3 }}
                  activeDot={{ r: 5, fill: '#fff' }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
            ) : (
              <Text size="sm" c="dimmed" ta="center" mt="xl">
                No data available for this location (ocean or missing data)
              </Text>
            )}
          </Paper>
        )}
      </Transition>

      {/* Region Computation UI */}
      <DrawingInstructions
        isDrawing={regionComputation.isDrawing}
        vertexCount={regionComputation.vertexCount}
      />

      <RegionResultCallout
        result={regionComputation.computeResult}
        polygon={regionComputation.closedPolygon}
        onClear={regionComputation.clearRegion}
        unit={datasetConfig?.unit || ''}
      />
    </div>
  );
}

export default ZarrMap;
