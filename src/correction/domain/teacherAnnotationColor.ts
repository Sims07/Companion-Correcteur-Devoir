export type TeacherAnnotationInkColor = 'none' | 'red' | 'green' | 'blue' | 'purple' | `#${string}`;

export const TEACHER_ANNOTATION_INK_COLORS: Array<{ value: TeacherAnnotationInkColor; label: string }> = [
  { value: 'none', label: 'Aucune couleur' },
  { value: 'red', label: 'Rouge' },
  { value: 'green', label: 'Vert' },
  { value: 'blue', label: 'Bleu' },
  { value: 'purple', label: 'Violet' },
];

type Rgb = readonly [number, number, number];
type Hsv = { hue: number; saturation: number; value: number };

const namedColors: Record<'red' | 'green' | 'blue' | 'purple', Rgb> = {
  red: [255, 0, 0],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  purple: [160, 32, 240],
};

function parseRgb(color: Exclude<TeacherAnnotationInkColor, 'none'>): Rgb {
  if (color in namedColors) return namedColors[color as keyof typeof namedColors];
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) throw new Error('La couleur sélectionnée doit être au format hexadécimal #RRGGBB.');
  const value = match[1];
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)];
}

function toHsv([red, green, blue]: Rgb): Hsv {
  const r = red / 255, g = green / 255, b = blue / 255;
  const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b), delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === r) hue = 60 * (((g - b) / delta) % 6);
    else if (maximum === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: maximum === 0 ? 0 : delta / maximum, value: maximum };
}

function hueDistance(left: number, right: number): number {
  const distance = Math.abs(left - right) % 360;
  return Math.min(distance, 360 - distance);
}

/** Robustly sample the paper tone from corner patches, ignoring dark handwriting and colored marks. */
export function sampleTeacherPaperColor(pixels: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) return [255, 255, 255];
  const patchWidth = Math.max(2, Math.ceil(width * 0.025));
  const patchHeight = Math.max(2, Math.ceil(height * 0.025));
  const samples: Array<[number, number, number, number]> = [];
  for (const [startX, startY] of [[0, 0], [width - patchWidth, 0], [0, height - patchHeight], [width - patchWidth, height - patchHeight]]) {
    for (let y = Math.max(0, startY); y < Math.min(height, startY + patchHeight); y += 1) {
      for (let x = Math.max(0, startX); x < Math.min(width, startX + patchWidth); x += 1) {
        const offset = (y * width + x) * 4;
        const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2];
        const brightness = (Math.max(red, green, blue) + Math.min(red, green, blue)) / 2;
        const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
        samples.push([red, green, blue, brightness >= 150 && saturation <= 90 ? 1 : 0]);
      }
    }
  }
  let candidates = samples.filter((sample) => sample[3] === 1);
  if (candidates.length === 0) candidates = [...samples].sort((left, right) => (right[0] + right[1] + right[2]) - (left[0] + left[1] + left[2])).slice(0, Math.max(1, Math.ceil(samples.length * 0.25)));
  const median = (values: number[]) => {
    values.sort((left, right) => left - right);
    return values[Math.floor(values.length / 2)] ?? 255;
  };
  return [0, 1, 2].map((channel) => median(candidates.map((sample) => sample[channel]))) as [number, number, number];
}

/**
 * Remove a selected teacher ink color, including its low-saturation scanner/JPEG
 * fringes. Compare chroma relative to the sampled paper, rather than requiring
 * the original vivid ink saturation: pale orange/red edges can be almost white.
 *
 * Weak fringes are removed only next to confidently colored ink. Neutral
 * graphite and unrelated paper texture stay unchanged; the source is immutable.
 * Dimensions are optional for existing pixel-only callers, but the image adapter
 * passes them to enable the bounded (2 px) fringe cleanup.
 */
export function eraseTeacherInkPixels(
  pixels: Uint8ClampedArray,
  paper: Rgb,
  color: Exclude<TeacherAnnotationInkColor, 'none'>,
  width?: number,
  height?: number,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(pixels);
  const selected = parseRgb(color);
  const target = toHsv(selected);
  // A pale sampled pink is still colored ink, not a grayscale annotation.
  const neutralTarget = Math.max(...selected) - Math.min(...selected) <= 2;
  const pixelCount = Math.floor(pixels.length / 4);
  const solid = new Uint8Array(pixelCount);
  const fringe = new Uint8Array(pixelCount);
  const minimumDarkInkBrightness = Math.max(...paper) * 0.60;

  for (let position = 0; position < pixelCount; position += 1) {
    const offset = position * 4;
    const pixel: Rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    const candidate = toHsv(pixel);
    if (neutralTarget) {
      // Preserve the existing explicit neutral-ink behavior.
      if (candidate.saturation < 0.16 && Math.abs(candidate.value - target.value) <= 0.24) solid[position] = 1;
      continue;
    }

    // Remove the intrinsic cast of warm or slightly tinted paper.
    const relativeRed = pixel[0] - paper[0];
    const relativeGreen = pixel[1] - paper[1];
    const relativeBlue = pixel[2] - paper[2];
    const minimum = Math.min(relativeRed, relativeGreen, relativeBlue);
    const maximum = Math.max(relativeRed, relativeGreen, relativeBlue);
    const relativeChroma = maximum - minimum;
    if (relativeChroma < 3) continue;
    const relativeHue = toHsv([
      relativeRed - minimum,
      relativeGreen - minimum,
      relativeBlue - minimum,
    ]).hue;
    // Scanned red handwriting may shift towards orange as its opacity fades.
    if (hueDistance(relativeHue, target.hue) > 40) continue;
    // Very dark, nearly neutral student pencil must not be erased.
    if (Math.max(...pixel) < minimumDarkInkBrightness && candidate.saturation < 0.25) continue;

    if (relativeChroma >= 8 || (relativeChroma >= 5 && candidate.saturation >= 0.16)) {
      solid[position] = 1;
    } else {
      // Faint antialiasing is only erased where anchored to actual colored ink.
      fringe[position] = 1;
    }
  }

  const erased = new Uint8Array(solid);
  if (width && height && Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width * height === pixelCount && !neutralTarget) {
    for (let position = 0; position < pixelCount; position += 1) {
      if (!solid[position]) continue;
      const x = position % width;
      const y = Math.floor(position / width);
      for (let dy = -2; dy <= 2; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -2; dx <= 2; dx += 1) {
          if (dx * dx + dy * dy > 8) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbor = ny * width + nx;
          if (fringe[neighbor]) erased[neighbor] = 1;
        }
      }
    }
  }

  for (let position = 0; position < pixelCount; position += 1) {
    if (!erased[position]) continue;
    const offset = position * 4;
    result[offset] = paper[0];
    result[offset + 1] = paper[1];
    result[offset + 2] = paper[2];
    result[offset + 3] = 255;
  }
  return result;
}
