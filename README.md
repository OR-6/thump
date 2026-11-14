# Thump: a band on your desk

[![CI](https://github.com/OR-6/thump/actions/workflows/ci.yml/badge.svg)](https://github.com/OR-6/thump/actions/workflows/ci.yml)

A music game for Meta Quest 3, played sitting down. Tap your desk (or an airplane tray) and a drum kit comes up under your hands. A display standing at the back of the desk lets you swap it for a piano, a marimba, a guitar, congas or a handpan, pick a song and play your part while a band plays the rest, or make your own track a part at a time. Every note is in the scale, so there's no wrong one. Alone or with up to three friends in their own headsets. Hands only, in passthrough. Design notes: [docs/GAME-V3.md](docs/GAME-V3.md).

**Play:** open **https://or-6.github.io/thump/** in the Quest browser, put the controllers down and press *Enter mixed reality*.

## At your desk

Sit at a desk or a tray table. If nothing shows up, rest a palm flat on it. A panel appears just above the back of the desk, leaning back toward you. It says THUMP and "Or just tap the desk".

To press something on the panel, poke it with a fingertip or pinch it. An item lights up as your finger gets close, and it presses when your fingertip goes through the face. It clicks.

Tap the desk and the drums come out: a snare and a hi-hat on their stands and a kick on its side, as a right-handed drummer has them (the hi-hat left of the snare). A tom joins after your first song. Then your first few notes on anything bring in a soft backing band at your tempo (three steady notes set it; otherwise 90 bpm), and the panel says how fast. Stop for two bars and it drops out.

## The panel

The main menu has four tiles and a button: FREE PLAY, SONGS, MAKE A TRACK, PLAY TOGETHER, and SETTINGS in the corner.

FREE PLAY opens the instruments, a card each: DRUMS, PIANO, MARIMBA, GUITAR, CONGAS, HANDPAN. Tap one and it unfolds onto the desk. Every instrument but the drums has a settings page:

- Its notes: HAPPY, SAD, BLUESY, DREAMY (not on the congas: a drum has no notes to pick).
- Its sounds. Piano: Grand, Bowl, Marimba, Glock. Marimba: Marimba, Xylo, Glock. Guitar: Nylon, Steel, Harp. Congas: Congas, Cajon, Frame drum. Handpan: Steel, Glass, Bells.
- LOWER and HIGHER move it an octave (not the congas).
- PLAY IT takes you back to the desk.

Whatever you leave out is there next time.

## The instruments

They're models of the real things and they move when you play them. All of it is sized for a tray.

- Drums: a snare on its stand (13 cm, a chrome shell, its coated head 13 cm up and worn grey where sticks land, a throw-off), a hi-hat on its rod (two 12 cm turned brass cymbals that swing when hit) and an 18 cm kick on its side with its front head facing you, all with chrome hoops, lugs and tension rods. Slap a head (or push into the kick's front, or slap its top), or make fists: a stick appears in each, and its tip plays.
- Piano: two octaves at real key size (white keys 23.5 mm apart and 150 mm long, black keys 11 by 95 mm, grouped two and three as on any keyboard) in a lacquered case with a felt rail, 41 cm across. Every white key is a note of the scale, and the tune sits in the middle. Your fingertips press the keys, one note per finger (a hand resting on them plays nothing). The red button on the left plays a chord. Outside a song, a black key plays the two white keys either side of it together.
- Marimba: eight rosewood bars that bounce when hit, on a frame with resonators. Make a fist and a mallet appears in that hand; its head is what strikes. Your bare hand works too.
- Guitar: lying on its back on the desk, spruce top, rosette, frets and six strings. Pinch (or press) one of the three chord positions on the neck with one hand; strum the strings with the fingertips of the other. The strings are synthesised in the browser.
- Congas: two staved barrels 15 cm tall, the low one on the left. Slap the middle of a head for an open tone, its edge for a slap.
- Handpan: a hammered bronze lens with a low note in the middle and eight round it. Tap them with your fingers; alternate hands round the rim and you walk up the scale.

## Songs

Five songs: Kick Start, Two Step, Boom Bap 88, Lowrider, Night Shift, and a sixth that changes every day (named for the day: "Friday's song"). LISTEN FIRST plays a song through once on your own instrument, then counts you straight in. Each row shows its tempo and your stars, and the next one opens once you've played the one before. Pick EASY, NORMAL or HARD, check what you'll play (it's whatever is out on the desk; tap it to change), then PLAY.

The band plays the song as written and you play your part on what's out:

- Drums: the beat. Normal adds the hat.
- Piano or marimba: the tune. Normal adds the high tune.
- Guitar: strums, and the chords follow the song. From bar 9 the rhythm moves; on Normal your other hand changes chord on the neck.
- Congas: the extra percussion. Normal adds the hat's eighths as a tumbao.
- Handpan: the bass line on Easy, the extra percussion on Normal.

In bars 9 to 12 the chords change (to IV and V, or VI and VII in a minor song) and the tune moves up, then the song comes home. HARD gives you more: the extra percussion on the tom, the CHORD key on each new chord on the piano, the guitar's changes from the start, and four bars with no lights at the end.

The notes fall onto the exact key, bar, field or drum that plays them and land on the beat. Hit one and it bursts. A song has two one-bar solos (*Solo!*) where the band drops out and anything you hit counts (the kit keeps time under you unless you're the drummer), and in the last two bars on Normal the notes stop falling (*No lights now*). The band's drummer counts you in on sticks from across the desk. When the song ends the band holds the five chord and waits (*Bring it home*): hit it and they land home with you. The progress bar shows the song's map: the two solos and its second half, where the tune moves up. During a solo the room above eye level goes dim and your hits wash it in their colour, never more than three times a second.

In a song the panel shows its name, a progress bar, how many notes in a row (from eight, also on tape on the desk behind the instrument), a card for each instrument you can switch to, and STOP. Tap a card to switch mid-song: it says "Piano next", takes over at the next loop, and gives you a bar to find it ("Find it, then join in").

At the end the band plays your best two bars back with you on them, your notes in gold, and the panel says only *That was you*. Then the results: the song and your score as a percentage, your stars, Perfect and Good, your best run, NEW BEST when you beat your score on that level, and *On time* when you were close (or which side of the beat you were on). AGAIN plays it again; after three stars on Easy it's AGAIN ON NORMAL. After one of the five songs there's MAKE IT YOURS; after your own track, NEXT SONG. MENU goes back.

## Make a track

MAKE A TRACK builds the song one part at a time: BOOM, SMACK, TICK, EXTRA, TUNE, BASS. Each part's instrument comes out by itself. Bar 1 lights the pattern to copy ("Hit when it glows"). In bar 2 the lights go out ("Your turn: play anything") and whatever you play is kept. It snaps to the beat and quietly fills in what you missed. When the last part is in, there's a silent bar with a riser and then everything drops in at once. Then you play it, like a song.

## Play together

On the 2D page or on the panel (PLAY TOGETHER, START A BAND), one of you starts a band and gets a 4-letter code. Friends type it on the Thump page and tap *Join* before they enter mixed reality. Up to four headsets, wherever you all are. Then PICK A SONG and it starts for everyone on the same beat.

The host's clock is the band's clock; the other headsets work out how far off theirs is by pinging it. Each friend sits across the desk as a light in their instrument's colour, with its name, that swells when they play, and their sound comes from that side. When you play the same song, your band leaves out the parts they're playing live (never the bass). On your own, the backing band's players sit there instead during a song. In a real two-page test the song started within a thousandth of a beat on both. LEAVE leaves the band.

Signalling goes through the PeerJS public broker; after that it's peer-to-peer. Only the notes you play are sent, and each one is checked: a friend's headset can only ask for sounds the game already makes, at most 80 a second. No accounts, no voice. There's no phone mode.

## Settings

In the headset, SETTINGS on the main menu: SLOWER SONGS, ONE HAND, HIGH CONTRAST, WORDS, BACKING BAND (piano and bass under songs). On the 2D page under Settings there's also lead hand, speed, less movement and *Start over*.

## How it works

- Hits are read from raw hand-joint poses in each surface's own frame (`src/kit/strike.ts`, unit-tested on synthetic hand paths). A hit is the hand's lowest point passing through fast (0.35 m/s or more), or stopping sharply within 1.8 cm of it, since tracking loses the last centimetre. It survives dropouts and frame hitches; rebounds, resting and reaching don't play. The panel takes a gentler poke.
- `src/kit/shelf.ts` has the five instruments, their layouts in centimetres, the scales and the three chords that fit each scale. The models are in `src/scene-assets/lib/instruments.ts` and `src/scene-assets/lib/drums.ts`.
- `src/ui/menu.ts` has every page on the panel as plain data; `src/ui/panel.ts` draws it and lights what your finger is near.
- `src/play/build.ts` has the songs and how a take is snapped to the beat; `src/play/game.ts` runs songs, building, switching and scoring. `src/room/waterfall.ts` drops the notes onto the instrument.
- The sound (`src/audio/`) is 204 short clips from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL) (CC0), picked by how hard you hit and re-pitched to the note, through a room reverb and a soft limiter. The guitar is a plucked-string synth.
- Playing together is `src/net/coop.ts` (the code and the connections) and `src/net/band.ts` (the shared clock, the note messages, the checks and the rate limit).

There's an older idea still in the code: tap a mug or a book and it becomes an instrument too. It's a side extra now.

## Status

Verified in the IWER emulator (IWSDK's browser-based XR emulator), by unit tests, and with a real two-page PeerJS test where each page hears the other and a song starts on the same beat. Not yet tried on a Quest 3; that happens 14–17 Nov. Frame rate and hit-to-sound latency go here once measured on the headset with `?debug=1`.

## Develop

```
npm install
npm run typecheck && npx vitest run
npx @iwsdk/cli dev up --headless --allow-browser-automation --ai-mode agent
node tools/e2e-all.mjs
```

`tools/e2e-band.mjs` runs the playing-together test on its own (it needs the network).

## Licence

Code: MIT (see LICENSE).

Sounds: recordings from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL) by Samuel Gossner and contributors, CC0 1.0 (trimmed and converted; see `src/audio/sample-map.ts`).

Type: [Barlow Condensed](https://github.com/jpt/barlow) by Jeremy Tribby, SIL Open Font License 1.1 (`public/fonts/OFL.txt`). [Permanent Marker](https://fonts.google.com/specimen/Permanent+Marker) by Font Diner, Apache License 2.0 (`public/fonts/PermanentMarker-LICENSE.txt`).

Networking: [PeerJS](https://github.com/peers/peerjs), MIT.
