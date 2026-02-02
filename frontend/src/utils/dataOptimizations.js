/**
 * Data Loading Optimizations for ECV Explorer
 *
 * Implements various techniques to improve perceived and actual loading performance:
 * - Preloading adjacent time slices
 * - Background data prefetching
 * - Progressive loading (coarse to fine)
 * - LRU cache with size limits
 * - Request deduplication
 */

import * as zarr from 'zarrita';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// LRU Cache implementation
class LRUCache {
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;

    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    // Delete if exists to move to end
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Evict oldest if at capacity
    else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

// Global caches
export const dataCache = new LRUCache(100); // Raw data cache
export const imageCache = new LRUCache(50); // Rendered image cache
export const metadataCache = new LRUCache(20); // Store metadata cache

// Request deduplication
const pendingRequests = new Map();

/**
 * Deduplicated data fetch - prevents duplicate network requests
 */
export async function fetchDataDeduplicated(cacheKey, fetchFn) {
  // Check cache first
  const cached = dataCache.get(cacheKey);
  if (cached) {
    console.log(`[CACHE] Data hit: ${cacheKey}`);
    return cached;
  }

  // Check for pending request
  if (pendingRequests.has(cacheKey)) {
    console.log(`[DEDUP] Waiting for pending request: ${cacheKey}`);
    return pendingRequests.get(cacheKey);
  }

  // Start new request
  const promise = fetchFn().then(result => {
    dataCache.set(cacheKey, result);
    pendingRequests.delete(cacheKey);
    return result;
  }).catch(err => {
    pendingRequests.delete(cacheKey);
    throw err;
  });

  pendingRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Preload adjacent time slices in the background
 * Supports both single-year and multi-year datasets
 */
export function preloadAdjacentTimeSlices(config, currentTime, level, options = {}) {
  const { lookahead = 2, lookbehind = 1, year = null } = options;
  const datasetKey = config.id || config.path.split('/').pop();
  const isMultiYear = config.isMultiYear && year !== null;

  const preloadTasks = [];

  // Preload next slices (higher priority)
  for (let i = 1; i <= lookahead; i++) {
    const nextTime = (currentTime + i) % 12;
    const cacheKey = isMultiYear
      ? `${datasetKey}-${level}-${year}-${nextTime}-data`
      : `${datasetKey}-${level}-${nextTime}-data`;

    if (!dataCache.has(cacheKey)) {
      preloadTasks.push({
        time: nextTime,
        priority: i,
        cacheKey,
      });
    }
  }

  // Preload previous slices (lower priority)
  for (let i = 1; i <= lookbehind; i++) {
    const prevTime = (currentTime - i + 12) % 12;
    const cacheKey = isMultiYear
      ? `${datasetKey}-${level}-${year}-${prevTime}-data`
      : `${datasetKey}-${level}-${prevTime}-data`;

    if (!dataCache.has(cacheKey)) {
      preloadTasks.push({
        time: prevTime,
        priority: lookahead + i,
        cacheKey,
      });
    }
  }

  // Sort by priority and execute
  preloadTasks.sort((a, b) => a.priority - b.priority);

  // Use requestIdleCallback for background loading
  const loadInBackground = (tasks, index = 0) => {
    if (index >= tasks.length) return;

    const task = tasks[index];

    const doLoad = async () => {
      try {
        console.log(`[PRELOAD] Background loading time ${task.time}`);
        await loadZarrSlice(config, level, task.time, year);
      } catch (err) {
        console.warn(`[PRELOAD] Failed to preload time ${task.time}:`, err.message);
      }

      // Schedule next
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => loadInBackground(tasks, index + 1), { timeout: 5000 });
      } else {
        setTimeout(() => loadInBackground(tasks, index + 1), 100);
      }
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(doLoad, { timeout: 5000 });
    } else {
      setTimeout(doLoad, 100);
    }
  };

  loadInBackground(preloadTasks);
}

/**
 * Load a single Zarr slice with caching and deduplication
 * Supports both single-year and multi-year datasets
 */
export async function loadZarrSlice(config, level, timeIndex, year = null) {
  // Use consistent cache key format with ZarrMap.jsx
  const datasetKey = config.id || config.path.split('/').pop();
  const isMultiYear = config.isMultiYear && year !== null;

  const cacheKey = isMultiYear
    ? `${datasetKey}-${level}-${year}-${timeIndex}-data`
    : `${datasetKey}-${level}-${timeIndex}-data`;

  return fetchDataDeduplicated(cacheKey, async () => {
    const storeUrl = `${API_URL}${config.path}/${level}`;
    const store = new zarr.FetchStore(storeUrl);
    const root = zarr.root(store);

    const arr = await zarr.open(root.resolve(config.variable), { kind: 'array' });

    let result;
    if (isMultiYear) {
      // Multi-year: need to find year index first
      const coordKey = `${datasetKey}-${level}-coords`;
      let coords = dataCache.get(coordKey);

      if (!coords) {
        const xArr = await zarr.open(root.resolve('x'), { kind: 'array' });
        const yArr = await zarr.open(root.resolve('y'), { kind: 'array' });
        const yearArr = await zarr.open(root.resolve('year'), { kind: 'array' });
        const xResult = await zarr.get(xArr);
        const yResult = await zarr.get(yArr);
        const yearResult = await zarr.get(yearArr);
        coords = {
          x: Array.from(xResult.data),
          y: Array.from(yResult.data),
          years: Array.from(yearResult.data).map(y => Number(y)),
          shape: arr.shape,
        };
        dataCache.set(coordKey, coords);
      }

      const yearIndex = coords.years.indexOf(year);
      if (yearIndex === -1) {
        throw new Error(`Year ${year} not found`);
      }

      result = await zarr.get(arr, [yearIndex, timeIndex, null, null]);
    } else {
      // Single-year format
      result = await zarr.get(arr, [timeIndex, null, null]);

      // Cache coordinates if not already
      const coordKey = `${datasetKey}-${level}-coords`;
      if (!dataCache.has(coordKey)) {
        const xArr = await zarr.open(root.resolve('x'), { kind: 'array' });
        const yArr = await zarr.open(root.resolve('y'), { kind: 'array' });
        const xResult = await zarr.get(xArr);
        const yResult = await zarr.get(yArr);
        dataCache.set(coordKey, {
          x: Array.from(xResult.data),
          y: Array.from(yResult.data),
          shape: arr.shape,
        });
      }
    }

    return result.data;
  });
}

/**
 * Progressive loading - load coarse first, then refine
 */
export async function loadProgressive(config, targetLevel, timeIndex, onProgress) {
  // Start with coarsest level
  const startLevel = 0;

  for (let level = startLevel; level <= targetLevel; level++) {
    const result = await loadZarrSlice(config, level, timeIndex);

    // Report progress
    if (onProgress) {
      onProgress({
        level,
        targetLevel,
        data: result,
        isFinal: level === targetLevel,
        progress: (level + 1) / (targetLevel + 1),
      });
    }

    // If this is the final level, we're done
    if (level === targetLevel) {
      return result;
    }
  }
}

/**
 * Preload all LOD levels for a time slice (useful during idle time)
 */
export async function preloadAllLevels(config, timeIndex, maxLevel) {
  const tasks = [];

  for (let level = 0; level <= maxLevel; level++) {
    const cacheKey = `${config.path}-${level}-${timeIndex}`;
    if (!dataCache.has(cacheKey)) {
      tasks.push({ level, cacheKey });
    }
  }

  // Load from coarse to fine
  for (const task of tasks) {
    try {
      await loadZarrSlice(config, task.level, timeIndex);
      console.log(`[PRELOAD] Loaded level ${task.level} for time ${timeIndex}`);
    } catch (err) {
      console.warn(`[PRELOAD] Failed level ${task.level}:`, err.message);
    }
  }
}

/**
 * Warm up cache on app start
 */
export function warmupCache(datasets, initialTime = 0) {
  console.log('[WARMUP] Starting cache warmup...');

  const warmupTasks = [];

  for (const [key, config] of Object.entries(datasets)) {
    // Load level 0 for initial time (fast initial load)
    warmupTasks.push({
      config,
      level: 0,
      time: initialTime,
      priority: 0,
    });

    // Preload adjacent times at level 0
    for (let delta = 1; delta <= 2; delta++) {
      warmupTasks.push({
        config,
        level: 0,
        time: (initialTime + delta) % 12,
        priority: delta,
      });
    }
  }

  // Sort by priority
  warmupTasks.sort((a, b) => a.priority - b.priority);

  // Execute in background
  const executeWarmup = async (index = 0) => {
    if (index >= warmupTasks.length) {
      console.log('[WARMUP] Cache warmup complete');
      return;
    }

    const task = warmupTasks[index];
    try {
      await loadZarrSlice(task.config, task.level, task.time);
    } catch (err) {
      // Ignore warmup errors
    }

    // Small delay between requests
    setTimeout(() => executeWarmup(index + 1), 50);
  };

  // Start warmup after initial render
  setTimeout(() => executeWarmup(), 1000);
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    dataCache: dataCache.size,
    imageCache: imageCache.size,
    metadataCache: metadataCache.size,
    pendingRequests: pendingRequests.size,
  };
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
  dataCache.clear();
  imageCache.clear();
  metadataCache.clear();
  console.log('[CACHE] All caches cleared');
}

/**
 * Estimate memory usage (rough approximation)
 */
export function estimateMemoryUsage() {
  let totalBytes = 0;

  // Data cache (estimate based on typical slice sizes)
  // Each slice is roughly height * width * 4 bytes
  totalBytes += dataCache.size * 1024 * 1024; // ~1MB per cached slice

  // Image cache (base64 strings are roughly 1.33x raw size)
  totalBytes += imageCache.size * 1024 * 1024 * 1.33;

  return {
    bytes: totalBytes,
    megabytes: (totalBytes / (1024 * 1024)).toFixed(2),
  };
}
