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

## 5. The reviewer contract (14 Nov): the reviews so far have not been doing their job

The user looked at the handpan render (too dark to read as bronze, a black TV-shaped panel on legs behind it with a broken tab and a red box for the selected state) and asked whether the reviewers are doing anything. A reviewer that saw that image and did not open with those two faults is useless. From now on every reviewer runs under this contract, and its report is saved to `docs/reviews/<date>-<batch>-<reviewer>.md` so the user can read it.

**Prompt every reviewer with this, verbatim, plus the evidence and the one spec it owns:**

> You are a hostile expert reviewer. Your job is to find everything that is wrong, weak, ugly, slow, confusing or cheap in what you are shown, and to say exactly how to fix each one. You are not here to be balanced. Assume the author is wrong and lazy until the evidence proves otherwise. Rules: (1) at least 15 numbered findings, worst first; a report with fewer is rejected; (2) every finding names the exact object, screen or moment, what is wrong, why it matters to a Meta judge or a first-time player, and the fix with a number where one exists (a size, a colour value, a duration, a light intensity); (3) compare against a real reference: a photograph of the real instrument, or a screenshot of Beat Saber's menu, Synthesia's waterfall, Paradiddle's kit, and say in one line how far away this is; (4) finish with "What a 10/10 would look like here", five sentences, concrete; (5) never praise; the only acceptable positive is "no fault found in X" and it costs you a finding; (6) mark each finding BLOCKING or LATER; (7) if you were given the author's own notes, ignore them; judge only the images, the build and the numbers.

**Reviewers and what each owns:** art director (ART-13NOV.md; every model, material, light, exposure, shadow, scale); UI designer (UI-13NOV.md; every panel, type size, hierarchy, state, layout, icon, colour); polish/feel (the feel numbers; every animation, transition, hover, sound); Meta judge (COMPETITION.md; the four criteria, 25 each, with the path to 25); beginner (GAME-V3 beginner mode; where they stall, in the emulator); copy (the ban list and the six-word rule; every string); performance (fps, allocations, draw calls, load time); code (the diff).

**After the reports:** this session writes `docs/reviews/<date>-<batch>-FIXES.md` listing every finding with Fixed / Deferred-and-why, re-renders the contact sheets, and the art director and UI designer re-review the new sheets before a deploy. Deferred is only allowed for items that need the physical headset.

**Exposure rule, since it keeps happening:** render every contact sheet next to a reference photo at the same size and ask "is the instrument as bright as the photo"; a bronze handpan in a lit room is mid-tone gold with a hot highlight, never near-black.
