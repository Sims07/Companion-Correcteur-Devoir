export type TeacherAnnotationInkColor = 'none' | 'red' | 'green' | 'blue' | 'purple';

export const TEACHER_ANNOTATION_INK_COLORS: Array<{ value: TeacherAnnotationInkColor; label: string }> = [
  { value: 'none', label: 'Aucune couleur' },
  { value: 'red', label: 'Rouge' },
  { value: 'green', label: 'Vert' },
  { value: 'blue', label: 'Bleu' },
  { value: 'purple', label: 'Violet' },
];

const targetHue: Record<Exclude<TeacherAnnotationInkColor, 'none'>, number> = { red: 0, green: 120, blue: 220, purple: 285 };
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

/** Replace saturated pixels matching the professor's selected ink with the sampled paper tone. */
export function eraseTeacherInkPixels(pixels: Uint8ClampedArray, paper: readonly [number, number, number], color: Exclude<TeacherAnnotationInkColor, 'none'>): Uint8ClampedArray {
  const result = new Uint8ClampedArray(pixels);
  for (let index = 0; index < result.length; index += 4) {
    const red = result[index] / 255, green = result[index + 1] / 255, blue = result[index + 2] / 255;
    const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue), delta = maximum - minimum;
    const saturation = maximum === 0 ? 0 : delta / maximum;
    if (saturation < 0.22 || maximum < 0.22) continue;
    let hue = 0;
    if (delta > 0) {
      if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
      else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
      else hue = 60 * ((red - green) / delta + 4);
    }
    if (hue < 0) hue += 360;
    if (hueDistance(hue, targetHue[color]) > 28) continue;
    result[index] = paper[0]; result[index + 1] = paper[1]; result[index + 2] = paper[2]; result[index + 3] = 255;
  }
  return result;
}
