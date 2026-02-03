#!/usr/bin/env node
/**
 * Test Viewport Utilities and Viewport-Based Loading
 */

// Inline viewport utilities (same logic as viewportUtils.js)
function lonToMercatorX(lon) {
  return lon * 20037508.34 / 180.0;
}

function latToMercatorY(lat) {
  const clampedLat = Math.max(-85.051, Math.min(85.051, lat));
  const y = Math.log(Math.tan((90 + clampedLat) * Math.PI / 360.0)) / (Math.PI / 180.0);
  return y * 20037508.34 / 180.0;
}

function getViewportBoundsMercator(viewState, canvasWidth = 1200, canvasHeight = 800) {
  const { longitude, latitude, zoom } = viewState;
  const scale = Math.pow(2, zoom);
  const worldSizePixels = 256 * scale;
  const degreesPerPixelX = 360 / worldSizePixels;
  const degreesPerPixelY = degreesPerPixelX * Math.cos(latitude * Math.PI / 180);

  const halfWidthDegrees = (canvasWidth / 2) * degreesPerPixelX;
  const halfHeightDegrees = (canvasHeight / 2) * degreesPerPixelY;

  const westLon = longitude - halfWidthDegrees;
  const eastLon = longitude + halfWidthDegrees;
  const southLat = latitude - halfHeightDegrees;
  const northLat = latitude + halfHeightDegrees;

  return {
    west: lonToMercatorX(Math.max(-180, westLon)),
    east: lonToMercatorX(Math.min(180, eastLon)),
    south: latToMercatorY(Math.max(-85, southLat)),
    north: latToMercatorY(Math.min(85, northLat)),
  };
}

function viewportToDataIndices(viewportBounds, xCoords, yCoords, padding = 32) {
  const { west, east, south, north } = viewportBounds;
  const xMin = xCoords[0];
  const xMax = xCoords[xCoords.length - 1];
  const yMin = yCoords[0];
  const yMax = yCoords[yCoords.length - 1];

  const yInverted = yMin > yMax;
  const xPixelsPerUnit = (xCoords.length - 1) / (xMax - xMin);
  const yPixelsPerUnit = (yCoords.length - 1) / Math.abs(yMax - yMin);

  let xStart = Math.floor((west - xMin) * xPixelsPerUnit);
  let xEnd = Math.ceil((east - xMin) * xPixelsPerUnit);

  let yStart, yEnd;
  if (yInverted) {
    yStart = Math.floor((yMin - north) * yPixelsPerUnit);
    yEnd = Math.ceil((yMin - south) * yPixelsPerUnit);
  } else {
    yStart = Math.floor((south - yMin) * yPixelsPerUnit);
    yEnd = Math.ceil((north - yMin) * yPixelsPerUnit);
  }

  xStart = Math.max(0, xStart - padding);
  xEnd = Math.min(xCoords.length, xEnd + padding);
  yStart = Math.max(0, yStart - padding);
  yEnd = Math.min(yCoords.length, yEnd + padding);

  if (xEnd <= xStart) { xStart = 0; xEnd = xCoords.length; }
  if (yEnd <= yStart) { yStart = 0; yEnd = yCoords.length; }

  return { xStart, xEnd, yStart, yEnd, width: xEnd - xStart, height: yEnd - yStart };
}

// Test cases
console.log('═══════════════════════════════════════════════════════════════');
console.log('  Viewport Utilities Test');
console.log('═══════════════════════════════════════════════════════════════\n');

// Simulate a typical data grid (1000 x 500 pixels covering the world in Web Mercator)
const xExtent = [-20037508.34, 20037508.34]; // Full world X
const yExtent = [-20037508.34, 20037508.34]; // Full world Y (clipped to ~85 degrees)
const gridWidth = 1000;
const gridHeight = 500;

// Create coordinate arrays
const xCoords = Array.from({ length: gridWidth }, (_, i) =>
  xExtent[0] + (i / (gridWidth - 1)) * (xExtent[1] - xExtent[0])
);
const yCoords = Array.from({ length: gridHeight }, (_, i) =>
  yExtent[1] - (i / (gridHeight - 1)) * (yExtent[1] - yExtent[0]) // Note: inverted (north to south)
);

// Test 1: Zoomed out (full world)
console.log('Test 1: Zoomed out (zoom=1, centered on 0,0)');
const viewStateZoomedOut = { longitude: 0, latitude: 0, zoom: 1 };
const vpBoundsOut = getViewportBoundsMercator(viewStateZoomedOut);
const indicesOut = viewportToDataIndices(vpBoundsOut, xCoords, yCoords, 0);
const pixelsOut = indicesOut.width * indicesOut.height;
const totalPixels = gridWidth * gridHeight;
console.log(`  Viewport: ${indicesOut.width}x${indicesOut.height} = ${pixelsOut} pixels`);
console.log(`  Coverage: ${(pixelsOut / totalPixels * 100).toFixed(1)}%`);
console.log();

// Test 2: Zoomed into Europe
console.log('Test 2: Zoomed into Europe (zoom=4, centered on 10,50)');
const viewStateEurope = { longitude: 10, latitude: 50, zoom: 4 };
const vpBoundsEurope = getViewportBoundsMercator(viewStateEurope);
const indicesEurope = viewportToDataIndices(vpBoundsEurope, xCoords, yCoords, 32);
const pixelsEurope = indicesEurope.width * indicesEurope.height;
console.log(`  Viewport: ${indicesEurope.width}x${indicesEurope.height} = ${pixelsEurope} pixels`);
console.log(`  Coverage: ${(pixelsEurope / totalPixels * 100).toFixed(1)}%`);
console.log(`  Reduction: ${(100 - pixelsEurope / totalPixels * 100).toFixed(1)}% less data to transfer`);
console.log();

// Test 3: Zoomed into Ireland
console.log('Test 3: Zoomed into Ireland (zoom=6, centered on -8,53)');
const viewStateIreland = { longitude: -8, latitude: 53, zoom: 6 };
const vpBoundsIreland = getViewportBoundsMercator(viewStateIreland);
const indicesIreland = viewportToDataIndices(vpBoundsIreland, xCoords, yCoords, 32);
const pixelsIreland = indicesIreland.width * indicesIreland.height;
console.log(`  Viewport: ${indicesIreland.width}x${indicesIreland.height} = ${pixelsIreland} pixels`);
console.log(`  Coverage: ${(pixelsIreland / totalPixels * 100).toFixed(1)}%`);
console.log(`  Reduction: ${(100 - pixelsIreland / totalPixels * 100).toFixed(1)}% less data to transfer`);
console.log();

// Summary
console.log('═══════════════════════════════════════════════════════════════');
console.log('  Summary');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Full grid: ${gridWidth}x${gridHeight} = ${totalPixels} pixels`);
console.log(`  Zoomed out (z=1): ${pixelsOut} pixels (${(pixelsOut / totalPixels * 100).toFixed(1)}%)`);
console.log(`  Europe (z=4): ${pixelsEurope} pixels (${(pixelsEurope / totalPixels * 100).toFixed(1)}%)`);
console.log(`  Ireland (z=6): ${pixelsIreland} pixels (${(pixelsIreland / totalPixels * 100).toFixed(1)}%)`);
console.log();
console.log('  Expected speedup when zoomed in: ~10-50x faster');
console.log('═══════════════════════════════════════════════════════════════\n');
