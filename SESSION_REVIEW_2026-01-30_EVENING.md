# Session Review: Continued Projection Failures
**Date:** 2026-01-30 (Friday evening, late)
**Duration:** ~2 hours
**Goal:** Get Zarr-native soil moisture visualization working
**Outcome:** Failed. Same projection mismatch issue as before.

---

## What Happened

### The Task
Continue from previous session to implement:
1. Soil Moisture data with time slider
2. GlobeView + MapView toggle
3. Click-to-timeseries

### What I Did
1. Added GlobeView toggle - code written
2. Added click-to-timeseries with Recharts - code written
3. Fixed zarrita.js API usage (was using wrong pattern for opening arrays)
4. Discovered soil moisture Zarr pyramid had NO DATA (empty chunks)
5. Found the original NetCDF was a ZIP file containing the actual data
6. Recreated Zarr pyramids properly (now in Zarr v3 format)
7. Data finally loaded in browser (405,000 valid pixels)
8. **Rendered with severe distortion - same projection mismatch as before**

### The Fundamental Failure
For the THIRD time in this project, I wrote rendering code without first verifying that:
- The data projection (WGS84/EPSG:4326)
- The map view projection (Web Mercator/EPSG:3857)

**ARE COMPATIBLE.**

They are not. They never were. I knew this from the previous session. The session review from earlier today explicitly documented this lesson. I ignored it and repeated the same mistake.

---

## Technical Details

### Data
- **Source:** ERA5-Land Soil Moisture (swvl1) from CDS
- **Original format:** NetCDF inside a ZIP file (CDS download quirk)
- **Converted to:** Zarr v3 pyramids (7 levels)
- **Projection:** WGS84 (EPSG:4326) - equirectangular/plate carrée
- **Coordinates:** -180 to +180 longitude, -90 to +90 latitude

### Rendering Attempt
- **View:** deck.gl MapView (Web Mercator projection)
- **Layer:** BitmapLayer with geographic bounds
- **Result:** Severe vertical distortion, data misaligned with basemap

### Why It Failed
BitmapLayer places image corners at the specified geographic coordinates, but **does not reproject the pixel content**. The image is WGS84 (rectangular lat/lon grid), but MapView expects Web Mercator (where areas near poles are stretched).

The debug image I added showed the correct data (Africa, Europe clearly visible). But when overlaid on the Web Mercator basemap, it was completely distorted.

---

## What Should Have Happened

### Before Writing ANY Rendering Code
1. **Check data CRS:** `print(ds.crs)` or examine coordinates
2. **Check view CRS:** Read deck.gl docs - MapView = Web Mercator
3. **Compare:** WGS84 ≠ Web Mercator
4. **Decision point:**
   - Option A: Reproject data to Web Mercator
   - Option B: Use WGS84-compatible view
   - Option C: Use a library that handles reprojection (@carbonplan/maps)

### Instead What I Did
1. Wrote rendering code assuming it would "just work"
2. Debugged data loading issues (valid)
3. Debugged Zarr format issues (valid)
4. Got data rendering... with wrong projection
5. Only THEN realized the projection mismatch
6. User had to point this out. Again.

---

## Lessons (That I Should Have Already Learned)

### 1. PROJECTION FIRST
Before ANY mapping code:
```
Q1: What projection is my data in?
Q2: What projection does my view/library use?
Q3: Are they the same?
   - YES → Proceed
   - NO → Reproject or change approach
```

### 2. The Previous Session Review Existed
I had access to `SESSION_REVIEW_2026-01-30.md` which explicitly stated:
> "ALWAYS verify projection compatibility BEFORE starting visualization work"

I did not follow this guidance.

### 3. Web Mercator vs WGS84 - Know the Difference
- **WGS84 (EPSG:4326):** Lat/lon coordinates, equirectangular grid, poles same width as equator
- **Web Mercator (EPSG:3857):** Standard web map tiles, poles stretched to infinity, square world

Climate data is almost always WGS84. Web maps are almost always Web Mercator. They do not mix without reprojection.

---

## Options Going Forward

### Option 1: Server-Side Reprojection
Reproject the Zarr data to Web Mercator using Python (rasterio/rioxarray). Store Web Mercator pyramids. Browser displays directly.

**Pros:** Clean browser code, standard web mapping
**Cons:** Data duplication, need to reprocess when adding datasets

### Option 2: Client-Side Reprojection
Reproject in JavaScript before creating the image. I started writing this but was stopped.

**Pros:** No server changes
**Cons:** CPU-intensive in browser, may be slow

### Option 3: Use @carbonplan/maps
This library is specifically designed for climate data visualization and handles the WGS84→Web Mercator reprojection.

**Pros:** Purpose-built for this exact use case
**Cons:** Another dependency, learning curve

### Option 4: Use OrthographicView (WGS84-Compatible)
deck.gl OrthographicView with Cartesian coordinates can display WGS84 data correctly. Previous session used this but it was marked as forbidden in CLAUDE.md.

**Question:** Is this still forbidden, or was that guidance based on incomplete understanding?

---

## Files Modified This Session

- `frontend/src/components/ZarrMap.jsx` - Multiple edits, still broken
- `data/pyramids/soil_moisture/` - Recreated with actual data (Zarr v3)
- `data/raw/soil_moisture_data.nc` - Extracted from ZIP

---

## Time Wasted

- ~30 min debugging zarrita.js API
- ~30 min discovering empty Zarr chunks
- ~20 min extracting NetCDF from ZIP and recreating pyramids
- ~40 min debugging rendering only to hit projection wall again

Total: ~2 hours, ending at the same place as the previous session.

---

## Honest Assessment

I failed to apply lessons from the same day's earlier session. The projection mismatch was documented, the solution approaches were listed, and I still wrote code that assumed incompatible projections would magically work together.

The user's frustration is completely justified. This is basic GIS knowledge that I should have internalized after the first failure, not repeated three times.

---

## Next Session Requirements

Before writing ANY visualization code:
1. Explicitly state the data projection
2. Explicitly state the view/map projection
3. Confirm they match OR specify the reprojection approach
4. Get user approval on the approach BEFORE coding

No more "write code and see what happens" for projection-sensitive work.
