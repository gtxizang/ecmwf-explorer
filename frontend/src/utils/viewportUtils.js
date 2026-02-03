/**
 * Viewport Utilities for ECV Explorer
 *
 * Functions to convert between map viewport coordinates and Zarr data indices.
 * Enables viewport-based loading - only fetching visible data.
 */

/**
 * Convert longitude to Web Mercator X coordinate
 */
export function lonToMercatorX(lon) {
  return lon * 20037508.34 / 180.0;
}

/**
 * Convert latitude to Web Mercator Y coordinate
 */
export function latToMercatorY(lat) {
  const clampedLat = Math.max(-85.051, Math.min(85.051, lat));
  const y = Math.log(Math.tan((90 + clampedLat) * Math.PI / 360.0)) / (Math.PI / 180.0);
  return y * 20037508.34 / 180.0;
}

/**
 * Convert Web Mercator X to longitude
 */
export function mercatorXToLon(x) {
  return x * 180.0 / 20037508.34;
}

/**
 * Convert Web Mercator Y to latitude
 */
export function mercatorYToLat(y) {
  const lat = y * 180.0 / 20037508.34;
  return (Math.atan(Math.exp(lat * Math.PI / 180.0)) * 360.0 / Math.PI) - 90;
}

/**
 * Calculate viewport bounds in Web Mercator coordinates from deck.gl viewState
 *
 * @param {Object} viewState - deck.gl view state {longitude, latitude, zoom}
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @returns {Object} - { west, south, east, north } in Web Mercator coordinates
 */
export function getViewportBoundsMercator(viewState, canvasWidth = 1200, canvasHeight = 800) {
  const { longitude, latitude, zoom } = viewState;

  // Calculate the size of the viewport in degrees at this zoom level
  // At zoom 0, the world is 256 pixels wide (standard Web Mercator)
  const scale = Math.pow(2, zoom);
  const worldSizePixels = 256 * scale;

  // Degrees per pixel at the equator
  const degreesPerPixelX = 360 / worldSizePixels;

  // For latitude, we need to account for Mercator distortion
  // This is an approximation that works well for most zoom levels
  const degreesPerPixelY = degreesPerPixelX * Math.cos(latitude * Math.PI / 180);

  // Calculate bounds in degrees
  const halfWidthDegrees = (canvasWidth / 2) * degreesPerPixelX;
  const halfHeightDegrees = (canvasHeight / 2) * degreesPerPixelY;

  const westLon = longitude - halfWidthDegrees;
  const eastLon = longitude + halfWidthDegrees;
  const southLat = latitude - halfHeightDegrees;
  const northLat = latitude + halfHeightDegrees;

  // Convert to Web Mercator
  return {
    west: lonToMercatorX(Math.max(-180, westLon)),
    east: lonToMercatorX(Math.min(180, eastLon)),
    south: latToMercatorY(Math.max(-85, southLat)),
    north: latToMercatorY(Math.min(85, northLat)),
    // Also return in degrees for BitmapLayer bounds
    westLon: Math.max(-180, westLon),
    eastLon: Math.min(180, eastLon),
    southLat: Math.max(-85, southLat),
    northLat: Math.min(85, northLat),
  };
}

/**
 * Convert viewport bounds to Zarr data indices
 *
 * @param {Object} viewportBounds - { west, south, east, north } in data coordinates
 * @param {Array} xCoords - X coordinate array from Zarr
 * @param {Array} yCoords - Y coordinate array from Zarr
 * @param {number} padding - Extra pixels to load around viewport (default 32)
 * @returns {Object} - { xStart, xEnd, yStart, yEnd } indices for zarr.get
 */
export function viewportToDataIndices(viewportBounds, xCoords, yCoords, padding = 32) {
  const { west, east, south, north } = viewportBounds;

  // Find the data extent
  const xMin = xCoords[0];
  const xMax = xCoords[xCoords.length - 1];
  const yMin = yCoords[0];
  const yMax = yCoords[yCoords.length - 1];

  // Check if y coordinates are inverted (north to south)
  const yInverted = yMin > yMax;

  // Calculate pixels per coordinate unit
  const xPixelsPerUnit = (xCoords.length - 1) / (xMax - xMin);
  const yPixelsPerUnit = (yCoords.length - 1) / Math.abs(yMax - yMin);

  // Convert viewport bounds to pixel indices
  let xStart = Math.floor((west - xMin) * xPixelsPerUnit);
  let xEnd = Math.ceil((east - xMin) * xPixelsPerUnit);

  let yStart, yEnd;
  if (yInverted) {
    // Y coords go from high (north) to low (south)
    yStart = Math.floor((yMin - north) * yPixelsPerUnit);
    yEnd = Math.ceil((yMin - south) * yPixelsPerUnit);
  } else {
    // Y coords go from low (south) to high (north)
    yStart = Math.floor((south - yMin) * yPixelsPerUnit);
    yEnd = Math.ceil((north - yMin) * yPixelsPerUnit);
  }

  // Add padding
  xStart = Math.max(0, xStart - padding);
  xEnd = Math.min(xCoords.length, xEnd + padding);
  yStart = Math.max(0, yStart - padding);
  yEnd = Math.min(yCoords.length, yEnd + padding);

  // Ensure we have at least some data
  if (xEnd <= xStart) {
    xStart = 0;
    xEnd = xCoords.length;
  }
  if (yEnd <= yStart) {
    yStart = 0;
    yEnd = yCoords.length;
  }

  return {
    xStart,
    xEnd,
    yStart,
    yEnd,
    width: xEnd - xStart,
    height: yEnd - yStart,
  };
}

/**
 * Calculate the geographic bounds for a subset of data
 * Returns bounds in DEGREES (for BitmapLayer) converted from Web Mercator
 *
 * @param {Object} indices - { xStart, xEnd, yStart, yEnd }
 * @param {Array} xCoords - X coordinate array from Zarr (Web Mercator meters)
 * @param {Array} yCoords - Y coordinate array from Zarr (Web Mercator meters)
 * @returns {Array} - [west, south, east, north] in DEGREES for BitmapLayer
 */
export function indicesToBounds(indices, xCoords, yCoords) {
  const { xStart, xEnd, yStart, yEnd } = indices;

  // Guard against empty or invalid arrays
  if (!xCoords || xCoords.length === 0 || !yCoords || yCoords.length === 0) {
    console.warn('[indicesToBounds] Empty coordinate arrays');
    return [-180, -85, 180, 85]; // World bounds fallback in degrees
  }

  // Clamp indices to valid range
  const safeXStart = Math.max(0, Math.min(xStart, xCoords.length - 1));
  const safeXEnd = Math.max(0, Math.min(xEnd - 1, xCoords.length - 1));
  const safeYStart = Math.max(0, Math.min(yStart, yCoords.length - 1));
  const safeYEnd = Math.max(0, Math.min(yEnd - 1, yCoords.length - 1));

  const westMerc = xCoords[safeXStart];
  const eastMerc = xCoords[safeXEnd];

  // Handle both normal and inverted Y coordinates
  const y1 = yCoords[safeYStart];
  const y2 = yCoords[safeYEnd];
  const southMerc = Math.min(y1, y2);
  const northMerc = Math.max(y1, y2);

  // Convert from Web Mercator meters to degrees
  const west = mercatorXToLon(westMerc);
  const east = mercatorXToLon(eastMerc);
  const south = mercatorYToLat(southMerc);
  const north = mercatorYToLat(northMerc);

  return [west, south, east, north];
}

/**
 * Check if viewport has changed enough to warrant reloading data
 *
 * @param {Object} prevBounds - Previous viewport bounds
 * @param {Object} newBounds - New viewport bounds
 * @param {number} threshold - Minimum change ratio to trigger reload (default 0.2 = 20%)
 * @returns {boolean} - True if should reload
 */
export function shouldReloadViewport(prevBounds, newBounds, threshold = 0.2) {
  if (!prevBounds) return true;

  const prevWidth = prevBounds.east - prevBounds.west;
  const prevHeight = prevBounds.north - prevBounds.south;
  const newWidth = newBounds.east - newBounds.west;
  const newHeight = newBounds.north - newBounds.south;

  // Check if zoom changed significantly
  const widthRatio = Math.abs(newWidth - prevWidth) / prevWidth;
  const heightRatio = Math.abs(newHeight - prevHeight) / prevHeight;
  if (widthRatio > threshold || heightRatio > threshold) {
    return true;
  }

  // Check if panned outside of loaded area
  const centerXShift = Math.abs((newBounds.east + newBounds.west) / 2 - (prevBounds.east + prevBounds.west) / 2);
  const centerYShift = Math.abs((newBounds.north + newBounds.south) / 2 - (prevBounds.north + prevBounds.south) / 2);

  if (centerXShift > prevWidth * 0.3 || centerYShift > prevHeight * 0.3) {
    return true;
  }

  return false;
}

/**
 * Calculate how much of the viewport is covered by currently loaded data
 *
 * @param {Object} viewportBounds - Current viewport bounds
 * @param {Object} loadedBounds - Bounds of loaded data
 * @returns {number} - Coverage ratio (0-1)
 */
export function calculateCoverage(viewportBounds, loadedBounds) {
  if (!loadedBounds) return 0;

  const vWidth = viewportBounds.east - viewportBounds.west;
  const vHeight = viewportBounds.north - viewportBounds.south;

  // Calculate intersection
  const iWest = Math.max(viewportBounds.west, loadedBounds.west);
  const iEast = Math.min(viewportBounds.east, loadedBounds.east);
  const iSouth = Math.max(viewportBounds.south, loadedBounds.south);
  const iNorth = Math.min(viewportBounds.north, loadedBounds.north);

  if (iEast <= iWest || iNorth <= iSouth) {
    return 0; // No intersection
  }

  const iWidth = iEast - iWest;
  const iHeight = iNorth - iSouth;

  return (iWidth * iHeight) / (vWidth * vHeight);
}

/**
 * Determine optimal LOD level based on viewport size and zoom
 *
 * @param {Object} viewportBounds - Viewport bounds
 * @param {Object} dataExtent - Full data extent
 * @param {number} maxLevel - Maximum available LOD level
 * @returns {number} - Recommended LOD level
 */
export function calculateOptimalLOD(viewportBounds, dataExtent, maxLevel) {
  // Calculate what fraction of the data is visible
  const vWidth = viewportBounds.east - viewportBounds.west;
  const dWidth = dataExtent.east - dataExtent.west;
  const visibleRatio = vWidth / dWidth;

  // Higher LOD (more detail) when zoomed in (smaller visible ratio)
  // LOD 0 = coarsest, maxLevel = finest
  if (visibleRatio > 0.5) return 0;  // Showing more than half the world
  if (visibleRatio > 0.25) return Math.min(1, maxLevel);
  if (visibleRatio > 0.1) return Math.min(2, maxLevel);
  if (visibleRatio > 0.05) return Math.min(3, maxLevel);
  return maxLevel; // Zoomed in, use highest detail
}
