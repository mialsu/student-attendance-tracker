/**
 * Whether every bar on *Tilastot* can carry its count: spec 0010 decisions 3 and 4.
 *
 * 20px per bar: a two-digit count in the chart's 12px text, with a date slanted at -45° under it,
 * needs about that before neighbours collide. Confirmed on 2026-10-01 from element screenshots at
 * 320, 390 and 1280px at each width's limit (7, 11 and 41 bars), where nothing collided; below it
 * the slanted dates start to touch.
 */
export const MIN_PX_PER_BAR = 20;

/**
 * True when `barCount` bars each get at least `MIN_PX_PER_BAR` of `plotWidth`. A width of 0 or
 * less never fits, empty chart included: an unmeasured chart reports 0, and the page subtracts its
 * margins and Y axis from that, so before it measures it asks about a negative plot width.
 */
export function countsFit(barCount: number, plotWidth: number): boolean {
  return plotWidth > 0 && barCount * MIN_PX_PER_BAR <= plotWidth;
}
