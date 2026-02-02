import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Slider, ActionIcon, Group, Text, Paper, Select, Stack, SegmentedControl, Loader } from '@mantine/core';
import DeckGL from '@deck.gl/react';
import { BitmapLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { MapView, _GlobeView as GlobeView } from '@deck.gl/core';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const MONTHS = [
  '2023-01', '2023-02', '2023-03', '2023-04', '2023-05', '2023-06',
  '2023-07', '2023-08', '2023-09', '2023-10', '2023-11', '2023-12'
];

const VARIABLES = [
  { value: '2m_temperature', label: '2m Temperature' },
  { value: 'skin_temperature', label: 'Skin Temperature' },
];

const INITIAL_VIEW_STATE = {
  longitude: 10,
  latitude: 50,
  zoom: 3,
  minZoom: 0,
  maxZoom: 5,
  pitch: 0,
  bearing: 0,
};

export function ClimateMap() {
  const [timeIndex, setTimeIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [variable, setVariable] = useState('2m_temperature');
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [viewMode, setViewMode] = useState('map');
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [timeseries, setTimeseries] = useState(null);
  const [loadingTimeseries, setLoadingTimeseries] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [preloaded, setPreloaded] = useState(false);

  const intervalRef = useRef(null);

  // Preload all frames on mount for smooth animation
  useEffect(() => {
    const preloadTiles = async () => {
      setPreloaded(false);
      setPreloadProgress(0);

      // Preload key tiles for each time index at current zoom level
      const zoom = Math.round(viewState.zoom);
      const centerX = Math.floor((viewState.longitude + 180) / 360 * Math.pow(2, zoom));
      const centerY = Math.floor((1 - Math.log(Math.tan(viewState.latitude * Math.PI / 180) + 1 / Math.cos(viewState.latitude * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));

      const tilesToPreload = [];
      // Preload a 5x5 grid around center for each time index
      for (let t = 0; t < 12; t++) {
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -2; dy <= 2; dy++) {
            const x = Math.max(0, centerX + dx);
            const y = Math.max(0, centerY + dy);
            tilesToPreload.push(`${API_URL}/tiles/${variable}/${t}/${zoom}/${x}/${y}.png?v=3`);
          }
        }
      }

      let loaded = 0;
      const loadPromises = tilesToPreload.map(url =>
        new Promise(resolve => {
          const img = new Image();
          img.onload = img.onerror = () => {
            loaded++;
            setPreloadProgress(Math.round((loaded / tilesToPreload.length) * 100));
            resolve();
          };
          img.src = url;
        })
      );

      await Promise.all(loadPromises);
      setPreloaded(true);
    };

    preloadTiles();
  }, [variable]); // Re-preload when variable changes

  // Animation
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setTimeIndex(prev => (prev + 1) % 12);
      }, 500);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [playing]);

  // Fetch timeseries when point is clicked
  useEffect(() => {
    if (!selectedPoint) {
      setTimeseries(null);
      return;
    }

    const fetchTimeseries = async () => {
      setLoadingTimeseries(true);
      try {
        const response = await fetch(
          `${API_URL}/api/timeseries?variable=${variable}&lat=${selectedPoint.lat}&lon=${selectedPoint.lon}`
        );
        if (response.ok) {
          const data = await response.json();
          setTimeseries(data);
        }
      } catch (err) {
        console.error('Timeseries fetch failed:', err);
      } finally {
        setLoadingTimeseries(false);
      }
    };

    fetchTimeseries();
  }, [selectedPoint, variable]);

  const handleClick = useCallback((info) => {
    if (info.coordinate) {
      const [lon, lat] = info.coordinate;
      setSelectedPoint({ lat, lon });
    }
  }, []);

  const handleVariableChange = (v) => {
    setVariable(v);
    setSelectedPoint(null);
    setTimeseries(null);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    if (mode === 'globe') {
      setViewState({ ...INITIAL_VIEW_STATE, zoom: 1.2 });
    } else {
      setViewState(INITIAL_VIEW_STATE);
    }
  };

  const togglePlay = () => setPlaying(p => !p);
  const resetView = () => {
    setViewState(viewMode === 'globe' ? { ...INITIAL_VIEW_STATE, zoom: 1.2 } : INITIAL_VIEW_STATE);
  };

  const variableLabel = VARIABLES.find(v => v.value === variable)?.label || variable;

  const view = useMemo(() => {
    if (viewMode === 'globe') {
      return new GlobeView({ id: 'globe', resolution: 10 });
    }
    return new MapView({ id: 'map', repeat: true });
  }, [viewMode]);

  // All 12 layers - stable IDs, visibility controlled by timeIndex
  // Not in useMemo so visibility updates each render without recreating layers
  const layers = Array.from({ length: 12 }, (_, idx) =>
    new TileLayer({
      id: `tile-layer-${variable}-${idx}`,
      data: `${API_URL}/tiles/${variable}/${idx}/{z}/{x}/{y}.png?v=3`,
      minZoom: 0,
      maxZoom: 5,
      tileSize: 256,
      visible: idx === timeIndex,
      renderSubLayers: (props) => {
        const { bbox: { west, south, east, north } } = props.tile;
        return new BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [west, south, east, north],
        });
      },
    })
  );

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#1a1a2e',
      position: 'relative',
    }}>
      <DeckGL
        views={view}
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => setViewState(vs)}
        controller={true}
        layers={layers}
        onClick={handleClick}
        getCursor={() => 'crosshair'}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Preload indicator */}
      {!preloaded && (
        <div style={{
          position: 'absolute',
          top: 20,
          right: 20,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(0,0,0,0.8)',
          padding: '8px 14px',
          borderRadius: 8,
        }}>
          <Loader size="xs" color="cyan" />
          <Text size="xs" c="white">
            Preloading frames... {preloadProgress}%
          </Text>
        </div>
      )}

      {/* Control panel */}
      <Paper
        shadow="lg"
        p="md"
        radius="md"
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(10px)',
          width: 260,
          zIndex: 5,
        }}
      >
        <Text size="lg" fw={600} c="cyan" mb="md">Climate Data Explorer</Text>

        <Stack gap="sm">
          <div>
            <Text size="xs" c="dimmed" mb={4}>View Mode</Text>
            <SegmentedControl
              size="xs"
              value={viewMode}
              onChange={handleViewModeChange}
              data={[
                { value: 'map', label: 'Map' },
                { value: 'globe', label: 'Globe' },
              ]}
              fullWidth
              styles={{ root: { background: 'rgba(255,255,255,0.05)' } }}
            />
          </div>

          <Select
            label="Variable"
            size="xs"
            value={variable}
            onChange={handleVariableChange}
            data={VARIABLES}
            styles={{ input: { background: 'rgba(255,255,255,0.05)' } }}
          />
        </Stack>

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #333' }}>
          <Text size="sm" c="dimmed">
            Period: <Text span c="white" fw={500}>{MONTHS[timeIndex]}</Text>
          </Text>
          <Text size="sm" c="dimmed">
            Variable: <Text span c="white">{variableLabel}</Text>
          </Text>
        </div>

        <Group mt="sm" gap="xs">
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={resetView} title="Reset view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </ActionIcon>
          <Text size="xs" c="dimmed">Scroll zoom | Drag pan | Click query</Text>
        </Group>
      </Paper>

      {/* Color scale */}
      <Paper
        shadow="lg"
        p="sm"
        radius="md"
        style={{
          position: 'absolute',
          bottom: 100,
          right: 20,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(10px)',
          zIndex: 5,
        }}
      >
        <Text size="xs" c="dimmed" mb={4}>{variableLabel} (°C)</Text>
        <Group gap={8}>
          <Text size="xs" c="white">-40°</Text>
          <div style={{
            width: 120,
            height: 12,
            background: 'linear-gradient(to right, #313695, #4575b4, #74add1, #abd9e9, #fee090, #fdae61, #f46d43, #d73027, #a50026)',
            borderRadius: 2,
          }} />
          <Text size="xs" c="white">40°</Text>
        </Group>
      </Paper>

      {/* Timeseries panel */}
      {selectedPoint && (
        <Paper
          shadow="lg"
          p="md"
          radius="md"
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            background: 'rgba(0,0,0,0.9)',
            backdropFilter: 'blur(10px)',
            width: 320,
            zIndex: 5,
          }}
        >
          <Group justify="space-between" mb="sm">
            <Text size="sm" fw={500} c="white">
              Location: {selectedPoint.lat.toFixed(2)}°, {selectedPoint.lon.toFixed(2)}°
            </Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => setSelectedPoint(null)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </ActionIcon>
          </Group>

          {loadingTimeseries ? (
            <Group justify="center" py="xl">
              <Loader size="sm" color="cyan" />
            </Group>
          ) : timeseries ? (
            <div>
              <Text size="xs" c="dimmed" mb="xs">{variableLabel} - 2023</Text>
              <div style={{ height: 150 }}>
                <SimpleChart data={timeseries} currentIndex={timeIndex} />
              </div>
            </div>
          ) : (
            <Text size="xs" c="dimmed">Loading data...</Text>
          )}
        </Paper>
      )}

      {/* Time slider */}
      <Paper
        shadow="xl"
        p="md"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(0,0,0,0.9)',
          backdropFilter: 'blur(10px)',
          borderTop: '1px solid #333',
          zIndex: 5,
        }}
      >
        <Group gap="md" align="center">
          <ActionIcon
            variant="filled"
            color="cyan"
            size="lg"
            radius="xl"
            onClick={togglePlay}
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </ActionIcon>

          <Text size="sm" c="white" fw={500} style={{ minWidth: 80 }}>
            {MONTHS[timeIndex]}
          </Text>

          <Slider
            value={timeIndex}
            onChange={setTimeIndex}
            min={0}
            max={11}
            step={1}
            label={(val) => MONTHS[val]}
            style={{ flex: 1 }}
            color="cyan"
            size="sm"
            marks={MONTHS.map((m, i) => ({ value: i, label: m.slice(5) }))}
          />
        </Group>
      </Paper>
    </div>
  );
}

// Simple SVG line chart for timeseries
function SimpleChart({ data, currentIndex }) {
  if (!data?.values?.length) return null;

  const values = data.values;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const width = 300;
  const height = 140;
  const padding = { top: 10, right: 10, bottom: 25, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = values.map((v, i) => {
    const x = padding.left + (i / (values.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((v - min) / range) * chartHeight;
    return { x, y, value: v };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
        const y = padding.top + chartHeight * (1 - frac);
        const val = min + range * frac;
        return (
          <g key={i}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="#333"
              strokeWidth="1"
            />
            <text x={padding.left - 5} y={y + 4} fill="#666" fontSize="10" textAnchor="end">
              {val.toFixed(0)}°
            </text>
          </g>
        );
      })}

      {/* Line */}
      <path d={pathD} fill="none" stroke="#22d3ee" strokeWidth="2" />

      {/* Data points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === currentIndex ? 5 : 3}
          fill={i === currentIndex ? '#22d3ee' : '#1a1a2e'}
          stroke="#22d3ee"
          strokeWidth="2"
        />
      ))}

      {/* Month labels */}
      {data.times.map((t, i) => (
        <text
          key={i}
          x={points[i].x}
          y={height - 5}
          fill={i === currentIndex ? '#22d3ee' : '#666'}
          fontSize="9"
          textAnchor="middle"
        >
          {t.slice(5)}
        </text>
      ))}
    </svg>
  );
}
