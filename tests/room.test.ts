import { describe, expect, it } from 'vitest';
import { classify, type Features } from '../src/room/classify.js';
import { degreeMidi, rootNear, zoneAt, zonesFor, retune } from '../src/room/zones.js';

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
    expect(((z[0].midi % 12) + 12) % 12).toBe(2);
  });
});
