# CarbonPlan Maps Integration - Status Report

**Date:** 2026-01-31
**Status:** BLOCKED - Raster layer not rendering visibly

## What We're Trying To Do

Display Zarr pyramid climate data on a map using `@carbonplan/maps` library. The goal is a climate data explorer for an EU tender demo.

## Current State

The map renders, the basemap works, but **no climate data is visible** despite the Raster component reporting "ready" status.

## What Works

- Mapbox basemap renders correctly
- Ocean Fill layer works
- Land boundary Line layer works
- `useColormap` hook returns valid colormap arrays
- Raster component loads without errors and reports `loading: false`
- When `debug={true}` on Map component, red tile boundary lines appear (proving regl pipeline functions)

## What Doesn't Work

**The Raster data itself never appears on screen.**

Even with CarbonPlan's own demo data (known to work on their site):
```jsx
<Raster
  colormap={colormap}
  clim={[-20, 30]}
  source={'https://carbonplan-maps.s3.us-west-2.amazonaws.com/v2/demo/2d/tavg'}
  variable={'tavg'}
  mode={'texture'}
  opacity={1}
  display={true}
/>
```

## Root Cause Investigation

### Canvas Z-Index Problem

The library creates two canvases:
1. **Mapbox canvas** - `z-index: auto`, `display: block`
2. **Regl canvas** - `z-index: -1`, `display: inline`

The Regl canvas (where raster data renders) is **behind** the Mapbox canvas.

### Test Result
We cleared the Regl canvas to solid red via WebGL:
```javascript
const g = canvas.getContext('webgl2') || canvas.getContext('webgl');
g.clearColor(1, 0, 0, 1);
g.clear(g.COLOR_BUFFER_BIT);
```
**Result:** No red visible. The Regl canvas content cannot be seen.

### CSS Override Attempted
Added CSS to force z-index:
```css
.mapboxgl-canvas { z-index: 1 !important; }
canvas:not(.mapboxgl-canvas) { z-index: 2 !important; display: block !important; }
```
**Result:** Still not working.

## Issues Fixed Along The Way

1. **WebGL Context Loss** - React StrictMode double-mounts components, destroying regl context. Fixed by removing StrictMode from main.jsx.

2. **Dimension Mismatch Error** - 3D data (with time dimension) requires `dimensions` and `selector` props:
   ```jsx
   dimensions={['time', 'y', 'x']}
   selector={{ time: 0 }}
   ```

3. **fill_value** - Changed from large float to `-9999` in pyramid metadata.

## Files Modified

- `/frontend/src/main.jsx` - Removed React StrictMode
- `/frontend/src/components/ZarrMap.jsx` - Multiple iterations
- `/frontend/src/index.css` - CSS reset attempts

## Local Data

Zarr pyramid at `/data/pyramids/soil_moisture_cp/`:
- 6 levels (0-5), 128px tiles
- Variable: `swvl1` (soil moisture)
- Dimensions: `[time, y, x]` with 12 time steps
- Projection: EPSG:3857
- Consolidated metadata in `.zmetadata`

Served via: `python -m http.server 8080` from `/data/pyramids/` with CORS headers

## What To Try Next

1. **Check CarbonPlan's actual implementation** - Their demo at https://maps.demo.carbonplan.org/ works. Compare DOM/CSS structure.

2. **Try their exact React setup** - Maybe we're missing a required wrapper or context provider.

3. **Use a different approach entirely** - Per CLAUDE.md, Deck.gl with BitmapLayer was recommended. Backend generates PNG, frontend displays via BitmapLayer. This bypasses the entire Zarr/carbonplan complexity.

4. **Contact CarbonPlan** - They're open source and responsive. GitHub issues might help.

## Recommendation

Given the Tuesday deadline, **abandon carbonplan/maps** and switch to:
1. FastAPI backend generating PNG images from Zarr data (matplotlib)
2. Deck.gl BitmapLayer for display
3. This is what CLAUDE.md originally recommended

The carbonplan approach is elegant but we've spent too long debugging canvas visibility issues that shouldn't exist.

## Console Output (Typical)

```
[INIT] ZarrMap module loaded
[MOUNT] ZarrMap mounted (count: 1)
[CONFIG] Dataset config: {source: "...", variable: "tavg", ...}
[COLORMAP] Loaded warm with 255 colors
[RASTER] Loading: true
[RASTER] Loading: false
[MAP] Mapbox instance ready
```

No errors. Everything reports success. Nothing visible.

## Package Versions

```json
"@carbonplan/colormaps": "^3.1.0",
"@carbonplan/maps": "^5.2.0",
"mapbox-gl": "^3.9.4",
"react": "^19.0.0"
```

Note: React 19 might have compatibility issues with carbonplan/maps (designed for React 18).
