/**
 * CesiumGlobeMap - 3D Globe visualization using CesiumJS
 *
 * Proper 3D globe rendering with correct imagery projection
 * - Supports global datasets projected onto sphere
 * - Same UI controls as 2D maps for consistent UX
 * - Click-to-timeseries support
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import * as zarr from 'zarrita';
import proj4 from 'proj4';
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

// Set Cesium Ion token (using default assets, no token needed for basic imagery)
Cesium.Ion.defaultAccessToken = '';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ============================================================================
// DATASET CONFIGURATIONS (Globe-compatible only)
// ============================================================================

const DATASETS = {
  soil_moisture_multiyear: {
    name: 'Soil Moisture ERA5',
    path: '/zarr/soil_moisture_multiyear',
    variable: 'soil_moisture',
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
    isMultiYear: true,
    yearRange: { start: 2019, end: 2023 },
    maxLevel: 4,
    colormap: 'fire',
    vmin: 0,
    vmax: 500000000,
    unit: 'km²',
    description: 'MODIS Burned Area',
  },
  satellite_radiation: {
    name: 'Solar Radiation Satellite',
    path: '/zarr/satellite_radiation',
    variable: 'solar_radiation',
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
    name: 'Sea Ice Concentration',
    path: '/zarr/sea_ice_polar_multiyear',
    variable: 'ice_concentration',
    isMultiYear: true,
    yearRange: { start: 1988, end: 2023 },
    maxLevel: 3,
    colormap: 'ice',
    vmin: 0,
    vmax: 100,
    unit: '%',
    description: 'Sea Ice Concentration (Arctic)',
    projection: 'polar', // Special flag for polar reprojection
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
  ice: [
    [20, 30, 60], [30, 60, 100], [50, 100, 140], [70, 140, 180],
    [100, 170, 200], [140, 200, 220], [180, 220, 240], [210, 240, 250],
    [240, 250, 255], [255, 255, 255]
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

// Convert Web Mercator to WGS84
function mercatorToLonLat(x, y) {
  const lng = (x / 20037508.34) * 180;
  const latRad = Math.atan(Math.sinh((y / 20037508.34) * Math.PI));
  const lat = latRad * (180 / Math.PI);
  return [lng, lat];
}

// EPSG:3413 - NSIDC Sea Ice Polar Stereographic North (same as PolarMap.jsx)
const EPSG3413 = '+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';

// Convert Polar Stereographic (EPSG:3413) to WGS84 using proj4
function polarToLonLat(x, y) {
  const [lng, lat] = proj4(EPSG3413, 'EPSG:4326', [x, y]);
  return [lng, lat];
}

// Convert WGS84 to Polar Stereographic (EPSG:3413) using proj4
function lonLatToPolar(lon, lat) {
  const [x, y] = proj4('EPSG:4326', EPSG3413, [lon, lat]);
  return [x, y];
}

// Reproject image from Web Mercator to WGS84 (plate carrée)
function reprojectMercatorToGeographic(sourceCanvas, srcXCoords, srcYCoords) {
  const srcWidth = sourceCanvas.width;
  const srcHeight = sourceCanvas.height;

  // Get source image data
  const srcCtx = sourceCanvas.getContext('2d');
  const srcImageData = srcCtx.getImageData(0, 0, srcWidth, srcHeight);
  const srcData = srcImageData.data;

  // Calculate geographic bounds
  const [west, south] = mercatorToLonLat(
    Math.min(srcXCoords[0], srcXCoords[srcXCoords.length - 1]),
    Math.min(srcYCoords[0], srcYCoords[srcYCoords.length - 1])
  );
  const [east, north] = mercatorToLonLat(
    Math.max(srcXCoords[0], srcXCoords[srcXCoords.length - 1]),
    Math.max(srcYCoords[0], srcYCoords[srcYCoords.length - 1])
  );

  // Clamp to valid globe bounds
  const geoWest = Math.max(-180, west);
  const geoSouth = Math.max(-85, south);
  const geoEast = Math.min(180, east);
  const geoNorth = Math.min(85, north);

  // Create destination canvas (same size for simplicity)
  const dstWidth = srcWidth;
  const dstHeight = srcHeight;
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = dstWidth;
  dstCanvas.height = dstHeight;
  const dstCtx = dstCanvas.getContext('2d');
  const dstImageData = dstCtx.createImageData(dstWidth, dstHeight);
  const dstData = dstImageData.data;

  // Source Mercator bounds
  const srcXMin = Math.min(srcXCoords[0], srcXCoords[srcXCoords.length - 1]);
  const srcXMax = Math.max(srcXCoords[0], srcXCoords[srcXCoords.length - 1]);
  const srcYMin = Math.min(srcYCoords[0], srcYCoords[srcYCoords.length - 1]);
  const srcYMax = Math.max(srcYCoords[0], srcYCoords[srcYCoords.length - 1]);

  // For each destination pixel (in geographic space)
  for (let dstY = 0; dstY < dstHeight; dstY++) {
    // Geographic latitude for this row (top = north)
    const lat = geoNorth - (dstY / dstHeight) * (geoNorth - geoSouth);

    // Convert to Web Mercator Y
    const latRad = lat * Math.PI / 180;
    const mercY = 20037508.34 * Math.log(Math.tan(Math.PI / 4 + latRad / 2)) / Math.PI;

    // Find source Y pixel
    const srcYNorm = (mercY - srcYMin) / (srcYMax - srcYMin);
    const srcYPx = Math.floor((1 - srcYNorm) * srcHeight); // Flip Y

    for (let dstX = 0; dstX < dstWidth; dstX++) {
      // Geographic longitude for this column
      const lng = geoWest + (dstX / dstWidth) * (geoEast - geoWest);

      // Convert to Web Mercator X (linear, same as geographic for X)
      const mercX = lng * 20037508.34 / 180;

      // Find source X pixel
      const srcXNorm = (mercX - srcXMin) / (srcXMax - srcXMin);
      const srcXPx = Math.floor(srcXNorm * srcWidth);

      // Sample from source if in bounds
      const dstIdx = (dstY * dstWidth + dstX) * 4;

      if (srcXPx >= 0 && srcXPx < srcWidth && srcYPx >= 0 && srcYPx < srcHeight) {
        const srcIdx = (srcYPx * srcWidth + srcXPx) * 4;
        dstData[dstIdx] = srcData[srcIdx];
        dstData[dstIdx + 1] = srcData[srcIdx + 1];
        dstData[dstIdx + 2] = srcData[srcIdx + 2];
        dstData[dstIdx + 3] = srcData[srcIdx + 3];
      } else {
        // Transparent
        dstData[dstIdx] = 0;
        dstData[dstIdx + 1] = 0;
        dstData[dstIdx + 2] = 0;
        dstData[dstIdx + 3] = 0;
      }
    }
  }

  dstCtx.putImageData(dstImageData, 0, 0);

  return {
    canvas: dstCanvas,
    bounds: { west: geoWest, south: geoSouth, east: geoEast, north: geoNorth }
  };
}

// Reproject image from Polar Stereographic (EPSG:3413) to WGS84 (plate carrée)
function reprojectPolarToGeographic(sourceCanvas, srcXCoords, srcYCoords) {
  const srcWidth = sourceCanvas.width;
  const srcHeight = sourceCanvas.height;

  const srcCtx = sourceCanvas.getContext('2d');
  const srcImageData = srcCtx.getImageData(0, 0, srcWidth, srcHeight);
  const srcData = srcImageData.data;

  // Source polar bounds
  const srcXMin = Math.min(srcXCoords[0], srcXCoords[srcXCoords.length - 1]);
  const srcXMax = Math.max(srcXCoords[0], srcXCoords[srcXCoords.length - 1]);
  const srcYMin = Math.min(srcYCoords[0], srcYCoords[srcYCoords.length - 1]);
  const srcYMax = Math.max(srcYCoords[0], srcYCoords[srcYCoords.length - 1]);


  // Sample multiple points around the data extent to find geographic bounds
  const samplePoints = [];
  for (let i = 0; i < srcWidth; i += Math.floor(srcWidth / 10)) {
    for (let j = 0; j < srcHeight; j += Math.floor(srcHeight / 10)) {
      const x = srcXCoords[Math.min(i, srcXCoords.length - 1)];
      const y = srcYCoords[Math.min(j, srcYCoords.length - 1)];
      const [lng, lat] = polarToLonLat(x, y);
      if (lat >= 40 && lat <= 90) { // Valid Arctic latitudes
        samplePoints.push({ lng, lat });
      }
    }
  }

  // Find actual geographic extent from sample points
  let minLat = 90, maxLat = -90;
  samplePoints.forEach(p => {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  });


  // For polar data covering the Arctic, use full longitude range but calculated latitude
  const geoWest = -180;
  const geoEast = 180;
  const geoSouth = Math.max(40, minLat - 5); // Add some padding
  const geoNorth = 90;

  // Create destination canvas
  const dstWidth = srcWidth;
  const dstHeight = srcHeight;
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = dstWidth;
  dstCanvas.height = dstHeight;
  const dstCtx = dstCanvas.getContext('2d');
  const dstImageData = dstCtx.createImageData(dstWidth, dstHeight);
  const dstData = dstImageData.data;

  // For each destination pixel (in geographic space)
  for (let dstY = 0; dstY < dstHeight; dstY++) {
    const lat = geoNorth - (dstY / dstHeight) * (geoNorth - geoSouth);

    for (let dstX = 0; dstX < dstWidth; dstX++) {
      const lng = geoWest + (dstX / dstWidth) * (geoEast - geoWest);

      // Convert to polar stereographic
      const [polarX, polarY] = lonLatToPolar(lng, lat);

      // Find source pixel
      const srcXNorm = (polarX - srcXMin) / (srcXMax - srcXMin);
      const srcYNorm = (polarY - srcYMin) / (srcYMax - srcYMin);
      const srcXPx = Math.floor(srcXNorm * srcWidth);
      const srcYPx = Math.floor((1 - srcYNorm) * srcHeight); // Flip Y

      const dstIdx = (dstY * dstWidth + dstX) * 4;

      if (srcXPx >= 0 && srcXPx < srcWidth && srcYPx >= 0 && srcYPx < srcHeight) {
        const srcIdx = (srcYPx * srcWidth + srcXPx) * 4;
        dstData[dstIdx] = srcData[srcIdx];
        dstData[dstIdx + 1] = srcData[srcIdx + 1];
        dstData[dstIdx + 2] = srcData[srcIdx + 2];
        dstData[dstIdx + 3] = srcData[srcIdx + 3];
      } else {
        dstData[dstIdx] = 0;
        dstData[dstIdx + 1] = 0;
        dstData[dstIdx + 2] = 0;
        dstData[dstIdx + 3] = 0;
      }
    }
  }

  dstCtx.putImageData(dstImageData, 0, 0);

  return {
    canvas: dstCanvas,
    bounds: { west: geoWest, south: geoSouth, east: geoEast, north: geoNorth }
  };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CesiumGlobeMap({ onShowWelcome }) {
  // Refs
  const cesiumContainerRef = useRef(null);
  const viewerRef = useRef(null);
  const dataLayerRef = useRef(null);
  const lastLoadedRef = useRef(null);

  // State
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timeIndex, setTimeIndex] = useState(0);
  const [selectedYear, setSelectedYear] = useState(2020);
  const [currentLevel, setCurrentLevel] = useState(2);
  const [techInfoOpen, setTechInfoOpen] = useState(true);
  const [loadDuration, setLoadDuration] = useState(null);
  const [opacity, setOpacity] = useState(0.85);
  const [dataShape, setDataShape] = useState(null);
  const [copied, setCopied] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [sceneMode, setSceneMode] = useState('3D'); // '3D' or '2D'

  // Timeseries state
  const [clickedPoint, setClickedPoint] = useState(null);
  const [timeseries, setTimeseries] = useState(null);
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);

  // Get current dataset config
  const datasetConfig = selectedDataset ? DATASETS[selectedDataset] : null;

  // ============================================================================
  // CESIUM INITIALIZATION
  // ============================================================================

  useEffect(() => {
    if (!cesiumContainerRef.current || viewerRef.current) return;

    // Create Cesium viewer with dark theme
    const viewer = new Cesium.Viewer(cesiumContainerRef.current, {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      animation: false,
      fullscreenButton: false,
      vrButton: false,
      creditContainer: document.createElement('div'), // Hide credits
      imageryProvider: false, // Disable default imagery
      terrainProvider: undefined,
      skyBox: false,
      skyAtmosphere: false,
    });

    // Add basemap layer after viewer is created
    const basemapProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      credit: 'CARTO',
    });
    viewer.imageryLayers.addImageryProvider(basemapProvider);

    // Dark background
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#0a0a1a');
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1a1a2e');

    // Set initial view
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(0, 20, 20000000),
    });

    // Handle click for timeseries
    viewer.screenSpaceEventHandler.setInputAction((click) => {
      const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
      if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lng = Cesium.Math.toDegrees(cartographic.longitude);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);
        loadTimeseriesCallback(lng, lat);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, []);

  // ============================================================================
  // LOD BASED ON CAMERA ALTITUDE
  // ============================================================================

  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;

    // Calculate LOD level from camera altitude
    const updateLOD = () => {
      if (!viewer || viewer.isDestroyed()) return;

      const altitude = viewer.camera.positionCartographic?.height;
      if (altitude === undefined) return;

      // Map altitude to LOD level
      // High altitude (20M+ meters) = LOD 0
      // Low altitude (< 500km) = LOD 4
      let newLevel;
      if (altitude > 15000000) {
        newLevel = 0;  // Very zoomed out - whole Earth
      } else if (altitude > 8000000) {
        newLevel = 1;  // Continental view
      } else if (altitude > 3000000) {
        newLevel = 2;  // Regional view
      } else if (altitude > 1000000) {
        newLevel = 3;  // Country view
      } else {
        newLevel = 4;  // Detailed view (zoomed into Ireland level)
      }

      const maxLevel = datasetConfig?.maxLevel || 4;
      newLevel = Math.min(newLevel, maxLevel);

      if (newLevel !== currentLevel) {
        console.log(`[CESIUM] Camera altitude: ${(altitude / 1000000).toFixed(2)}M km → LOD ${newLevel}`);
        setCurrentLevel(newLevel);
      }
    };

    // Listen to camera changes
    const removeListener = viewer.camera.changed.addEventListener(updateLOD);

    // Initial check
    updateLOD();

    return () => {
      if (removeListener) {
        removeListener();
      }
    };
  }, [datasetConfig, currentLevel]);

  // ============================================================================
  // AUTO-ROTATION
  // ============================================================================

  useEffect(() => {
    if (!viewerRef.current || !autoRotate) return;

    const viewer = viewerRef.current;
    let lastTime = Date.now();

    const rotate = () => {
      if (!autoRotate || !viewerRef.current || viewerRef.current.isDestroyed()) return;

      const now = Date.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      const rotationSpeed = 0.5; // degrees per second
      viewer.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, Cesium.Math.toRadians(rotationSpeed * delta));
    };

    const intervalId = setInterval(rotate, 16); // ~60fps

    return () => clearInterval(intervalId);
  }, [autoRotate]);

  // ============================================================================
  // SCENE MODE (2D/3D TOGGLE)
  // ============================================================================

  useEffect(() => {
    if (!viewerRef.current) return;

    const viewer = viewerRef.current;
    const newMode = sceneMode === '3D' ? Cesium.SceneMode.SCENE3D : Cesium.SceneMode.SCENE2D;

    if (viewer.scene.mode !== newMode) {
      viewer.scene.morphTo2D(1.0); // 1 second transition
      if (sceneMode === '3D') {
        viewer.scene.morphTo3D(1.0);
      } else {
        viewer.scene.morphTo2D(1.0);
      }
    }
  }, [sceneMode]);

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = useCallback(async () => {
    if (!selectedDataset || !datasetConfig || !viewerRef.current) return;

    const maxLevel = datasetConfig.maxLevel || 3;
    const level = Math.min(currentLevel, maxLevel);
    const loadKey = `${selectedDataset}-${level}-${selectedYear}-${timeIndex}`;

    if (lastLoadedRef.current === loadKey) {
      return;
    }

    setLoading(true);
    const startTime = performance.now();

    try {
      const storePath = `${API_URL}${datasetConfig.path}/${level}`;
      console.log(`[CESIUM] Loading ${selectedDataset} level ${level}/${maxLevel}`);
      const store = new zarr.FetchStore(storePath);
      const root = zarr.root(store);
      const arr = await zarr.open(root.resolve(datasetConfig.variable), { kind: 'array' });

      const shape = arr.shape;
      let slice, width, height;

      if (datasetConfig.isMultiYear && shape.length === 4) {
        const yearArr = await zarr.open(root.resolve('year'), { kind: 'array' });
        const yearResult = await zarr.get(yearArr, [null]);
        const years = Array.from(yearResult.data).map(y => Number(y));
        let yearIndex = years.indexOf(selectedYear);

        // If exact year not found, use nearest available year
        if (yearIndex === -1) {
          console.warn(`[CESIUM] Year ${selectedYear} not found, finding nearest...`);
          let minDiff = Infinity;
          for (let i = 0; i < years.length; i++) {
            const diff = Math.abs(years[i] - selectedYear);
            if (diff < minDiff) {
              minDiff = diff;
              yearIndex = i;
            }
          }
          console.log(`[CESIUM] Using year ${years[yearIndex]} instead`);
        }

        height = shape[2];
        width = shape[3];
        slice = await zarr.get(arr, [yearIndex, timeIndex, null, null]);
      } else if (shape.length === 3) {
        height = shape[1];
        width = shape[2];
        slice = await zarr.get(arr, [timeIndex, null, null]);
      } else {
        console.error('Unexpected data shape:', shape);
        setLoading(false);
        return;
      }

      setDataShape({ width, height });

      const rawData = slice.data;
      const rgba = applyColormap(
        rawData, width, height,
        datasetConfig.colormap,
        datasetConfig.vmin,
        datasetConfig.vmax
      );

      // Get coordinate arrays first (needed for reprojection)
      const xArr = await zarr.open(root.resolve('x'), { kind: 'array' });
      const yArr = await zarr.open(root.resolve('y'), { kind: 'array' });
      const xResult = await zarr.get(xArr);
      const yResult = await zarr.get(yArr);
      const xCoords = Array.from(xResult.data);
      const yCoords = Array.from(yResult.data);

      // Create source image canvas
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = width;
      srcCanvas.height = height;
      const srcCtx = srcCanvas.getContext('2d');
      const imgData = new ImageData(rgba, width, height);
      srcCtx.putImageData(imgData, 0, 0);

      // Reproject to Geographic (plate carrée) for Cesium
      // Use polar reprojection for polar datasets, Mercator for others
      let geoCanvas, bounds;
      if (datasetConfig.projection === 'polar') {
        const result = reprojectPolarToGeographic(srcCanvas, xCoords, yCoords);
        geoCanvas = result.canvas;
        bounds = result.bounds;
      } else {
        const result = reprojectMercatorToGeographic(srcCanvas, xCoords, yCoords);
        geoCanvas = result.canvas;
        bounds = result.bounds;
      }
      const dataUrl = geoCanvas.toDataURL('image/png');

      // Remove previous data layer
      if (dataLayerRef.current && viewerRef.current) {
        viewerRef.current.imageryLayers.remove(dataLayerRef.current);
        dataLayerRef.current = null;
      }

      // Add new imagery layer with the reprojected data
      const rectangle = Cesium.Rectangle.fromDegrees(
        bounds.west,
        bounds.south,
        bounds.east,
        bounds.north
      );

      // Use async SingleTileImageryProvider
      Cesium.SingleTileImageryProvider.fromUrl(dataUrl, {
        rectangle: rectangle,
      }).then((imageryProvider) => {
        if (!viewerRef.current || viewerRef.current.isDestroyed()) return;

        const layer = viewerRef.current.imageryLayers.addImageryProvider(imageryProvider);
        layer.alpha = opacity;
        dataLayerRef.current = layer;
      }).catch((err) => {
        console.error('[CESIUM] Failed to create imagery provider:', err);
      });

      lastLoadedRef.current = loadKey;
      const duration = performance.now() - startTime;
      setLoadDuration(duration);
      console.log(`[CESIUM] Loaded in ${duration.toFixed(0)}ms`);

    } catch (error) {
      console.error('[CESIUM] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDataset, datasetConfig, currentLevel, timeIndex, selectedYear, opacity]);

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

      // Get coordinate arrays (in Web Mercator)
      const xArr = await zarr.open(root.resolve('x'), { kind: 'array' });
      const yArr = await zarr.open(root.resolve('y'), { kind: 'array' });
      const xResult = await zarr.get(xArr);
      const yResult = await zarr.get(yArr);
      const xCoords = Array.from(xResult.data);
      const yCoords = Array.from(yResult.data);

      // Convert click coords (WGS84) to Web Mercator
      const dataX = lng * 20037508.34 / 180;
      const latRad = lat * Math.PI / 180;
      const dataY = Math.log(Math.tan(Math.PI / 4 + latRad / 2)) * 20037508.34 / Math.PI;

      const xIdx = findNearestIndex(xCoords, dataX);
      const yIdx = findNearestIndex(yCoords, dataY);

      console.log(`[TIMESERIES] Click (${lat.toFixed(2)}, ${lng.toFixed(2)}) -> pixel (${xIdx}, ${yIdx})`);

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
  }, [selectedDataset, datasetConfig, selectedYear]);

  // Create a stable reference for the click handler
  const loadTimeseriesCallback = useCallback((lng, lat) => {
    loadTimeseries(lng, lat);
  }, [loadTimeseries]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    if (selectedDataset) {
      loadData();
    }
  }, [selectedDataset, currentLevel, timeIndex, selectedYear, loadData]);

  // Update opacity when changed
  useEffect(() => {
    if (dataLayerRef.current) {
      dataLayerRef.current.alpha = opacity;
    }
  }, [opacity]);

  // Handle dataset change
  const handleDatasetChange = (value) => {
    // Remove existing data layer
    if (dataLayerRef.current && viewerRef.current) {
      viewerRef.current.imageryLayers.remove(dataLayerRef.current);
      dataLayerRef.current = null;
    }
    lastLoadedRef.current = null;
    setClickedPoint(null);
    setTimeseries(null);
    setTimeIndex(0);

    const config = DATASETS[value];
    if (config?.isMultiYear) {
      setSelectedYear(config.yearRange?.end || 2020);
    }

    // Fly to Arctic for polar datasets
    if (config?.projection === 'polar' && viewerRef.current) {
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(0, 75, 15000000),
        duration: 1.5,
      });
    }

    setSelectedDataset(value);
  };

  // Copy tech info
  const copyTechInfo = () => {
    const maxLevel = datasetConfig?.maxLevel || 3;
    const effectiveLevel = Math.min(currentLevel, maxLevel);
    const info = `Tech Info (CesiumJS Globe)
=====================================
LOD: ${effectiveLevel} / ${maxLevel}
${dataShape ? `Data Size: ${dataShape.width} × ${dataShape.height} px` : ''}
Load Time: ${loadDuration ? (loadDuration < 1000 ? `${loadDuration.toFixed(0)}ms` : `${(loadDuration / 1000).toFixed(2)}s`) : 'N/A'}
Renderer: CesiumJS
Projection: 3D Globe (WGS84)
Auto-Rotate: ${autoRotate ? 'ON' : 'OFF'}
${selectedDataset ? `
Dataset: ${selectedDataset}
Variable: ${datasetConfig?.variable}
Path: ${datasetConfig?.path}/${effectiveLevel}
Year Range: ${datasetConfig?.yearRange?.start}-${datasetConfig?.yearRange?.end}
Selected: ${selectedYear}, ${MONTHS[timeIndex]}` : ''}`;
    navigator.clipboard.writeText(info).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', background: '#0a0a1a' }}>
      {/* Cesium container */}
      <div ref={cesiumContainerRef} style={{ width: '100%', height: '100%' }} />

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
          border: '1px solid rgba(99, 179, 237, 0.3)',
        }}
      >
        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <Text
            size="lg"
            fw={700}
            onClick={onShowWelcome}
            style={{
              background: 'linear-gradient(135deg, #63b3ed 0%, #b794f4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              cursor: 'pointer',
            }}
          >
            ECV Explorer ({sceneMode === '3D' ? '3D Globe' : '2D Map'})
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            CesiumJS - {sceneMode === '3D' ? 'Rotating Earth' : 'Flat Projection'}
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

          {/* Year slider */}
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
                color="violet"
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
                color="violet"
              />
            </div>
          )}

          {/* Opacity slider */}
          {selectedDataset && (
            <div>
              <Text size="xs" c="white" fw={500} mb={4}>
                Opacity: {Math.round(opacity * 100)}%
              </Text>
              <Slider
                value={opacity}
                onChange={setOpacity}
                min={0}
                max={1}
                step={0.05}
                size="xs"
                color="violet"
              />
            </div>
          )}

          {/* 2D/3D Toggle */}
          <Group gap="xs">
            <Text size="xs" c="dimmed">View mode:</Text>
            <Group gap={4}>
              <ActionIcon
                size="sm"
                variant={sceneMode === '3D' ? 'filled' : 'subtle'}
                color="violet"
                onClick={() => setSceneMode('3D')}
                title="3D Globe"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <ellipse cx="12" cy="12" rx="10" ry="4" />
                  <line x1="12" y1="2" x2="12" y2="22" />
                </svg>
              </ActionIcon>
              <ActionIcon
                size="sm"
                variant={sceneMode === '2D' ? 'filled' : 'subtle'}
                color="violet"
                onClick={() => setSceneMode('2D')}
                title="2D Map"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="12" y1="3" x2="12" y2="21" />
                </svg>
              </ActionIcon>
            </Group>
          </Group>

          {/* Auto-rotate toggle (only in 3D mode) */}
          {sceneMode === '3D' && (
            <Group gap="xs">
              <Text size="xs" c="dimmed">Auto-rotate:</Text>
              <ActionIcon
                size="sm"
                variant={autoRotate ? 'filled' : 'subtle'}
                color="violet"
                onClick={() => setAutoRotate(!autoRotate)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
              </ActionIcon>
            </Group>
          )}

          {/* Dataset info */}
          {datasetConfig && (
            <Text size="xs" c="dimmed">
              {datasetConfig.description}
            </Text>
          )}

          {/* Badges */}
          <Group gap={4}>
            <Badge size="xs" color="violet" variant="light">{sceneMode === '3D' ? '3D GLOBE' : '2D MAP'}</Badge>
            <Badge size="xs" color="blue" variant="light">CESIUM</Badge>
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
          minWidth: 220,
          border: '1px solid rgba(99, 179, 237, 0.3)',
        }}
      >
        <Group gap="sm" justify="space-between">
          <Group gap="xs" style={{ cursor: 'pointer' }} onClick={() => setTechInfoOpen(!techInfoOpen)}>
            <Text size="xs" fw={500} c="white">Tech Info</Text>
          </Group>
          <Group gap="xs">
            <Badge color="violet" size="sm">LOD {Math.min(currentLevel, datasetConfig?.maxLevel || 3)}/{datasetConfig?.maxLevel || 3}</Badge>
            {loadDuration !== null && (
              <Badge color={loadDuration < 2000 ? 'green' : 'red'} size="sm">
                {loadDuration < 1000 ? `${loadDuration.toFixed(0)}ms` : `${(loadDuration / 1000).toFixed(2)}s`}
              </Badge>
            )}
            <ActionIcon
              size="xs"
              variant="subtle"
              color={copied ? 'green' : 'violet'}
              onClick={copyTechInfo}
              title="Copy tech info"
            >
              {copied ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </ActionIcon>
          </Group>
        </Group>

        <Collapse in={techInfoOpen}>
          <Divider my="xs" color="rgba(99, 179, 237, 0.2)" />
          <Stack gap="xs">
            <Box>
              <Text size="xs" c="violet" fw={500}>Renderer</Text>
              <Text size="xs" c="dimmed">CesiumJS</Text>
            </Box>
            <Box>
              <Text size="xs" c="violet" fw={500}>Projection</Text>
              <Text size="xs" c="dimmed">3D Globe (WGS84)</Text>
            </Box>
            <Box>
              <Text size="xs" c="violet" fw={500}>Architecture</Text>
              <Text size="xs" c="dimmed">WebGL 3D rendering</Text>
            </Box>
            {dataShape && (
              <Box>
                <Text size="xs" c="violet" fw={500}>Data Size</Text>
                <Text size="xs" c="dimmed">{dataShape.width} × {dataShape.height} px</Text>
              </Box>
            )}
            {selectedDataset && (
              <>
                <Box>
                  <Text size="xs" c="violet" fw={500}>Dataset</Text>
                  <Text size="xs" c="dimmed">{selectedDataset}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="violet" fw={500}>Variable</Text>
                  <Text size="xs" c="dimmed">{datasetConfig?.variable}</Text>
                </Box>
              </>
            )}
          </Stack>
        </Collapse>
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
            border: '1px solid rgba(99, 179, 237, 0.3)',
          }}
        >
          <Text size="xs" fw={600} c="violet" mb={8}>{datasetConfig.name}</Text>
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
              border: '1px solid rgba(99, 179, 237, 0.3)',
            }}
          >
            <Group justify="space-between" mb="xs">
              <div>
                <Text size="sm" fw={600} c="violet">
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
                    contentStyle={{ background: 'rgba(0,0,0,0.9)', border: '1px solid #b794f4' }}
                    formatter={(value) => [value?.toFixed(3) || 'N/A', datasetConfig?.unit || '']}
                  />
                  <ReferenceLine x={MONTHS[timeIndex]} stroke="#b794f4" strokeDasharray="5 5" />
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
            background: 'linear-gradient(90deg, transparent, #b794f4, transparent)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s ease-in-out infinite',
          }} />
        )}
      </Transition>

      {/* Note about polar datasets */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .cesium-viewer .cesium-widget-credits {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
