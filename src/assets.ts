/**
 * Asset manifest (evaluated by both the runtime and the editor; keep it pure).
 * Thump builds every model in code (src/scene-assets) and plays recorded CC0 clips from public/sounds.
 */
import { defineAssets } from '@iwsdk/core';
import { hihat } from './scene-assets/hihat.scene-asset.js';
import { snare } from './scene-assets/snare.scene-asset.js';
import { guitar, handpan, marimba, piano } from './scene-assets/desk-instruments.scene-asset.js';

export default defineAssets({ snare, hihat, piano, guitar, handpan, marimba });
