/**
 * RegionComputation - Draw polygons and compute mean values
 * Shift+Click to start drawing, click to add vertices, Enter or click near start to close
 */
import { useState, useCallback, useEffect } from 'react';
import { PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import {
  Paper,
  Text,
  Group,
  Badge,
  ActionIcon,
  Stack,
  Tooltip as MantineTooltip,
} from '@mantine/core';

// Check if a point is near another point (for closing polygon)
function isNearPoint(p1, p2, threshold = 10) {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy) < threshold;
}

// Ray casting algorithm to check if point is inside polygon
function pointInPolygon(point, polygon) {
  const x = point[0];
  const y = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

// Get bounding box of polygon
function getPolygonBounds(polygon) {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  for (const [lon, lat] of polygon) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return { minLon, maxLon, minLat, maxLat };
}

// Get centroid of polygon for placing the result callout
function getPolygonCentroid(polygon) {
  let cx = 0, cy = 0;
  for (const [lon, lat] of polygon) {
    cx += lon;
    cy += lat;
  }
  return [cx / polygon.length, cy / polygon.length];
}

export function useRegionComputation({ enabled, onComputeMean }) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [vertices, setVertices] = useState([]);
  const [closedPolygon, setClosedPolygon] = useState(null);
  const [computeResult, setComputeResult] = useState(null);
  const [isComputing, setIsComputing] = useState(false);

  // Start drawing mode (can be triggered by button)
  const startDrawing = useCallback(() => {
    console.log('[Region] Entering drawing mode');
    setIsDrawing(true);
    setVertices([]);
    setClosedPolygon(null);
    setComputeResult(null);
  }, []);

  // Handle click event
  const handleClick = useCallback((info, event) => {
    if (!enabled) return false;
    if (!info?.coordinate) return false;

    const coords = [info.coordinate[0], info.coordinate[1]];

    // Check for Shift key - deck.gl passes native event directly
    const shiftKey = event?.shiftKey || event?.srcEvent?.shiftKey;

    // Shift+Click OR already in drawing mode starts/continues polygon
    if (shiftKey && !isDrawing) {
      console.log('[Region] Starting polygon via Shift+Click at', coords);
      setIsDrawing(true);
      setVertices([coords]);
      setClosedPolygon(null);
      setComputeResult(null);
      return true;
    }

    // If in drawing mode and no vertices yet, add first vertex
    if (isDrawing && vertices.length === 0) {
      console.log('[Region] Adding first vertex at', coords);
      setVertices([coords]);
      return true;
    }

    // If drawing, add vertex or close polygon
    if (isDrawing) {
      console.log('[Region] Adding vertex', vertices.length + 1, 'at', coords);

      // Check if clicking near start point to close
      if (vertices.length >= 3 && isNearPoint(coords, vertices[0], 0.5)) {
        console.log('[Region] Closing polygon with', vertices.length, 'vertices');
        // Close the polygon
        const polygon = [...vertices];
        setClosedPolygon(polygon);
        setIsDrawing(false);

        // Trigger computation
        if (onComputeMean) {
          setIsComputing(true);
          onComputeMean(polygon).then(result => {
            console.log('[Region] Computation result:', result);
            setComputeResult(result);
            setIsComputing(false);
          }).catch((err) => {
            console.error('[Region] Computation error:', err);
            setIsComputing(false);
          });
        }
        return true;
      }

      // Add new vertex
      setVertices(prev => [...prev, coords]);
      return true;
    }

    return false;
  }, [enabled, isDrawing, vertices, onComputeMean]);

  // Handle keyboard events (Enter to close, Escape to cancel)
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && isDrawing && vertices.length >= 3) {
        // Close polygon
        const polygon = [...vertices];
        setClosedPolygon(polygon);
        setIsDrawing(false);

        if (onComputeMean) {
          setIsComputing(true);
          onComputeMean(polygon).then(result => {
            setComputeResult(result);
            setIsComputing(false);
          }).catch(() => {
            setIsComputing(false);
          });
        }
      } else if (e.key === 'Escape') {
        // Cancel drawing
        setIsDrawing(false);
        setVertices([]);
        setClosedPolygon(null);
        setComputeResult(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, isDrawing, vertices, onComputeMean]);

  // Clear region
  const clearRegion = useCallback(() => {
    setIsDrawing(false);
    setVertices([]);
    setClosedPolygon(null);
    setComputeResult(null);
  }, []);

  // Build layers for rendering
  const layers = [];

  // Drawing outline layer (during drawing)
  if (isDrawing && vertices.length > 0) {
    // Line connecting vertices
    if (vertices.length > 1) {
      layers.push(
        new PolygonLayer({
          id: 'region-drawing-outline',
          data: [{ polygon: vertices }],
          getPolygon: d => d.polygon,
          getFillColor: [79, 209, 197, 30],
          getLineColor: [79, 209, 197, 200],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          stroked: true,
          filled: true,
          pickable: false,
        })
      );
    }

    // Vertex points
    layers.push(
      new ScatterplotLayer({
        id: 'region-drawing-vertices',
        data: vertices.map((v, i) => ({ position: v, isStart: i === 0 })),
        getPosition: d => d.position,
        getRadius: d => d.isStart ? 8 : 5,
        getFillColor: d => d.isStart ? [255, 200, 0, 255] : [79, 209, 197, 255],
        radiusUnits: 'pixels',
        pickable: false,
      })
    );
  }

  // Closed polygon layer
  if (closedPolygon) {
    layers.push(
      new PolygonLayer({
        id: 'region-closed-polygon',
        data: [{ polygon: closedPolygon }],
        getPolygon: d => d.polygon,
        getFillColor: [79, 209, 197, 50],
        getLineColor: [79, 209, 197, 255],
        getLineWidth: 3,
        lineWidthUnits: 'pixels',
        stroked: true,
        filled: true,
        pickable: false,
      })
    );
  }

  return {
    handleClick,
    layers,
    isDrawing,
    closedPolygon,
    computeResult,
    isComputing,
    clearRegion,
    startDrawing,
    vertexCount: vertices.length,
  };
}

// Result callout component
export function RegionResultCallout({ result, polygon, onClear, unit }) {
  if (!result || !polygon) return null;

  const centroid = getPolygonCentroid(polygon);

  return (
    <Paper
      p="xs"
      radius="md"
      style={{
        position: 'absolute',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(26, 26, 46, 0.98)',
        border: '1px solid rgba(79, 209, 197, 0.5)',
        zIndex: 1000,
        minWidth: 200,
      }}
    >
      <Group justify="space-between" mb={4}>
        <Text size="sm" fw={700} c="cyan">Region Statistics</Text>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="xs"
          onClick={onClear}
          aria-label="Clear region"
        >
          <Text size="xs">✕</Text>
        </ActionIcon>
      </Group>

      <Stack gap={4}>
        <Group gap={8}>
          <Text size="xs" c="dimmed">Mean:</Text>
          <Badge color="cyan" size="sm" variant="filled">
            {typeof result.mean === 'number' ? result.mean.toFixed(4) : 'N/A'} {unit}
          </Badge>
        </Group>

        {result.min !== undefined && (
          <Group gap={8}>
            <Text size="xs" c="dimmed">Range:</Text>
            <Text size="xs" c="white">
              {result.min.toFixed(4)} – {result.max.toFixed(4)} {unit}
            </Text>
          </Group>
        )}

        {result.count !== undefined && (
          <Group gap={8}>
            <Text size="xs" c="dimmed">Pixels:</Text>
            <Text size="xs" c="white">{result.count.toLocaleString()}</Text>
          </Group>
        )}

        <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
          Press Escape or click ✕ to clear
        </Text>
      </Stack>
    </Paper>
  );
}

// Instructions overlay shown when drawing
export function DrawingInstructions({ isDrawing, vertexCount }) {
  if (!isDrawing) return null;

  return (
    <Paper
      p="xs"
      radius="md"
      style={{
        position: 'absolute',
        top: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(26, 26, 46, 0.95)',
        border: '1px solid rgba(79, 209, 197, 0.5)',
        zIndex: 1000,
      }}
    >
      <Group gap={8}>
        <Badge color="yellow" size="sm" variant="filled">Drawing Mode</Badge>
        <Text size="xs" c="white">
          {vertexCount} vertices • Click to add • {vertexCount >= 3 ? 'Click near start or press Enter to close' : 'Add at least 3 points'}
        </Text>
        <Text size="xs" c="dimmed">Escape to cancel</Text>
      </Group>
    </Paper>
  );
}

export default useRegionComputation;
