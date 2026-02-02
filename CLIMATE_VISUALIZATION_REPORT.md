# Climate Data Visualization Best Practices & Recommendations

**ECMWF ECV Explorer - CJS2_231 POC**
**Report Date: January 31, 2026**

---

## Executive Summary

This report provides comprehensive recommendations for enhancing the Climate Data Explorer based on industry best practices, leading platform analysis, and audience-specific requirements. The goal is to achieve a "buttery smooth" UX that maximizes the impact of the multi-year climate datasets we've assembled.

### Current State
- **4 Datasets Working**: Soil Moisture (75yr), Solar Radiation (75yr), Fire Burned Area (5yr), Sea Ice (36yr)
- **Technology Stack**: deck.gl + zarrita.js + React + Mantine UI
- **Data Format**: Zarr v2 pyramids with LOD levels 0-4

---

## Part 1: Technical Delivery Best Practices

### 1.1 Data Loading & Rendering Performance

#### Progressive Loading / Level of Detail (LOD)

**Current Implementation**: Our LOD system correctly selects pyramid levels based on zoom.

**Industry Best Practices**:
- **Google Earth Engine**: Uses hierarchical tiling with 256x256 tiles at each zoom level
- **ECMWF ERA Explorer**: Implements dual Zarr storage (one chunked by time, one by space) for optimal retrieval
- **NASA Worldview**: Pre-renders daily composites at multiple resolutions

**Recommendations for Enhancement**:

```javascript
// Predictive LOD loading - preload adjacent levels
async function preloadAdjacentLODs(currentLevel, maxLevel) {
  const levelsToPreload = [
    Math.max(0, currentLevel - 1),  // Coarser fallback
    Math.min(maxLevel, currentLevel + 1)  // Finer for zoom-in
  ].filter(l => l !== currentLevel);

  await Promise.all(levelsToPreload.map(level =>
    preloadLevel(level, viewBounds)
  ));
}
```

#### GPU Acceleration with deck.gl

**What We Have**: BitmapLayer rendering with WebGL

**Best Practices from deck.gl Documentation**:
1. **Direct GPU Attribute Buffers**: Pass typed arrays directly to GPU
2. **GPU-Accelerated Aggregation**: For heatmaps and density visualization
3. **GPU-Based Data Filtering**: Use DataFilterExtension for real-time filtering

**Recommendations**:

```javascript
// Add GPU-powered transitions for smooth animation
new BitmapLayer({
  ...existingProps,
  transitions: {
    opacity: 300,  // Smooth fade transitions
  },
  extensions: [new DataFilterExtension({
    filterSize: 1  // Enable single-value filtering
  })],
});
```

#### Caching Strategies

**Current**: In-memory image cache (24 images max)

**Industry Best Practices**:
1. **Service Workers**: Offline-capable caching
2. **IndexedDB**: Persist decoded data between sessions
3. **HTTP Range Requests**: Zarr naturally supports this

**Recommendations**:

```javascript
// Add Service Worker for offline support
// sw.js
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/zarr/')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open('zarr-v1').then(cache =>
            cache.put(event.request, clone)
          );
          return response;
        })
      )
    );
  }
});
```

### 1.2 Data Formats & Storage

#### Zarr Chunking Optimization

**Current Chunks**: `[1, 1, height, width]` per year/month

**Best Practices**:
- **For HPC/Analytics**: 10-100 MB chunks
- **For Web Visualization**: 100-500 KB chunks (256x256 or 512x512 spatial)

**Key Insight from Research**:
> "Keeping chunks spatial-only allows the browser to load just the visible region for the current time/depth step."

Our chunking is optimal - each chunk is a single year/month spatial slice.

#### Compression

**Current**: zstd compression

**Recommendation**: Consider blosc with lz4 for faster decompression in browser:
- zstd: Higher compression ratio, slower
- blosc/lz4: Lower compression, faster decompression
- For real-time visualization, decompression speed matters more

### 1.3 Web Technologies

#### Web Workers for Background Processing

**Recommendation**: Move data decoding to Web Worker

```javascript
// dataWorker.js
self.onmessage = async (e) => {
  const { arrayBuffer, colormap, vmin, vmax } = e.data;

  // Decode Zarr chunk
  const decoded = await decodeZarrChunk(arrayBuffer);

  // Apply colormap (CPU-intensive)
  const rgba = applyColormap(decoded, colormap, vmin, vmax);

  // Transfer back (zero-copy with transferable)
  self.postMessage({ rgba }, [rgba.buffer]);
};
```

#### Progressive Web App (PWA) Features

**Recommendations for Demo**:
1. **Add manifest.json** for installable PWA
2. **Offline indicator** when service worker has cached data
3. **Background sync** for preloading during idle time

### 1.4 Leading Platform Analysis

| Platform | Key Technique | Applicable Learning |
|----------|---------------|---------------------|
| **ECMWF ERA Explorer** | Dual Zarr storage (time-chunked + space-chunked) | Consider space-optimized Zarr for timeseries queries |
| **NASA Worldview** | Pre-rendered daily composites | Precompute popular views |
| **Google Earth Engine** | Streaming tiles with adaptive quality | Reduce quality on slow connections |
| **Climate Reanalyzer** | Animated maps with annotation overlays | Add drawing tools for presentation |
| **NOAA Climate Explorer** | County-level data with comparisons | Add region-specific views |

---

## Part 2: Audience-Specific UI/UX Recommendations

### 2.1 Scientists/Researchers

**Key Needs**: Data exploration, uncertainty, export, reproducibility

#### Recommended Features

| Feature | Implementation | Priority |
|---------|----------------|----------|
| **Data Export** | Add NetCDF/CSV download for visible data | HIGH |
| **Uncertainty Display** | Show ensemble spread or confidence intervals | MEDIUM |
| **Reproducible Links** | URL encodes view state (year, dataset, location) | HIGH |
| **Jupyter Integration** | Generate Python notebook code for data access | MEDIUM |
| **API Access** | Document REST API for programmatic access | HIGH |

#### UI Pattern: Data Export Panel

```jsx
// Add export button to control panel
<Button onClick={() => exportData({
  dataset: selectedDataset,
  year: selectedYear,
  month: timeIndex,
  bounds: viewBounds,
  format: 'netcdf'  // or 'csv', 'geojson'
})}>
  Download Data
</Button>
```

### 2.2 Journalists/Media

**Key Needs**: Storytelling, shareable visualizations, embeddable widgets

#### Recommended Features

| Feature | Implementation | Priority |
|---------|----------------|----------|
| **Screenshot Export** | High-res PNG with legend and attribution | HIGH |
| **Embed Code Generator** | iframe snippet for articles | MEDIUM |
| **Annotation Mode** | Draw arrows, add text callouts | MEDIUM |
| **Story Mode** | Scrollytelling presentation builder | LOW (post-demo) |
| **Social Share Cards** | Auto-generated Open Graph images | MEDIUM |

#### UI Pattern: Share Panel

```jsx
<Menu>
  <Menu.Target>
    <Button leftIcon={<ShareIcon />}>Share</Button>
  </Menu.Target>
  <Menu.Dropdown>
    <Menu.Item onClick={downloadScreenshot}>Download Image (PNG)</Menu.Item>
    <Menu.Item onClick={copyEmbedCode}>Copy Embed Code</Menu.Item>
    <Menu.Item onClick={shareToTwitter}>Share to Twitter</Menu.Item>
    <Menu.Item onClick={copyLink}>Copy Link</Menu.Item>
  </Menu.Dropdown>
</Menu>
```

### 2.3 Policy Makers

**Key Needs**: Executive summaries, scenario comparison, regional filtering

#### Recommended Features

| Feature | Implementation | Priority |
|---------|----------------|----------|
| **Dashboard View** | Key metrics at a glance (sparklines, trends) | MEDIUM |
| **Region Selector** | Country/region dropdown with presets | HIGH |
| **Scenario Comparison** | Side-by-side year comparison | MEDIUM |
| **Risk Indicators** | Traffic light system for thresholds | LOW |
| **PDF Report Export** | Formatted briefing document | LOW |

#### UI Pattern: Region Quick-Select

```jsx
<Select
  label="Focus Region"
  data={[
    { value: 'eu', label: 'European Union' },
    { value: 'sahel', label: 'Sahel Region' },
    { value: 'arctic', label: 'Arctic Circle' },
    { value: 'custom', label: 'Draw Region...' },
  ]}
  onChange={(region) => flyToRegion(region)}
/>
```

### 2.4 Educators

**Key Needs**: Interactive learning, lesson integration, age-appropriate views

#### Recommended Features

| Feature | Implementation | Priority |
|---------|----------------|----------|
| **Simplified Mode** | Hide technical details, show plain language | MEDIUM |
| **Guided Tour** | Step-by-step walkthrough of features | HIGH |
| **Full Screen Presentation** | Distraction-free mode for projectors | HIGH |
| **Teacher Notes** | Pop-up explanations of climate concepts | LOW |
| **Quiz Mode** | "Find the warmest month" interactions | LOW |

#### UI Pattern: Guided Tour

```jsx
// Using react-joyride or similar
const tourSteps = [
  { target: '.dataset-selector', content: 'Choose from 4 climate datasets spanning up to 75 years' },
  { target: '.year-slider', content: 'Slide through time to see how climate has changed' },
  { target: '.map-area', content: 'Click anywhere to see detailed data for that location' },
  { target: '.play-button', content: 'Press play to animate through all months and years' },
];
```

### 2.5 General Public

**Key Needs**: Accessibility, mobile-first, personal relevance

#### Recommended Features

| Feature | Implementation | Priority |
|---------|----------------|----------|
| **Geolocation** | "Show my location" button | HIGH |
| **Accessibility** | Color-blind friendly palettes, ARIA labels | HIGH |
| **Mobile Optimization** | Touch gestures, responsive layout | HIGH |
| **Plain Language** | Tooltips explaining what values mean | MEDIUM |
| **Local Context** | "Your city will feel like X by 2050" | LOW |

#### UI Pattern: Location Search

```jsx
<Group>
  <TextInput
    placeholder="Search location..."
    value={searchQuery}
    onChange={setSearchQuery}
    rightSection={<SearchIcon />}
  />
  <ActionIcon onClick={useCurrentLocation} title="Use my location">
    <LocationIcon />
  </ActionIcon>
</Group>
```

---

## Part 3: Prioritized Implementation Roadmap

### Immediate (Before Demo)
1. **Screenshot Export** - Simple canvas capture
2. **Shareable URLs** - Encode view state in URL params
3. **Accessibility** - Verify color contrast, add ARIA labels
4. **Full-screen Mode** - Hide controls for presentation

### Short-term (Post-Demo, Pre-Tender)
1. **Data Export (CSV/NetCDF)** - Backend endpoint for data extraction
2. **Guided Tour** - First-time user walkthrough
3. **Region Presets** - Quick navigation to key areas
4. **Mobile Polish** - Touch gestures, responsive panels

### Medium-term (Production)
1. **Service Worker Caching** - Offline support
2. **Web Worker Processing** - Background data decoding
3. **Annotation Mode** - Drawing tools for presentations
4. **Embed Widget** - Standalone embeddable component

### Long-term (Full Platform)
1. **Scrollytelling Builder** - Visual story creation tool
2. **Scenario Comparison** - Multiple years side-by-side
3. **Uncertainty Visualization** - Ensemble spread display
4. **API Documentation Portal** - Developer-focused resources

---

## Part 4: Buttery Smooth UX Techniques

### Preloading & Prefetching

```javascript
// Predictive data loading based on user behavior
useEffect(() => {
  // Preload next/previous year while user is viewing current
  if (selectedYear < yearRange.end) {
    preloadYear(selectedYear + 1, timeIndex, currentLOD);
  }
  if (selectedYear > yearRange.start) {
    preloadYear(selectedYear - 1, timeIndex, currentLOD);
  }

  // Preload adjacent months
  preloadMonth(selectedYear, (timeIndex + 1) % 12, currentLOD);
  preloadMonth(selectedYear, (timeIndex + 11) % 12, currentLOD);
}, [selectedYear, timeIndex]);
```

### Optimistic UI Updates

```javascript
// Show old data while loading new, avoiding blank screens
const [displayData, setDisplayData] = useState(null);
const [pendingData, setPendingData] = useState(null);

useEffect(() => {
  if (newDataLoaded && pendingData) {
    setDisplayData(pendingData);
    setPendingData(null);
  }
}, [newDataLoaded, pendingData]);

// Never clear displayData until pendingData is ready
```

### Smooth Transitions

```javascript
// CSS transitions for data layer changes
.data-layer {
  transition: opacity 0.3s ease-in-out;
}

.data-layer.loading {
  opacity: 0.7;  // Dim slightly while loading, don't hide
}
```

### Progressive Rendering

```javascript
// Render low-res first, then high-res
async function loadWithFallback(level, bounds) {
  // Immediately show low-res if available
  const lowRes = await loadFromCache(level - 2, bounds);
  if (lowRes) setPreviewData(lowRes);

  // Then load full resolution
  const highRes = await loadFromServer(level, bounds);
  setData(highRes);
  setPreviewData(null);
}
```

---

## Part 5: Key Sources & References

### ECMWF & Copernicus
- [The dawn of a new ERA Explorer](https://www.ecmwf.int/en/newsletter/183/news/dawn-new-era-explorer) - ARCO Data Lake architecture
- [Data visualisation at Copernicus](https://climate.copernicus.eu/data-visualisation) - Best practices for climate viz
- [Code for Earth 2024](https://www.ecmwf.int/en/newsletter/181/news/code-earth-2024-successful-completion-13-challenges) - Fire Front Radar, CAMS Verisualiser

### Technical Delivery
- [Zarr in the Browser](https://medium.com/@tobias.ramalho.ferreira/zarr-in-the-browser-fast-flexible-and-surprisingly-powerful-for-big-geo-data-eeb90ddf8a3d) - Client-side Zarr strategies
- [deck.gl Performance Guide](https://deck.gl/docs/developer-guide/performance) - GPU optimization techniques
- [Cloud Native Climate Data with Zarr](https://speakerdeck.com/rabernat/cloud-native-climate-data-with-zarr-and-xarray) - Pangeo community best practices

### UX & Visualization
- [Towards more effective visualisations in climate services](https://link.springer.com/article/10.1007/s10584-022-03365-4) - Academic research on climate viz
- [NOAA Climate Data Primer](https://www.climate.gov/maps-data/climate-data-primer/visualizing-climate-data) - Accessible visualization guidance
- [NYT Scrollytelling Innovation](https://www.storybench.org/scrollytelling-innovation-new-york-times-journalists-on-climate-change-visualization-and-intense-teamwork/) - Storytelling techniques

### Leading Platforms
- [NASA Climate Interactives](https://science.nasa.gov/climate-change/climate-interactives/) - Educational features
- [Climate Central](https://www.climatecentral.org/) - Public engagement
- [PROVIDE Climate Risk Dashboard](https://climate-risk-dashboard.climateanalytics.org/) - Policy maker tools
- [Climate Reanalyzer](https://climatereanalyzer.org/) - Real-time visualization

---

## Conclusion

The ECMWF ECV Explorer is well-positioned with its solid technical foundation (deck.gl + zarrita.js + Zarr pyramids). The key opportunities for differentiation are:

1. **Multi-year temporal navigation** - Few platforms offer 75-year animations
2. **Client-side Zarr loading** - Aligns with ECMWF tender preference
3. **Multiple ECV datasets** - Demonstrating breadth of Copernicus data
4. **Polar-optimized sea ice view** - Specialized projection handling

The recommendations in this report provide a roadmap for evolving from a demo into a production-ready platform that serves scientists, journalists, policy makers, educators, and the public effectively.

---

*Report generated by Claude Code for the ECMWF CJS2_231 POC*
