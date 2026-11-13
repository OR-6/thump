/**
 * Thump entry point. World options come from iwsdk.config.json via the virtual project module;
 * systems are registered explicitly in run order: hands first, then the kit, then the occluders.
 */
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { HandTrackerSystem } from './input/hands.js';
import { HandOccluderSystem } from './input/occluders.js';
import { KitSystem } from './kit/kit-system.js';
import { mountLanding } from './ui/landing.js';
import { loadFonts } from './ui/fonts.js';

const container = document.getElementById('scene-container') as HTMLDivElement;

await loadFonts();

World.create(container, projectOptions).then((world) => {
  world.registerSystem(HandTrackerSystem, { priority: -5 });
  world.registerSystem(KitSystem, { priority: 0 });
  world.registerSystem(HandOccluderSystem, { priority: 1 });
  mountLanding(world);
});
