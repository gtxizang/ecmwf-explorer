/**
 * PolarMap - Leaflet-based polar stereographic map for sea ice visualization
 * Uses EPSG:3413 (NSIDC Sea Ice Polar Stereographic North)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'proj4';
import 'proj4leaflet';
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
  Modal,
  Switch,
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
import proj4 from 'proj4';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// EPSG:3413 - NSIDC Sea Ice Polar Stereographic North
const EPSG3413 = '+proj=stere +lat_0=90 +lat_ts=70 +lon_0=-45 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';

// GIBS-compatible bounds for EPSG:3413 (meters) - for map extent
const POLAR_BOUNDS = {
  xmin: -4194304,
  ymin: -4194304,
  xmax: 4194304,
  ymax: 4194304,
};

// Sea ice data bounds (from processing script) - for data overlay
const SEA_ICE_BOUNDS = {
  xmin: -3850000,
  ymin: -5350000,
  xmax: 3750000,
  ymax: 5850000,
};

// NASA GIBS configuration for EPSG:3413 (500m TileMatrixSet)
// Based on GIBS capabilities: https://gibs.earthdata.nasa.gov/wmts/epsg3413/best/
const GIBS_CONFIG = {
  origin: [-4194304, 4194304],
  // Resolutions for 500m TileMatrixSet (levels 0-5)
  resolutions: [8192, 4096, 2048, 1024, 512, 256],
  tileSize: 512,
};

// Available polar basemaps from NASA GIBS (all EPSG:3413)
const POLAR_BASEMAPS = {
  satellite: {
    name: 'Satellite',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3413/best/BlueMarble_NextGeneration/default/500m/{z}/{y}/{x}.jpeg',
    description: 'Blue Marble satellite imagery',
  },
  land: {
    name: 'Land Outline',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3413/best/OSM_Land_Mask/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png',
    description: 'Simple land/ocean mask',
  },
  coastlines: {
    name: 'Coastlines',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3413/best/Coastlines_15m/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png',
    description: 'Coastline outlines only',
  },
  grayscale: {
    name: 'Grayscale',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3413/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{z}/{y}/{x}.jpeg',
    description: 'Shaded relief bathymetry',
  },
};

// Pyramid levels
const PYRAMID_LEVELS = {
  0: 256,
  1: 512,
  2: 1024,
  3: 2048,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Ice colormap - dark blue to white
const ICE_COLORMAP = [
  [10, 20, 40], [20, 40, 80], [40, 80, 140], [60, 120, 180],
  [100, 160, 210], [140, 190, 230], [180, 215, 245], [210, 235, 255],
  [240, 250, 255], [255, 255, 255]
];

// Dataset configurations - matching ZarrMap structure
const DATASETS = {
  soil_moisture: { name: 'Soil Moisture' },
  radiation_budget: { name: 'Solar Radiation' },
  fire_burned_area: { name: 'Fire Burned Area' },
  sea_ice: { name: 'Sea Ice (Polar View)' },
  sea_ice_multiyear: { name: 'Sea Ice (36 Years)' },
  sea_ice_with_quality: { name: 'Sea Ice with Quality Data' },
};

// Polar dataset configurations (all EPSG:3413)
const POLAR_DATASETS = {
  sea_ice: {
    path: '/zarr/sea_ice_polar',
    variable: 'ice_concentration',
    isMultiYear: false,
    hasUncertainty: false,
  },
  sea_ice_multiyear: {
    path: '/zarr/sea_ice_polar_multiyear',
    variable: 'ice_concentration',
    isMultiYear: true,
    hasUncertainty: false,
  },
  sea_ice_with_quality: {
    path: '/zarr/sea_ice_with_quality',
    variable: 'ice_concentration',
    uncertaintyVariable: 'total_uncertainty',
    isMultiYear: false,
    hasUncertainty: true,
    maxLevel: 2,
  },
};

// Multi-year sea ice configuration
const SEA_ICE_MULTIYEAR = {
  yearRange: { start: 1988, end: 2023 },
  totalYears: 36,
};

// Dataset technical info - matching ZarrMap structure
const DATASET_INFO = {
  source: {
    name: 'Copernicus Climate Data Store',
    url: 'https://cds.climate.copernicus.eu/datasets/satellite-sea-ice-concentration',
    dataset: 'Sea ice concentration from 1979 to present',
    provider: 'EUMETSAT OSI SAF',
  },
  rawData: {
    resolution: '25km (EASE2 Grid)',
    projection: 'EPSG:6931 (Lambert Azimuthal Equal Area)',
    temporalCoverage: '2023 (12 months)',
    spatialCoverage: 'Northern Hemisphere (Arctic)',
  },
  processing: {
    reprojection: 'EASE2 (EPSG:6931) → Polar Stereographic (EPSG:3413)',
    pyramid: '4 levels (256px to 2048px)',
    resampling: 'Bilinear interpolation',
    format: 'Zarr v2 with Blosc compression',
    chunking: '1 × 256 × 256 (time × y × x)',
  },
};

// Technology stack info
const TECH_STACK = {
  browser: {
    visualization: 'Leaflet + Proj4Leaflet',
    zarrLoader: 'zarrita.js',
    ui: 'React 18 + Mantine v7',
    projection: 'EPSG:3413 (Polar Stereographic)',
  },
  basemap: {
    provider: 'NASA GIBS',
    style: 'Blue Marble Next Generation',
    attribution: '© NASA GIBS',
  },
};

function applyColormap(data, width, height, vmin = 0, vmax = 100) {
  const colormap = ICE_COLORMAP;
  const range = vmax - vmin;
  const numColors = colormap.length;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const value = data[i];

    if (isNaN(value) || value <= 0) {
      rgba[idx] = 0;
      rgba[idx + 1] = 0;
      rgba[idx + 2] = 0;
      rgba[idx + 3] = 0;
      continue;
    }

    const normalized = Math.max(0, Math.min(1, (value - vmin) / range));
    const colorIdx = Math.min(numColors - 1, Math.floor(normalized * (numColors - 1)));
    const color = colormap[colorIdx];

    rgba[idx] = color[0];
    rgba[idx + 1] = color[1];
    rgba[idx + 2] = color[2];
    rgba[idx + 3] = 200;
  }

  return rgba;
}

export default function PolarMap({ onBack, initialDataset = 'sea_ice_multiyear' }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const imageOverlayRef = useRef(null);
  const uncertaintyOverlayRef = useRef(null);
  const basemapLayerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [timeIndex, setTimeIndex] = useState(0);
  const [selectedYear, setSelectedYear] = useState(2020);
  // Map 'sea_ice' from ZarrMap to 'sea_ice_multiyear' in PolarMap
  const getInitialDataset = () => {
    if (initialDataset === 'sea_ice') return 'sea_ice_multiyear';
    return initialDataset;
  };
  const [selectedPolarDataset, setSelectedPolarDataset] = useState(getInitialDataset);
  const [isMultiYear, setIsMultiYear] = useState(initialDataset !== 'sea_ice_with_quality'); // Quality data is single year
  const [currentLevel, setCurrentLevel] = useState(1);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [techInfoOpen, setTechInfoOpen] = useState(true); // Default to open
  const [selectedBasemap, setSelectedBasemap] = useState('satellite');
  const playIntervalRef = useRef(null);

  // Uncertainty visualization state
  const [showUncertainty, setShowUncertainty] = useState(false);
  const [uncertaintyModalOpen, setUncertaintyModalOpen] = useState(false);
  const [uncertaintyModalShown, setUncertaintyModalShown] = useState(false);

  // Click-to-timeseries state
  const [clickedPoint, setClickedPoint] = useState(null); // { lng, lat }
  const [timeseries, setTimeseries] = useState(null); // [{ month, value }, ...]
  const [timeseriesLoading, setTimeseriesLoading] = useState(false);
  const loadTimeseriesRef = useRef(null);

  // Load timer state (for demonstrating <2s render requirement)
  const [loadStartTime, setLoadStartTime] = useState(null);
  const [loadDuration, setLoadDuration] = useState(null);

  // Helper: find nearest index in array
  const findNearestIndex = (arr, value) => {
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
  };

  // Initialize the polar stereographic map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Define the CRS using GIBS configuration
    const crs = new L.Proj.CRS(
      'EPSG:3413',
      EPSG3413,
      {
        origin: GIBS_CONFIG.origin,
        resolutions: GIBS_CONFIG.resolutions,
        bounds: L.bounds(
          [POLAR_BOUNDS.xmin, POLAR_BOUNDS.ymin],
          [POLAR_BOUNDS.xmax, POLAR_BOUNDS.ymax]
        ),
      }
    );

    // Create the map
    const map = L.map(mapRef.current, {
      crs: crs,
      center: [80, 0],
      zoom: 1,
      minZoom: 0,
      maxZoom: 5,
      zoomControl: false,
      attributionControl: true,
    });

    // Add NASA GIBS basemap (initial)
    basemapLayerRef.current = L.tileLayer(POLAR_BASEMAPS[selectedBasemap].url, {
      tileSize: GIBS_CONFIG.tileSize,
      attribution: '© NASA GIBS',
      noWrap: true,
      bounds: [[-90, -180], [90, 180]],
    }).addTo(map);

    // Add graticule (lat/lon lines) - these provide geographic reference
    const graticuleStyle = {
      color: 'rgba(79, 209, 197, 0.25)',
      weight: 1,
    };

    // Latitude circles with labels
    const latCircles = [60, 70, 80];
    latCircles.forEach(lat => {
      const points = [];
      for (let lon = -180; lon <= 180; lon += 3) {
        points.push([lat, lon]);
      }
      L.polyline(points, graticuleStyle).addTo(map);

      // Add latitude label
      L.marker([lat, 0], {
        icon: L.divIcon({
          html: `<div style="color: rgba(79, 209, 197, 0.7); font-size: 9px; text-shadow: 0 0 3px rgba(0,0,0,0.8);">${lat}°N</div>`,
          className: 'lat-label',
          iconSize: null,
        }),
      }).addTo(map);
    });

    // Longitude lines (meridians)
    for (let lon = -180; lon < 180; lon += 45) {
      L.polyline([[50, lon], [90, lon]], graticuleStyle).addTo(map);
    }

    // Add geographic direction labels at the edges
    const directionLabels = [
      { lat: 62, lon: 0, text: 'Europe →' },
      { lat: 62, lon: 180, text: '← Pacific' },
      { lat: 62, lon: -90, text: 'N. America ↓' },
      { lat: 62, lon: 90, text: '↓ Asia' },
    ];

    directionLabels.forEach(({ lat, lon, text }) => {
      L.marker([lat, lon], {
        icon: L.divIcon({
          html: `<div style="color: rgba(255,255,255,0.7); font-size: 10px; font-weight: 400; white-space: nowrap; text-shadow: 0 0 3px rgba(0,0,0,0.8);">${text}</div>`,
          className: 'direction-label',
          iconSize: null,
        }),
      }).addTo(map);
    });

    // Add North Pole marker
    L.marker([90, 0], {
      icon: L.divIcon({
        html: `<div style="color: #4fd1c5; font-size: 12px; font-weight: 600; white-space: nowrap; text-shadow: 0 0 10px rgba(79, 209, 197, 0.5), 0 0 3px rgba(0,0,0,0.8);">North Pole</div>`,
        className: 'pole-label',
        iconSize: null,
      }),
    }).addTo(map);

    mapInstanceRef.current = map;

    // Handle zoom changes for LOD
    map.on('zoomend', () => {
      const zoom = map.getZoom();
      setCurrentZoom(zoom);
      const newLevel = Math.min(3, Math.max(0, Math.floor(zoom)));
      setCurrentLevel(newLevel);
    });

    // Handle map clicks for timeseries
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      // Only load timeseries for valid Arctic coordinates (lat > 50)
      if (lat > 50 && lat <= 90 && loadTimeseriesRef.current) {
        loadTimeseriesRef.current(lng, lat);
      }
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle basemap changes
  useEffect(() => {
    if (mapInstanceRef.current && basemapLayerRef.current) {
      const newUrl = POLAR_BASEMAPS[selectedBasemap].url;
      basemapLayerRef.current.setUrl(newUrl);
      console.log(`[POLAR] Basemap changed to: ${selectedBasemap}`);
    }
  }, [selectedBasemap]);

  // Load and display sea ice data
  const loadSeaIceData = useCallback(async (level, time, year = null, multiYear = false, datasetKey = 'sea_ice_multiyear') => {
    setLoading(true);
    const startTime = performance.now();
    setLoadStartTime(startTime);
    setLoadDuration(null);
    try {
      // Get dataset config
      const dsConfig = POLAR_DATASETS[datasetKey] || POLAR_DATASETS.sea_ice_multiyear;
      const effectiveLevel = dsConfig.maxLevel !== undefined ? Math.min(level, dsConfig.maxLevel) : level;
      const storePath = `${API_URL}${dsConfig.path}/${effectiveLevel}`;
      console.log(`[POLAR] Loading ${datasetKey} level ${effectiveLevel}, ${multiYear ? `year ${year}, ` : ''}time ${time}`);

      const store = new zarr.FetchStore(storePath);
      const root = zarr.root(store);
      const arr = await zarr.open(root.resolve(dsConfig.variable), { kind: 'array' });

      const shape = arr.shape;
      let size, slice;

      if (multiYear && shape.length === 4) {
        // Multi-year: [year, month, y, x]
        // Find year index
        const yearArr = await zarr.open(root.resolve('year'), { kind: 'array' });
        const yearResult = await zarr.get(yearArr, [null]);
        const years = Array.from(yearResult.data).map(y => Number(y));
        const yearIndex = years.indexOf(year);

        if (yearIndex === -1) {
          console.error(`[POLAR] Year ${year} not found in dataset. Available: ${years[0]}-${years[years.length-1]}`);
          setLoading(false);
          return;
        }

        size = shape[2]; // y dimension
        slice = await zarr.get(arr, [yearIndex, time, null, null]);
        console.log(`[POLAR] Loaded year ${year} (index ${yearIndex}), month ${time}`);
      } else {
        // Single year: [time, y, x]
        size = shape[1];
        slice = await zarr.get(arr, [time, null, null]);
      }

      const rawData = slice.data;

      const rgba = applyColormap(rawData, size, size);

      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const imageData = new ImageData(rgba, size, size);
      ctx.putImageData(imageData, 0, 0);

      const dataUrl = canvas.toDataURL();

      if (mapInstanceRef.current) {
        // Use sea ice data bounds (different from GIBS map bounds)
        const sw = mapInstanceRef.current.options.crs.unproject(L.point(SEA_ICE_BOUNDS.xmin, SEA_ICE_BOUNDS.ymin));
        const ne = mapInstanceRef.current.options.crs.unproject(L.point(SEA_ICE_BOUNDS.xmax, SEA_ICE_BOUNDS.ymax));
        const latLngBounds = L.latLngBounds(sw, ne);

        if (imageOverlayRef.current) {
          imageOverlayRef.current.setUrl(dataUrl);
        } else {
          imageOverlayRef.current = L.imageOverlay(dataUrl, latLngBounds, {
            opacity: 0.85,
            interactive: false,
          }).addTo(mapInstanceRef.current);
        }
      }

      console.log(`[POLAR] Loaded successfully`);
      // Stop timer
      const endTime = performance.now();
      const duration = endTime - startTime;
      setLoadDuration(duration);
      setLoadStartTime(null);
      console.log(`[POLAR TIMER] Loaded in ${duration.toFixed(0)}ms`);
    } catch (error) {
      console.error('[POLAR] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load timeseries for clicked point
  const loadTimeseries = useCallback(async (lng, lat) => {
    setTimeseriesLoading(true);
    setClickedPoint({ lng, lat });

    try {
      const level = 2; // Use a middle resolution for timeseries
      const storePath = `${API_URL}/zarr/sea_ice_polar_multiyear/${level}`;
      const store = new zarr.FetchStore(storePath);
      const root = zarr.root(store);
      const arr = await zarr.open(root.resolve('ice_concentration'), { kind: 'array' });

      // Get x/y coordinate arrays
      const xArr = await zarr.open(root.resolve('x'), { kind: 'array' });
      const yArr = await zarr.open(root.resolve('y'), { kind: 'array' });
      const xResult = await zarr.get(xArr);
      const yResult = await zarr.get(yArr);
      const xCoords = Array.from(xResult.data);
      const yCoords = Array.from(yResult.data);

      // Convert lat/lon to EPSG:3413 polar stereographic
      const wgs84 = 'EPSG:4326';
      const polar = EPSG3413;
      const [polarX, polarY] = proj4(wgs84, polar, [lng, lat]);

      // Find nearest pixel indices
      const xIdx = findNearestIndex(xCoords, polarX);
      const yIdx = findNearestIndex(yCoords, polarY);

      console.log(`[POLAR Timeseries] (${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E) -> polar (${polarX.toFixed(0)}, ${polarY.toFixed(0)}) -> pixel (${xIdx}, ${yIdx})`);

      // Get year array
      const yearArr = await zarr.open(root.resolve('year'), { kind: 'array' });
      const yearResult = await zarr.get(yearArr);
      const years = Array.from(yearResult.data).map(y => Number(y));
      const yearIndex = years.indexOf(selectedYear);

      if (yearIndex === -1) {
        throw new Error(`Year ${selectedYear} not found`);
      }

      // Load all 12 months for this year at this location
      const result = await zarr.get(arr, [yearIndex, null, yIdx, xIdx]);
      const monthValues = result.data;

      let timeseriesData = [];
      for (let m = 0; m < 12; m++) {
        const value = monthValues[m];
        timeseriesData.push({
          month: MONTHS[m],
          monthIdx: m,
          value: (isNaN(value) || value < 0 || value > 100) ? null : Number(value),
        });
      }

      console.log(`[POLAR Timeseries] Year ${selectedYear}:`, timeseriesData.map(d => d.value?.toFixed(1)));

      const hasValidData = timeseriesData.some(d => d.value !== null);
      if (hasValidData) {
        setTimeseries(timeseriesData);
      } else {
        setTimeseries(null);
      }
    } catch (err) {
      console.error('[POLAR Timeseries] Error:', err);
      setTimeseries(null);
    } finally {
      setTimeseriesLoading(false);
    }
  }, [selectedYear]);

  // Keep loadTimeseriesRef in sync with latest function
  useEffect(() => {
    loadTimeseriesRef.current = loadTimeseries;
  }, [loadTimeseries]);

  // Load data when level, time, year, or dataset changes
  useEffect(() => {
    if (mapInstanceRef.current) {
      console.log(`[POLAR] Time/Level changed - loading ${selectedPolarDataset}, ${isMultiYear ? `year=${selectedYear}, ` : ''}time=${timeIndex} (${MONTHS[timeIndex]}), level=${currentLevel}`);
      loadSeaIceData(currentLevel, timeIndex, selectedYear, isMultiYear, selectedPolarDataset);
    }
  }, [currentLevel, timeIndex, selectedYear, isMultiYear, selectedPolarDataset, loadSeaIceData]);

  // Show modal when switching to sea_ice_with_quality (only once)
  useEffect(() => {
    const dsConfig = POLAR_DATASETS[selectedPolarDataset];
    if (dsConfig?.hasUncertainty && !uncertaintyModalShown) {
      setUncertaintyModalOpen(true);
      setUncertaintyModalShown(true);
    }
    // Reset showUncertainty when switching away from quality dataset
    if (!dsConfig?.hasUncertainty) {
      setShowUncertainty(false);
    }
  }, [selectedPolarDataset, uncertaintyModalShown]);

  // Load and display uncertainty overlay when enabled
  useEffect(() => {
    const dsConfig = POLAR_DATASETS[selectedPolarDataset];
    if (!showUncertainty || !dsConfig?.hasUncertainty || !mapInstanceRef.current) {
      // Remove uncertainty overlay if it exists
      if (uncertaintyOverlayRef.current) {
        uncertaintyOverlayRef.current.remove();
        uncertaintyOverlayRef.current = null;
      }
      return;
    }

    const loadUncertaintyOverlay = async () => {
      try {
        const level = dsConfig.maxLevel !== undefined ? Math.min(currentLevel, dsConfig.maxLevel) : currentLevel;
        const storePath = `${API_URL}${dsConfig.path}/${level}`;
        const store = new zarr.FetchStore(storePath);
        const root = zarr.root(store);
        const arr = await zarr.open(root.resolve(dsConfig.uncertaintyVariable), { kind: 'array' });

        const shape = arr.shape;
        const size = shape[1];
        const slice = await zarr.get(arr, [timeIndex, null, null]);
        const uncertaintyData = slice.data;

        // Create orange overlay for high uncertainty areas
        const rgba = new Uint8ClampedArray(size * size * 4);
        for (let i = 0; i < size * size; i++) {
          const idx = i * 4;
          const uncertainty = uncertaintyData[i];

          if (isNaN(uncertainty) || uncertainty < 5) {
            rgba[idx] = 0;
            rgba[idx + 1] = 0;
            rgba[idx + 2] = 0;
            rgba[idx + 3] = 0;
          } else if (uncertainty < 15) {
            rgba[idx] = 255;
            rgba[idx + 1] = 180;
            rgba[idx + 2] = 0;
            rgba[idx + 3] = Math.min(80, (uncertainty - 5) * 8);
          } else if (uncertainty < 25) {
            rgba[idx] = 255;
            rgba[idx + 1] = 120;
            rgba[idx + 2] = 0;
            rgba[idx + 3] = Math.min(140, 80 + (uncertainty - 15) * 6);
          } else {
            rgba[idx] = 255;
            rgba[idx + 1] = 60;
            rgba[idx + 2] = 0;
            rgba[idx + 3] = Math.min(200, 140 + (uncertainty - 25) * 3);
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = new ImageData(rgba, size, size);
        ctx.putImageData(imageData, 0, 0);
        const dataUrl = canvas.toDataURL();

        const sw = mapInstanceRef.current.options.crs.unproject(L.point(SEA_ICE_BOUNDS.xmin, SEA_ICE_BOUNDS.ymin));
        const ne = mapInstanceRef.current.options.crs.unproject(L.point(SEA_ICE_BOUNDS.xmax, SEA_ICE_BOUNDS.ymax));
        const latLngBounds = L.latLngBounds(sw, ne);

        if (uncertaintyOverlayRef.current) {
          uncertaintyOverlayRef.current.setUrl(dataUrl);
        } else {
          uncertaintyOverlayRef.current = L.imageOverlay(dataUrl, latLngBounds, {
            opacity: 0.8,
            interactive: false,
          }).addTo(mapInstanceRef.current);
        }
        console.log('[POLAR] Uncertainty overlay loaded');
      } catch (error) {
        console.error('[POLAR] Error loading uncertainty:', error);
      }
    };

    loadUncertaintyOverlay();
  }, [showUncertainty, selectedPolarDataset, timeIndex, currentLevel]);

  // Handle autoplay - cycles through months and years for multi-year mode
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        if (isMultiYear) {
          // Multi-year: cycle through months, then advance year
          setTimeIndex((prevMonth) => {
            if (prevMonth >= 11) {
              // Move to next year
              setSelectedYear((prevYear) => {
                const maxYear = SEA_ICE_MULTIYEAR.yearRange.end;
                const minYear = SEA_ICE_MULTIYEAR.yearRange.start;
                return prevYear >= maxYear ? minYear : prevYear + 1;
              });
              return 0;
            }
            return prevMonth + 1;
          });
        } else {
          // Single year: just cycle months
          setTimeIndex((prev) => (prev + 1) % 12);
        }
      }, 800); // Slightly faster for multi-year
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    }
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, isMultiYear]);

  // Zoom handlers
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', background: '#1a1a2e' }}>
      {/* Map container */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Tech Info Panel - Top Right (matching ZarrMap exactly) */}
      <Paper
        shadow="lg"
        p="sm"
        radius="md"
        className="ecv-control"
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'rgba(26, 26, 46, 0.95)',
          backdropFilter: 'blur(20px)',
          zIndex: 1000,
          minWidth: 220,
          maxWidth: 350,
          border: '1px solid rgba(79, 209, 197, 0.2)',
        }}
      >
        <Group gap="sm" justify="space-between" style={{ cursor: 'pointer' }} onClick={() => setTechInfoOpen(!techInfoOpen)}>
          <Text size="xs" fw={500} c="white">Tech Info</Text>
          <Group gap="xs">
            <Badge color="cyan" size="sm">LOD {currentLevel}</Badge>
            <Badge color="teal" size="sm">ZOOM {currentZoom.toFixed(1)}</Badge>
            {/* Load timer - always visible */}
            {loadDuration !== null && (
              <Badge
                color={loadDuration < 2000 ? 'green' : 'red'}
                size="sm"
                variant="filled"
                style={{ fontFamily: 'monospace', minWidth: 60 }}
              >
                {loadDuration < 1000
                  ? `${loadDuration.toFixed(0)}ms`
                  : `${(loadDuration / 1000).toFixed(2)}s`}
              </Badge>
            )}
            {loading && (
              <Badge color="yellow" size="sm" variant="filled" style={{ fontFamily: 'monospace' }}>
                Loading...
              </Badge>
            )}
            <ActionIcon size="xs" variant="subtle" color="cyan">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  transform: techInfoOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              >
                <polyline points="6,9 12,15 18,9" />
              </svg>
            </ActionIcon>
          </Group>
        </Group>

        <Collapse in={techInfoOpen}>
          <Divider my="xs" color="rgba(79, 209, 197, 0.2)" />
          <Stack gap="xs">
            <Box>
              <Text size="xs" c="cyan" fw={500} mb={2}>Data Source</Text>
              <Anchor
                href={DATASET_INFO.source.url}
                target="_blank"
                size="xs"
                c="dimmed"
                style={{ textDecoration: 'none' }}
              >
                {DATASET_INFO.source.name} ↗
              </Anchor>
              <Text size="xs" c="dimmed">{DATASET_INFO.source.dataset}</Text>
              <Text size="xs" c="dimmed">Provider: {DATASET_INFO.source.provider}</Text>
            </Box>

            <Box>
              <Text size="xs" c="cyan" fw={500} mb={2}>Raw Data</Text>
              <Text size="xs" c="dimmed">Resolution: {DATASET_INFO.rawData.resolution}</Text>
              <Text size="xs" c="dimmed">Projection: {DATASET_INFO.rawData.projection}</Text>
              <Text size="xs" c="dimmed">Time: {DATASET_INFO.rawData.temporalCoverage}</Text>
              <Text size="xs" c="dimmed">Coverage: {DATASET_INFO.rawData.spatialCoverage}</Text>
            </Box>

            <Box>
              <Text size="xs" c="cyan" fw={500} mb={2}>Processing</Text>
              <Text size="xs" c="dimmed">{DATASET_INFO.processing.reprojection}</Text>
              <Text size="xs" c="dimmed">Pyramid: {DATASET_INFO.processing.pyramid}</Text>
              <Text size="xs" c="dimmed">Resampling: {DATASET_INFO.processing.resampling}</Text>
              <Text size="xs" c="dimmed">Format: {DATASET_INFO.processing.format}</Text>
              <Text size="xs" c="dimmed">Chunking: {DATASET_INFO.processing.chunking}</Text>
            </Box>

            <Box>
              <Text size="xs" c="cyan" fw={500} mb={2}>Browser Tech</Text>
              <Text size="xs" c="dimmed">Map: {TECH_STACK.browser.visualization}</Text>
              <Text size="xs" c="dimmed">Zarr: {TECH_STACK.browser.zarrLoader}</Text>
              <Text size="xs" c="dimmed">UI: {TECH_STACK.browser.ui}</Text>
              <Text size="xs" c="dimmed">CRS: {TECH_STACK.browser.projection}</Text>
            </Box>

            {/* Basemap Selector */}
            <Box>
              <Text size="xs" c="cyan" fw={500} mb={4}>Basemap</Text>
              <Group gap="xs">
                {Object.entries(POLAR_BASEMAPS).map(([key, basemap]) => (
                  <Badge
                    key={key}
                    size="sm"
                    variant={selectedBasemap === key ? 'filled' : 'outline'}
                    color={selectedBasemap === key ? 'cyan' : 'gray'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedBasemap(key)}
                  >
                    {basemap.name}
                  </Badge>
                ))}
              </Group>
              <Text size="xs" c="dimmed" mt={4}>
                {POLAR_BASEMAPS[selectedBasemap].description}
              </Text>
            </Box>

            <Box>
              <Text size="xs" c="cyan" fw={500} mb={2}>Current View</Text>
              <Text size="xs" c="dimmed">LOD Level: {currentLevel} ({PYRAMID_LEVELS[currentLevel]}px)</Text>
              <Text size="xs" c="dimmed">Zoom: {currentZoom.toFixed(1)}</Text>
              <Text size="xs" c="dimmed">Time: {MONTHS[timeIndex]} {isMultiYear ? selectedYear : '2023'}</Text>
              {isMultiYear && (
                <Text size="xs" c="dimmed">Mode: Multi-year ({SEA_ICE_MULTIYEAR.totalYears} years)</Text>
              )}
            </Box>
          </Stack>
        </Collapse>
      </Paper>

      {/* Control Panel - Top Left (matching ZarrMap exactly) */}
      <Paper
        shadow="lg"
        p="md"
        radius="md"
        className="ecv-control"
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
        {/* App Title - clickable to return to main view */}
        <div style={{ marginBottom: 16 }}>
          <Text
            size="lg"
            fw={700}
            onClick={onBack}
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
          {/* Dataset selector - switches back to main view for other datasets */}
          <Select
            label="Dataset"
            size="xs"
            value={selectedPolarDataset}
            onChange={(value) => {
              if (value === 'sea_ice') {
                setSelectedPolarDataset('sea_ice');
                setIsMultiYear(false);
                setSelectedYear(2023);
              } else if (value === 'sea_ice_multiyear') {
                setSelectedPolarDataset('sea_ice_multiyear');
                setIsMultiYear(true);
                setSelectedYear(2020);
              } else if (value === 'sea_ice_with_quality') {
                setSelectedPolarDataset('sea_ice_with_quality');
                setIsMultiYear(false);
                setTimeIndex(0);
              } else if (onBack) {
                onBack();
              }
            }}
            data={Object.entries(DATASETS).map(([key, cfg]) => ({
              value: key,
              label: cfg.name,
            }))}
            styles={{
              input: { background: 'rgba(255,255,255,0.05)' },
              dropdown: { zIndex: 10000 }
            }}
            comboboxProps={{ zIndex: 10000 }}
          />

          {/* Time slider - combined year+month for multi-year mode */}
          <div>
            <Group justify="space-between" mb={4}>
              <Text size="xs" c="white" fw={500}>
                {MONTHS[timeIndex]} {isMultiYear ? selectedYear : '2023'}
              </Text>
              <Group gap={4}>
                {isMultiYear && (
                  <Badge size="xs" color="cyan" variant="filled">
                    {SEA_ICE_MULTIYEAR.totalYears} YEARS
                  </Badge>
                )}
                <ActionIcon
                  variant={isPlaying ? 'filled' : 'light'}
                  color="cyan"
                  size="sm"
                  onClick={() => setIsPlaying(!isPlaying)}
                  title={isPlaying ? 'Pause' : 'Play animation'}
                >
                  {isPlaying ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  )}
                </ActionIcon>
              </Group>
            </Group>
            {isMultiYear ? (
              <Slider
                value={(selectedYear - SEA_ICE_MULTIYEAR.yearRange.start) * 12 + timeIndex}
                onChange={(val) => {
                  const yearOffset = Math.floor(val / 12);
                  const monthOffset = val % 12;
                  setSelectedYear(SEA_ICE_MULTIYEAR.yearRange.start + yearOffset);
                  setTimeIndex(monthOffset);
                }}
                min={0}
                max={(SEA_ICE_MULTIYEAR.totalYears) * 12 - 1}
                step={1}
                marks={[
                  { value: 0, label: '1988' },
                  { value: 12 * 12, label: '2000' },
                  { value: 24 * 12, label: '2012' },
                  { value: 35 * 12, label: '2023' },
                ]}
                size="xs"
                color="cyan"
              />
            ) : (
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
            )}
          </div>

          {/* Uncertainty Toggle - only for sea_ice_with_quality */}
          {POLAR_DATASETS[selectedPolarDataset]?.hasUncertainty && (
            <Group justify="space-between" align="center" mt="xs">
              <div>
                <Text size="xs" c="dimmed">Uncertainty Overlay</Text>
                <Text size="xs" c="dimmed" style={{ fontSize: '10px', opacity: 0.7 }}>
                  Highlight high uncertainty areas
                </Text>
              </div>
              <Switch
                checked={showUncertainty}
                onChange={(e) => setShowUncertainty(e.currentTarget.checked)}
                color="orange"
                size="sm"
              />
            </Group>
          )}

          {/* Description */}
          <Text size="xs" c="dimmed" mt="xs">
            {selectedPolarDataset === 'sea_ice_with_quality'
              ? 'Arctic Sea Ice with Quality Data — Sample'
              : `Arctic Sea Ice Concentration — ${isMultiYear ? `${SEA_ICE_MULTIYEAR.yearRange.start}-${SEA_ICE_MULTIYEAR.yearRange.end}` : '2023'}`
            }
          </Text>

          {/* Badges */}
          <Group gap={4}>
            <Badge size="xs" color="cyan" variant="light">
              {selectedPolarDataset === 'sea_ice_with_quality' ? '3 LOD LEVELS' : '4 LOD LEVELS'}
            </Badge>
            <Badge size="xs" color="teal" variant="light">ZARR V2</Badge>
            {isMultiYear && (
              <Badge size="xs" color="grape" variant="light">{SEA_ICE_MULTIYEAR.totalYears} YEARS</Badge>
            )}
            {POLAR_DATASETS[selectedPolarDataset]?.hasUncertainty && (
              <Badge size="xs" color="orange" variant="light">QUALITY DATA</Badge>
            )}
          </Group>
        </Stack>
      </Paper>

      {/* Zoom Controls - Bottom Left */}
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
          <ActionIcon variant="subtle" color="cyan" onClick={handleZoomIn} title="Zoom in">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </ActionIcon>
          <ActionIcon variant="subtle" color="cyan" onClick={handleZoomOut} title="Zoom out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </ActionIcon>
        </Stack>
      </Paper>

      {/* Legend - Bottom Right */}
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
        <Text size="xs" fw={600} c="cyan" mb={8}>Sea Ice Concentration</Text>
        <Group gap={8} align="flex-start">
          <Stack gap={0} align="center">
            <Text size="xs" c="white" fw={500}>100.0</Text>
            <div style={{
              width: 16,
              height: 100,
              background: `linear-gradient(to bottom, ${
                [...ICE_COLORMAP].reverse()
                  .map((c, i, arr) => `rgb(${c[0]},${c[1]},${c[2]}) ${i/(arr.length-1)*100}%`)
                  .join(', ')
              })`,
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              margin: '4px 0',
            }} />
            <Text size="xs" c="white" fw={500}>0.0</Text>
          </Stack>
          <Text size="xs" c="dimmed" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            %
          </Text>
        </Group>
      </Paper>

      {/* Click-to-Timeseries Chart - Bottom Left */}
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
                  Sea Ice Concentration ({selectedYear})
                </Text>
                {clickedPoint && (
                  <Text size="xs" c="dimmed">
                    {clickedPoint.lat.toFixed(2)}°N, {clickedPoint.lng.toFixed(2)}°E
                  </Text>
                )}
              </div>
              <CloseButton
                size="sm"
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
                <div style={{
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
                    domain={[0, 100]}
                    tick={{ fill: '#888', fontSize: 10 }}
                    axisLine={{ stroke: '#444' }}
                    tickFormatter={(v) => v.toFixed(0)}
                    label={{
                      value: '%',
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
                      value != null ? `${value.toFixed(1)}%` : 'N/A',
                      'Ice Concentration'
                    ]}
                  />
                  <ReferenceLine x={MONTHS[timeIndex]} stroke="#4fd1c5" strokeDasharray="5 5" />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#63b3ed"
                    strokeWidth={2}
                    dot={{ fill: '#63b3ed', r: 3 }}
                    activeDot={{ r: 5, fill: '#fff' }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Text size="sm" c="dimmed" ta="center" mt="xl">
                No data available for this location (ocean or outside coverage)
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
            overflow: 'hidden',
          }}>
            <div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, transparent, #4fd1c5, transparent)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s ease-in-out infinite',
              }}
            />
          </div>
        )}
      </Transition>

      {/* CSS */}
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
        .leaflet-control-attribution a {
          color: #4fd1c5 !important;
        }
        .ecv-control:hover {
          transform: scale(1.01);
          box-shadow: 0 0 20px rgba(79, 209, 197, 0.2);
        }
        .ecv-control {
          transition: all 0.2s ease;
        }
      `}</style>

      {/* Uncertainty Modal - shown when switching to sea_ice_with_quality */}
      <Modal
        opened={uncertaintyModalOpen}
        onClose={() => setUncertaintyModalOpen(false)}
        title="Dataset with Quality Data"
        centered
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
        styles={{
          header: { background: 'rgba(26, 26, 46, 0.98)' },
          content: { background: 'rgba(26, 26, 46, 0.98)' },
          title: { color: '#4fd1c5', fontWeight: 700 },
        }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            This dataset includes <Text span c="orange" fw={600}>uncertainty</Text> and{' '}
            <Text span c="cyan" fw={600}>quality flag</Text> information.
          </Text>
          <Text size="sm" c="dimmed">
            Toggle the uncertainty overlay to visualise data reliability:
          </Text>
          <Group gap="xs">
            <Badge color="orange" variant="light">High uncertainty</Badge>
            <Text size="xs" c="dimmed">= lower confidence in values</Text>
          </Group>
          <Text size="xs" c="dimmed" style={{ fontStyle: 'italic', marginTop: 8 }}>
            Use the "Uncertainty Overlay" toggle in the controls panel.
          </Text>
          <ActionIcon
            variant="filled"
            color="cyan"
            size="lg"
            onClick={() => setUncertaintyModalOpen(false)}
            style={{ alignSelf: 'center', marginTop: 8 }}
          >
            <Text size="sm" fw={600}>Got it</Text>
          </ActionIcon>
        </Stack>
      </Modal>
    </div>
  );
}
