/**
 * Spec 0010 AC-2: whether every bar on *Tilastot* can carry its count.
 *
 * The rule is all-or-nothing (decision 3), so this function is the whole decision: yes means every
 * bar is numbered and every date tick shown, no means none is and the hint renders instead. The
 * browser walk proves the page calls it with a real width; this file proves the arithmetic, which
 * jsdom could never reach, since Recharts measures 0x0 there.
 */
import { describe, it, expect } from 'vitest';
import { countsFit, MIN_PX_PER_BAR } from '../barLabels';

describe('countsFit', () => {
  it('fits when every bar gets exactly the minimum width', () => {
    expect(countsFit(10, 10 * MIN_PX_PER_BAR)).toBe(true);
  });

  it('does not fit one pixel short of that', () => {
    expect(countsFit(10, 10 * MIN_PX_PER_BAR - 1)).toBe(false);
  });

  it('fits a single bar in any plot wide enough for it', () => {
    expect(countsFit(1, MIN_PX_PER_BAR)).toBe(true);
  });

  // Decision 5: until the chart has been measured, neither numbers nor hint may render. jsdom and
  // a first frame both report 0, so 0 must never read as "fits".
  it('does not fit an unmeasured width of 0, however few the bars', () => {
    expect(countsFit(1, 0)).toBe(false);
    // AC-2's own words: no for an unmeasured width of 0, with no bars as with some.
    expect(countsFit(0, 0)).toBe(false);
  });

  // What the page actually passes before it has measured: the container's 0 less the chart's
  // margins and Y axis.
  it('does not fit the negative plot width an unmeasured chart leaves', () => {
    expect(countsFit(4, -70)).toBe(false);
  });
});
