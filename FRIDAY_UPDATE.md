# ECMWF Climate Data Explorer - Friday Morning Update
**Date:** 2026-01-30

## Project Goal
Build a visually impressive climate data explorer POC to demonstrate capability for an EU tender. Target: "buttery smooth" pan/zoom/animation that impresses decision-makers.

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA PIPELINE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. RAW DATA (ECMWF/CDS API)                                   │
│     └── ERA5-Land monthly averages                             │
│     └── Downloaded via CDS API                                 │
│     └── Location: data/raw/                                    │
│                                                                 │
│  2. PROCESSED DATA (Zarr)                                      │
│     └── Converted to Zarr format for fast partial reads        │
│     └── Location: data/processed/era5_land.zarr                │
│     └── Variables: 2m_temperature, skin_temperature            │
│     └── Time range: 2020-2024 (60 months)                      │
│                                                                 │
│  3. PRE-RENDERED TILES (PNG)                                   │
│     └── XYZ tile pyramid for web map display                   │
│     └── Location: tiles/{variable}/{time_index}/{z}/{x}/{y}.png│
│     └── Zoom levels: 0-5 (partially regenerated)               │
│     └── Time indices: 0-11 (2023 only, 12 months)              │
│     └── ~30,000 tiles, ~750MB                                  │
│     └── Rendered with Cartopy (Mercator projection)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  FastAPI (Python)                                              │
│  └── Static file serving for pre-rendered tiles                │
│  └── /tiles/{variable}/{time}/{z}/{x}/{y}.png                  │
│  └── /api/tile-info - metadata about available tiles           │
│  └── /api/timeseries - point query for click-to-chart          │
│  └── /api/metadata - dataset info                              │
│  └── Port: 8000                                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
├─────────────────────────────────────────────────────────────────┤
│  React + Vite                                                  │
│  └── Deck.gl TileLayer for map rendering                       │
│  └── Mantine UI for controls                                   │
│  └── Port: 5173                                                │
│                                                                 │
│  Features:                                                     │
│  ├── 2D Map view (MapView)                                     │
│  ├── 3D Globe view (GlobeView)                                 │
│  ├── Time slider with play/pause animation                     │
│  ├── Variable selector (2m_temp, skin_temp)                    │
│  ├── Click-to-query with timeseries chart                      │
│  ├── Preloading for smooth animation                           │
│  └── 12 TileLayers with visibility toggle (no reload flicker)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## What's Working

| Feature | Status | Notes |
|---------|--------|-------|
| Pan/zoom | Smooth | Single TileLayer per time, deck.gl handles efficiently |
| Time animation | Smooth | 12 pre-loaded layers, visibility toggle |
| Tile seams | Fixed | Buffer + crop technique eliminates edge artifacts |
| Globe view | Working | Toggle between 2D map and 3D globe |
| Click query | Working | Shows timeseries chart for clicked location |
| Coastlines | Clean | Cartopy 50m/110m resolution based on zoom |
| Color scale | Working | RdYlBu_r colormap, fixed legend |

---

## Tile Generation Details

**Script:** `scripts/generate_tiles.py`

**Process:**
1. Load Zarr data for each variable/time combination
2. For each zoom level (0-5), iterate through all tile coordinates
3. Calculate Web Mercator bounds for each tile
4. Render with Cartopy:
   - pcolormesh for climate data (gouraud shading)
   - Ocean mask (dark background)
   - Coastlines (resolution varies by zoom)
5. Apply buffer + crop to eliminate edge seams
6. Save as 256x256 PNG

**Performance:**
- ~1-2 tiles/second with current setup
- Full regeneration: ~2-3 hours for all zooms
- Zooms 0-3 regenerated today with seam fix
- Zooms 4-5 partially regenerated

**Seam Fix Applied:**
- Render 2% larger extent than tile bounds
- Create figure slightly larger than 256px
- Crop center 256x256 to get clean edges

---

## Current Limitations / Known Issues

1. **Zoom 4-5 tiles** - Only partially regenerated with seam fix
2. **No country boundaries** - Only coastlines currently rendered
3. **Single colormap** - RdYlBu_r hardcoded (was intentional for POC)
4. **2023 data only** - Tiles only cover 12 months of 2023
5. **Browser caching** - Need cache buster (?v=3) for tile updates
6. **No loading indicator** - Preload progress not very visible

---

## File Structure

```
ECMWF-POC/
├── backend/
│   ├── main.py              # FastAPI server
│   ├── venv/                # Python environment
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── components/
│   │       └── ClimateMap.jsx  # Main map component
│   └── package.json
├── scripts/
│   └── generate_tiles.py    # Tile generation pipeline
├── data/
│   ├── raw/                 # Original downloads
│   └── processed/
│       └── era5_land.zarr   # Processed Zarr data
├── tiles/                   # Pre-rendered tile pyramid
│   ├── 2m_temperature/
│   │   └── {time}/{z}/{x}/{y}.png
│   └── skin_temperature/
│       └── {time}/{z}/{x}/{y}.png
├── CLAUDE.md                # Project instructions
└── FRIDAY_UPDATE.md         # This file
```

---

## Running the Application

```bash
# Terminal 1 - Backend
cd backend && uvicorn main:app --reload --port 8000

# Terminal 2 - Frontend
cd frontend && npm run dev
```

Open: http://localhost:5173

---

## Potential Next Steps (For Discussion)

### Immediate Polish
- [ ] Complete zoom 4-5 tile regeneration with seam fix
- [ ] Add country boundaries to tiles
- [ ] Improve loading indicator visibility
- [ ] Test on different browsers/devices

### Data Expansion
- [ ] Add more variables (precipitation, wind, etc.)
- [ ] Extend time range beyond 2023
- [ ] Add more recent data (near real-time?)

### Features
- [ ] Multiple colormaps (user selectable)
- [ ] Region highlighting/selection
- [ ] Data comparison (side-by-side or diff)
- [ ] Export/download functionality
- [ ] URL sharing (encode view state)

### Performance
- [ ] WebP tiles instead of PNG (smaller files)
- [ ] Tile CDN/caching strategy
- [ ] Service worker for offline support

### Infrastructure
- [ ] Docker containerization
- [ ] CI/CD pipeline
- [ ] Cloud deployment (AWS/Azure/GCP)

---

## Key Decisions Made

1. **Pre-rendered tiles** over on-demand rendering - enables buttery smooth UX
2. **Deck.gl TileLayer** over MapLibre/Leaflet - better WebGL performance
3. **Cartopy for rendering** - high-quality coastlines, proper projections
4. **Zarr for data storage** - fast partial reads, cloud-friendly
5. **12 visibility-toggled layers** over single dynamic layer - instant frame switching

---

## Questions for Next Session

1. What features are must-haves for the tender demo?
2. Should we add country boundaries before other features?
3. What's the deployment target (cloud provider, timeline)?
4. Do we need additional datasets beyond ERA5-Land?
5. Is the current 2023-only time range sufficient for demo?
