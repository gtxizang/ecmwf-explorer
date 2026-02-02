/**
 * Feature Flags - Toggle experimental features
 * All stored in localStorage for persistence
 */

const STORAGE_KEY = 'ecv-feature-flags';

// Default values
// Note: Globe is OFF by default due to deck.gl rendering artifacts at the antimeridian
const defaults = {
  enableGlobe: false,  // Experimental - has visual artifacts
  enableComputation: true,
  enableAccessibility: true,
};

// Load from localStorage or use defaults
function loadFlags() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaults, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('[FeatureFlags] Failed to load from localStorage:', e);
  }
  return { ...defaults };
}

// Save to localStorage
function saveFlags(flags) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch (e) {
    console.warn('[FeatureFlags] Failed to save to localStorage:', e);
  }
}

// Initial load
export let featureFlags = loadFlags();

// Update a single flag
export function setFeatureFlag(key, value) {
  featureFlags = { ...featureFlags, [key]: value };
  saveFlags(featureFlags);
  return featureFlags;
}

// Reset to defaults
export function resetFeatureFlags() {
  featureFlags = { ...defaults };
  saveFlags(featureFlags);
  return featureFlags;
}

// Get current flags
export function getFeatureFlags() {
  return { ...featureFlags };
}

export default featureFlags;
