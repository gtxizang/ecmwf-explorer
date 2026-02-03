/**
 * OpenLayersUnifiedMap - Unified OpenLayers-based map for all projections
 *
 * Uses OpenLayers with proj4 for native multi-projection support:
 * - EPSG:3857 (Web Mercator) for soil moisture, fire, radiation
 * - EPSG:3413 (Polar Stereographic) for sea ice
 *
 * Single renderer architecture with proper CRS support
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import ImageLayer from 'ol/layer/Image';
import XYZ from 'ol/source/XYZ';
import ImageStatic from 'ol/source/ImageStatic';
import { register } from 'ol/proj/proj4';
import { get as getProjection, transform } from 'ol/proj';
import proj4 from 'proj4';
import * as zarr from 'zarrita';
import 'ol/ol.css';
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
// PROJECTION DEFINITIONS - Register with proj4 and OpenLayers
// ============================================================================

// EPSG:3413 - NSIDC Sea Ice Polar Stereographic North
proj4.defs('EPSG:3413', '+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs');

// Register all proj4 definitions with OpenLayers
register(proj4);

// Get projection objects
const EPSG3857 = getProjection('EPSG:3857');
const EPSG3413 = getProjection('EPSG:3413');

// Set extent for polar projection
if (EPSG3413) {
  EPSG3413.setExtent([-4194304, -4194304, 4194304, 4194304]);
}

// ============================================================================
// DATASET CONFIGURATIONS
// ============================================================================

const DATASETS = {
  soil_moisture_multiyear: {
    name: 'Soil Moisture ERA5',
    path: '/zarr/soil_moisture_multiyear',
    variable: 'swvl1',
    projection: 'EPSG:3857',
    isMultiYear: true,
    yearRange: { start: 1988, end: 2023 },
    colormap: 'soil',
    vmin: 0.05,
    vmax: 0.5,
    unit: 'm\u00B3/m\u00B3',
    description: 'ERA5 Volumetric Soil Water Layer 1',
  },
  radiation_budget: {
    name: 'Solar Radiation ERA5',
    path: '/zarr/radiation_budget',
    variable: 'ssr',
    projection: 'EPSG:3857',
    isMultiYear: false,
    colormap: 'radiation',
    vmin: 0,
    vmax: 25000000,
    unit: 'J/m\u00B2',
    description: 'Surface Solar Radiation Downwards',
  },
  fire_burned_area: {
    name: 'Fire Burned Area',
    path: '/zarr/fire_burned_area',
    variable: 'burned_area',
    projection: 'EPSG:3857',
    isMultiYear: false,
    colormap: 'fire',
    vmin: 0,
    vmax: 100,
    unit: '%',
    description: 'MODIS Burned Area',
  },
  satellite_radiation: {
    name: 'Solar Radiation Satellite',
    path: '/zarr/satellite_radiation',
    variable: 'SIS',
    projection: 'EPSG:3857',
    isMultiYear: false,
    colormap: 'radiation',
    vmin: 0,
    vmax: 350,
    unit: 'W/m\u00B2',
    description: 'Surface Incoming Shortwave Radiation',
  },
  sea_ice: {
    name: 'Sea Ice (Polar View)',
    path: '/zarr/sea_ice_polar_multiyear',
    variable: 'ice_concentration',
    projection: 'EPSG:3413',
    isMultiYear: true,
    yearRange: { start: 1988, end: 2023 },
    colormap: 'ice',
    vmin: 0,
    vmax: 100,
    unit: '%',
    description: 'Sea Ice Concentration',
    // Polar-specific bounds
    extent: [-3850000, -5350000, 3750000, 5850000],
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

export default function OpenLayersUnifiedMap({ onShowWelcome }) {
  // Map refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const dataLayerRef = useRef(null);

  // State
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [currentProjection, setCurrentProjection] = useState('EPSG:3857');
  const [loading, setLoading] = useState(false);
  const [timeIndex, setTimeIndex] = useState(0);
  const [selectedYear, setSelectedYear] = useState(2020);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [currentZoom, setCurrentZoom] = useState(2);
  const [techInfoOpen, setTechInfoOpen] = useState(true);
  const [loadDuration, setLoadDuration] = useState(null);

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
      mapInstanceRef.current.setTarget(null);
      mapInstanceRef.current = null;
      dataLayerRef.current = null;
    }

    let view, basemapSource;

    if (projection === 'EPSG:3413') {
      // Polar Stereographic view
      view = new View({
        projection: EPSG3413,
        center: [0, 0],
        zoom: 2,
        minZoom: 0,
        maxZoom: 6,
      });

      // NASA GIBS polar basemap
      basemapSource = new XYZ({
        url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3413/best/BlueMarble_NextGeneration/default/500m/{z}/{y}/{x}.jpeg',
        projection: EPSG3413,
        tileSize: 512,
        maxZoom: 5,
      });
    } else {
      // Web Mercator view (default)
      view = new View({
        projection: EPSG3857,
        center: [0, 3000000],
        zoom: 2,
        minZoom: 1,
        maxZoom: 12,
      });

      // CARTO dark basemap
      basemapSource = new XYZ({
        url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        attributions: '&copy; CARTO, &copy; OpenStreetMap contributors',
      });
    }

    const basemapLayer = new TileLayer({
      source: basemapSource,
    });

    const map = new Map({
      target: mapContainerRef.current,
      layers: [basemapLayer],
      view: view,
      controls: [],
    });

    // Handle zoom changes
    view.on('change:resolution', () => {
      const z = view.getZoom();
      setCurrentZoom(z);
      const newLevel = Math.min(3, Math.max(0, Math.floor(z) + 1));
      setCurrentLevel(newLevel);
    });

    // Handle click for timeseries
    map.on('click', (evt) => {
      const coordinate = evt.coordinate;
      // Transform to WGS84 for display and timeseries loading
      const lonLat = transform(coordinate, projection, 'EPSG:4326');
      if (loadTimeseriesRef.current) {
        loadTimeseriesRef.current(lonLat[0], lonLat[1], coordinate);
      }
    });

    mapInstanceRef.current = map;
    setCurrentProjection(projection);
    console.log(`[OPENLAYERS] Map initialized with ${projection}`);
  }, []);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = useCallback(async () => {
    if (!selectedDataset || !mapInstanceRef.current || !datasetConfig) return;

    setLoading(true);
    const startTime = performance.now();

    try {
      const level = Math.min(currentLevel, 3);
      const storePath = `${API_URL}${datasetConfig.path}/${level}`;
      console.log(`[OPENLAYERS] Loading ${selectedDataset} level ${level}`);

      const store = new zarr.FetchStore(storePath);
      const root = zarr.root(store);
      const arr = await zarr.open(root.resolve(datasetConfig.variable), { kind: 'array' });

      const shape = arr.shape;
      let slice, size;

      if (datasetConfig.isMultiYear && shape.length === 4) {
        // Multi-year: [year, month, y, x]
        const yearArr = await zarr.open(root.resolve('year'), { kind: 'array' });
        const yearResult = await zarr.get(yearArr, [null]);
        const years = Array.from(yearResult.data).map(y => Number(y));
        const yearIndex = years.indexOf(selectedYear);

        if (yearIndex === -1) {
          console.error(`Year ${selectedYear} not found`);
          setLoading(false);
          return;
        }

        size = shape[2];
        slice = await zarr.get(arr, [yearIndex, timeIndex, null, null]);
      } else if (shape.length === 3) {
        // Single year: [time, y, x]
        size = shape[1];
        slice = await zarr.get(arr, [timeIndex, null, null]);
      } else {
        console.error('Unexpected data shape:', shape);
        setLoading(false);
        return;
      }

      const rawData = slice.data;
      const rgba = applyColormap(
        rawData, size, size,
        datasetConfig.colormap,
        datasetConfig.vmin,
        datasetConfig.vmax
      );

      // Create image
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const imageData = new ImageData(rgba, size, size);
      ctx.putImageData(imageData, 0, 0);
      const dataUrl = canvas.toDataURL();

      // Get data extent
      let extent;
      if (isPolar && datasetConfig.extent) {
        extent = datasetConfig.extent;
      } else {
        // Web Mercator - get bounds from Zarr coordinates
        const xArr = await zarr.open(root.resolve('x'), { kind: 'array' });
        const yArr = await zarr.open(root.resolve('y'), { kind: 'array' });
        const xResult = await zarr.get(xArr);
        const yResult = await zarr.get(yArr);
        const xCoords = Array.from(xResult.data);
        const yCoords = Array.from(yResult.data);

        extent = [
          xCoords[0],
          yCoords[yCoords.length - 1],
          xCoords[xCoords.length - 1],
          yCoords[0]
        ];
      }

      // Create or update data layer
      const imageSource = new ImageStatic({
        url: dataUrl,
        projection: datasetConfig.projection,
        imageExtent: extent,
      });

      if (dataLayerRef.current) {
        mapInstanceRef.current.removeLayer(dataLayerRef.current);
      }

      dataLayerRef.current = new ImageLayer({
        source: imageSource,
        opacity: 0.85,
      });

      mapInstanceRef.current.addLayer(dataLayerRef.current);

      const duration = performance.now() - startTime;
      setLoadDuration(duration);
      console.log(`[OPENLAYERS] Loaded in ${duration.toFixed(0)}ms`);

    } catch (error) {
      console.error('[OPENLAYERS] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDataset, datasetConfig, currentLevel, timeIndex, selectedYear, isPolar]);

  // ============================================================================
  // TIMESERIES LOADING
  // ============================================================================

  const loadTimeseries = useCallback(async (lng, lat, nativeCoord) => {
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

      // Use native coordinates if polar, otherwise convert
      let dataX, dataY;
      if (isPolar && nativeCoord) {
        [dataX, dataY] = nativeCoord;
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
    if (currentProjection !== targetProjection || !mapInstanceRef.current) {
      initializeMap(targetProjection);
    }
  }, [datasetConfig, currentProjection, initializeMap]);

  // Load data when dataset/time changes
  useEffect(() => {
    if (selectedDataset && mapInstanceRef.current) {
      loadData();
    }
  }, [selectedDataset, currentLevel, timeIndex, selectedYear, loadData]);

  // Handle dataset change
  const handleDatasetChange = (value) => {
    // Clear existing layer
    if (dataLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(dataLayerRef.current);
      dataLayerRef.current = null;
    }
    setClickedPoint(null);
    setTimeseries(null);
    setTimeIndex(0);

    const config = DATASETS[value];
    if (config?.isMultiYear) {
      setSelectedYear(config.yearRange?.end || 2020);
    }

    setSelectedDataset(value);
  };

  // Zoom handlers
  const handleZoomIn = () => {
    const view = mapInstanceRef.current?.getView();
    if (view) {
      view.animate({ zoom: view.getZoom() + 1, duration: 250 });
    }
  };

  const handleZoomOut = () => {
    const view = mapInstanceRef.current?.getView();
    if (view) {
      view.animate({ zoom: view.getZoom() - 1, duration: 250 });
    }
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
            ECV Explorer (OpenLayers)
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Unified OpenLayers Architecture
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
            <Badge size="xs" color="orange" variant="light">OPENLAYERS</Badge>
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
          minWidth: 200,
          border: '1px solid rgba(79, 209, 197, 0.2)',
        }}
      >
        <Group gap="sm" justify="space-between" style={{ cursor: 'pointer' }} onClick={() => setTechInfoOpen(!techInfoOpen)}>
          <Text size="xs" fw={500} c="white">Tech Info</Text>
          <Group gap="xs">
            <Badge color="cyan" size="sm">LOD {currentLevel}</Badge>
            <Badge color="teal" size="sm">Z {currentZoom.toFixed(1)}</Badge>
            {loadDuration !== null && (
              <Badge color={loadDuration < 2000 ? 'green' : 'red'} size="sm">
                {loadDuration < 1000 ? `${loadDuration.toFixed(0)}ms` : `${(loadDuration / 1000).toFixed(2)}s`}
              </Badge>
            )}
          </Group>
        </Group>

        <Collapse in={techInfoOpen}>
          <Divider my="xs" color="rgba(79, 209, 197, 0.2)" />
          <Stack gap="xs">
            <Box>
              <Text size="xs" c="cyan" fw={500}>Renderer</Text>
              <Text size="xs" c="dimmed">OpenLayers 10.x</Text>
            </Box>
            <Box>
              <Text size="xs" c="cyan" fw={500}>Current CRS</Text>
              <Text size="xs" c="dimmed">{currentProjection || 'None'}</Text>
            </Box>
            <Box>
              <Text size="xs" c="cyan" fw={500}>Architecture</Text>
              <Text size="xs" c="dimmed">Native multi-CRS support</Text>
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
      `}</style>
    </div>
  );
}
