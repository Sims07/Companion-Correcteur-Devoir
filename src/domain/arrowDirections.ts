// Coordinates refer to the raster, with y increasing downwards.
const orientations = [
  { direction: 'droite', dx: 1, dy: 0 }, { direction: 'gauche', dx: -1, dy: 0 },
  { direction: 'bas', dx: 0, dy: 1 }, { direction: 'haut', dx: 0, dy: -1 },
] as const;

export interface DetectedArrow {
  x: number;
  y: number;
  direction: typeof orientations[number]['direction'];
}

// Sample the width across a thin leader. A few gaps or intersections are
// normal in pencil drawings, but both a broadened head and a long shaft
// must be visible before we supply a direction.
function hasPencilHead(ink: Uint8Array, tip: number, stride: number, cross: number): boolean {
  function span(back: number, radius: number) {
    const center = tip - back * stride;
    let left = radius + 1, right = -radius - 1;
    for (let side = -radius; side <= radius; side++) {
      if (ink[center + side * cross]) {
        left = Math.min(left, side);
        right = side;
      }
    }
    return { left, right, width: Math.max(0, right - left + 1) };
  }
  const clearAhead = [4, 7, 10].filter(distance => {
    const center = tip + distance * stride;
    return !ink[center] && !ink[center - cross] && !ink[center + cross];
  }).length;
  if (clearAhead < 2 || span(0, 5).width > 4 || span(2, 6).width < 2) return false;
  let wideRows = 0;
  for (let back = 3; back <= 9; back++) {
    const row = span(back, 8);
    if (row.left <= -2 && row.right >= 2 && row.width >= 6 && row.width <= 14 && ink[tip - back * stride]) wideRows++;
  }
  if (wideRows < 3) return false;
  const hasNeck = [9, 10, 11, 12, 13].some(back => {
    const { width } = span(back, 6);
    return width >= 1 && width <= 3;
  });
  if (!hasNeck) return false;
  let narrowRows = 0;
  for (let back = 14; back <= 54; back += 4) {
    const row = span(back, 8);
    if (row.width >= 1 && row.width <= 4 && Math.abs(row.left + row.right) <= 2 + back * 0.22) narrowRows++;
  }
  return narrowRows >= 10;
}

/** Look for a widening filled head followed by a thinner, continuous shaft.
 * Sample both ink and surrounding paper to reject corners, glyphs and crossings.
 * The input is a bounded analysis raster, independent of labels or rubric. */
export function detectArrowDirections({ width, height, data }: Pick<ImageData, 'width' | 'height' | 'data'>): DetectedArrow[] {
  const ink = new Uint8Array(width * height);
  const pencil = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i++) {
    const p = i * 4;
    const luminance = (data[p] * 3 + data[p + 1] * 6 + data[p + 2]) / 10;
    pencil[i] = (255 - luminance) * data[p + 3] / 255 > 42 ? 1 : 0;
    ink[i] = (255 - luminance) * data[p + 3] / 255 > 92 ? 1 : 0;
  }
  const candidates: (DetectedArrow & { size: number })[] = [];
  for (const { direction, dx, dy } of orientations) {
    const stride = dx + dy * width;
    const cross = -dy + dx * width;
    for (let y = 3; y < height - 3; y++) {
      for (let x = 3; x < width - 3; x++) {
        const tip = y * width + x;
        if (pencil[tip] && !pencil[tip + stride] &&
            x >= 10 && x < width - 10 && y >= 10 && y < height - 10 &&
            x - dx * 54 >= 10 && x - dx * 54 < width - 10 &&
            y - dy * 54 >= 10 && y - dy * 54 < height - 10 &&
            hasPencilHead(pencil, tip, stride, cross)) {
          candidates.push({ x, y, direction, size: 10 });
        }
        if (!ink[tip] || ink[tip + 3 * cross] || ink[tip - 3 * cross]) continue;
        for (const size of [32, 24, 18, 14, 10, 8]) {
          const reach = size * 2;
          const tailX = x - dx * reach;
          const tailY = y - dy * reach;
          const margin = Math.ceil(size * 0.7);
          if (tailX < 0 || tailX >= width || tailY < 0 || tailY >= height ||
              (dx ? y < margin || y >= height - margin : x < margin || x >= width - margin)) continue;
          const sample = (back: number, side: number) =>
            ink[tip - Math.round(back * size) * stride + Math.round(side * size) * cross];
          if (![0.25, 0.5, 0.8, 1.1, 1.4, 1.7, 2].every(back => sample(back, 0))) continue;
          const matchesSide = (sign: number) =>
            sample(0.5, sign * 0.13) && sample(0.65, sign * 0.22) && sample(0.8, sign * 0.28) &&
            !sample(0.25, sign * 0.31) && !sample(0.8, sign * 0.66) &&
            !sample(1.3, sign * 0.28) && !sample(1.7, sign * 0.28);
          if (!matchesSide(-1) || !matchesSide(1)) continue;
          // A chromosome or a thin leader can hit isolated sample points.
          // Require ink throughout the interior of the proposed triangle.
          let filled = 0;
          let sampled = 0;
          for (let back = 2; back <= size * 0.85; back += 2) {
            const radius = Math.floor(back * 0.32);
            for (let side = -radius; side <= radius; side++) {
              filled += ink[tip - back * stride + side * cross];
              sampled++;
            }
          }
          // Small dark marks in handwriting can mimic a wedge on a short
          // stroke. Require its shaft to continue for another two head lengths.
          const extension = tip - size * 4 * stride;
          const extendedShaft = size > 10 || (
            [3, 5, 7].some(distance => !ink[tip + distance * stride]) &&
            x - dx * size * 4 >= 0 && x - dx * size * 4 < width &&
            y - dy * size * 4 >= 0 && y - dy * size * 4 < height &&
            [extension, tip - size * 3 * stride].every(center =>
              [-1, 0, 1].some(side => pencil[center + side * cross])));
          if (extendedShaft && filled >= sampled * 0.93) {
            candidates.push({ x, y, direction, size });
            break;
          }
        }
      }
    }
  }
  const distinct: typeof candidates = [];
  for (const candidate of candidates.sort((a, b) => b.size - a.size)) {
    if (!distinct.some(other => other.direction === candidate.direction &&
      Math.hypot(other.x - candidate.x, other.y - candidate.y) < candidate.size)) distinct.push(candidate);
  }
  return distinct.map(({ x, y, direction }) => ({ x, y, direction }));
}
