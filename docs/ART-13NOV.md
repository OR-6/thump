# Art brief (13 Nov, night): the instruments have to look like instruments

The user looked at the build and said it looks bad. He is right. This brief says exactly what is wrong in the current screenshots and what the standard is. It applies to every instrument, now and later. OPERATING-13NOV.md's judge round gets a ninth reviewer: the art director (below).

## What is wrong now (from the screenshots)

1. **The drum kit is three flat discs the size of coasters, on the floor, two metres away.** A black disc with a red rim, a white disc with a paper "KIT" tag, a gold disc. No shells, no hoops, no lugs, no stands, no depth, no scale. A paper tag is on the ban list. Nobody would call this a drum kit.
2. **The keyboard is a black slab with white boxes.** Keys are the wrong size and proportion, the black keys are wedges in the wrong places, there is no case, no lip, no key gap, no notch where black keys sit, and the lighting is flat so it reads as untextured geometry.
3. **The song list is a floating dark rectangle with orange condensed text.** It floats mid-air, far away, in a font and colour that read as a debug overlay. It is the first thing the player sees, and it says "prototype".
4. **Everything is unlit.** Passthrough gives no scene light, and nothing was added, so chrome is grey, wood is flat, and there are no shadows under anything. This alone is half the problem.
5. **Scale and placement.** The instruments must be at real size, at desk height, within a forearm of a seated player, facing them. In the screenshot they are small, low and far.

## The standard

Hold every instrument to this: **in a 1080p frame from the seated view, a musician recognises it instantly, and a non-musician would want to touch it.** Each instrument gets a reference sheet (three real photos found online, not copied: used as reference for proportions, materials and details) saved under `docs/art/<instrument>/` with the measurements written down, before any geometry.

### Lighting and materials (do this first, it fixes everything at once)

- Add an **image-based environment** for reflections and ambient light (a neutral indoor HDR or a procedural room environment via `PMREMGenerator` with a `RoomEnvironment`; IWSDK can load an HDR through the asset manifest). Metals need it or they stay grey.
- One soft **key light** from above-front and a weaker fill; **contact shadows** under every piece (a soft radial blob or a shadow-catcher plane on the desk with `ShadowMaterial`), so the instruments sit on the desk instead of floating.
- Materials are **PBR with real values**: chrome (metalness 1, roughness 0.12 to 0.2), brass cymbal (metalness 1, roughness 0.35, a warm tint, lathe rings as a procedural radial normal and roughness texture), lacquered wood (a wood-grain texture, clearcoat 1, clearcoat roughness 0.1), coated drum head (off-white, roughness 0.8, a fine noise normal map), rubber (black, roughness 0.9), piano white keys (ivory-white, roughness 0.3), black keys (matte, roughness 0.7). Textures procedural (canvas-generated) or CC0; never flat colours on anything larger than a lug.
- **Tone mapping** on (ACES) with exposure tuned so white heads are not blown and blacks are not crushed in passthrough.

### Models (procedural in `src/scene-assets/`, or CC0 glTF where one is genuinely better; use the `iwsdk-build-model` skill for each)

- **Drum kit**, tabletop size but real proportions, sitting on the desk: a **snare** (shell 30 cm, 12 cm deep, chrome hoop with 8 lugs and tension rods, a throw-off, a coated head with a faint centre wear ring); a **hi-hat** (two 25 cm cymbals with a 1 cm gap on a short chrome stand with a clutch, the top slightly tilted); a **kick pad** or small bass drum (36 cm, front-facing hoop, a resonant head with a port) on the left; a **tom** (25 cm) and a **crash** (30 cm, on an angled arm) as unlocks; **sticks** that appear in pinching hands. Heads ripple on hit (vertex shader), cymbals wobble (a damped rotation), the hoops catch the light.
- **Keys**: 2 octaves at real key size (white key 23.5 mm wide, 150 mm long, 20 mm tall at the front; black key 11 mm wide, 95 mm long, 10 mm higher, bevelled top), the correct CDE and FGAB spacing with the notches cut into the white keys, 1 mm gaps, a case with a felt-strip rail behind the keys, rounded end cheeks, a slim lip in front. Keys sink 8 mm with a spring on press. An electric-piano variant later with the same geometry.
- **Marimba**: rosewood-coloured bars with rounded ends in graduated lengths, on a frame with cord and posts, resonator tubes beneath (chrome, graduated), two mallets with wound heads.
- Every later instrument follows the same rule: measurements first, reference sheet, PBR materials, animation on every hit.

### UI

- No floating slabs. The song list lives on a **physical object**: a small tablet-like **setlist** leaning on the desk at the back, or the module's display, with a clean grotesque at readable size (at least 20 px at 1 m) and proper hierarchy (title, artist line, difficulty, stars). White on near-black, one accent, nothing orange-on-black.
- The stand (instrument picker) is a short shelf with **miniatures of the real models** as icons, not symbols.
- No paper tags, no stickers, no felt. Names appear on the setlist or the module only.

### Scale and placement

- Real sizes, at desk height, 35 to 55 cm from the seated head, facing the player; the kit spans about 60 cm; the keys 70 cm. Nothing on the floor.
- A contact-sheet render from the seated view (eye height 1.2 m, 45 cm back from the desk edge) for every instrument, every time it changes, saved under `docs/art/<instrument>/seated.png`, plus front, quarter and top. Look at them. If it would not pass as a product shot, it is not done.

## The art director (the ninth reviewer, every judge round)

Given only the contact sheets and the live build's screenshots, names every place a model, material, light, font, layout or scale is below the standard, in order of how much it hurts a 1080p frame, with the exact fix (a measurement, a material value, a light position). Every item gets done.

## Order

1. Lighting: environment, key light, contact shadows, tone mapping. Re-render the contact sheets. Deploy.
2. The drum kit rebuilt to the brief, with sticks and hit animation. Contact sheets. Deploy.
3. The keys rebuilt to the brief. The setlist and the stand. Contact sheets. Deploy. Art director round.
4. The marimba. Then every new instrument to the same bar.

## Piano, second pass (14 Nov): the user says it looks basic. He is right.

A black box with keys is a toy. A premium keyboard is premium because of edges, materials and detail. Reference: a stage piano (Nord Stage, Yamaha CP88, Roland RD-2000) or the keyboard end of a grand (fallboard, curved cheek blocks). Do all of these:

1. **Edges.** Every case edge gets a real chamfer or 3 mm fillet (ExtrudeGeometry with bevel, or RoundedBoxGeometry). Sharp box edges catch no light; that is most of why it reads as flat.
2. **Materials with variety.** Walnut or ash **end cheeks** with visible grain and a satin clearcoat; a **brushed-aluminium top panel** behind the keys with a faint anisotropic sheen (a directional roughness map); a **satin black** case body, not gloss everywhere; **rubber feet**; a **gloss black fallboard strip** above the keys that reflects the environment. Four materials minimum on the case.
3. **Control panel** behind the keys (stage-piano style): a row of six small knobs with pointer marks, two faders, a small dark display with one line of real text (the sound name), a backlit power dot, two pitch and mod wheels at the left end sunk into the panel. All of it decorative but modelled, 8 to 12 mm tall, with their own shadows. No brand, no logo.
4. **Keys that read as ivory and ebony.** White keys: a very faint warm ivory tint with a slight gloss, the front face with a 1 mm rounded top edge, and **ambient occlusion** between keys and under the fallboard (a dark gradient strip 6 mm wide where the keys disappear under the fallboard, and a 0.3 mm dark line in every gap); black keys: satin, with a 1 mm chamfer on the top edges and the sloped front. AO is the single biggest realism win on a keyboard.
5. **Lighting with contrast.** The environment must have bright patches (the procedural room needs two or three large bright rectangles like windows and a softbox) so gloss surfaces show reflections; a rim light from behind-above traces the top edges; the key light casts the black keys' shadows onto the whites.
6. **Proportions.** The case is deeper than the keys (26 to 30 cm) with the control panel on the back third, the keybed sunk 8 mm into it, the key slip in front standing 10 mm above the desk, overall height at the back 9 to 10 cm.
7. **Life.** A pressed key's neighbours do not move; the pressed key dips at the front and the white key's shadow on the keybed shortens; the display shows the note names as they are played; the power dot breathes slowly.

Judge it with the art director against a photo of a stage piano from the seated view before calling it done.
