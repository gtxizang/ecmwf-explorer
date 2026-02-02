# Climate Data Visualisation Architecture Proposal

## Background

### Project Context
We are developing a proof-of-concept for an EU tender that requires a climate data explorer application. The application must display ERA5-Land climate data (temperature, precipitation, etc.) on an interactive map with:
- Smooth pan and zoom
- Time-based animation (monthly data 2020-2024)
- Variable and colormap selection
- Both 2D map and 3D globe views

### Reference Application
The target user experience is comparable to the [Copernicus NEC Explorer](https://apps.climate.copernicus.eu/nec-explorer/) - a professional climate visualisation tool with smooth, responsive map interactions.

### Current Implementation
Our current approach renders climate data images on-demand:

```
User Request → Backend reads Zarr → Matplotlib/Cartopy renders image → Send to frontend
```

**Problems with this approach:**
1. **Slow**: Each request takes 2-5 seconds to render
2. **Resolution limited**: Single global image doesn't scale well with zoom
3. **Server load**: Every pan/zoom could trigger re-renders
4. **Poor UX**: Not "butter smooth" - noticeable delays when interacting

### Data Characteristics
- **Source**: ECMWF Climate Data Store (CDS) API
- **Update frequency**: Historical data is static; new data added periodically (daily/monthly depending on product)
- **Volume**: ~60 time steps × 2 variables = 120 datasets currently
- **Nature**: This is NOT real-time data - it's historical/reanalysis data that rarely changes once published

---

## Proposed Architecture

### Core Insight
Since climate reanalysis data is static (or updates infrequently), we should **pre-render all visualisations as map tiles** rather than rendering on-demand.

### Tile Pyramid Approach

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA PIPELINE                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌───────────────┐    ┌──────────────────────┐  │
│  │ ECMWF/CDS    │───▶│ Pre-process   │───▶│ Tile Storage         │  │
│  │ API          │    │ Pipeline      │    │ (Static Files/S3)    │  │
│  │ (Raw NetCDF/ │    │               │    │                      │  │
│  │  Zarr)       │    │ - Zarr ingest │    │ tiles/               │  │
│  └──────────────┘    │ - Tile render │    │   {variable}/        │  │
│                      │ - Quality     │    │     {time}/          │  │
│  Runs periodically   │   levels      │    │       {z}/{x}/{y}.png│  │
│  (daily/weekly)      └───────────────┘    └──────────┬───────────┘  │
│                                                       │              │
└───────────────────────────────────────────────────────┼──────────────┘
                                                        │
                                                        │ Static file serving
                                                        │ (CDN cacheable)
                                                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  React + Deck.gl TileLayer                                    │   │
│  │                                                               │   │
│  │  - Requests only visible tiles                                │   │
│  │  - Smooth pan/zoom (tiles load progressively)                 │   │
│  │  - Time slider swaps tile URLs instantly                      │   │
│  │  - Globe view uses same tiles                                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### How Map Tiles Work

Map tiles use a **pyramid structure** where each zoom level has 4× more tiles:

| Zoom | Tiles      | Coverage per tile |
|------|------------|-------------------|
| 0    | 1          | Whole world       |
| 1    | 4          | Hemisphere        |
| 2    | 16         | Large region      |
| 3    | 64         | Country           |
| ...  | ...        | ...               |
| 8    | 65,536     | ~1km              |

The frontend only requests tiles visible in the current viewport. As you zoom in, it requests higher-zoom tiles for that specific area.

### Pre-processing Pipeline

```python
# Pseudocode for tile generation
for variable in ['2m_temperature', 'skin_temperature']:
    for time_index in range(60):  # 60 months
        for zoom in range(0, 9):  # Zoom levels 0-8
            for x, y in get_tiles_at_zoom(zoom):
                # Render this tile using cartopy
                tile_image = render_tile(variable, time_index, zoom, x, y)
                save_tile(f"tiles/{variable}/{time_index}/{zoom}/{x}/{y}.png")
```

**One-time generation cost:**
- ~65,000 tiles per time step per variable (at zoom 0-8)
- 60 time steps × 2 variables = ~7.8 million tiles total
- At ~10KB per tile = ~78GB storage
- Generation time: Several hours (parallelisable)

**But then serving is instant** - just static file delivery.

### Benefits

| Aspect | Current (On-demand) | Proposed (Pre-rendered) |
|--------|---------------------|-------------------------|
| Response time | 2-5 seconds | <100ms |
| Zoom smoothness | Poor (single resolution) | Excellent (progressive tiles) |
| Server CPU | High (rendering) | Minimal (file serving) |
| Cacheability | Limited | Fully CDN-cacheable |
| Scalability | Poor | Excellent |
| User experience | Laggy | Butter smooth |

### Technology Options

**Tile Generation:**
- `rio-tiler` + `titiler` (Python, production-ready)
- Custom cartopy script (more control over styling)
- `gdal2tiles.py` (standard tool)

**Tile Storage:**
- Static files on disk (`tiles/{z}/{x}/{y}.png`)
- AWS S3 / CloudFront (scalable, CDN)
- MBTiles (SQLite database, portable)

**Frontend:**
- Deck.gl `TileLayer` (already using Deck.gl)
- Or any standard map library (Leaflet, MapLibre, OpenLayers)

---

## Questions for Tender Compatibility

We need to verify this architecture aligns with the tender requirements:

1. **Technology Stack**: The tender specifies React + Mantine UI for the frontend. Does the backend technology (Python tile generation, static file serving) have any constraints?

2. **Data Pipeline**: Is a batch pre-processing approach acceptable, or does the tender require real-time data processing capabilities?

3. **Infrastructure**: What are the hosting/infrastructure constraints? Can we use:
   - Static file storage (S3, Azure Blob, etc.)
   - CDN for tile delivery
   - Scheduled jobs for pipeline execution

4. **Update Frequency**: How often does the climate data update? This determines how frequently we need to regenerate tiles.

5. **Scale Requirements**:
   - How many variables/datasets need to be visualised?
   - What geographic coverage (global, Europe only)?
   - What time range (historical + forecasts)?

6. **Offline/On-premise**: Does the solution need to work offline or on-premise, or is cloud deployment acceptable?

---

## Recommendation

**Implement the tile-based architecture.** This is the industry-standard approach used by:
- Google Maps
- Mapbox
- OpenStreetMap
- Copernicus Climate Data Store visualisations
- NOAA climate viewers

The upfront investment in tile generation pays off with a dramatically better user experience and lower operational costs.

### Next Steps (if approved)

1. Confirm tender compatibility
2. Set up tile generation pipeline
3. Generate tiles for sample dataset
4. Update frontend to use TileLayer
5. Verify performance meets "butter smooth" requirement
6. Document pipeline for production deployment

---

*Document prepared for architecture review - January 2026*
