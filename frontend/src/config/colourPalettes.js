/**
 * Colour Palettes - Including colour-blind safe options
 */

export const palettes = {
  default: {
    name: 'Default',
    colors: [
      [49, 54, 149], [69, 117, 180], [116, 173, 209], [171, 217, 233],
      [255, 255, 191], [254, 224, 144], [253, 174, 97], [244, 109, 67],
      [215, 48, 39], [165, 0, 38]
    ],
    description: 'Blue to red diverging',
  },
  viridis: {
    name: 'Viridis',
    colors: [
      [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142],
      [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89],
      [180, 222, 44], [253, 231, 37]
    ],
    description: 'Colour-blind safe (perceptually uniform)',
    colourBlindSafe: true,
  },
  cividis: {
    name: 'Cividis',
    colors: [
      [0, 34, 78], [18, 53, 112], [58, 76, 109], [87, 93, 109],
      [117, 112, 112], [147, 133, 109], [177, 155, 101], [206, 180, 88],
      [234, 208, 70], [254, 232, 56]
    ],
    description: 'Colour-blind safe (optimized for deuteranopia)',
    colourBlindSafe: true,
  },
  plasma: {
    name: 'Plasma',
    colors: [
      [13, 8, 135], [75, 3, 161], [125, 3, 168], [168, 34, 150],
      [203, 70, 121], [229, 107, 93], [248, 148, 65], [253, 195, 40],
      [240, 249, 33]
    ],
    description: 'Colour-blind safe (perceptually uniform)',
    colourBlindSafe: true,
  },
};

// Get palette by key
export function getPalette(key) {
  return palettes[key] || palettes.viridis;
}

// Get list of available palettes
export function getPaletteOptions() {
  return Object.entries(palettes).map(([key, palette]) => ({
    value: key,
    label: palette.name + (palette.colourBlindSafe ? ' (colour-blind safe)' : ''),
    description: palette.description,
  }));
}

export default palettes;
