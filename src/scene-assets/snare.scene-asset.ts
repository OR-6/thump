/** The desk snare: a 13 cm drum, coated head, dark lacquer shell, a throw-off (see lib/drums.ts). */
import { buildDrum } from './lib/drums.js';

export const snare = buildDrum(0.13, { shell: 0x2a2a30, throwOff: true });
export default snare;
