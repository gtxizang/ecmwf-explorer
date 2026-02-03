/**
 * LeafletUnifiedMap - Unified Leaflet-based map for all projections
 *
 * Uses Leaflet + proj4leaflet to support:
 * - EPSG:3857 (Web Mercator) for soil moisture, fire, radiation
 * - EPSG:3413 (Polar Stereographic) for sea ice
 *
 * Single renderer architecture - no deck.gl dependency
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'proj4';
import 'proj4leaflet';
import proj4 from 'proj4';
import * as zarr from 'zarrita';
import {
  Paper,
  Text,
  Select,
  Slider,
  Group,
  Stack,
  Badge,
  ActionIcon,
  Transition,
  Collapse,
  Box,
  Divider,
  Anchor,
  CloseButton,
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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ============================================================================
// PROJECTION DEFINITIONS
// ============================================================================

// EPSG:3857 - Web Mercator (standard web map projection)
const EPSG3857_DEF = '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs';

// EPSG:3413 - NSIDC Sea Ice Polar Stereographic North
const EPSG3413_DEF = '+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';

// Register projections with proj4
proj4.defs('EPSG:3857', EPSG3857_DEF);
proj4.defs('EPSG:3413', EPSG3413_DEF);

// ============================================================================
// CRS CONFIGURATIONS
// ============================================================================

// Web Mercator CRS config
const WEB_MERCATOR_CONFIG = {
  // Standard Web Mercator bounds
  bounds: {
    xmin: -20037508.34,
    ymin: -20037508.34,
    xmax: 20037508.34,
    ymax: 20037508.34,
  },
  // Standard Web Mercator resolutions (256px tiles)
  resolutions: (() => {
    const resolutions = [];
    for (let i = 0; i <= 18; i++) {
      resolutions.push(20037508.34 * 2 / 256 / Math.pow(2, i));
    }
    return resolutions;
  })(),
  origin: [-20037508.34, 20037508.34],
};

// Polar Stereographic CRS config (NASA GIBS compatible)
const POLAR_CONFIG = {
  bounds: {
    xmin: -4194304,
    ymin: -4194304,
    xmax: 4194304,
    ymax: 4194304,
  },
  resolutions: [8192, 4096, 2048, 1024, 512, 256],
  origin: [-4194304, 4194304],
  tileSize: 512,
};

// Sea ice data bounds (from processing - different from map bounds)
const SEA_ICE_DATA_BOUNDS = {
  xmin: -3850000,
  ymin: -5350000,
  xmax: 3750000,
  ymax: 5850000,
};

// ============================================================================
// DATASET CONFIGURATIONS
// ============================================================================

const DATASETS = {
  soil_moisture_multiyear: {
    name: 'Soil Moisture ERA5',
    path: '/zarr/soil_moisture_multiyear',
    variable: 'soil_moisture',
    projection: 'EPSG:3857',
    isMultiYear: true,
    yearRange: { start: 1988, end: 2023 },
    maxLevel: 4,
    colormap: 'soil',
    vmin: 0.05,
    vmax: 0.5,
    unit: 'm³/m³',
    description: 'ERA5 Volumetric Soil Water Layer 1',
  },
  radiation_budget: {
    name: 'Solar Radiation ERA5',
    path: '/zarr/radiation_multiyear',
    variable: 'solar_radiation',
    projection: 'EPSG:3857',
    isMultiYear: true,
    yearRange: { start: 1988, end: 2023 },
    maxLevel: 3,
    colormap: 'radiation',
    vmin: 0,
    vmax: 25000000,
    unit: 'J/m²',
    description: 'Surface Solar Radiation Downwards',
  },
  fire_burned_area: {
    name: 'Fire Burned Area',
    path: '/zarr/fire_multiyear',
    variable: 'burned_area',
    projection: 'EPSG:3857',
    isMultiYear: true,
    yearRange: { start: 1988, end: 2023 },
    maxLevel: 4,
    colormap: 'fire',
    vmin: 0,
    vmax: 100,
    unit: '%',
    description: 'MODIS Burned Area',
  },
  satellite_radiation: {
    name: 'Solar Radiation Satellite',
    path: '/zarr/satellite_radiation',
    variable: 'solar_radiation',
    projection: 'EPSG:3857',
    isMultiYear: true,
    yearRange: { start: 2001, end: 2024 },
    maxLevel: 2,
    colormap: 'radiation',
    vmin: 0,
    vmax: 350,
    unit: 'W/m²',
    description: 'Surface Incoming Shortwave Radiation',
  },
  sea_ice: {
    name: 'Sea Ice (Polar View)',
    path: '/zarr/sea_ice_polar_multiyear',
    variable: 'ice_concentration',
    projection: 'EPSG:3413',
    isMultiYear: true,
    yearRange: { start: 1988, end: 2023 },
    maxLevel: 3,
    colormap: 'ice',
    vmin: 0,
    vmax: 100,
    unit: '%',
    description: 'Sea Ice Concentration',
  },
};

// ============================================================================
// COLORMAPS
// ============================================================================

const COLORMAPS = {
  soil: [
    [139, 90, 43], [160, 120, 70], [180, 150, 100], [160, 180, 120],
    [120, 180, 140], [80, 170, 160], [40, 150, 170], [20, 120, 180],
    [10, 80, 160], [5, 40, 130]
  ],
  radiation: [
    [20, 20, 60], [40, 40, 100], [60, 60, 140], [100, 80, 160],
    [140, 100, 160], [180, 120, 140], [220, 140, 100], [250, 180, 60],
    [255, 220, 40], [255, 255, 200]
  ],
  fire: [
    [80, 30, 10], [140, 45, 5], [180, 60, 0], [210, 80, 0],
    [235, 110, 0], [250, 140, 10], [255, 170, 30], [255, 200, 60],
    [255, 230, 100], [255, 255, 180]
  ],
  ice: [
    [10, 20, 40], [20, 40, 80], [40, 80, 140], [60, 120, 180],
    [100, 160, 210], [140, 190, 230], [180, 215, 245], [210, 235, 255],
    [240, 250, 255], [255, 255, 255]
  ],
};

// ============================================================================
// BASEMAP CONFIGURATIONS
// ============================================================================

const BASEMAPS = {
  'EPSG:3857': {
    url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    attribution: '&copy; CARTO, &copy; OpenStreetMap contributors',
    tileSize: 256,
  },
  'EPSG:3413': {
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3413/best/BlueMarble_NextGeneration/default/500m/{z}/{y}/{x}.jpeg',
    attribution: '&copy; NASA GIBS',
    tileSize: 512,
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function applyColormap(data, width, height, colormap, vmin, vmax) {
  const colors = COLORMAPS[colormap] || COLORMAPS.soil;
  const range = vmax - vmin;
  const numColors = colors.length;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const value = data[i];

    if (isNaN(value) || value === null || value === undefined || value <= vmin * 0.1) {
      rgba[idx] = 0;
      rgba[idx + 1] = 0;
      rgba[idx + 2] = 0;
      rgba[idx + 3] = 0;
      continue;
    }

    const normalized = Math.max(0, Math.min(1, (value - vmin) / range));
    const colorIdx = Math.min(numColors - 1, Math.floor(normalized * (numColors - 1)));
    const color = colors[colorIdx];

    rgba[idx] = color[0];
    rgba[idx + 1] = color[1];
    rgba[idx + 2] = color[2];
    rgba[idx + 3] = 200;
  }

  return rgba;
}

function findNearestIndex(arr, value) {
  let minDiff = Infinity;
  let nearestIdx = 0;
  for (let i = 0; i < arr.length; i++) {
    const diff = Math.abs(arr[i] - value);
    if (diff < minDiff) {
      minDiff = diff;
      nearestIdx = i;
    }
  }
  return nearestIdx;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LeafletUnifiedMap({ onShowWelcome }) {
  // Map refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const imageOverlayRef = useRef(null);
  const basemapLayerRef = useRef(null);

  // State
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [currentProjection, setCurrentProjection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timeIndex, setTimeIndex] = useState(0);
  const [selectedYear, setSelectedYear] = useState(2020);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [currentZoom, setCurrentZoom] = useState(2);
  const [techInfoOpen, setTechInfoOpen] = useState(true);
  const [loadDuration, setLoadDuration] = useState(null);
  const [opacity, setOpacity] = useState(0.85);
  const [dataShape, setDataShape] = useState(null);
  const [copied, setCopied] = useState(false);

  // Timeseries state
  const [clickedPoint, setClickedPoint] = useState(null);
  const [timeseries, setTimeseries] = useState(null);
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);
  const loadTimeseriesRef = useRef(null);

  // Get current dataset config
  const datasetConfig = selectedDataset ? DATASETS[selectedDataset] : null;
  const isPolar = datasetConfig?.projection === 'EPSG:3413';

  // ============================================================================
  // MAP INITIALIZATION
  // ============================================================================

  const initializeMap = useCallback((projection) => {
    if (!mapContainerRef.current) return;

    // Clean up existing map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      imageOverlayRef.current = null;
      basemapLayerRef.current = null;
    }

    let crs, center, zoom, minZoom, maxZoom;

    if (projection === 'EPSG:3413') {
      // Polar Stereographic
      crs = new L.Proj.CRS(
        'EPSG:3413',
        EPSG3413_DEF,
        {
          origin: POLAR_CONFIG.origin,
          resolutions: POLAR_CONFIG.resolutions,
          bounds: L.bounds(
            [POLAR_CONFIG.bounds.xmin, POLAR_CONFIG.bounds.ymin],
            [POLAR_CONFIG.bounds.xmax, POLAR_CONFIG.bounds.ymax]
          ),
        }
      );
      center = [80, 0];
      zoom = 1;
      minZoom = 0;
      maxZoom = 5;
    } else {
      // Web Mercator (default)
      crs = L.CRS.EPSG3857;
      center = [30, 0];
      zoom = 2;
      minZoom = 1;
      maxZoom = 10;
    }

    const map = L.map(mapContainerRef.current, {
      crs: crs,
      center: center,
      zoom: zoom,
      minZoom: minZoom,
      maxZoom: maxZoom,
      zoomControl: false,
      attributionControl: true,
    });

    // Add basemap
    const basemapConfig = BASEMAPS[projection] || BASEMAPS['EPSG:3857'];
    basemapLayerRef.current = L.tileLayer(basemapConfig.url, {
      tileSize: basemapConfig.tileSize || 256,
      attribution: basemapConfig.attribution,
      noWrap: projection !== 'EPSG:3413',
    }).addTo(map);

    // Add graticule for polar view
    if (projection === 'EPSG:3413') {
      const graticuleStyle = { color: 'rgba(79, 209, 197, 0.25)', weight: 1 };
      [60, 70, 80].forEach(lat => {
        const points = [];
        for (let lon = -180; lon <= 180; lon += 3) {
          points.push([lat, lon]);
        }
        L.polyline(points, graticuleStyle).addTo(map);
      });
      for (let lon = -180; lon < 180; lon += 45) {
        L.polyline([[50, lon], [90, lon]], graticuleStyle).addTo(map);
      }
    }

    // Event handlers
    map.on('zoomend', () => {
      const z = map.getZoom();
      setCurrentZoom(z);
      // Don't cap here - let loadData cap based on dataset's maxLevel
      const newLevel = Math.max(0, Math.floor(z) + 1);
      setCurrentLevel(newLevel);
    });

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (loadTimeseriesRef.current) {
        loadTimeseriesRef.current(lng, lat);
      }
    });

    mapInstanceRef.current = map;
    setCurrentProjection(projection);
    console.log(`[LEAFLET] Map initialized with ${projection}`);
  }, []);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = useCallback(async () => {
    if (!selectedDataset || !mapInstanceRef.current || !datasetConfig) return;

    setLoading(true);
    const startTime = performance.now();

    try {
      const maxLevel = datasetConfig.maxLevel || 3;
      const level = Math.min(currentLevel, maxLevel);
      const storePath = `${API_URL}${datasetConfig.path}/${level}`;
      console.log(`[LEAFLET] Loading ${selectedDataset} level ${level} (max: ${maxLevel})`);

      const store = new zarr.FetchStore(storePath);
      const root = zarr.root(store);
      const arr = await zarr.open(root.resolve(datasetConfig.variable), { kind: 'array' });

      const shape = arr.shape;
      let slice, height, width;

      if (datasetConfig.isMultiYear && shape.length === 4) {
        // Multi-year: [year, month, y, x]
        const yearArr = await zarr.open(root.resolve('year'), { kind: 'array' });
        const yearResult = await zarr.get(yearArr, [null]);
        const years = Array.from(yearResult.data).map(y => Number(y));
        const yearIndex = years.indexOf(selectedYear);

        if (yearIndex === -1) {
          console.error(`Year ${selectedYear} not found. Available years:`, years.slice(0, 5), '...', years.slice(-5));
          setLoading(false);
          return;
        }
        console.log(`[LEAFLET] Found year ${selectedYear} at index ${yearIndex}`);

        height = shape[2];
        width = shape[3];
        slice = await zarr.get(arr, [yearIndex, timeIndex, null, null]);
      } else if (shape.length === 3) {
        // Single year: [time, y, x]
        height = shape[1];
        width = shape[2];
        slice = await zarr.get(arr, [timeIndex, null, null]);
      } else {
        console.error('Unexpected data shape:', shape);
        setLoading(false);
        return;
      }

      console.log(`[LEAFLET] Data shape: ${width}x${height}`);
      setDataShape({ width, height });
      const rawData = slice.data;
      const rgba = applyColormap(
        rawData, width, height,
        datasetConfig.colormap,
        datasetConfig.vmin,
        datasetConfig.vmax
      );

      // Create image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const imageData = new ImageData(rgba, width, height);
      ctx.putImageData(imageData, 0, 0);
      const dataUrl = canvas.toDataURL();

      // Get data bounds
      let latLngBounds;
      if (isPolar) {
        const sw = mapInstanceRef.current.options.crs.unproject(
          L.point(SEA_ICE_DATA_BOUNDS.xmin, SEA_ICE_DATA_BOUNDS.ymin)
        );
        const ne = mapInstanceRef.current.options.crs.unproject(
          L.point(SEA_ICE_DATA_BOUNDS.xmax, SEA_ICE_DATA_BOUNDS.ymax)
        );
        latLngBounds = L.latLngBounds(sw, ne);
      } else {
        // Web Mercator - get bounds from Zarr coordinates
        const xArr = await zarr.open(root.resolve('x'), { kind: 'array' });
        const yArr = await zarr.open(root.resolve('y'), { kind: 'array' });
        const xResult = await zarr.get(xArr);
        const yResult = await zarr.get(yArr);
        const xCoords = Array.from(xResult.data);
        const yCoords = Array.from(yResult.data);

        // Convert Web Mercator to lat/lng
        const west = xCoords[0] * 180 / 20037508.34;
        const east = xCoords[xCoords.length - 1] * 180 / 20037508.34;
        const south = (Math.atan(Math.exp(yCoords[yCoords.length - 1] * Math.PI / 20037508.34)) * 360 / Math.PI) - 90;
        const north = (Math.atan(Math.exp(yCoords[0] * Math.PI / 20037508.34)) * 360 / Math.PI) - 90;

        latLngBounds = L.latLngBounds([south, west], [north, east]);
      }

      // Update or create overlay
      if (imageOverlayRef.current) {
        imageOverlayRef.current.setUrl(dataUrl);
        imageOverlayRef.current.setBounds(latLngBounds);
        imageOverlayRef.current.setOpacity(opacity);
      } else {
        imageOverlayRef.current = L.imageOverlay(dataUrl, latLngBounds, {
          opacity: opacity,
          interactive: false,
        }).addTo(mapInstanceRef.current);
      }

      const duration = performance.now() - startTime;
      setLoadDuration(duration);
      console.log(`[LEAFLET] Loaded in ${duration.toFixed(0)}ms`);

    } catch (error) {
      console.error('[LEAFLET] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDataset, datasetConfig, currentLevel, timeIndex, selectedYear, isPolar]);

  // ============================================================================
  // TIMESERIES LOADING
  // ============================================================================

  const loadTimeseries = useCallback(async (lng, lat) => {
    if (!selectedDataset || !datasetConfig) return;

    setTimeseriesLoading(true);
    setClickedPoint({ lng, lat });

    try {
      const level = 2;
      const storePath = `${API_URL}${datasetConfig.path}/${level}`;
      const store = new zarr.FetchStore(storePath);
      const root = zarr.root(store);
      const arr = await zarr.open(root.resolve(datasetConfig.variable), { kind: 'array' });

      // Get coordinate arrays
      const xArr = await zarr.open(root.resolve('x'), { kind: 'array' });
      const yArr = await zarr.open(root.resolve('y'), { kind: 'array' });
      const xResult = await zarr.get(xArr);
      const yResult = await zarr.get(yArr);
      const xCoords = Array.from(xResult.data);
      const yCoords = Array.from(yResult.data);

      // Convert click coordinates to data coordinates
      let dataX, dataY;
      if (isPolar) {
        [dataX, dataY] = proj4('EPSG:4326', 'EPSG:3413', [lng, lat]);
      } else {
        // Web Mercator
        dataX = lng * 20037508.34 / 180;
        const latRad = lat * Math.PI / 180;
        dataY = Math.log(Math.tan(Math.PI / 4 + latRad / 2)) * 20037508.34 / Math.PI;
      }

      const xIdx = findNearestIndex(xCoords, dataX);
      const yIdx = findNearestIndex(yCoords, dataY);

      console.log(`[TIMESERIES] Click (${lat.toFixed(2)}, ${lng.toFixed(2)}) -> pixel (${xIdx}, ${yIdx})`);

      // Load all months
      const shape = arr.shape;
      let timeseriesData = [];

      if (datasetConfig.isMultiYear && shape.length === 4) {
        const yearArr = await zarr.open(root.resolve('year'), { kind: 'array' });
        const yearResult = await zarr.get(yearArr);
        const years = Array.from(yearResult.data).map(y => Number(y));
        const yearIndex = years.indexOf(selectedYear);

        if (yearIndex !== -1) {
          const result = await zarr.get(arr, [yearIndex, null, yIdx, xIdx]);
          const values = result.data;
          for (let m = 0; m < 12; m++) {
            const value = values[m];
            timeseriesData.push({
              month: MONTHS[m],
              monthIdx: m,
              value: (isNaN(value) || value < datasetConfig.vmin * 0.1) ? null : Number(value),
            });
          }
        }
      } else {
        const result = await zarr.get(arr, [null, yIdx, xIdx]);
        const values = result.data;
        for (let m = 0; m < values.length && m < 12; m++) {
          const value = values[m];
          timeseriesData.push({
            month: MONTHS[m],
            monthIdx: m,
            value: (isNaN(value) || value < datasetConfig.vmin * 0.1) ? null : Number(value),
          });
        }
      }

      const hasValidData = timeseriesData.some(d => d.value !== null);
      setTimeseries(hasValidData ? timeseriesData : null);

    } catch (error) {
      console.error('[TIMESERIES] Error:', error);
      setTimeseries(null);
    } finally {
      setTimeseriesLoading(false);
    }
  }, [selectedDataset, datasetConfig, selectedYear, isPolar]);

  // Keep ref in sync
  useEffect(() => {
    loadTimeseriesRef.current = loadTimeseries;
  }, [loadTimeseries]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Initialize map when projection changes
  useEffect(() => {
    const targetProjection = datasetConfig?.projection || 'EPSG:3857';
    if (currentProjection !== targetProjection) {
      initializeMap(targetProjection);
    }
  }, [datasetConfig, currentProjection, initializeMap]);

  // Load data when dataset/time changes
  useEffect(() => {
    if (selectedDataset && mapInstanceRef.current) {
      loadData();
    }
  }, [selectedDataset, currentLevel, timeIndex, selectedYear, loadData]);

  // Update opacity when it changes
  useEffect(() => {
    if (imageOverlayRef.current) {
      imageOverlayRef.current.setOpacity(opacity);
    }
  }, [opacity]);

  // Handle dataset change
  const handleDatasetChange = (value) => {
    // Clear existing overlay
    if (imageOverlayRef.current) {
      imageOverlayRef.current.remove();
      imageOverlayRef.current = null;
    }
    setClickedPoint(null);
    setTimeseries(null);
    setTimeIndex(0);

    const config = DATASETS[value];
    if (config?.isMultiYear) {
      // Use a year that's likely to exist (prefer middle or recent year)
      const startYear = config.yearRange?.start || 2000;
      const endYear = config.yearRange?.end || 2023;
      // Use year before the end to avoid edge cases
      const safeYear = Math.max(startYear, endYear - 1);
      setSelectedYear(safeYear);
      console.log(`[DATASET] Setting year to ${safeYear} for ${value}`);
    }

    setSelectedDataset(value);
  };

  // Zoom handlers
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  // Copy tech info to clipboard
  const copyTechInfo = () => {
    const maxLevel = datasetConfig?.maxLevel || 3;
    const effectiveLevel = Math.min(currentLevel, maxLevel);
    const info = `Tech Info (Leaflet Unified)
LOD: ${effectiveLevel} / ${maxLevel}
Zoom: ${currentZoom.toFixed(1)}
${dataShape ? `Data Size: ${dataShape.width} × ${dataShape.height} px (${(dataShape.width * dataShape.height / 1000).toFixed(0)}K pixels)` : ''}
Time: ${MONTHS[timeIndex]}${datasetConfig?.isMultiYear ? ` ${selectedYear}` : ''}
Load Time: ${loadDuration ? (loadDuration < 1000 ? `${loadDuration.toFixed(0)}ms` : `${(loadDuration / 1000).toFixed(2)}s`) : 'N/A'}
Opacity: ${Math.round(opacity * 100)}%

Dataset: ${datasetConfig?.name || 'None'}
Variable: ${datasetConfig?.variable || 'N/A'}
Range: ${datasetConfig ? `${datasetConfig.vmin} - ${datasetConfig.vmax} ${datasetConfig.unit}` : 'N/A'}
${datasetConfig?.isMultiYear ? `Years: ${datasetConfig.yearRange.start} - ${datasetConfig.yearRange.end}` : ''}

Renderer: Leaflet + proj4leaflet
CRS: ${currentProjection || 'None'}
Format: Zarr v2 + LOD Pyramids
Loader: zarrita.js`;

    navigator.clipboard.writeText(info).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', background: '#1a1a2e' }}>
      {/* Map container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Control Panel - Top Left */}
      <Paper
        shadow="lg"
        p="md"
        radius="md"
        style={{
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
        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <Text
            size="lg"
            fw={700}
            onClick={onShowWelcome}
            style={{
              background: 'linear-gradient(135deg, #4fd1c5 0%, #63b3ed 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              cursor: 'pointer',
            }}
          >
            ECV Explorer (Leaflet)
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Unified Leaflet Architecture
          </Text>
        </div>

        <Stack gap="sm">
          {/* Dataset selector */}
          <Select
            label="Dataset"
            size="xs"
            placeholder="Select dataset..."
            value={selectedDataset}
            onChange={handleDatasetChange}
            data={Object.entries(DATASETS).map(([key, cfg]) => ({
              value: key,
              label: cfg.name,
            }))}
            styles={{
              input: { background: 'rgba(255,255,255,0.05)' },
              dropdown: { zIndex: 10000 }
            }}
          />

          {/* Year slider (multi-year datasets) */}
          {datasetConfig?.isMultiYear && (
            <div>
              <Text size="xs" c="white" fw={500} mb={4}>
                Year: {selectedYear}
              </Text>
              <Slider
                value={selectedYear}
                onChange={setSelectedYear}
                min={datasetConfig.yearRange.start}
                max={datasetConfig.yearRange.end}
                step={1}
                marks={[
                  { value: datasetConfig.yearRange.start, label: String(datasetConfig.yearRange.start) },
                  { value: datasetConfig.yearRange.end, label: String(datasetConfig.yearRange.end) },
                ]}
                size="xs"
                color="cyan"
              />
            </div>
          )}

          {/* Time slider */}
          {selectedDataset && (
            <div>
              <Text size="xs" c="white" fw={500} mb={4}>
                Month: {MONTHS[timeIndex]}
              </Text>
              <Slider
                value={timeIndex}
                onChange={setTimeIndex}
                min={0}
                max={11}
                step={1}
                marks={[
                  { value: 0, label: 'Jan' },
                  { value: 6, label: 'Jul' },
                  { value: 11, label: 'Dec' },
                ]}
                size="xs"
                color="cyan"
              />
            </div>
          )}

          {/* Dataset info */}
          {datasetConfig && (
            <Text size="xs" c="dimmed">
              {datasetConfig.description}
            </Text>
          )}

          {/* Badges */}
          <Group gap={4}>
            {currentProjection && (
              <Badge size="xs" color={isPolar ? 'grape' : 'blue'} variant="light">
                {currentProjection}
              </Badge>
            )}
            <Badge size="xs" color="cyan" variant="light">LEAFLET</Badge>
            <Badge size="xs" color="teal" variant="light">ZARR</Badge>
          </Group>
        </Stack>
      </Paper>

      {/* Tech Info Panel - Top Right */}
      <Paper
        shadow="lg"
        p="sm"
        radius="md"
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'rgba(26, 26, 46, 0.95)',
          backdropFilter: 'blur(20px)',
          zIndex: 1000,
          minWidth: 280,
          maxWidth: 320,
          border: '1px solid rgba(79, 209, 197, 0.2)',
        }}
      >
        <Group gap="sm" justify="space-between">
          <Text size="xs" fw={500} c="white" style={{ cursor: 'pointer' }} onClick={() => setTechInfoOpen(!techInfoOpen)}>Tech Info</Text>
          <Group gap="xs">
            <Badge color="cyan" size="sm">LOD {Math.min(currentLevel, datasetConfig?.maxLevel || 4)}</Badge>
            <Badge color="teal" size="sm">Z {currentZoom.toFixed(1)}</Badge>
            {loadDuration !== null && (
              <Badge color={loadDuration < 2000 ? 'green' : 'red'} size="sm">
                {loadDuration < 1000 ? `${loadDuration.toFixed(0)}ms` : `${(loadDuration / 1000).toFixed(2)}s`}
              </Badge>
            )}
            {loading && <Badge color="yellow" size="sm">Loading...</Badge>}
            <ActionIcon
              variant="subtle"
              color={copied ? 'green' : 'gray'}
              size="xs"
              onClick={(e) => { e.stopPropagation(); copyTechInfo(); }}
              title="Copy tech info"
            >
              {copied ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20,6 9,17 4,12" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </ActionIcon>
          </Group>
        </Group>

        <Collapse in={techInfoOpen}>
          <Divider my="xs" color="rgba(79, 209, 197, 0.2)" />
          <Stack gap="xs">
            {/* Layer Opacity Control */}
            <Box>
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="cyan" fw={500}>Layer Opacity</Text>
                <Text size="xs" c="dimmed">{Math.round(opacity * 100)}%</Text>
              </Group>
              <Slider
                value={opacity}
                onChange={setOpacity}
                min={0}
                max={1}
                step={0.05}
                size="xs"
                color="cyan"
              />
            </Box>

            <Divider color="rgba(79, 209, 197, 0.1)" />

            {/* Current View Info */}
            <Box>
              <Text size="xs" c="cyan" fw={500} mb={2}>Current View</Text>
              <Group gap={4}>
                <Text size="xs" c="dimmed">LOD Level:</Text>
                <Text size="xs" c="white">{Math.min(currentLevel, datasetConfig?.maxLevel || 4)} / {datasetConfig?.maxLevel || 4}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Zoom:</Text>
                <Text size="xs" c="white">{currentZoom.toFixed(1)}</Text>
              </Group>
              {dataShape && (
                <Group gap={4}>
                  <Text size="xs" c="dimmed">Data Size:</Text>
                  <Text size="xs" c="white">{dataShape.width} × {dataShape.height} px</Text>
                </Group>
              )}
              {dataShape && (
                <Group gap={4}>
                  <Text size="xs" c="dimmed">Pixels:</Text>
                  <Text size="xs" c="white">{(dataShape.width * dataShape.height / 1000).toFixed(0)}K</Text>
                </Group>
              )}
              <Group gap={4}>
                <Text size="xs" c="dimmed">Time:</Text>
                <Text size="xs" c="white">{MONTHS[timeIndex]} {datasetConfig?.isMultiYear ? selectedYear : ''}</Text>
              </Group>
            </Box>

            <Divider color="rgba(79, 209, 197, 0.1)" />

            {/* Dataset Info */}
            {datasetConfig && (
              <Box>
                <Text size="xs" c="cyan" fw={500} mb={2}>Dataset</Text>
                <Group gap={4}>
                  <Text size="xs" c="dimmed">Name:</Text>
                  <Text size="xs" c="white">{datasetConfig.name}</Text>
                </Group>
                <Group gap={4}>
                  <Text size="xs" c="dimmed">Variable:</Text>
                  <Text size="xs" c="white">{datasetConfig.variable}</Text>
                </Group>
                <Group gap={4}>
                  <Text size="xs" c="dimmed">Range:</Text>
                  <Text size="xs" c="white">{datasetConfig.vmin} - {datasetConfig.vmax} {datasetConfig.unit}</Text>
                </Group>
                {datasetConfig.isMultiYear && datasetConfig.yearRange && (
                  <Group gap={4}>
                    <Text size="xs" c="dimmed">Years:</Text>
                    <Text size="xs" c="white">{datasetConfig.yearRange.start} - {datasetConfig.yearRange.end}</Text>
                  </Group>
                )}
              </Box>
            )}

            <Divider color="rgba(79, 209, 197, 0.1)" />

            {/* Technical Stack */}
            <Box>
              <Text size="xs" c="cyan" fw={500} mb={2}>Technical Stack</Text>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Renderer:</Text>
                <Text size="xs" c="white">Leaflet + proj4leaflet</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">CRS:</Text>
                <Text size="xs" c="white">{currentProjection || 'None'}</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Data Format:</Text>
                <Text size="xs" c="white">Zarr v2 + LOD Pyramids</Text>
              </Group>
              <Group gap={4}>
                <Text size="xs" c="dimmed">Loader:</Text>
                <Text size="xs" c="white">zarrita.js</Text>
              </Group>
            </Box>

            <Divider color="rgba(79, 209, 197, 0.1)" />

            {/* Architecture Note */}
            <Box>
              <Text size="xs" c="cyan" fw={500} mb={2}>Architecture</Text>
              <Text size="xs" c="dimmed">
                Single renderer supporting multiple CRS.
                Leaflet reinitializes when switching between
                Web Mercator (EPSG:3857) and Polar Stereographic (EPSG:3413).
              </Text>
            </Box>
          </Stack>
        </Collapse>
      </Paper>

      {/* Zoom Controls */}
      <Paper
        p="xs"
        radius="md"
        style={{
          position: 'absolute',
          bottom: 40,
          left: 20,
          background: 'rgba(26, 26, 46, 0.95)',
          backdropFilter: 'blur(20px)',
          zIndex: 1000,
          border: '1px solid rgba(79, 209, 197, 0.2)',
        }}
      >
        <Stack gap={4}>
          <ActionIcon variant="subtle" color="cyan" onClick={handleZoomIn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </ActionIcon>
          <ActionIcon variant="subtle" color="cyan" onClick={handleZoomOut}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </ActionIcon>
        </Stack>
      </Paper>

      {/* Legend */}
      {datasetConfig && (
        <Paper
          p="sm"
          radius="md"
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            background: 'rgba(26, 26, 46, 0.95)',
            backdropFilter: 'blur(20px)',
            zIndex: 1000,
            border: '1px solid rgba(79, 209, 197, 0.2)',
          }}
        >
          <Text size="xs" fw={600} c="cyan" mb={8}>{datasetConfig.name}</Text>
          <Group gap={8} align="flex-start">
            <Stack gap={0} align="center">
              <Text size="xs" c="white" fw={500}>{datasetConfig.vmax}</Text>
              <div style={{
                width: 16,
                height: 100,
                background: `linear-gradient(to bottom, ${
                  [...COLORMAPS[datasetConfig.colormap]].reverse()
                    .map((c, i, arr) => `rgb(${c[0]},${c[1]},${c[2]}) ${i/(arr.length-1)*100}%`)
                    .join(', ')
                })`,
                borderRadius: 4,
                margin: '4px 0',
              }} />
              <Text size="xs" c="white" fw={500}>{datasetConfig.vmin}</Text>
            </Stack>
            <Text size="xs" c="dimmed" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
              {datasetConfig.unit}
            </Text>
          </Group>
        </Paper>
      )}

      {/* Timeseries Panel */}
      <Transition mounted={clickedPoint !== null || timeseriesLoading} transition="slide-right" duration={300}>
        {(styles) => (
          <Paper
            shadow="xl"
            p="md"
            radius="md"
            style={{
              ...styles,
              position: 'absolute',
              bottom: 140,
              left: 20,
              width: 400,
              height: 280,
              background: 'rgba(26, 26, 46, 0.95)',
              backdropFilter: 'blur(20px)',
              zIndex: 1000,
              border: '1px solid rgba(79, 209, 197, 0.3)',
            }}
          >
            <Group justify="space-between" mb="xs">
              <div>
                <Text size="sm" fw={600} c="cyan">
                  {datasetConfig?.name || 'Timeseries'}
                </Text>
                {clickedPoint && (
                  <Text size="xs" c="dimmed">
                    {clickedPoint.lat.toFixed(2)}°, {clickedPoint.lng.toFixed(2)}°
                  </Text>
                )}
              </div>
              <CloseButton
                size="sm"
                onClick={() => { setClickedPoint(null); setTimeseries(null); }}
              />
            </Group>

            {timeseriesLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 180 }}>
                <Text size="xs" c="dimmed">Loading...</Text>
              </div>
            ) : timeseries ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={timeseries} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="month" tick={{ fill: '#888', fontSize: 10 }} />
                  <YAxis
                    domain={[datasetConfig?.vmin || 0, datasetConfig?.vmax || 100]}
                    tick={{ fill: '#888', fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{ background: 'rgba(0,0,0,0.9)', border: '1px solid #4fd1c5' }}
                    formatter={(value) => [value?.toFixed(3) || 'N/A', datasetConfig?.unit || '']}
                  />
                  <ReferenceLine x={MONTHS[timeIndex]} stroke="#4fd1c5" strokeDasharray="5 5" />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#63b3ed"
                    strokeWidth={2}
                    dot={{ fill: '#63b3ed', r: 3 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Text size="sm" c="dimmed" ta="center" mt="xl">
                No data at this location
              </Text>
            )}
          </Paper>
        )}
      </Transition>

      {/* Loading indicator */}
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
            background: 'linear-gradient(90deg, transparent, #4fd1c5, transparent)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s ease-in-out infinite',
          }} />
        )}
      </Transition>

      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .leaflet-control-attribution {
          background: rgba(26, 26, 46, 0.8) !important;
          color: rgba(255,255,255,0.5) !important;
          font-size: 10px !important;
        }
      `}</style>
    </div>
  );
}
