/**
 * Whether every bar on *Tilastot* can carry its count: spec 0010 decisions 3 and 4.
 *
 * About 20px per bar: a two-digit count in the chart's 12px text, with a date slanted at -45°
 * under it, needs roughly that before neighbours collide. It is a default, tuned from element
 * screenshots at 320, 390 and 1280px (the spec's open question 2), and the verification records
 * any move.
 */
export const MIN_PX_PER_BAR = 20;

/**
 * True when `barCount` bars each get at least `MIN_PX_PER_BAR` of `plotWidth`. The width an
 * unmeasured chart reports, 0, fits no bar at all; a chart with no bars is never drawn, because
 * the empty states own the surface, so that case needs no guard of its own.
 */
export function countsFit(barCount: number, plotWidth: number): boolean {
  return barCount * MIN_PX_PER_BAR <= plotWidth;
}
