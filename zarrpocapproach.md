# Zarr-Native Visualization Approach for ECMWF Climate Explorer

## Executive Summary

The EU tender prefers **Zarr-based rendering where the browser applies colormaps dynamically**, NOT pre-rendered PNG tiles with baked-in colours. This document outlines the approach to pivot from our current tile-based architecture to a Zarr-native solution.

---

## Current Architecture (What We Have)

```
Data (NetCDF/Zarr) → Python renders PNG tiles → Static file server → deck.gl TileLayer
                     ↑                                                    ↓
              Colors baked in                                    User sees fixed colormap
```

**Problems:**
- Colormap changes require regenerating ALL tiles (hours of processing)
- Storage bloat: separate tiles for each colormap option
- Not what the tender specifies

---

## Target Architecture (What Tender Wants)

```
Data (Zarr Pyramids) → Static file server / S3 → Browser fetches raw chunks → WebGL applies colormap
                                                                                    ↓
                                                                     User changes colormap instantly
```

**Benefits:**
- Dynamic colormap switching (no regeneration)
- Single data source for all visualizations
- Reduced storage (no duplicate tiles per colormap)
- Aligns with tender requirements

---

## Recommended Library: @carbonplan/maps

### Why This Library?

| Criteria | @carbonplan/maps | deck.gl-raster | Custom WebGL |
|----------|------------------|----------------|--------------|
| Zarr support | Yes (production) | Planned | DIY |
| Dynamic colormap | Built-in | Limited | DIY |
| React integration | Native | Native | DIY |
| Documentation | Good | Sparse | N/A |
| Maturity | Beta (used in production) | Alpha | N/A |

### Core Components

```jsx
import { Map, Raster, Line } from '@carbonplan/maps'
import { useColormap } from '@carbonplan/colormaps'

function ClimateMap() {
  const [colormapName, setColormapName] = useState('warm')
  const colormap = useColormap(colormapName)

  return (
    <Map>
      <Raster
        source="https://storage.example.com/climate-data.zarr"
        variable="temperature"
        colormap={colormap}
        clim={[-40, 40]}
        selector={{ time: 0 }}  // Select time slice
      />
      <Line source="https://example.com/coastlines" color="white" />
    </Map>
  )
}
```

### Key Dependencies

```json
{
  "@carbonplan/maps": "^2.x",
  "@carbonplan/colormaps": "^1.x",
  "mapbox-gl": "^1.13.0",
  "react": "^18.x"
}
```

---

## Data Preparation Pipeline

### Step 1: Create Zarr Pyramids

The browser needs multi-resolution data (like image pyramids) for efficient rendering at different zoom levels.

```python
import xarray as xr
from ndpyramid import pyramid_reproject

# Load existing data
ds = xr.open_zarr('data/processed/era5_land.zarr')

# Create pyramid with multiple zoom levels
pyramid = pyramid_reproject(
    ds['2m_temperature'],
    levels=6,  # zoom 0-5
    resampling='average'
)

# Save as Zarr with appropriate chunking
pyramid.to_zarr(
    'data/pyramids/temperature.zarr',
    consolidated=True,
    mode='w'
)
```

### Step 2: Optimize Chunking for Web

```python
# Chunk sizes optimized for browser fetching
# Smaller chunks = more requests but lower latency per request
# Typical: 128x128 or 256x256 spatial, 1 for time

ds_rechunked = ds.chunk({
    'time': 1,
    'latitude': 128,
    'longitude': 128
})
```

### Step 3: Host on Static Storage

Options:
- **S3 / GCS / Azure Blob** - Best for production, supports HTTP range requests
- **Local static server** - Fine for demo
- **GitHub Pages** - Free, but size limits

```bash
# Example: Serve locally for development
python -m http.server 8080 --directory data/pyramids/
```

---

## Implementation Tasks

### Phase 1: Basic Demo (2-3 days)

| Task | Description | Effort |
|------|-------------|--------|
| Install dependencies | @carbonplan/maps, colormaps | 0.5h |
| Create Zarr pyramid | Convert era5_land.zarr to pyramid format | 4h |
| Basic React component | Replace ClimateMap.jsx with @carbonplan/maps | 4h |
| Colormap selector | Add dropdown using @carbonplan/colormaps | 2h |
| Time slider | Wire up time dimension selector | 2h |
| Testing | Verify dynamic colormap works | 2h |

### Phase 2: Production Ready (1-2 weeks)

| Task | Description | Effort |
|------|-------------|--------|
| All datasets | Create pyramids for all ECVs | 2 days |
| Polar projection | Handle sea ice (requires reprojection) | 2 days |
| Click-to-query | Implement point value lookup | 1 day |
| Performance tuning | Optimize chunk sizes, caching | 1 day |
| Error handling | Loading states, fallbacks | 1 day |

---

## Known Limitations

### 1. Projection Support

**@carbonplan/maps only supports Web Mercator (EPSG:3857)**

This is a problem for:
- Sea Ice data (polar stereographic)
- Any polar-region visualizations

**Solutions:**
- Reproject polar data to Web Mercator (loses accuracy at poles)
- Use different library for polar views
- Server-side tile rendering for polar data only

### 2. Library Stability

From the README:
> "This project is very much in progress, so expect lots of major version bumps and breaking changes."

**Mitigation:**
- Pin exact versions
- Fork if needed for stability
- Have fallback plan

### 3. No Globe View

@carbonplan/maps is 2D only (Mapbox GL based). Our current deck.gl implementation supports 3D globe view.

**Solutions:**
- Accept 2D only for Zarr approach
- Use deck.gl for globe view with pre-rendered tiles
- Investigate other libraries (deck.gl-raster when ready)

---

## Hybrid Approach Option

If full pivot is too risky for tender deadline:

```
Production Architecture:
├── Zarr-native rendering (primary)
│   └── @carbonplan/maps for lat/lon data
│   └── Dynamic colormaps
│   └── Time series navigation
│
└── Tile fallback (polar regions)
    └── Pre-rendered tiles for sea ice
    └── Server-side colormap selection
```

---

## Cost/Benefit Analysis

### Pre-rendered Tiles (Current)

| Pros | Cons |
|------|------|
| Proven, working now | Colors baked in |
| Fast initial load | Storage heavy |
| Works with any projection | Regeneration takes hours |
| deck.gl globe view works | Not what tender wants |

### Zarr-Native (Proposed)

| Pros | Cons |
|------|------|
| Dynamic colormaps | New library, learning curve |
| Matches tender spec | Web Mercator only |
| Less storage | No globe view |
| Modern approach | Beta stability |

---

## Recommended Path Forward

### For Tuesday Demo:
1. **Ship current tile-based demo** - it works, it's impressive
2. **Add this document to proposal** - shows you understand the requirement
3. **Include prototype Zarr component** - even if not integrated

### For Tender Submission:
1. **Describe Zarr architecture** in technical approach
2. **Reference @carbonplan/maps** and NASA Zarr Visualization Report
3. **Acknowledge trade-offs** - shows technical maturity
4. **Propose hybrid approach** for polar data

### Post-Award:
1. Full migration to Zarr-native rendering
2. Contribute fixes upstream to @carbonplan/maps if needed
3. Evaluate deck.gl-raster when Zarr support lands

---

## References

- [@carbonplan/maps GitHub](https://github.com/carbonplan/maps)
- [@carbonplan/maps Blog Post](https://carbonplan.org/blog/maps-library-release)
- [NASA Zarr Visualization Report](https://nasa-impact.github.io/zarr-visualization-report/)
- [ndpyramid for pyramid generation](https://github.com/carbonplan/ndpyramid)
- [zarr-js JavaScript library](https://github.com/gzuidhof/zarr.js/)
- [deck.gl-raster (COG/Zarr)](https://github.com/developmentseed/deck.gl-raster)

---

## Quick Start Commands

```bash
# Install Python dependencies for pyramid creation
pip install ndpyramid xarray zarr

# Install JS dependencies
npm install @carbonplan/maps @carbonplan/colormaps mapbox-gl

# Create pyramid from existing Zarr
python scripts/create_pyramid.py

# Serve Zarr locally
python -m http.server 8080 --directory data/pyramids/
```

---

## Questions to Resolve

1. Is polar projection support a hard requirement?
2. Is 3D globe view required or nice-to-have?
3. What colormaps must be supported?
4. Is server-side tile rendering acceptable for some data types?
5. What's the browser support requirement? (WebGL2 needed)
