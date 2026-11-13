/** Secondary, deliberately conservative detector for tiny handwritten leader heads.
 * It complements the filled-triangle detector, never infers a direction from
 * the handwriting or the scientific meaning of a diagram.
 *
 * A leader must have a long, nearly straight, narrow stroke; its terminal
 * region must broaden on both sides (often an open V). Tips touching other
 * strokes are reported as tentative rather than discarded.
 */
export interface CompactLeaderTip {
  x: number;
  y: number;
  direction: 'gauche' | 'droite';
  tentative: boolean;
  score: number;
}

export function detectCompactLeaderTips(pencil: Uint8Array, width: number, height: number): CompactLeaderTip[] {
  const result: CompactLeaderTip[] = [];
  if (width < 110 || height < 25) return result;
  const slopes = [0, -0.04, 0.04, -0.08, 0.08, -0.12, 0.12];

  // A direction of -1 means the arrow tip points left; the shaft goes right.
  for (const dx of [-1, 1] as const) {
    for (let y = 16; y < height - 16; y++) {
      for (let x = 103; x < width - 103; x++) {
        if (!pencil[y * width + x]) continue;
        const shaftX = -dx;

        // Cheap, gap-tolerant prefilter. Hand-drawn leaders are not perfectly
        // horizontal, so search a short vertical band at three distances.
        const nearShaft = (back: number, radius: number) => {
          const xx = x + shaftX * back;
          for (let yy = y - radius; yy <= y + radius; yy++) {
            if (pencil[yy * width + xx]) return true;
          }
          return false;
        };
        if (!nearShaft(24, 4) || !nearShaft(52, 8) || !nearShaft(80, 12)) continue;

        // Compare the locally widened head with a much thinner tail.
        // A single crossing at the end of a headless leader is insufficient.
        let best: CompactLeaderTip | undefined;
        for (const slope of slopes) {
          const at = (back: number, side: number) =>
            pencil[(y + Math.round(back * slope) + side) * width + x + shaftX * back];
          const centered = (back: number) =>
            at(back, -1) || at(back, 0) || at(back, 1);
          let first = 0, second = 0, tailWide = 0;
          for (let back = 16; back <= 96; back += 4) {
            const hit = centered(back);
            if (back <= 52) first += Number(Boolean(hit));
            else second += Number(Boolean(hit));
            if (back >= 24 && back <= 72 && back % 8 === 0 &&
                (at(back, -4) || at(back, 4))) tailWide++;
          }
          if (first < 7 || second < 6 || first + second < 15 || tailWide > 3) continue;
          let left = 0, right = 0, core = 0;
          for (let back = 2; back <= 11; back++) {
            core += Number(Boolean(centered(back)));
            left += Number(Boolean(at(back, -2) || at(back, -3) || at(back, -4)));
            right += Number(Boolean(at(back, 2) || at(back, 3) || at(back, 4)));
          }
          // A blunt rectangular collision is not a tapered arrowhead.
          if (at(1, -3) || at(1, 3) || at(2, -3) || at(2, 3)) continue;
          if (core < 6 || left < 3 || right < 3) continue;

          let clearAhead = 0;
          for (const ahead of [4, 7, 10]) {
            const xx = x + dx * ahead;
            if (!pencil[(y - 1) * width + xx] && !pencil[y * width + xx] &&
                !pencil[(y + 1) * width + xx]) clearAhead++;
          }
          // A line running *through* the alleged tip is not an arrow,
          // even if a crossing produces a convincing small V. Unlike a
          // short intersecting contour, a continuing leader stays thin
          // and connected for several centimetres in raster space.
          const continuingStroke = slopes.some(aheadSlope => {
            let hits = 0;
            for (let ahead = 8; ahead <= 32; ahead += 2) {
              const xx = x + dx * ahead;
              const yy = y + Math.round(aheadSlope * ahead);
              if (pencil[yy * width + xx] ||
                  pencil[(yy - 1) * width + xx] ||
                  pencil[(yy + 1) * width + xx]) hits++;
            }
            return hits >= 11;
          });
          if (continuingStroke) continue;
          // An intersection with another short stroke may hide the open
          // space in front of the tip. Keep that case as a possible arrow,
          // never as a certain head.
          const tentative = clearAhead < 2;
          if (tentative && (left < 5 || right < 5 || first + second < 17)) continue;
          const score = first + second + Math.min(left, right) + clearAhead * 2;
          if (!best || score > best.score) best = {
            x, y, direction: dx === -1 ? 'gauche' : 'droite', tentative, score,
          };
        }
        if (best) result.push(best);
      }
    }
  }

  // Non-maximum suppression: otherwise every dark pixel of a tiny wedge
  // produces its own circle. Prefer clear tips to tentative intersections.
  const distinct: CompactLeaderTip[] = [];
  for (const candidate of result.sort((a, b) =>
    Number(a.tentative) - Number(b.tentative) || b.score - a.score)) {
    if (!distinct.some(other => other.direction === candidate.direction &&
      Math.hypot(other.x - candidate.x, other.y - candidate.y) < 19)) {
      distinct.push(candidate);
    }
  }
  return distinct;
}
