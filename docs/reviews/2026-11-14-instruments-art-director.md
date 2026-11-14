# Instruments: art director's hostile review (2026-11-14)

Evidence judged: `docs/art/<drums|piano|marimba|guitar|congas|handpan>/{seated,quarter,close}.png`, `docs/art/drums/{jazz,electronic}.png`, and the numbers in `src/scene-assets/lib/{piano,instruments,drums,surfaces}.ts`, `src/kit/{pad-view,shelf}.ts`, `src/config.ts` (PADS), `src/art/lighting.ts`, `src/kit/kit-view.ts` (lights). The grey emulator room is ignored. Author notes and REFERENCE.md files are ignored.

## Why the owner keeps saying "weird"

Five faults show up on every instrument at once:
1. **Mixed scale.** The keys are 100 % of real size. The drums are about 45 %, the congas 50 %, the guitar about 60 % and the handpan 57 %. The marimba bars are 120 % of real width but only 50 % of real length. Next to a real hand, half of the set reads as a dollhouse and the rest does not.
2. **A dark brown environment.** Chrome, bronze and lacquer can only reflect what the environment holds, and here that is brown walls (`0x4a443e`). So hoops read as brown string, cymbals as cardboard and the handpan as caramel.
3. **Missing signature parts.** Each real instrument has one or two parts that identify it, and those parts are missing or wrong: the bottom hoop and floor-tom legs on the drums, the kick's pedal and wooden hoop, the conga's hooks and crown, the guitar's narrow neck and teardrop pickguard, the marimba's long bars and pins, and the handpan's tall lens.
4. **Procedural textures that read as blotches.** The marimba's wood is a "camouflage" pattern tiled twice per bar. The drum heads have a grey smudge in the centre, and the handpan looks like a golf ball.
5. **The menu panel.** It is the largest object in every seated frame, and its three legs stand inside the instrument's silhouette.

## One-second test and distance from a real photograph

| Instrument | Named by a musician in one second from seated.png? | Reference photo | How far away |
|---|---|---|---|
| Drums, acoustic | "A toy drum kit". Nobody finds the kick. | A Pearl Export / Ludwig Breakbeats kit in wine red | Far: red buckets with paper lids, beside orange plates |
| Drums, jazz | "Copper pots", or the same toy kit in orange | A Gretsch Catalina Jazz kit in natural satin | Far: only the colour changes, and it turns the shells to copper |
| Drums, electronic | Yes, "e-kit", but a toy one | A Roland TD-07 kit | Middle: the rack and pads read, but the LEDs and bowl-shaped pads say arcade |
| Piano | Yes, "MIDI keyboard" | An Akai MPK mini / Novation Launchkey 25 | Middle: the silhouette is right, but the panel is an empty black slab with a hole on the left |
| Marimba | "Xylophone", a toy one | A Sonor/Studio 49 Orff alto xylophone | Far: chocolate-bar bricks on a plank |
| Guitar | "Ukulele" or "kid's guitar" | A Martin D-18 lying on its back | Far: ukulele neck and headstock, a black hole punched next to the soundhole |
| Congas | "Two barrels", maybe "bongos" | An LP Classic tumba and quinto | Very far: wine barrels with stickers on them |
| Handpan | "A bronze dome" or "a wok lid" | A nitrided Ember/Saraz handpan | Far: half as tall as it should be, with dark spots instead of tone fields |

## Findings, worst first

**1. BLOCKING: every acoustic drum has no bottom hoop and no bottom head, so it reads as a bucket or cake tin.**
Object: `buildDrum` in `drums.ts`. The shell is a lathe from `(R*0.97, 0)` to the top, with nothing at the bottom edge. Snare, tom and floor tom all end in a bare rim, so the drums in seated.png and close.png look like flowerpots with lids. A Meta judge sees "cylinders", not drums: two hoops with claws are the visual signature of a drum. Fix:
- Add a second hoop at the shell's foot, using `hoopGeometry` mirrored (`scale.y = -1`) at `y = 0.006`.
- Add bottom claws (`0.003 x 0.0022 x 0.004`) under every lug.
- On any drum deeper than 0.07 m (tom, floor tom, kick), split each lug into a top lug at `0.72·H` and a bottom lug at `0.28·H`, each 0.012 tall, with rods running to each hoop.
- Start the shell at `R`, not `0.97R`. The 3 % chamfer adds to the flowerpot taper.

**2. BLOCKING: chrome reads dark brown and cymbals read as matte orange card, because the environment the metals reflect is a dark brown box.**
Object: `roomEnvironment` in `src/art/lighting.ts`. The walls are `0x4a443e` and fill most of the sphere a metal reflects. In close.png every hoop is a dull brown line and the cymbal stands are grey. The cymbal material (`cymbalMat`) uses `metalness: 0.7`. That value is physically meaningless: it mixes 30 % diffuse orange lit by the 2.2 key light, which is why the cymbals look like painted plates. Metal reads by its reflections, and here there are none worth reading. Fix:
- Walls `0x4a443e` → `0x8c857c`.
- Add a softbox strip all round the walls at `y = 1.3` (4 panels, 6 x 0.35 m, intensity 6) so every rim catches a bright horizon line.
- `scene.environmentIntensity` 1.0 → 1.3.
- Cymbals: `metalness 1.0`, colour `0xd9b25e` (acoustic) or `0xa98a52` (jazz). Raise the ring contrast in `cymbalRings` from ±4 to ±14 grey levels. Use `MeshPhysicalMaterial` with `anisotropy: 0.8` and the anisotropy direction tangential, so the highlight becomes the radial streak that makes a cymbal a cymbal.

**3. BLOCKING: the congas are egg-shaped wine barrels.**
Object: `CongaModel.layout`, `rAt()`. The foot is `0.6R`, the belly `1.1R` at 35 % of the height, and `H/D = 0.22/0.15 = 1.47`. A real conga is 2.6:1, with a foot of about 0.82 of the head and the belly at about 55 % of the height. The `Stripe` band at 59 % plus 12 dark stave seams is a barrel hoop and barrel staves. A first-time player sees barrels; a percussionist sees bongo-sized heads on barrel bodies, and so neither instrument. Fix:
- Profile: foot `0.82R`, rising through a 1 cm straight bottom band (a rubber foot ring, `0x151515`) to a belly of `1.12R` at `t = 0.55`, then back to `1.0R` at the head.
- Delete the `Stripe` band.
- Stave seams 1.2 mm → 0.6 mm, colour `0x4a2412` instead of `0x2a140a`.
- Raise `CONGA.top` 0.22 → 0.28 if the strike heights allow. Otherwise keep 0.22 and tilt each drum 10° toward the player on a three-leg low chrome stand: legs 0.004 thick, base ring 0.05 under the foot. Tilting is how a seated player holds a conga, and it hides the squat proportion.

**4. BLOCKING: the guitar has a ukulele's neck and headstock.**
Object: `GuitarModel.layout`.
- The fretboard is 0.052 wide on a 0.215 body, a ratio of 0.24. A real steel-string is 43 mm at the nut on a 400 mm body (0.11), rising to 55 mm at the 14th fret (0.14).
- The headstock plate is a 75 x 58 x 12 mm slab with 3 tiny buttons per side.
- The strings run parallel 9 mm apart all the way to the nut.

At a glance a musician names it "ukulele". Fix:
- Fretboard 0.034 at the nut, tapering to 0.042 at the body joint. Make it a tapered extrude, not a box. `neckBack` follows the same taper.
- String spacing 0.0058 at the nut, fanning out to 0.0085 at the saddle.
- Headstock 0.11 long, 0.042 wide at the nut flaring to 0.05, 0.009 thick, with a shallow V at the top. Tuner buttons 0.008 across, on 0.006 shafts sticking out 0.008 from each side.
- Body length 0.28 → 0.30. The hit zone (`NECK.h = 0.07`) can stay wider than the visible neck.

**5. BLOCKING: the marimba bars are bricks. They are far too short and too fat for their width.**
Object: `MarimbaModel.layout` and `marimbaZones`. The bars are 44 mm wide, 140 → 84 mm long and about 18 mm thick with bevels. That makes the length:width ratio 3.2 → 1.9; a real Orff alto runs 7.4 → 4.6 (280 → 175 mm long, 38 mm wide). The top bar is almost square, a tile. Next to the user's own Orff references this is the first thing anyone notices: bars of almost equal length, like chocolate pieces. Fix:
- Bar width 0.042 at a 0.054 pitch, so the gap becomes 12 mm.
- Lengths 0.22 → 0.15, graduated by 0.01 per bar.
- Thickness 0.013 → 0.011 (bass to treble), bevel 0.001.
- Deepen the box to match: `dL = 0.20`, `dR = 0.14`.
- The hit zones can keep `h` at 0.14 or grow with the bars.

**6. BLOCKING: the marimba's wood texture is a blotchy camouflage, tiled twice per bar with a visible seam, and bar 7 is blown to white.**
Object: the `wood` material in `MarimbaModel` and `woodGrain()` in `surfaces.ts`.
- The cause of the blotches and seam: `woodGrain` is 256 x 64 px, but `repeat(7, 7)` on UVs measured in metres squashes it 4:1 across, turning the sine-wobbled lines into blotches. On a 0.14 m bar, one tile is 0.143 m, so the seam lands mid-bar (visible in close.png).
- The cause of the white bar: `clearcoat 0.55` and `clearcoatRoughness 0.2` mirror the ceiling panel (intensity 9) onto bar 7.

To a judge it looks like meat or marbled plastic, not rosewood. Fix:
- Per bar, `repeat = (1/barLength, 4/barWidth)`, so one grain run covers each bar.
- A 512 x 64 straight-grain variant: wobble amplitude ×0.3, plus a pore layer of 1 px dark flecks at 3 % density.
- `roughness 0.36` → 0.5, `clearcoat` → 0.2, `clearcoatRoughness` → 0.45.
- Colour `0x7a3322` → `0x5a2416`, a padauk/rosewood brown rather than ox-blood red.

**7. BLOCKING: there is no recognisable bass drum. The kick is a fourth floor tom lying flat.**
Object: `PADS.kick` (size 0.2) and `DEPTH.kick` 0.088, built by `buildFloorDrum`. The kick is only 1.25x the snare (real: 22"/14" = 1.57x) and 0.44 deep (real: 0.8). It has a chrome rolled hoop like every tom, and no pedal. In seated.png, the biggest red drum reads as a large tom, and a drummer's first question ("where's the kick?") has no answer. Fix:
- Diameter 0.24, head at 0.14, depth 0.13.
- Wooden hoops in the shell finish: 0.014 tall, 0.007 thick, with a 0.003 chrome or contrasting inlay strip.
- Ten T-handle tension rods: a 0.014 T-bar on top of each claw, outside the hoop.
- Two folded spurs.
- A pedal clamped to the near hoop: footboard 0.06 x 0.025, a chrome frame, and a 0.035 beater shaft with a felt ball (0.009 radius) leaning against the head. That is the single part that says "kick" from any angle.
- Shift the layout to make room: kick x 0.13, snare x −0.11, hat x −0.31, floor tom x 0.40.

**8. BLOCKING: the drum heads are flat beige paper plates with a stain in the middle.**
Object: `headMat` in `buildDrum` and `headCoat()` in `surfaces.ts`. The colour is `0xe6e0d2` at `roughness 0.8`, with a 14+6-level grey "wear" blotch dead centre. The heads are the largest bright areas in the drum frames, so they set the read. A real coated head is near-white with a satin sheen and a visible collar where it bends over the bearing edge. Fix:
- Colour `0xf1efe9`, `roughness 0.5`, `clearcoat 0.3` with `clearcoatRoughness 0.5`.
- Cut the centre blotch to 4 levels, and move the stick-wear 0.15R toward the player (where sticks land).
- Add a collar: a ring from `R*0.94` to `R*0.985` in `0xcfcac0`.
- Raise the hoop so its top sits 0.006 above the head, putting the head visibly inside the hoop.
- Hoop profile: a 0.006 vertical flange face plus a 0.0025 rolled lip.

**9. BLOCKING: the cymbals are flat frisbees of nearly equal size.**
Object: `cymbal()` and the PADS sizes. The bell rise is 4.8 mm over a 0.09 radius (2.7 % of the diameter). A real crash's profile is 6–7 % of its diameter, with a clear domed bell. The sizes are hat 0.16, crash 0.18 and ride 0.19. Real: hat 14", crash 16–18", ride 20–22", so the ride is 1.5x the hat. In seated.png the four discs are indistinguishable plates. Fix:
- Crash: bell height 0.010, total height 0.012, bell diameter `0.22R`, bow drop rising toward the bell.
- Ride: bell height 0.012, bell `0.28R`, total height 0.013.
- Sizes: hat 0.15, crash 0.19, ride 0.23.
- Hi-hat: open the gap to 0.012, so the two plates show as two.

**10. BLOCKING: the handpan is half as tall as a real one, caramel-coloured and shiny, with dark spots instead of tone fields.**
Object: `HANDPAN` in `shelf.ts` and `HandpanModel`.
- Height: the rim is at 0.026 and the dome adds 0.05 on a 0.304 diameter, so `H/D = 0.25`. A real handpan is 0.45 (24 cm over 53 cm).
- Material: the shell is `0x8a6a4c`, metal 1, roughness 0.28, with a hammered normal map at strength 10/128 and repeat 9. That gives a copper truffle with golf-ball dimples (close.png).
- Tone fields: `fieldMat` is `0x4a3828`, darker than the shell, and the fields are flat `CircleGeometry` discs that do not follow the curve. In the far fields the back edge sinks into the shell and the front edge floats.

Fix:
- `HANDPAN.rim` → 0.04, `dome` → 0.065, giving `H/D` about 0.35.
- Shell `0x6b5640`, `roughness 0.42`, normal strength 10 → 4, repeat 9 → 14.
- Fields in the shell's own colour, at `roughness 0.35`, outlined by a 1.5 mm groove ring in `0x4e3b2a`.
- Dimple `scale.y` 0.16 → 0.25.
- Build each field as a patch whose vertices are lifted to `handpanY(d, R)`, so it conforms to the shell.

**11. BLOCKING: the menu panel dwarfs and cages every instrument.**
Object: the module panel. In every seated.png the panel (about 0.45 x 0.30 m) is bigger than the instrument, sits directly behind it, and plants three black posts on the desk inside the instrument's silhouette:
- In drums/seated.png the rack tom stands caged between the posts.
- In piano/seated.png the keyboard looks like a TV's plinth.
- In congas/close.png the panel covers the background of both heads.

The player's first look lands on a black rectangle, not the instrument. Fix:
- Width 0.45 → 0.32.
- Move it 0.12 further back and raise its bottom edge to 0.20 above the desk.
- Replace the three posts with one 0.008 post behind the panel's centre, or float the panel with no post.
- Alternatively, yaw the panel 30° off to the side the free hand is not playing on.

**12. BLOCKING: the guitar's pickguard is a black ellipse that reads as a second hole.**
Object: `Pickguard` (a 0.03 circle scaled 1.25 x 0.8, `0x2a140c`, clearcoat 1) placed overlapping the rosette. In close.png it is a dark blot cutting into the soundhole ring. A real pickguard is a tortoiseshell teardrop whose inner edge follows the rosette. Fix:
- Shape: a teardrop 0.07 x 0.05 with its inner curve concentric to the rosette at r = 0.042. Put it on the treble side toward the bridge, so it never overlaps the rings.
- Colour `0x5a2a14` with a mottled map: 3 octaves of noise, between `0x3a180a` and `0x8a4a20`.
- `clearcoat 0.6`.

**13. BLOCKING: the piano's left end panel has a flat grey square that reads as a hole, and wheels you cannot see.**
Object: `ChordPad` in `PianoModel.layout`, a box `chord.w*1.7` = 37 mm square in `0x55575e`, lying flat on the end panel, plus two wheels in `0x1c1c1f` on a `0x232428` body. In piano/close.png it is a dull grey square at key level, like a missing key. No reference keyboard has anything like it. Fix:
- Make the chord pad a 30 x 30 mm backlit rubber pad, 4 mm proud, with a 1 mm darker frame and an idle glow (`emissiveIntensity 0.12`, `0xffe6b8`), so it reads as one of the pads.
- Sink the wheels in a 0.05 x 0.06 recessed well (floor `0x0a0a0b`), 6 mm proud of the panel top.
- Give each wheel 24 rubber ribs (0.0008 thick) and a white index line.

**14. BLOCKING: the keyboard's control panel is dark on dark, and its controls are too small to see from the seat.**
Object: `buildPiano` in `piano.ts`:
- Plate `0x17181b` on a body of `0x232428`.
- Knobs `0x111113`, radius 0.0065.
- Pads 0.017 square in `0x2c2d31`, dark at rest.
- Buttons in `0x3a3b40`.

In piano/seated.png the panel is an empty black strip with eight specks on it. The user's four references all have busy, readable panels. Fix:
- Body `0x2b2d31`, plate `0x1a1b1e`.
- Knobs radius 0.009 with brushed aluminium caps (`0xb9bdc3`, metal 1, roughness 0.35) and a 0.0015 white pointer line.
- Pads 0.024 at a 0.027 pitch, rubber `0x4a4c52`, each with a dim idle glow in its own colour (`emissiveIntensity 0.08`).
- Fine white silk-screen lines (0.0006 wide, `0xcfcfcf`) under the knob row and the pad block.
- Display `emissiveIntensity` 0.6 → 1.2, with 3 rows of brighter pixel text in it.

**15. BLOCKING: the floor tom has no legs and is smaller than the snare.**
Object: `PADS.floor` (0.15) against `PADS.snare` (0.16), built by `buildFloorDrum` on three rubber nubs. A floor tom's three chrome legs are its identity, and a real floor tom (16") is larger than the snare (14"). As built, it reads as another bucket. Fix:
- Size 0.18, head at 0.14, depth 0.11.
- Three chrome legs, 0.004 across, from brackets (0.008 x 0.012) at 60 % of the shell height, splayed 10° outward to rubber feet.
- The shell's bottom hoop sits 0.03 above the desk.

**16. BLOCKING: the instruments sit at mixed scales against the hand.**
Real sizes compared with these:
- Snare: 0.16 here, 0.356 real (45 %).
- Conga heads: 0.15 and 0.13 here, 0.30 and 0.28 real (50 %).
- Handpan: 0.30 here, 0.53 real (57 %).
- Guitar body: 0.28 here, 0.51 real (55 %).
- Piano keys: real size, 23.5 mm pitch (100 %).
- Marimba bars: 48 mm zones against 38 mm real (120 % wide).

A 19 cm adult hand covers the whole snare head. Switching between instruments changes the world's scale, and that is the "toy" feeling in one sentence. Fix: set a floor of about 60 % for everything struck with the hand. Snare 0.20, rack tom 0.15, floor tom 0.20, kick 0.25 (which needs the layout widened by about 0.12 and the cymbals pulled 0.05 toward the centre), conga heads 0.17/0.15, handpan 0.34. Real travel kits (10–14" drums) read as real drums; 6" ones do not.

**17. LATER: the snare is black among red toms, so the kit looks assembled from spare parts.**
Object: `lookFor()` in `pad-view.ts`. The snare is `0x16161a` while the toms are `0x7a1d14`. Kits ship with a matching snare, or with a chrome or brass one. Fix: set `chromeShell: true` for the acoustic snare (the code path exists), or use the same `0x7a1d14`.

**18. LATER: the red "lacquer" is a stained barrel, not lacquer.**
Object: the `Lacquer` shell material in `buildDrum`. `woodGrain` is multiplied into a dark `0x7a1d14` at `roughness 0.42`, which shows mottled grain under a dull red: a stained barrel. A real wine-red lacquer is a deep, even colour with a mirror coat. Fix:
- Colour `0x8e1a14`, `roughness 0.25`, `clearcoat 1`, `clearcoatRoughness 0.04`.
- Grain map at 15 % strength (lerp toward white), or a sparkle normal map (fine noise, strength 6) if a sparkle finish is wanted.
- This only reads once finding 2 gives the coat something to reflect.

**19. BLOCKING: the conga hardware is flat chrome stickers, and the crown is a thread.**
Object: `Lugs` and `Crown` in `CongaModel`.
- Side plates are `0.0016 x 0.035 x 0.008` boxes. In close.png they are pale flat rectangles, like labels.
- Rods are radius 0.0011, invisible.
- The crown is a torus with a 0.004 tube.

The hooks running over the crown are what make a conga's silhouette from the seat. Fix:
- Side plates 0.006 wide x 0.05 tall x 0.003 thick, with rounded ends, from 62 % to 85 % of the height.
- L-shaped tension hooks, radius 0.0022, from each plate up over the crown, with a 0.004 quarter-torus hook and a 0.006 hex nut at the plate top.
- Crown tube 0.004 → 0.007, with a 0.012-tall skirt below it, in `0x1d1d20` at metal 0.8 and roughness 0.25.

**20. LATER: the conga heads are flat beige discs.**
Object: the `Rawhide` material (`0xd9bd8c`/`0xdfc497`, roughness 0.82, no map). Real rawhide is mottled, fibrous and slightly translucent, with darker spots. Fix:
- A 128 px noise map: 2 octaves, ±12 levels, plus about 15 % coverage of darker blotches in `0xb89668`.
- `roughness 0.6`.
- Widen the darker over-the-edge band from 0.01 to 0.015, in `0x8c6a40`.

**21. LATER: the jazz kit is the acoustic kit dipped in orange; the shells read as copper pots.**
Object: `lookFor(..., 'jazz')`. The shells are `0xb07a45` natural, the heads calf `0xd9c39a`, and the geometry is identical. In jazz.png the shells glow copper and the heads are biscuit-yellow. Fix:
- Shells `0x9a6a3e` at `roughness 0.55`, with grain at full strength (natural wood should show grain, unlike lacquer).
- Calf heads `0xe2d3b0`.
- A smaller kick (0.20) and a bigger ride (0.25), as jazz kits are.
- Darker, thinner cymbals: `0xa98a52` with a patina map (dark spots in `0x5a4a30`, 20 % coverage) and edge height ×0.7.
- Black-nickel hoops, `0x5a5a60` at metal 1.

**22. LATER: the electronic kit glows like an arcade toy, and its pads are bowls.**
Object: `buildEPad` and `buildECymbal`.
- LED strips at `emissiveIntensity 0.7`, and bell rings at 0.45, at rest.
- The shell tapers from `R*0.97` to `R*0.9`, a bowl.
- The mesh head (`0xf2f2f8` x weave) is a uniform mid grey.
- The kick is a flat pad like the toms.

A Roland or Alesis kit is matte black with dark mesh and no light at rest. Fix:
- Rest glow 0, flaring to 1.2 on a hit and decaying in 0.25 s.
- Straight shell (`R*0.97` top and bottom).
- Mesh head `0x5a5a62` with the weave at full contrast.
- A 0.022 rubber rim (not 0.0065).
- The kick as an upright tower pad (0.13 across x 0.16 tall) with a pedal and beater in front. The hit zone stays flat on top.

**23. LATER: the guitar's neck and headstock hover with no shadow under them.**
Object: `NeckBack` (bottom at about 0.033) and `Headstock` (about 0.035 off the desk). A real guitar on its back also lifts its neck, but it casts a clear shadow along it. Here a single ellipse contact shadow sits under the whole instrument and nothing darkens under the neck, so in guitar/seated.png the neck looks pasted on. Fix:
- A second `contactShadow`, 0.30 x 0.07 at strength 0.6, under the neck and headstock.
- A heel block (0.02 long, from the fretboard down to the body back) where the neck meets the body.

**24. LATER: the piano's white keys merge into one cream slab sitting on a thick black plinth.**
Object: `KEY.gap 0.001`, `ivory()` `0xf4eedf` with clearcoat 0.6, `KEY.top 0.042`, key thickness 0.014, and a bed 0.026 tall. In close.png the gaps are invisible, the keys are aged-ivory cream on a modern black-and-red controller, and 26 mm of black base shows under the key fronts. Fix:
- Gap 0.0014.
- Key colour `0xf6f5f1`, clearcoat 0.25.
- Lower `KEY.top`/`KEYBOARD.top` to 0.036, so the bed shows about 20 mm. Re-check the strike heights.

**25. LATER: the marimba's box is a flat plank and its pins are invisible.**
Object: the `side()` boxes at `H = 0.051`, and the pins (radius 0.0011, 12 mm tall). In marimba/close.png the bars float over a low plank, and the pins between bars, prominent in all of the user's Orff references, show only as sparkles. Fix:
- Box height 0.051 → 0.065.
- Feet cut-outs 0.012 deep (not `H*0.42` of the side).
- Pins radius 0.002, 0.016 tall, in `0xc8ccd2`.
- Rubber sleeves radius 0.0035, 0.008 tall, in `0x1c1c1e`.
- Let the felt rail show 2 mm beyond the bar ends.

## What a 10/10 would look like here

1. From the seat, every instrument fills the lower half of the view at no less than 60 % of real size, with the menu panel off to one side and no legs inside any silhouette.
2. The acoustic kit has two hoops on every drum, a floor tom on three chrome legs, a 24 cm kick with wooden hoops and a pedal on its near edge, and three clearly different cymbals whose bright radial highlight sweeps as the head moves.
3. The keyboard's panel shows 24 mm pads glowing faintly in colour, aluminium-capped knobs and a lit display. The chord pad is one of those pads, and the wheels sit in their own well.
4. The marimba's bars are long, grain-straight rosewood planks of 22 cm down to 15 cm, held by visible pins on a maple trapezoid box; the guitar has a 34 mm neck, a proper headstock and a teardrop tortoiseshell guard.
5. The congas stand tall and tilted, with chrome hooks over black crowns on mottled rawhide, and the handpan is a dark satin lens whose tone fields show only as soft shading and a fine groove, lit by an environment bright enough that every metal edge carries a highlight.
