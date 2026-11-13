import { describe, expect, it } from 'vitest';
import { Vector3 } from '@iwsdk/core';
import { HandMallet, MALLET_LEN } from '../src/room/hand-mallet.js';

describe('a mallet in your hand', () => {
  it('its head is ten centimetres on from the pinch, forward and a little down', () => {
    const tip = HandMallet.tip(new Vector3(0, 1, 0), new Vector3(0, 1, -0.05), new Vector3(0, 1, 0.03), new Vector3());
    expect(tip.distanceTo(new Vector3(0, 1, 0))).toBeCloseTo(MALLET_LEN, 5);
    expect(tip.z).toBeLessThan(-0.08);
    expect(tip.y).toBeLessThan(1);
  });
});
