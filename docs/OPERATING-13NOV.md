# How to run the build from now on (13 Nov onward)

The user has played the build and rejected it. Not the code quality: the game. It plays the walls and not the mug, the copy reads as machine-written, and the session stops when it should be improving. This document is the standing order until the deadline (18 Nov, 21:00 Amsterdam; submit by midday). Read DIRECTION-13NOV-B.md first; this is how to work on it.

## The three laws

1. **The game is for a person sitting at a desk with their own stuff.** Every feature is judged by one question: does it make hitting the things on this desk more fun in the next ten minutes? If a thing on the desk cannot be played, the game is broken, whatever else works.
2. **Never stop improving.** A turn ends only when there is literally nothing left, and there is never nothing left: run the improvement loop below. Do not end a turn to report; report in NOTES.md and continue. Do not wait for the user; list what only they can do and keep going.
3. **Think before building.** Every batch starts with a written design note (ten lines in NOTES.md: what, why it is more fun, how a judge will see it, how it fails). Every batch ends with a judge round. A batch without both is not done.

## The loop (repeat until the deadline)

```
plan a batch  →  build it  →  typecheck + unit + targeted E2E  →  deploy, verify live hash
→  JUDGE ROUND (below)  →  implement every item  →  CREATIVE ROUND (below)  →  next batch
```

One full E2E only right before a deploy. Push main after each deploy. NOTES.md current after each batch: done, next, needs-the-user, what changed from the plan and why.

## The judge round (after every deploy, no exceptions)

Run these as separate faults-only reviewers in parallel, each given only what a judge can see (the live URL, the README, the landing, screenshots, the emulator session) and the rubric in docs/COMPETITION.md. Each returns numbered faults, worst first, with the exact moment and the fix. Implement every item; items needing the physical headset go to NOTES "needs you".

1. **The Meta judge.** Plays the ten minutes in the emulator with the autoplayer and by hand (E2E scripts), at a desk with a cup, a book and a keyboard (the emulator room plus synthetic hand paths). Scores the four criteria out of 25 in Meta's words, and says what would make each one a 25. Checks the special awards (First Five Minutes, Boldest Concept, Reason to Come Back, Accessibility, Social, Agentic) and names the strongest two.
2. **The airplane auditor.** Reads the debug surface list and the flow: every interaction in the ten minutes, how far from the head, whether seated. Anything beyond 60 cm that the game asks for is a fault. Anything that needs a room scan to work at all is a fault.
3. **The fresh-eyes player.** Someone who has never worn a headset: what do they do in the first 15 seconds, what confuses them, where do they stall, when do they smile. Uses only screenshots and the live page; no source.
4. **The copy editor.** Every string in the headset and on the page against the ban list in DIRECTION-13NOV-B.md and these tests: would a person say it out loud; is it six words or fewer in the headset; does it name what you do or see; is it the same voice everywhere. Rewrites, not notes.
5. **The product manager.** The whole product: the name, the tagline, the landing, the README, the gallery, the video plan, the Devpost text. What is missing for a judge to believe this is a shipped product. What claims are not backed by evidence.
6. **The feel engineer.** Strike detection on synthetic paths for a palm on the desk, a fingertip on a mug, a soft tap on a laptop lid, a knee under the desk, a hand stopping in mid-air. Misses, doubles, false positives, latency. Numbers, not adjectives.
7. **The performance engineer.** Frame time with twelve pads, three loops and a track running; allocations per frame; draw calls; shader warm-up; the frame guard.
8. **The code reviewer.** Bugs in the diff since the last deploy only.

Keep a running score table in NOTES.md (date, deploy hash, the four criteria, the top three faults). The score must go up every day. If it does not, the next batch is only fixes.

## The creative round (after every judge round)

This is the part that has been missing. The judge finds faults; this finds the next thing that makes the game better than it had to be. Do it properly, in writing, every time:

1. **Play it as a player, not a developer.** Run the ten minutes in the emulator and write down every moment that is flat: a hit with no payoff, a wait, a screen with nothing to do, a sound that is the same as the last one, a reward that does not feel earned.
2. **Generate ten ideas, minimum.** Use these lenses, one idea per lens at least:
   - *Payoff:* what could happen when I hit this thing that would make me hit it again? (light, sound, a reaction from the bandmate, a count going up)
   - *Pressure:* what gives the next 30 seconds stakes? (a fill window, a streak, a held groove, a card)
   - *Expression:* where can the player put themselves in? (fills, loops, swaps, dynamics, two-finger versus palm)
   - *Surprise:* what happens the first time that nobody expected? (the keyboard becoming keys, the knee being a conga, the bandmate stealing your mug)
   - *Mastery:* what can a good player do that a beginner cannot, visibly? (gold, full tempo, eyes-shut card, tight %)
   - *Return:* what is different tomorrow? (daily track, a new card, the desk map remembering, a new thing to find)
   - *Social:* what would I show a friend in the room? (the phone pad, two players on one desk, a beat played back)
   - *Readability:* what could be understood with no words at all?
   - *Sound:* what would a drummer notice? (dynamics, round-robins, room, a hat that opens, ghost notes)
   - *The video:* what is the shot that makes someone stop scrolling?
3. **Score each idea** on judge delta (which criterion moves, how much), fun in the first ten minutes, cost in hours, risk on device. Pick the top three by delta over cost. Write the rejects in NOTES.md under "Idea bank" so they are not lost.
4. **Build the three** as the next batch, with a design note each.

The round is not optional and not a formality. A round that produces "polish the existing features" has failed; try again with the lenses.

## Idea bank to start from (use, improve or beat these)

- **Sound check opening:** the module asks for three hits on anything; it builds a two-bar groove from those three things live and loops it. Payoff in 20 seconds; the player already has a beat before the first track.
- **Tempo follow:** in free play the band drops in under the player's own tempo after four even hits (tempo from the hit intervals) and leaves when they stop. Playing alone never feels alone.
- **Palm versus fingertip:** on the desk a palm is the open sound, a fingertip the closed one (kick/rim, open/closed hat). Hand pose is already tracked; this doubles the kit without adding pads.
- **Tight %:** one number after every track, the median timing error, shown as a percentage. Drummers chase it; it is the mastery meter and the leaderboard-free bragging stat.
- **The rule revealed:** after the third thing found, one line: *Taller rings higher.* The player now predicts sounds before hitting; that is the moment the room feels designed.
- **The bandmate steals a pad:** mid-jam it takes the thing you play most and gives you one you have ignored.
- **Playback on the objects:** after a track, your own performance plays back with the rings lighting in sequence (the encore already exists; move it to every track and let a good one be kept as a beat).
- **Two players, one desk:** a second pair of hands is already tracked when a friend leans in; the left half of the desk is theirs. Trades fills.
- **Eyes shut card:** the chart with no lights, scored; a card that teaches listening.
- **Desk map as a product:** the module can show your desk from above as rings with names; saved per room; the "studio" grows and is the thing you show a friend.
- **Film mode:** `?film=1` hides debug, enlarges rings, slows tags, for the video.
- **Hat that opens:** hold a fingertip on the hat zone and it stays open; lift to choke. One gesture, big expressiveness.
- **Dynamics coach:** the chart marks accents; hitting them harder earns the star for dynamics. Rewards playing, not tapping.
- **Daily track from your desk:** the daily is generated from the pads you have, so it always uses your mug.
- **Reason to come back:** a streak of days and one new card per day; the desk map remembers; a kept beat per day.

## Creativity standard

Before each creative round, read the user's words once more: *"I need an actual fun game. What's the point of 'play your room' when you can't play 90% of the stuff."* The answer to that sentence is the only measure. Any batch that does not make more of the desk playable, or make playing it more fun, is the wrong batch.

## Keeping the session alive

The host nudges this session with "Continue" when it is idle. Do not rely on it. A turn ends only after a judge round and a creative round have both produced the next batch, and that batch has been started. Write NOTES.md, then keep working.
