/**
 * The felt-and-wood look (PLAN §3.13): cream paper, tomato, mustard, teal, navy and plum felt;
 * Lilita One for display. High contrast turns tags black on white and pads black-on-cream (each
 * pad still told apart by its shape).
 */
export interface Theme {
  hc: boolean;
  /** CSS font-family list for in-world text. */
  font: string;
  paper: string;
  ink: string;
}

export const FELT_THEME: Theme = {
  hc: false,
  font: "'Lilita One', system-ui, -apple-system, sans-serif",
  paper: '#fff6e8',
  ink: '#2b2118',
};

export const HC_THEME: Theme = { ...FELT_THEME, hc: true, paper: '#ffffff', ink: '#000000' };

export const THEMES = { toy: FELT_THEME };

export function themeFor(highContrast: boolean): Theme {
  return highContrast ? HC_THEME : FELT_THEME;
}
