import { describe, expect, it } from 'vitest';
import { loadSettings, saveSettings } from '../src/persistence/settings.js';

describe('settings', () => {
  it('keep what was set on the way back in (the guitar held at the desk or moved in your lap, the timing guessed)', () => {
    const s = loadSettings();
    saveSettings({ ...s, guitarDesk: true, guitarAt: { x: 0.05, y: -0.1, z: 0.3 }, offsetSeeded: true, offset: 0.05 });
    const back = loadSettings();
    expect(back.guitarDesk).toBe(true);
    expect(back.guitarAt).toEqual({ x: 0.05, y: -0.1, z: 0.3 });
    expect(back.offsetSeeded).toBe(true);
    expect(back.offset).toBeCloseTo(0.05);
  });
  it('drop what is broken (a guitar placed at nonsense, a flag that is not a flag)', () => {
    const s = loadSettings();
    saveSettings({ ...s, guitarDesk: 'yes' as unknown as boolean, guitarAt: { x: Number.NaN, y: 0, z: 0 }, offsetSeeded: 1 as unknown as boolean });
    const back = loadSettings();
    expect(back.guitarDesk).toBeUndefined();
    expect(back.guitarAt).toBeUndefined();
    expect(back.offsetSeeded).toBeUndefined();
  });
});
