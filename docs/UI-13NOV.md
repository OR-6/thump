# UI, menus and feel (13 Nov, night)

The user's requirement, verbatim: a fully polished music game that works well in VR, mixing what VR games do well with what music games do well. Real-looking instruments, a proper menu, instrument selection, mode selection, instrument settings, a waterfall for songs, and animations that are good and feel responsive, everywhere. This file is the spec for the UI and the feel. GAME-V3.md is the game, ART-13NOV.md the models, OPERATING-13NOV.md the loop.

## What is wrong in the latest screenshot (fix before anything else)

1. **The drums are still three flat discs on the floor, a metre and a half away.** Real drums have height. A snare is 14 cm deep, a kick 36 cm across and 35 cm deep, a hi-hat stands on a rod 60 cm tall. Put them at real size, at desk height, within a forearm. The ART brief measurements apply.
2. **A handwritten band name on the kick in a marker font.** On the ban list (no paper, no stickers, no handwriting). Remove it; a kick head is plain or carries a small clean logo-free port.
3. **The panel floats in mid-air a metre away with 10 px text.** Panels sit in reach, at a readable size (minimum 24 px at 1 m equivalent; body 28 to 32), angled to the eye, anchored to the desk or the hand, never hanging in the room.
4. **Nothing is lit; nothing has a shadow.** Same as before: environment, key light, contact shadows, tone mapping. This is still not done and it is why every render looks like clip art.

## References (study these before building the UI; name what you took from each)

- **Beat Saber:** one panel in front of you, big type, a song list with difficulty pills and a preview that plays when you hover, a results screen with one big number. Nothing floats far away.
- **Synth Riders / Audica:** menus anchored to the hand or a near panel; hover states that glow and grow; audio ticks on every hover and click.
- **Paradiddle:** instrument settings that are physical: grab a drum to move it, two hands to resize; a settings panel next to the kit with sliders; presets.
- **Synthesia / Piano games:** the waterfall with left and right hand colours, a progress bar, score and streak in the corner of the lane, a practice loop over a section.
- **Guitar Hero / Rock Band:** a count-in, a star meter that fills in real time, a crowd-free "rock meter" turned into an energy bar, results with accuracy and best streak.
- **Rhythm Heaven / Taiko:** feedback words on every hit (Perfect, Good, Late) in a strong small type next to the hit, never in the middle of the view.

## The UI system

One visual language: near-black glass panels (slightly translucent, blurred edge light), white type in a clean grotesque (Inter or similar, not condensed, not handwritten), one accent colour for the active item, 12 px radius, 1 px light rim, soft drop shadow onto the desk. Panels are built with the project's UIKit (`@pmndrs/uikit` via the `iwsdk-ui` skill), not canvases. Everything is pinch-tappable by direct touch when in reach and by ray with a pinch when not; every control has hover, press and release states.

Where panels live:
- **The hand menu:** turn your left palm up and a small menu appears above it (Beat Saber's wrist style): Resume, Instruments, Songs, Settings, Band. Always reachable, never in the way.
- **The desk panel:** a 36 × 24 cm glass panel at the back of the desk, tilted 25° to the eye, for everything that needs a list or a preview. It slides in from the desk surface and back down (250 ms).
- **In-song HUD:** on the lane itself: score and streak top-left of the waterfall, song progress as a thin bar along the landing line, hit words next to the key that was hit. Nothing in the middle of the view during play.

Screens, each one panel, each with a back button and a title:

1. **Home:** the game's name, three big buttons: Free Play, Songs, Band; below: Instruments, Settings; a line of what's new. The instrument you used last is already on the desk behind it.
2. **Instruments:** a horizontal row of 3D miniatures (the real models at 1:6) on the panel's shelf; hover one and it rises, rotates slowly and shows its name and gesture (Hit, Press, Strum, Shake); pinch to choose: the miniature flies to the desk and unfolds into the full instrument (500 ms). Locked ones are dim with "Unlocks after <song>". A second row for a second instrument on the desk (Pro).
3. **Instrument settings** (a tab on the Instruments screen, or pinch-hold the instrument): size (slider, 70 to 130 %), height and distance (nudge arrows, or just grab the instrument and move it), angle, key and scale (C major, A minor, pentatonic, chromatic), octave, sound (grand, upright, electric; kit: acoustic, electronic, jazz), easy mode toggles (fold to key, big keys, guide hands), hit sensitivity, latency check (tap along to four clicks), reset. Every change applies live on the instrument behind the panel.
4. **Songs:** a list with title, artist line, length, BPM, best stars, a difficulty pill per part (Easy, Normal, Pro), hover plays a four-bar preview on the instrument with the waterfall running (the strongest way to sell a song), filters by instrument, a daily at the top, Play button. Before play: a count-in overlay on the lane, not a modal.
5. **Band:** create (a four-letter code shown large), join (a code entry with big keys), the room: players as cards with their instrument and part, Ready toggles, Start; in-room chat is emotes only (a wave, a thumbs up, a metronome tap).
6. **Results:** one big number (score or tight %), stars that land one by one (200 ms apart) with a sound each, accuracy, best streak, a Replay button that plays the performance back on the instrument, Again and Next.
7. **Pause** (hand menu or a pinch-hold on the lane): the lane freezes, the panel shows Resume, Restart, Songs, Settings; resume has a one-bar count-in.
8. **Settings:** audio (master, instrument, band, metronome), hand (left or right lead, one hand), comfort (calm motion, high contrast, big type, no words), account-free, about.

## Feel (numbers, so it can be checked)

- **Input latency:** sound within one frame of the hit on the audio clock; visual reaction on the same frame. Never a 100 ms tween before anything happens.
- **Every hit** does four things at once: sound, the instrument part moves (key sinks 8 mm in 40 ms and springs back over 160 ms; a drum head ripples 3 cycles over 300 ms; a cymbal wobbles 1.2 s; a bar bounces 2 mm), a light flash on the part (80 ms in, 250 ms out), and in songs a hit word next to it.
- **Menus:** hover scale 1.04 over 120 ms ease-out; press scale 0.97 over 60 ms; release back over 150 ms with a 1 px rim flash; panels slide 250 ms ease-out, never fade only; lists stagger in 30 ms per row. Every hover and press has a tick sound at −18 dB.
- **Transitions:** instrument unfold 500 ms (pieces rise and settle with a small overshoot); song start count-in 4 beats with the lane lighting from bottom to top; results stars 200 ms apart.
- **Motion rules:** ease-out for things appearing, ease-in-out for things moving, springs for things you touched; nothing linear; nothing longer than 500 ms except celebration sweeps; calm-motion mode halves amplitudes and removes overshoot.
- **Comfort:** nothing moves toward the face; panels never closer than 35 cm; the lane never exceeds 60 cm tall; text never under 24 px equivalent.

## The waterfall (song mode), precisely

Lane rises from the back of the instrument, tilted 14° back, 55 cm tall; translucent dark backdrop fading to clear at the top; thin lines at white-key boundaries (or drum lanes); notes as rounded bars in two hand colours with a brighter core, length is duration; the target glows a beat ahead; on landing: the key dips, a burst at the landing line, a hit word (Perfect in white, Good in the hand colour, Late or Early in grey); misses dim the bar and it falls through; a thin progress bar along the landing line; score and streak top-left; combo milestones (×10, ×25) pulse the whole landing line. Drums: the same lane split into drum lanes with round notes; guitar: chord pads light with a strum arrow; theremin: a pitch wave. Easy: bars 30 % wider, speed 0.8, chords as one wide bar; Pro: real voicings.

## Polish checklist (the judge round's tenth reviewer: the polish reviewer)

Every deploy is checked for: a hover state on every control; a sound on every control; no text under 24 px; every instrument lit with a shadow on the desk; every hit does the four things; no panel floating further than 60 cm; no element from the ban list; results stars land with sound; the first screen loads with the instrument already on the desk; the back button on every screen; 72 fps with a panel open and a song running.

## Order

1. Lighting in the XR scene and the drums rebuilt at real size in reach (ART brief). 2. The UI system (glass panel component, hand menu, desk panel) with hover, press and sounds; Home, Instruments with miniatures, Songs with preview. 3. The waterfall per the spec on keys and drums; HUD; results. 4. Instrument settings; pause; settings. 5. Band screens. Contact sheets of every screen from the seated view after each step; the art director and polish reviewer in every judge round.
