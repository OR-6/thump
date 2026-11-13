/** The desk snare: a 9 cm drum, white coated head, black lacquer shell (see lib/drums.ts). */
import { buildDrum } from './lib/drums.js';

export const snare = buildDrum(0.09, { shell: 0x1d1c20 });
export default snare;
