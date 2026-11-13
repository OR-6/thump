/**
 * Build-size shim. IWSDK's UIKitML kit table imports the entire Lucide icon
 * set (~1,600 icons) even when spatial UI is unused. Thump renders no
 * UIKit panels, so we expose only the two icons @pmndrs/uikit-horizon
 * imports by name. Aliased in vite.config.ts.
 */
export { CheckIcon, Check } from '../../node_modules/@pmndrs/uikit-lucide/dist/Check.js';
export { ChevronDownIcon, ChevronDown } from '../../node_modules/@pmndrs/uikit-lucide/dist/ChevronDown.js';
