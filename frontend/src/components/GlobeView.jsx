/**
 * GlobeView - 3D Globe visualisation with auto-rotate
 * Uses deck.gl's GlobeView with TileLayer for proper spherical rendering
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { BitmapLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { _GlobeView as GlobeViewDeck } from '@deck.gl/core';
import {
  Paper,
  Text,
  ActionIcon,
  Group,
  Badge,
  Stack,
  Tooltip as MantineTooltip,
} from '@mantine/core';

// Initial view state for globe
const INITIAL_VIEW_STATE = {
  latitude: 20,
  longitude: 0,
  zoom: 1,
  minZoom: 0,
  maxZoom: 4,
};

// Auto-rotate settings
const ROTATE_SPEED = 0.15; // degrees per frame
const ROTATE_INTERVAL = 50; // ms between rotation updates

export function GlobeView({
  imageUrl,
  bounds,
  onExit,
  datasetName,
  loading,
  loadDuration,
}) {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [userInteracting, setUserInteracting] = useState(false);
  const rotateIntervalRef = useRef(null);
  const lastInteractionRef = useRef(0);

  // Auto-rotate effect
  useEffect(() => {
    if (isAutoRotating && !userInteracting) {
      rotateIntervalRef.current = setInterval(() => {
        const timeSinceInteraction = Date.now() - lastInteractionRef.current;
        if (timeSinceInteraction > 2000) {
          setViewState(prev => ({
            ...prev,
            longitude: (prev.longitude + ROTATE_SPEED) % 360,
          }));
        }
      }, ROTATE_INTERVAL);
    }

    return () => {
      if (rotateIntervalRef.current) {
        clearInterval(rotateIntervalRef.current);
      }
    };
  }, [isAutoRotating, userInteracting]);

  // Handle user interaction
  const handleViewStateChange = useCallback(({ viewState: newViewState, interactionState }) => {
    setViewState(newViewState);

    if (interactionState?.isDragging || interactionState?.isZooming || interactionState?.isPanning) {
      setUserInteracting(true);
      lastInteractionRef.current = Date.now();
    }
  }, []);

  // Resume rotation when user stops interacting
  const handleInteractionEnd = useCallback(() => {
    setUserInteracting(false);
    lastInteractionRef.current = Date.now();
  }, []);

  // Build layers
  const layers = [];

  // Basemap tile layer - works properly with GlobeView
  layers.push(
    new TileLayer({
      id: 'globe-basemap',
      data: 'https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
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
    })
  );

  // Add data layer if available - using tile-based approach
  if (imageUrl) {
    layers.push(
      new BitmapLayer({
        id: 'globe-data',
        bounds: bounds || [-180, -85, 180, 85],
        image: imageUrl,
        opacity: 0.8,
      })
    );
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: '#0a0a15',
      overflow: 'hidden',
    }}>
      <DeckGL
        views={new GlobeViewDeck({
          id: 'globe',
          resolution: 10,
        })}
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        onDragEnd={handleInteractionEnd}
        controller={{
          inertia: true,
          scrollZoom: { speed: 0.01, smooth: true },
        }}
        layers={layers}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Globe Controls - Top Right */}
      <Paper
        p="md"
        radius="md"
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'rgba(26, 26, 46, 0.98)',
          backdropFilter: 'blur(10px)',
          zIndex: 1000,
          minWidth: 220,
          border: '1px solid rgba(79, 209, 197, 0.5)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
      >
        <Stack gap="sm">
          {/* Header */}
          <Group justify="space-between">
            <Text size="md" fw={700} c="cyan">🌍 Globe View</Text>
            <MantineTooltip label="Exit globe view" position="left">
              <ActionIcon
                variant="light"
                color="red"
                size="sm"
                onClick={onExit}
                aria-label="Exit globe view"
              >
                <Text size="xs" fw={600}>✕</Text>
              </ActionIcon>
            </MantineTooltip>
          </Group>

          {/* Status badges */}
          <Group gap={8}>
            {loading && (
              <Badge color="yellow" size="sm" variant="filled">Loading...</Badge>
            )}
            {loadDuration !== null && !loading && (
              <Badge
                color={loadDuration < 2000 ? 'green' : 'red'}
                size="sm"
                variant="filled"
                style={{ fontFamily: 'monospace' }}
              >
                {loadDuration < 1000
                  ? `${loadDuration.toFixed(0)}ms`
                  : `${(loadDuration / 1000).toFixed(2)}s`}
              </Badge>
            )}
            <Badge
              color={isAutoRotating ? 'cyan' : 'gray'}
              size="sm"
              variant="light"
            >
              {isAutoRotating ? 'Auto-rotating' : 'Paused'}
            </Badge>
          </Group>

          {/* Controls */}
          <Group gap={8}>
            <MantineTooltip label={isAutoRotating ? 'Pause rotation' : 'Resume rotation'} position="bottom">
              <ActionIcon
                variant={isAutoRotating ? 'filled' : 'light'}
                color="cyan"
                size="md"
                onClick={() => setIsAutoRotating(!isAutoRotating)}
                aria-label={isAutoRotating ? 'Pause auto rotation' : 'Resume auto rotation'}
              >
                <Text size="sm" fw={600}>{isAutoRotating ? '⏸' : '▶'}</Text>
              </ActionIcon>
            </MantineTooltip>

            <MantineTooltip label="Reset view" position="bottom">
              <ActionIcon
                variant="light"
                color="cyan"
                size="md"
                onClick={() => {
                  setViewState(INITIAL_VIEW_STATE);
                  setIsAutoRotating(true);
                }}
                aria-label="Reset globe view"
              >
                <Text size="sm" fw={600}>🎯</Text>
              </ActionIcon>
            </MantineTooltip>
          </Group>

          {/* Dataset info */}
          {datasetName && (
            <Text size="xs" c="dimmed">
              Showing: {datasetName}
            </Text>
          )}

          <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
            Drag to rotate • Scroll to zoom
          </Text>
        </Stack>
      </Paper>

      {/* Bottom hint */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.7)',
        padding: '8px 16px',
        borderRadius: 8,
        border: '1px solid rgba(79, 209, 197, 0.2)',
      }}>
        <Text size="xs" c="dimmed">
          Press Exit or ESC to return to map view
        </Text>
      </div>
    </div>
  );
}

export default GlobeView;
