# Session Review: Zarr-Native Visualization Implementation
**Date:** 2026-01-30 (Friday evening)
**Duration:** ~3 hours
**Goal:** Implement Zarr-native rendering with dynamic colormaps for ECMWF tender demo

---

## What We Achieved

### Working Features
1. **Zarr-native data loading** - Browser loads Zarr chunks directly via zarrita.js
2. **Dynamic colormap switching** - Instant colormap changes without reloading data
3. **Fire Burned Area visualization** - January 2023 OLCI satellite data displaying correctly
4. **WGS84/Plate Carrée projection** - Data displays in correct geographic projection
5. **Blue Marble base map** - NASA imagery underlaying the climate data

### Technical Stack
- **Frontend:** React + deck.gl (OrthographicView) + zarrita.js
- **Data format:** Zarr V3 pyramids created with ndpyramid
- **Server:** Simple Python HTTP server with CORS headers
- **Projection:** EPSG:4326 (WGS84/plate carrée)

---

## Critical Lessons Learned

### 1. Projection Mismatch is a Showstopper
**Problem:** We spent ~2 hours debugging why fire data didn't align with base map tiles.

**Root cause:**
- Climate data is in WGS84/plate carrée (EPSG:4326)
- Standard web map tiles (CartoDB, OSM) are in Web Mercator (EPSG:3857)
- These projections are NOT compatible for simple overlay

**Solution:**
- Switched from deck.gl `MapView` (Web Mercator) to `OrthographicView` (Cartesian/unprojected)
- Used a WGS84 base map image instead of Web Mercator tiles

**Lesson:** ALWAYS verify projection compatibility BEFORE starting visualization work:
- What projection is the data in?
- What projection does the view/library use?
- What projection is the base map in?

### 2. OrthographicView Y-Axis is Inverted
**Problem:** Map displayed upside down (Australia at top).

**Root cause:** OrthographicView uses screen coordinates where Y increases downward.

**Solution:** Flip bounds from `[west, south, east, north]` to `[west, north, east, south]`:
```javascript
bounds: [-180, 90, 180, -90]  // Not [-180, -90, 180, 90]
```

### 3. Test Simple Cases First
**Problem:** We debugged complex layer interactions when the issue was fundamental.

**Lesson:** When something doesn't work:
1. Remove all layers except the one being tested
2. Verify that layer works in isolation
3. Add layers back one at a time

### 4. CORS is Always a Factor
**Problem:** Browser couldn't load Zarr data from localhost.

**Solution:** Simple Python HTTP server with CORS headers:
```python
self.send_header('Access-Control-Allow-Origin', '*')
```

---

## Current State

### What Works
- Fire Burned Area data loads and displays
- Colormap switching is instant (the key tender requirement)
- Geographic positioning is correct
- Pan and zoom work

### What Needs Improvement
- **Zoom quality:** Currently pixelated when zooming in
  - Base map is only 2560px wide
  - Data is 1440x720 resolution
  - Need pyramid-based LOD loading for smooth zoom

- **Soil Moisture dataset:** Not yet integrated
  - Data exists in pyramids
  - Needs time slider implementation

- **UI polish:** Basic but functional

---

## Remaining Tasks for Demo

1. **Implement pyramid LOD loading** - Load higher resolution data when zoomed in
2. **Add Soil Moisture with time slider** - Show 12 months animation
3. **Improve base map** - Either tiled or higher resolution
4. **UI polish** - Match NEC Explorer styling
5. **Test colormap switching demo** - The money shot for the tender

---

## Technical Debt / Future Considerations

1. **Web Mercator support:** For compatibility with standard web tiles, would need to either:
   - Reproject data to Web Mercator server-side
   - Use a library like @carbonplan/maps that handles reprojection

2. **Performance:** Current approach loads full resolution data. For large datasets, need:
   - Chunked loading based on viewport
   - WebGL-based colormap application (not CPU)
   - Web workers for data processing

3. **Sea Ice data:** In polar stereographic projection - needs reprojection to display on global map

---

## Files Modified This Session

- `frontend/src/components/ZarrMap.jsx` - Main visualization component
- `scripts/zarr_server.py` - CORS-enabled HTTP server
- `data/pyramids/` - Zarr pyramid data

---

## Key Code Patterns

### Loading Zarr in Browser
```javascript
import * as zarr from 'zarrita';

const store = new zarr.FetchStore(`${ZARR_BASE}/${path}`);
const root = zarr.root(store);
const arr = await zarr.open(root.resolve(variable), { kind: 'array' });
const data = await zarr.get(arr, [timeIndex, null, null]);
```

### Client-Side Colormap Application
```javascript
function applyColormap(data, clim, colormap) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i++) {
    const normalized = (data[i] - clim[0]) / (clim[1] - clim[0]);
    const colorIdx = Math.floor(normalized * colors.length);
    rgba[i*4] = colors[colorIdx][0];     // R
    rgba[i*4+1] = colors[colorIdx][1];   // G
    rgba[i*4+2] = colors[colorIdx][2];   // B
    rgba[i*4+3] = 220;                   // A
  }
  return rgba;
}
```

### OrthographicView Setup
```javascript
import { OrthographicView, COORDINATE_SYSTEM } from '@deck.gl/core';

const view = new OrthographicView({ id: 'ortho' });

new BitmapLayer({
  bounds: [-180, 90, 180, -90],  // Y-flipped!
  coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
  // ...
});
```

---

## Bottom Line

The Zarr-native approach is working. The core tender requirement (dynamic colormap switching) is demonstrated. With 75+ hours until demo, there's time to polish zoom quality and add more datasets.

The projection debugging was painful but educational. Future sessions should start with projection verification.
