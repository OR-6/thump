/** What the address and the room's reach say: debug and test switches, strike tuning for device sessions. */
import { STRIKE } from '../config.js';

export const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
/** `?debug=1`: a board behind the module (fps, planes, the last hit's surface and how it was measured). */
export const DEBUG = params.get('debug') === '1';
/** `?autoplay=1`: a player that discovers your surfaces and hits every note on time (tests and filming only). */
export const AUTOPLAY = params.get('autoplay') === '1';
/** `?desk=<y>`: a fixed table height (E2E, filming). */
export const FIXED_DESK = params.get('desk');
/** Surfaces within this of the head are played (stand up and walk to the far ones). */
export const ACTIVE_M = 3;
/** Swaps: a pinch this close to a found instrument (and held) changes it. */
export const SWAP_NEAR_M = 0.06;
/** Surfaces within this of a seated player's head carry a sheen and count in the room map. */
export const SEATED_M = 1.1;
/** A hand this close to a surface (along its normal) is tested against it. */
export const NEAR_MIN = -0.12;
export const NEAR_MAX = 0.6;

/** Strike tuning from the address (device sessions): ?speed=0.3 &near=20 (mm) &decel=10 &latch=100 (ms) &rearm=18 (mm). */
function strikeOverrides(): Partial<Record<keyof typeof STRIKE, number>> {
  const o: Partial<Record<keyof typeof STRIKE, number>> = {};
  const num = (k: string) => {
    const v = params.get(k);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const sp = num('speed');
  if (sp !== null) o.minSpeed = sp;
  const near = num('near');
  if (near !== null) o.nearM = near / 1000;
  const dc = num('decel');
  if (dc !== null) o.minDecel = dc;
  const la = num('latch');
  if (la !== null) o.latchS = la / 1000;
  const re = num('rearm');
  if (re !== null) o.rearmM = re / 1000;
  return o;
}
export const STRIKE_CFG = strikeOverrides();
