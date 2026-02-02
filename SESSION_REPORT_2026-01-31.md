# ECMWF Climate Explorer - Session Report
**Date:** 2026-01-31
**Session:** LOD Bug Fix & UI Improvements

---

## Executive Summary

The LOD (Level of Detail) selection bug has been **fixed**. The climate data explorer now correctly loads higher resolution data when zooming in, using client-side Zarr loading as required by the tender.

---

## Issues Fixed

### 1. Stack Overflow on High-Resolution Data (CRITICAL)
**Problem:** Loading pyramid levels 3-5 (1024x1024 to 4096x4096 pixels) caused `RangeError: Maximum call stack size exceeded`

**Root Cause:** Using `Math.min(...array)` and `Math.max(...array)` with millions of values exceeded JavaScript's call stack limit.

**Fix:** Replaced with efficient loop-based `getMinMax()` function:
```javascript
function getMinMax(arr, fillValue = -9999) {
  let min = Infinity, max = -Infinity, validCount = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v !== fillValue && !isNaN(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
      validCount++;
    }
  }
  return { min, max, validCount, totalCount: arr.length };
}
```

### 2. Data Not Rendering (Blank Map)
**Problem:** BitmapLayer showed nothing - black screen

**Root Cause:** Bounds were in EPSG:3857 meters but deck.gl expects longitude/latitude degrees

**Fix:** Changed bounds from Web Mercator meters to degrees:
```javascript
// Before (wrong)
const WORLD_BOUNDS = [-20037508.34, -20037508.34, 20037508.34, 20037508.34];

// After (correct)
const WORLD_BOUNDS = [-180, -85.051, 180, 85.051];
```

### 3. Colormap Changes Not Working
**Problem:** Selecting a different colormap didn't update the visualization

**Root Cause:** Cache check didn't include colormap in comparison

**Fix:** Added colormap to the load cache check:
```javascript
if (lastLoadRef.current.level === targetLOD &&
    lastLoadRef.current.time === timeIndex &&
    lastLoadRef.current.colormap === colormapName) {
  return; // Skip reload
}
```

### 4. No Basemap
**Problem:** Data displayed on plain dark background with no geographic context

**Fix:** Added CartoDB dark basemap using TileLayer:
```javascript
new TileLayer({
  id: 'basemap',
  data: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  // ...
})
```

### 5. LOD Too Conservative (Blocky at Low Zoom)
**Problem:** At zoom 2, only LOD 2 (512x512) was loaded - looked blocky

**Fix:** Made LOD selection more aggressive (+1 level):
```javascript
// Before: zoom 2 → LOD 2
// After: zoom 2 → LOD 3
const level = Math.min(MAX_PYRAMID_LEVEL, Math.max(0, Math.floor(mapZoom) + 1));
```

### 6. Colormap Dropdown Hidden Behind UI
**Problem:** Dropdown menu appeared behind time slider

**Fix:** Added z-index to Mantine Select component:
```javascript
comboboxProps={{ zIndex: 10000 }}
```

---

## Current State

### Working Features
| Feature | Status | Notes |
|---------|--------|-------|
| Client-side Zarr loading | ✅ | Uses zarrita.js |
| LOD selection | ✅ | Levels 0-5 (128px to 4096px) |
| LOD debug indicator | ✅ | Shows current LOD and zoom |
| Basemap | ✅ | CartoDB dark tiles |
| Colormap switching | ✅ | 5 options available |
| Time slider | ✅ | 12 months of 2023 |
| Ocean masking | ✅ | Transparent over oceans |

### LOD Mapping (After Fix)
| Zoom Level | LOD | Resolution | Pixels |
|------------|-----|------------|--------|
| 0 | 1 | 256x256 | 65K |
| 1 | 2 | 512x512 | 262K |
| 2 | 3 | 1024x1024 | 1M |
| 3 | 4 | 2048x2048 | 4M |
| 4+ | 5 | 4096x4096 | 16M |

### Available Colormaps
- **Rdylbu** - Red-Yellow-Blue (diverging) - default
- **Viridis** - Purple-Green-Yellow (sequential)
- **Inferno** - Black-Red-Yellow (sequential)
- **Plasma** - Purple-Pink-Yellow (sequential)
- **Browns** - Light to dark brown (sequential)

---

## Files Modified

1. `frontend/src/components/ZarrMap.jsx` - Main component with all fixes
2. `frontend/tests/map-visual.spec.js` - Increased wait time for LOD 5 loading

---

## Running the Demo

```bash
# Terminal 1: Backend
cd /Users/garfieldconnolly/Desktop/ECMWF-POC
source venv/bin/activate
cd backend && python main.py

# Terminal 2: Frontend
cd /Users/garfieldconnolly/Desktop/ECMWF-POC/frontend
npm run dev

# Open browser
open http://localhost:5173
```

---

## Playwright Test Results

```
✓ renders map and climate data (18.9s)
  - LOD 3 loaded at zoom 2.0 ✓
  - LOD 4 loaded during zoom ✓
  - LOD 5 loaded at zoom 5.3 ✓
  - No console errors ✓
  - No network errors ✓
```

---

## Screenshots

Located in `frontend/test-screenshots/`:
- `01-initial-load.png` - Initial page load
- `02-after-load.png` - Global view with LOD 3
- `03-zoomed.png` - UK/Ireland with LOD 5
- `04-time-changed.png` - Different month selected

---

## Remaining Considerations

1. **Performance:** LOD 5 (4096x4096 = 16M pixels) takes 2-3 seconds to load and render
2. **Click-to-timeseries:** Not implemented in ZarrMap (was in ClimateMap.jsx)
3. **Globe view:** Not implemented in ZarrMap (was in ClimateMap.jsx)

---

## Compliance with Tender Requirements

| Requirement | Status |
|-------------|--------|
| Browser-based Zarr loading | ✅ Client-side with zarrita.js |
| No server-side rendering | ✅ All processing in browser |
| Interactive visualization | ✅ Pan, zoom, time slider |
| Multiple variables | ⚠️ Currently soil moisture only |

---

---

## Session 2 Updates (Continued)

### Priority 1: Click-to-Timeseries ✓

**Implementation:**
- Added `onClick` handler to DeckGL
- Extract lon/lat from click coordinates
- Load all 12 months from Zarr for clicked pixel
- Display Recharts line chart in panel (bottom-left)
- Cyan marker shows clicked location on map
- Dashed reference line shows current month

**Files modified:** `frontend/src/components/ZarrMap.jsx`

### Priority 2: Earth Radiation Budget Dataset ✓

**Implementation:**
- Extracted existing CERES radiation data from CDS archive
- Processed 2020-2024 data (36 months)
- Created Zarr pyramid (levels 0-3, 128px to 1024px)
- Reprojected to EPSG:3857 using rioxarray
- Added dataset selector dropdown to UI
- Auto-switches colormap per dataset (Browns for soil, Inferno for radiation)

**Variables available:**
- `solar_mon`: Incoming Solar Flux (W/m²)

**Files created:**
- `scripts/process_radiation_budget.py`
- `data/pyramids/radiation_budget_cp/`

### Priority 3: Performance Improvements ✓

**Implementation:**
1. **Image Caching**: LRU cache for rendered images (up to 24 images)
   - Cache key: `{dataset}-{level}-{time}-{colormap}`
   - Instant switching when revisiting cached views
2. **Non-blocking Loading Indicator**: Small indicator in corner, doesn't obscure map
3. **Progressive Display**: Old image stays visible while new one loads

**Cache behavior:**
- First load: Network fetch → render → cache
- Subsequent loads: Instant from cache
- Logged as `[CACHE] Hit` or `(cached)` in console

---

## Session 3: Solar Radiation Y-Axis Fix

### Issue: Solar Radiation Data Only Displayed in Narrow Band

**Problem:** When switching to the Solar Radiation dataset, data only appeared in a narrow horizontal band near the equator instead of covering the entire globe.

**Root Cause:** Y-axis orientation mismatch between Zarr data and deck.gl BitmapLayer:
- Zarr data had row 0 = south (y = -20037508)
- BitmapLayer expects row 0 = top of image = north

**Fix:** Modified `scripts/process_radiation_budget.py` to flip the data along the y-axis:
```python
# Flip the data along y-axis so row 0 is NORTH (matches deck.gl BitmapLayer)
flipped_data = reprojected.values[:, ::-1, :]

# Create target coordinates - y goes from north (top) to south (bottom)
y = np.linspace(mercator_bounds[3], mercator_bounds[1], target_size)  # North to south
```

**Verification:**
- Before fix: Data from row 138-1023, y ascending (south to north)
- After fix: Data from row 0-885, y descending (north to south)
- Solar Radiation now displays globally across all land areas

---

## All Tests Passing

| Test | Status |
|------|--------|
| map-visual.spec.js | ✓ Pass |
| timeseries.spec.js | ✓ Pass |
| dataset-switch.spec.js | ✓ Pass |

---

**Report updated:** 2026-01-31 (Session 3)
