(function () {
const assert = typeof require !== 'undefined' ? require('assert') : window.assert;
const R = typeof RC !== 'undefined' ? RC : require('../js/cube.js');
const S = typeof RCSolver !== 'undefined' ? RCSolver : require('../js/solver.js');
const t0 = Date.now(); S.build();
console.log('tables built in', Date.now() - t0, 'ms');

// coordinates: the solved state is the origin and encode/decode round-trips
assert.deepStrictEqual(S.coordsPhase1(new R.Cube()), [0, 0, S.SOLVED_SLICE]);
for (let i = 0; i < 100; i++) {
  const c = R.randomState();
  const [t, f, s] = S.coordsPhase1(c);
  const d = new R.Cube(); S.setTwist(d.co, t); S.setFlip(d.eo, f); S.setSlice(d.ep, s);
  assert.deepStrictEqual(d.co, c.co); assert.deepStrictEqual(d.eo, c.eo);
  assert.strictEqual(S.sliceOf(d.ep), s);
}
console.log('ok coordinates');

const lens = []; let worst = 0, tmax = 0;
const N = 30;
for (let i = 0; i < N; i++) {
  const c = i < 5 ? R.applyAlg(new R.Cube(), R.randomScramble(20)) : R.randomState();
  const r = S.solve(c, { timeMs: 800 });
  assert(r.moves, 'no solution');
  assert(R.applyAlg(c, r.moves).isSolved(), 'solution does not solve the cube');
  lens.push(r.moves.length); worst = Math.max(worst, r.moves.length); tmax = Math.max(tmax, r.ms);
}
assert(S.solve(new R.Cube()).moves.length === 0);
console.log('ok ' + N + ' solves; mean', (lens.reduce((a, b) => a + b) / N).toFixed(1), 'worst', worst, 'max ms', tmax);
})();
