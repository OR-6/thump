/** The desk instruments laid out as they come out by default, for the model previews (see lib/instruments.ts). */
import { GuitarModel, HandpanModel, MarimbaModel, PianoModel } from './lib/instruments.js';
import { guitarZones, handpanZones, marimbaZones, pianoZones, scaleById } from '../kit/shelf.js';

const happy = scaleById('happy');
function build<T extends { root: import('@iwsdk/core').Group; layout(z: never): void }>(m: T, zones: unknown): import('@iwsdk/core').Group {
  m.layout(zones as never);
  return m.root;
}
export const piano = build(new PianoModel(), pianoZones(72, happy));
export const guitar = build(new GuitarModel(), guitarZones(48, happy));
export const handpan = build(new HandpanModel(), handpanZones(48, happy));
export const marimba = build(new MarimbaModel(), marimbaZones(60, happy));
