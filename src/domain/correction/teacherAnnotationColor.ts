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

/** Replace pixels matching the sampled ink hue (or grayscale tone) with the sampled paper tone. */
export function eraseTeacherInkPixels(pixels: Uint8ClampedArray, paper: Rgb, color: Exclude<TeacherAnnotationInkColor, 'none'>): Uint8ClampedArray {
  const result = new Uint8ClampedArray(pixels);
  const target = toHsv(parseRgb(color));
  for (let index = 0; index < result.length; index += 4) {
    const pixel: Rgb = [result[index], result[index + 1], result[index + 2]];
    const candidate = toHsv(pixel);
    const matches = target.saturation < 0.14
      ? candidate.saturation < 0.16 && Math.abs(candidate.value - target.value) <= 0.24
      : candidate.saturation >= Math.max(0.16, target.saturation * 0.5) && hueDistance(candidate.hue, target.hue) <= 24;
    if (!matches) continue;
    result[index] = paper[0]; result[index + 1] = paper[1]; result[index + 2] = paper[2]; result[index + 3] = 255;
  }
  return result;
}
