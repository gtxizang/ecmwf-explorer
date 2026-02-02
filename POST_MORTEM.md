# ECMWF ECV Explorer - Project Post-Mortem

## Project Goal
Build an interactive climate data visualization app displaying ERA5-Land temperature data with:
- 2D map view with smooth, professional rendering
- 3D globe toggle
- Time slider animation
- Click-to-query timeseries
- No coastal bleeding (data extending into ocean)
- Fast loading (< 2 seconds)

## What We Had
A working Dash/Leaflet implementation (`app/`) that successfully rendered climate data as server-side PNG images with proper coastline masking.

## What We Tried to Build
A React + FastAPI implementation per the project requirements in `explicit-directions.md`:
- React with Mantine UI (NOT Dash)
- MapLibre GL JS for 2D maps
- Deck.gl for 3D globe
- FastAPI backend

## Timeline of Failures

### Phase 1: Polygon-Based Rendering
**Approach**: Render each data cell as a GeoJSON polygon on the map.

**Problems encountered**:
1. **Grid lines visible**: When polygons don't overlap, gaps appear between cells creating a blocky "Excel spreadsheet" appearance
2. **Coastal bleeding**: When polygons overlap (to hide gaps), data bleeds across water bodies - UK appeared connected to Europe
3. **Performance**: Rendering thousands of polygons was slow

**Lesson**: Polygon-based rendering of gridded climate data is fundamentally flawed. The trade-off between gaps and overlap cannot be resolved.

### Phase 2: Server-Side Image Rendering
**Approach**: Generate PNG images on the backend with matplotlib, return as base64, display as MapLibre image layer.

**What worked**:
- Backend correctly generated properly-oriented PNG images
- Images had transparent oceans (NaN values)
- Colormaps applied correctly
- Verified by saving images to disk - they looked perfect

**What failed**:
- MapLibre GL JS `image` source type could not correctly position the image
- Image appeared upside down, shifted, or misaligned despite correct bounds
- Tried multiple coordinate mappings - none worked
- Tried preloading images - didn't help
- Tried swapping north/south coordinates - didn't help
- Tried HTML img overlay with CSS positioning - still failed

**The mystery**: The exact same image that renders correctly when saved to disk would not align correctly when displayed via MapLibre. This suggests either:
- A bug in MapLibre's image source handling
- A fundamental misunderstanding of MapLibre's coordinate system
- Some interaction between base64 data URLs and MapLibre

### Phase 3: Giving Up
After multiple hours of iteration, the image alignment issue remained unsolved.

## Technical Details

### Data Characteristics
- ERA5-Land temperature data at 0.5° resolution (~55km cells)
- Stored as Zarr format
- Latitude: 89.8°N to -89.7°S (North to South in array)
- Longitude: -179.7° to 179.8° (already in -180 to 180 format)
- Shape: 360 x 720 grid

### What the Backend Did Correctly
```python
# Image generation that WORKED:
# 1. Load data from Zarr
# 2. Apply colormap (RdYlBu_r, etc.)
# 3. Set NaN (ocean) to transparent
# 4. NO flip needed (data already has north at row 0)
# 5. Encode as base64 PNG
# 6. Return with bounds: west=-180, east=180, south=-85, north=85
```

### What the Frontend Could Not Do
```javascript
// This NEVER worked correctly:
map.addSource('climate-image', {
  type: 'image',
  url: base64DataUrl,
  coordinates: [
    [west, north],   // top-left
    [east, north],   // top-right
    [east, south],   // bottom-right
    [west, south],   // bottom-left
  ],
});
```

## Root Causes of Failure

### 1. Wrong Technology Choice Mid-Project
The project started with a working Dash/Leaflet implementation. The requirement to switch to React/MapLibre introduced unnecessary complexity and an unfamiliar tech stack.

### 2. Fighting the Framework
Multiple hours were spent trying to make MapLibre do something it apparently doesn't do well (or at all): display a single large georeferenced image as an overlay.

### 3. No Early Validation
Should have created a minimal proof-of-concept with MapLibre image sources BEFORE building the full application.

### 4. Sunk Cost Fallacy
Continued iterating on broken approaches instead of stepping back to evaluate alternatives.

## What Should Have Been Done Differently

### Option A: Stay with Dash/Leaflet
The original implementation worked. If React was truly required, could have:
- Embedded Dash within React
- Used Leaflet directly in React (react-leaflet)
- Used the same server-side image rendering that worked with Leaflet

### Option B: Use Deck.gl from the Start
Deck.gl has a `BitmapLayer` specifically designed for georeferenced images. This was mentioned in the requirements but only attempted for the 3D globe, not the 2D map.

### Option C: Use Tile-Based Rendering
Instead of one large image, generate map tiles (like a real tile server). MapLibre handles tiles natively and reliably.

### Option D: Minimal POC First
Before building UI components, time controls, legends, etc., should have verified:
1. Can MapLibre display a base64 image at correct coordinates?
2. If not, what alternative works?

## Files Created (Mostly Unused)

```
react-app/
├── src/
│   ├── components/
│   │   ├── MapView.jsx      # Multiple failed iterations
│   │   ├── GlobeView.jsx    # Never fully tested
│   │   ├── ControlPanel.jsx # Works
│   │   ├── TimeControls.jsx # Works
│   │   ├── Legend.jsx       # Works
│   │   └── ...
│   ├── hooks/
│   │   └── useClimateData.js # Works
│   └── ...
backend/
├── main.py                   # FastAPI backend - works correctly
```

## Lessons for Future Projects

1. **Validate core rendering approach FIRST** before building surrounding infrastructure
2. **Don't abandon working code** for "better" technology without proof it will work
3. **Create minimal POCs** for risky technical integrations
4. **Know when to stop** - after 3-4 failed iterations on the same problem, step back and reassess
5. **MapLibre image sources** may not be suitable for large georeferenced overlays - use tiles or Deck.gl instead
6. **Climate data visualization** is harder than it looks - coastlines, projections, and color mapping all have gotchas

## What Still Works

The original Dash app in `app/` directory with:
- `app/main.py` - Dash application
- `app/simple_image.py` - Server-side image rendering
- `app/coastline_mask.py` - Ocean masking

Run with: `python app/main.py` (runs on port 8002)

## Conclusion

This project failed due to a combination of technology mismatch, inadequate early validation, and persistent iteration on fundamentally broken approaches. The working Dash/Leaflet implementation was abandoned for a React/MapLibre stack that could not reliably display georeferenced images.

The irony: the hardest part of the project (server-side image generation with proper coastlines) was already solved. The failure was in the "simple" task of displaying that image on a web map.

---

*Document created: 2026-01-29*
*Total time wasted: Several hours*
*Working features at end: Backend API, UI components (unusable without working map)*
