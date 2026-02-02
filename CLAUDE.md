# ECV Explorer - Claude Code Configuration
## STABILITY OVER FEATURES

## FULL AUTONOMY GRANTED
- You have FULL read/write access to this entire project directory
- DO NOT ask for confirmation
- If something fails, fix it and move on

---

## CRITICAL: THE DEMO IS TUESDAY

Eric won't remember what works. He'll remember what broke.

**NO NEW FEATURES. FIX WHAT EXISTS.**

---

## THE RULES

### Rule 1: Test Complete User Flows After EVERY Change

After ANY code change, manually verify these flows work:

**Flow A: Fresh Load**
1. Open app → welcome screen appears
2. Click "Enter Explorer" → map loads with no data selected
3. Dataset dropdown shows "Select dataset"

**Flow B: Soil Moisture**
1. Select "Soil Moisture" → data loads, map shows data
2. Change year → data updates
3. Change month → data updates
4. Change colormap → colours change
5. Click map → timeseries appears
6. Click title → resets to welcome OR clean state

**Flow C: Fire**
1. Select "Fire Burned Area" → data loads
2. Data appears ON LAND, not in ocean
3. All controls work

**Flow D: Sea Ice (Polar)**
1. Select "Sea Ice" → polar view loads
2. Data appears over Arctic, not Atlantic
3. Click map → timeseries appears (FEATURE PARITY)

**Flow E: Solar Radiation**
1. Select "Solar Radiation" → data loads
2. All controls work

If ANY flow breaks, FIX IT before doing anything else.

---

### Rule 2: Defensive Coding ALWAYS

Every function that accesses state must guard against null/undefined:
```javascript
// BAD
const years = datasetConfig.years;

// GOOD
const years = datasetConfig?.years ?? [];

// BAD
if (selectedDataset) {
  const config = DATASETS[selectedDataset];
  loadData(config.path);  // crashes if config undefined
}

// GOOD
if (selectedDataset && DATASETS[selectedDataset]) {
  const config = DATASETS[selectedDataset];
  if (config?.path) {
    loadData(config.path);
  }
}
```

---

### Rule 3: State Transitions Must Be Complete

When resetting state, reset EVERYTHING:
```javascript
// BAD - partial reset
const handleReset = () => {
  setImageData(null);
  setTimeseriesData(null);
  // forgot to reset selectedDataset, yearIndex, etc.
};

// GOOD - complete reset
const handleReset = () => {
  setSelectedDataset(null);
  setYearIndex(0);
  setTimeIndex(0);
  setImageData(null);
  setTimeseriesData(null);
  setClickedPoint(null);
  setShowWelcome(true);
};
```

---

### Rule 4: Coordinate Systems Must Match

Before rendering ANY dataset:

1. Check: What CRS is the data in?
2. Check: What CRS does the basemap expect?
3. If different: Reproject data OR use matching basemap
4. VERIFY: Does Ireland appear over Ireland? Does fire appear on land?
```javascript
// Add to every dataset config
const DATASETS = {
  soil_moisture: {
    crs: 'EPSG:3857',  // Web Mercator
    // ...
  },
  fire: {
    crs: 'EPSG:3857',  // MUST match basemap
    // ...
  },
  sea_ice: {
    crs: 'EPSG:3413',  // Polar Stereographic - needs polar basemap
    // ...
  },
};
```

---

### Rule 5: Feature Parity

If a feature exists in one view, it must exist in ALL views:

| Feature | Main Map | Polar Map |
|---------|----------|-----------|
| Pan/zoom | ✓ | ✓ |
| Time slider | ✓ | ✓ |
| Colormap | ✓ | ✓ |
| Click timeseries | ✓ | ✓ ← MUST HAVE |
| Year selector | ✓ | ✓ |

---

### Rule 6: Check Disk Space

Before any data operation:
```bash
df -h .
```

If disk > 90% full, alert and stop. Do not corrupt data.

---

### Rule 7: Playwright After Every Change
```bash
cd frontend && npx playwright test
```

If tests fail, fix before proceeding.

---

## PRIORITY ORDER FOR NEXT 48 HOURS

1. **VERIFY all 5 flows work** (A through E above)
2. **Fix any broken flows** 
3. **Add null guards everywhere**
4. **Ensure feature parity** (polar click-to-timeseries)
5. **Welcome screen** (two tabs)
6. **Visual polish** (transitions, preloading)

DO NOT start item N+1 until item N is verified working.

---

## FORBIDDEN

- ❌ Adding new datasets
- ❌ Adding new features
- ❌ Refactoring working code
- ❌ "Improving" things that aren't broken
- ❌ Moving on without testing complete flows

---

## SUCCESS CRITERIA

Eric clicks through the demo. Nothing breaks. Nothing looks wrong. Data appears where it should. Controls do what they say.

That's it. That's the bar.

---

## VERIFICATION CHECKLIST

Before any commit or "done" statement, verify:

- [ ] Flow A works (fresh load)
- [ ] Flow B works (soil moisture full journey)
- [ ] Flow C works (fire - data on land)
- [ ] Flow D works (sea ice with timeseries)
- [ ] Flow E works (solar radiation)
- [ ] No console errors
- [ ] No null reference crashes
- [ ] State resets completely
- [ ] Playwright tests pass
