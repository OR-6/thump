import { describe, expect, it } from 'vitest';
import { classify, nextSwap, swapsFor, type Features } from '../src/room/classify.js';
import { Surface } from '../src/room/surface.js';
import { degreeMidi, rootNear, zoneAt, zonesFor, retune, zoneForDegree } from '../src/room/zones.js';

const base: Features = { facing: 'vertical', width: 1, length: 1, area: 1, elevation: 1, hollow: 0, glass: 0, soft: 0, curved: 0, bump: false, label: '' };
const f = (o: Partial<Features>): Features => {
  const x = { ...base, ...o };
  if (o.area === undefined) x.area = x.width * x.length;
  return x;
};

describe('physics → instrument', () => {
  it('the kit table is the kit', () => expect(classify(f({ facing: 'up', width: 1.2, length: 0.6, elevation: 0.75 }), true)?.family).toBe('kit'));
  it('a large solid wall is a gong, a bigger one lower', () => {
    const small = classify(f({ width: 1.2, length: 1.2 }))!;
    const big = classify(f({ width: 4, length: 2.5 }))!;
    expect(small.family).toBe('gong');
    expect(big.family).toBe('gong');
    expect(big.size).toBeGreaterThan(small.size);
  });
  it('a hollow door-sized face is a marimba', () => expect(classify(f({ width: 0.85, length: 2.0, hollow: 0.9 }))?.family).toBe('marimba'));
  it('a door frame label hints hollow when geometry cannot tell', () => expect(classify(f({ width: 0.85, length: 2.0, label: 'door frame' }))?.family).toBe('marimba'));
  it('a hollow box front is a tongue drum', () => expect(classify(f({ width: 0.6, length: 0.7, hollow: 0.8 }))?.family).toBe('tongue'));
  it('storage (a cupboard) is a tongue drum', () => expect(classify(f({ width: 0.8, length: 0.9, label: 'storage' }))?.family).toBe('tongue'));
  it('glass is a glockenspiel', () => expect(classify(f({ width: 1.2, length: 1.1, label: 'window frame' }))?.family).toBe('glock'));
  it('soft is a shaker, whatever its shape', () => {
    expect(classify(f({ facing: 'up', width: 1.8, length: 0.8, elevation: 0.45, label: 'couch' }))?.family).toBe('shaker');
    expect(classify(f({ width: 1, length: 1, soft: 0.8 }))?.family).toBe('shaker');
  });
  it('the floor is a stomp', () => expect(classify(f({ facing: 'up', width: 3, length: 3, elevation: 0 }))?.family).toBe('stomp'));
  it('a ceiling is not an instrument', () => expect(classify(f({ facing: 'down', elevation: 2.5 }))).toBeNull());
  it('bumps on the table: a mug is a bell, a book a block, a bowl a bowl', () => {
    expect(classify(f({ facing: 'up', bump: true, width: 0.08, length: 0.1, area: 0.006, elevation: 0.8 }))?.family).toBe('bell');
    expect(classify(f({ facing: 'up', bump: true, width: 0.2, length: 0.04, area: 0.03, elevation: 0.8 }))?.family).toBe('block');
    expect(classify(f({ facing: 'up', bump: true, width: 0.2, length: 0.08, area: 0.03, curved: 0.8, elevation: 0.8 }))?.family).toBe('bowl');
  });
  it('a measurement beats a label: a "couch" the hand does not sink into... still soft by hint (labels only raise)', () => {
    expect(classify(f({ width: 0.85, length: 2.0, hollow: 0.9, label: 'wall' }))?.family).toBe('marimba');
  });
});

describe('pitch zones', () => {
  const door = { minX: -0.45, maxX: 0.45, minZ: -1, maxZ: 1 };
  it('a marimba has 8 bars, low at the bottom, inside the door, around the hit', () => {
    const z = zonesFor('marimba', door, { x: 0.1, z: 0.2 }, 0.5);
    expect(z).toHaveLength(8);
    for (let i = 1; i < 8; i++) {
      expect(z[i].z).toBeGreaterThan(z[i - 1].z);
      expect(z[i].midi).toBeGreaterThan(z[i - 1].midi);
    }
    for (const q of z) {
      expect(q.x - q.w / 2).toBeGreaterThanOrEqual(door.minX - 1e-9);
      expect(q.x + q.w / 2).toBeLessThanOrEqual(door.maxX + 1e-9);
    }
    expect(Math.abs(z[3].z + z[4].z) / 2 - 0.2).toBeLessThan(0.05);
  });
  it('a glockenspiel has 8 keys, low on the left', () => {
    const z = zonesFor('glock', { minX: -0.6, maxX: 0.6, minZ: -0.5, maxZ: 0.5 }, { x: 0, z: 0 }, 0.5);
    expect(z).toHaveLength(8);
    for (let i = 1; i < 8; i++) expect(z[i].x).toBeGreaterThan(z[i - 1].x);
  });
  it('zones near an edge are pulled inside', () => {
    const z = zonesFor('marimba', door, { x: 0.44, z: 0.99 }, 0.5);
    for (const q of z) expect(q.z + q.h / 2).toBeLessThanOrEqual(door.maxZ + 1e-9);
  });
  it('a hit plays the zone it lands in, else the nearest', () => {
    const z = zonesFor('marimba', door, { x: 0, z: 0 }, 0.5);
    expect(zoneAt(z, 0, z[5].z)).toBe(5);
    expect(zoneAt(z, 0.3, z[0].z - 0.2)).toBe(0);
  });
  it('a bigger door is lower', () => {
    const small = zonesFor('marimba', door, { x: 0, z: 0 }, 0)[0].midi;
    const big = zonesFor('marimba', door, { x: 0, z: 0 }, 1)[0].midi;
    expect(big).toBeLessThan(small);
  });
  it('degrees walk the major pentatonic in the key', () => {
    expect([0, 1, 2, 3, 4, 5].map((d) => degreeMidi(60, d))).toEqual([60, 62, 64, 67, 69, 72]);
    expect(rootNear(55, 0)).toBe(60);
    expect(rootNear(55, 7)).toBe(55);
    const z = zonesFor('glock', { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, { x: 0, z: 0 }, 0.5, 0);
    retune(z, 'glock', 0.5, 2);
    const dPenta = new Set([2, 4, 6, 9, 11]);
    for (const q of z) expect(dPenta.has(((q.midi % 12) + 12) % 12)).toBe(true);
  });
  it('size really sets pitch: doors from small to big step down through the scale, not only by octaves', () => {
    const lows = [0, 0.2, 0.4, 0.6, 0.8, 1].map((s) => zonesFor('marimba', door, { x: 0, z: 0 }, s)[0].midi);
    for (let i = 1; i < lows.length; i++) expect(lows[i]).toBeLessThanOrEqual(lows[i - 1]);
    expect(new Set(lows).size).toBeGreaterThanOrEqual(4);
  });
  it('bars and keys are at least a hand apart', () => {
    const m = zonesFor('marimba', door, { x: 0, z: 0 }, 0.5);
    expect(m[1].z - m[0].z).toBeGreaterThanOrEqual(0.06);
    const g = zonesFor('glock', { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, { x: 0, z: 0 }, 0.5);
    expect(g[1].x - g[0].x).toBeGreaterThanOrEqual(0.06);
  });
  it("a song's degree lands on the zone with that degree, or the same note in another octave", () => {
    const z = zonesFor('marimba', door, { x: 0, z: 0 }, 0.5);
    const d = z[3].degree;
    expect(zoneForDegree(z, d)).toBe(3);
    expect(z[zoneForDegree(z, d + 5)].degree % 5).toBe(d % 5);
  });
  it('an invisible boundary wall is not an instrument', () => expect(classify(f({ width: 3, length: 2.5, label: 'invisible wall face' }))).toBeNull());
});

describe('swaps', () => {
  it('a surface cycles through what suits it and back to its own', () => {
    expect(swapsFor('marimba')[0]).toBe('marimba');
    expect(swapsFor('marimba')).not.toContain('kit');
    expect(swapsFor('marimba')).not.toContain('keys');
    let at: ReturnType<typeof nextSwap> = 'marimba';
    const seen = new Set([at]);
    for (let k = 0; k < swapsFor('marimba').length; k++) seen.add((at = nextSwap('marimba', at)));
    expect(at).toBe('marimba');
    expect(seen.size).toBe(swapsFor('marimba').length);
  });
  it('the kit never swaps', () => expect(swapsFor('kit')).toEqual(['kit']));
  it('a wall swapped to a tongue drum keeps it when re-measured, and drops a swap that no longer suits it', () => {
    const s = new Surface('p1', 'plane', 'wall');
    s.setFeatures(f({ width: 1.2, length: 1.2 }));
    expect(s.natural).toBe('gong');
    s.as = 'tongue';
    s.setFeatures(s.features);
    expect(s.voice?.family).toBe('tongue');
    expect(s.natural).toBe('gong');
    // it turns out soft: a shaker can't be a tongue drum, so it plays what it is
    s.setFeatures({ ...s.features, soft: 0.9 });
    expect(s.voice?.family).toBe('shaker');
    expect(s.as).toBeNull();
  });
});

describe('tuning in the headset', async () => {
  const { TUNE_ITEMS, stepValue, fmt, HitLog } = await import('../src/room/tuning.js');
  const item = (k: string) => TUNE_ITEMS.find((i) => i.key === k)!;
  it('steps in shown units, clamped, and shows units', () => {
    expect(stepValue(item('minSpeed'), 0.35, 1)).toBeCloseTo(0.4);
    expect(stepValue(item('latchS'), 0.12, -1)).toBeCloseTo(0.11);
    expect(stepValue(item('nearM'), 0.04, 1)).toBeCloseTo(0.04);
    expect(fmt(item('latchS'), 0.12)).toBe('120 ms');
    expect(fmt(item('minSpeed'), 0.35)).toBe('0.35 m/s');
    expect(fmt(item('offset'), 0.02)).toBe('+20 ms');
  });
  it('the readouts: the softest hit, stops, and doubles on one surface by one hand', () => {
    const log = new HitLog();
    log.add({ t: 0, speed: 0.9, kind: 'cross', heightMm: 3, surface: 'kit', side: 'right' });
    log.add({ t: 0.1, speed: 0.5, kind: 'stop', heightMm: 12, surface: 'kit', side: 'right' });
    log.add({ t: 0.15, speed: 0.6, kind: 'cross', heightMm: 2, surface: 'kit', side: 'left' });
    expect(log.doubles).toBe(1);
    expect(log.readout(item('minSpeed'), 72, 0)).toContain('softest 0.50');
    expect(log.readout(item('minDecel'), 72, 0)).toContain('1 of 3 stops');
    expect(log.readout(item('offset'), 72, 20)).toBe('Learned +20 ms · 72 fps');
  });
});
