// Returns live game state from the running app (browser run helper).
export default async function run({ page, frame }) {
  return await (frame ?? page).evaluate(() => {
    const T = window.__thump;
    if (!T) return null;
    const h = (s) => ({
      tracked: T.hands[s].tracked,
      pinching: T.hands[s].pinch.pinching,
      pinchPoint: T.hands[s].pinchPoint.toArray(),
      indexTip: T.hands[s].indexTip.toArray(),
      middleTip: T.hands[s].middleTip.toArray(),
      palm: T.hands[s].palm.toArray(),
      palmRadius: T.hands[s].palmRadius,
      tipRadius: T.hands[s].tipRadius,
      upDot: T.hands[s].upDot,
    });
    const f = T.flow();
    const sum = f.judge ? f.judge.summary() : null;
    return JSON.parse(
      JSON.stringify({
        debug: T.debug,
        right: h('right'),
        left: h('left'),
        targets: T.targets(),
        flow: { phase: f.phase, lanes: f.lanes, song: f.song?.id ?? null, attempts: f.attempts, crowd: f.crowd, chips: f.chipCount, graded: f.graded, last: f.last, judge: sum, copied: f.copied, beat: f.clock.beatAt(T.game.clock.t) },
        progress: T.game.progress,
        played: T.audio.played,
        lastGain: T.audio.lastGain,
      }),
    );
  });
}
