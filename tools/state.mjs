// Returns live game state from the running app (browser run helper).
export default async function run({ page, frame }) {
  return await (frame ?? page).evaluate(() => {
    const T = window.__thump;
    if (!T) return null;
    const h = (s) => {
      const x = T.hands[s];
      return {
        tracked: x.tracked,
        pinching: x.pinch.pinching,
        palm: x.palm.toArray(),
        indexTip: x.indexTip.toArray(),
        middleTip: x.middleTip.toArray(),
        ringTip: x.ringTip.toArray(),
        knuckleIndex: x.knuckleIndex.toArray(),
        knucklePinky: x.knucklePinky.toArray(),
        palmRadius: x.palmRadius,
        tipRadius: x.tipRadius,
        upDot: x.upDot,
      };
    };
    const g = T.game.game;
    return JSON.parse(
      JSON.stringify({
        debug: T.debug,
        right: h('right'),
        left: h('left'),
        targets: T.targets(),
        game: { mode: g.mode, found: g.found, total: g.roomTotal, selected: g.selected, song: g.song?.id ?? null, motes: g.moteCount, graded: g.graded, last: g.last, display: g.display, cast: g.cast },
        progress: g.progress,
        played: T.audio.played,
      }),
    );
  });
}
