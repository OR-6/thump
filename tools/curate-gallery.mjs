#!/usr/bin/env node
// The Devpost gallery, curated from artifacts/gallery (site-photos, strip-draw, finale-photo) into
// artifacts/devpost in story order: payoff first, how it plays, then one shot per idea.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
const ORDER = [
  ['01-picture-comes-alive.jpg', '01-picture-comes-alive.jpg'],
  ['16-how-it-plays.jpg', '02-how-it-plays.jpg'],
  ['20-first-minute.jpg', '03-the-first-minute.jpg'],
  ['12-phone-caller.jpg', '04-your-phone-is-the-card.jpg'],
  ['19-visitor.jpg', '05-a-visitor.jpg'],
  ['21-quilt-on-the-wall.jpg', '06-quilt-on-the-wall.jpg'],
  ['22-night-lantern.jpg', '07-night-lantern.jpg'],
  ['18-by-ear.jpg', '08-a-row-by-ear.jpg'],
  ['02-plushes-help.jpg', '09-plushes-help.jpg'],
  ['09-shelf-and-desk.jpg', '10-shelf-and-desk.jpg'],
  ['14-look-to-play.jpg', '11-look-to-play.jpg'],
  ['17-the-ending.jpg', '12-the-ending.jpg'],
];
rmSync('artifacts/devpost', { recursive: true, force: true });
mkdirSync('artifacts/devpost', { recursive: true });
for (const [from, to] of ORDER) cpSync(`artifacts/gallery/${from}`, `artifacts/devpost/${to}`);
console.log(`artifacts/devpost: ${ORDER.length} images`);
