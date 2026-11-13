# Self-judging (13 Nov, night): nobody outside this session reviews the build any more

The user has asked that this session judge its own work. That only works if the judging is adversarial and evidence-based, so it is done by separate faults-only subagents that are given only what a judge can see, never the source and never this session's own claims. Run this pass after every batch, before every deploy, with no exceptions.

## 1. Produce the evidence

- Contact sheets from the seated view (eye 1.2 m, 45 cm behind the desk edge) for every instrument and every screen on the desk, rendered with the preview harness (`preview/`, port 5190) and from the live XR runtime (`browser_screenshot` in the managed browser), saved under `docs/art/<thing>/` with the date in the name. The reference for the bar is `docs/art/piano/seated.jpg` and `close.jpg` from branch `fable/piano-waterfall`.
- A 20-second capture of a hit, a menu hover and press, an instrument unfold, and a song's landing moment (frame sequence or screenshots at 100 ms steps), so feel can be judged, not described.
- The live URL after deploy, the README, the landing.
- The measured numbers from `?debug=1`: fps with a panel open and a song running, hit-to-sound latency, allocations per frame.

## 2. Run the reviewers (parallel subagents, faults only, numbered, worst first, each with the exact fix)

Give each one the evidence above, the relevant spec, and nothing else. They must not be told what was intended or what this session believes is done.

1. **Art director** (docs/ART-13NOV.md): every model, material, light, shadow, font, layout and scale below the standard, judged against the piano reference and real photographs of the instrument. Must answer: would a musician recognise it in a 1080p frame; would a stranger want to touch it.
2. **Polish reviewer** (docs/UI-13NOV.md's polish checklist and feel numbers): every control without hover, press or sound; every text under 24 px; every panel out of reach; every hit that does not do all four things on the same frame; every animation that is linear, late or over 500 ms; every ban-list element.
3. **Meta judge** (docs/COMPETITION.md): plays the ten minutes in the emulator and by the autoplayer; scores the four criteria out of 25 in Meta's words with what would make each a 25; names the two strongest special awards and the single biggest reason this would not win.
4. **Beginner** (docs/GAME-V3.md beginner mode): a person who knows nothing about music, in the emulator: where do they stall, what do they not understand, do they succeed at the first song, do they smile; screenshots only.
5. **Feel engineer:** strike, press, strum and stick input on synthetic hand paths; misses, doubles, false positives, latency; numbers.
6. **Code reviewer:** bugs in the diff since the last deploy only.

## 3. Act on it

- Every item is implemented before the next batch starts. Items that need the physical headset go to NOTES.md "needs you".
- A deploy is blocked while the art director or polish reviewer has any item they marked blocking, or the Meta judge scores any criterion under 18.
- Keep the score table in NOTES.md (date, deploy hash, four scores, top three faults, what was fixed). It goes up every day.
- Then the creative round (OPERATING-13NOV.md): ten ideas across the lenses, build the top three.

## 4. The rule that makes it honest

A reviewer's report is only valid if it names at least one fault. A report with none is re-run with the evidence re-checked, because the bar is a shipped VR music game and nothing in this repo is there yet. The session never grades its own contact sheets; the subagents do.
