(function () {
const assert = typeof require !== 'undefined' ? require('assert') : window.assert;
const R = typeof RC !== 'undefined' ? RC : require('../js/cube.js');
const { Cube, MOVES, FACELETS, NORMALS, FACE_LETTERS } = R;

// 1. The algebraic model matches a physical layer rotation
MOVES.forEach((mv, m) => {
  const face = FACE_LETTERS[(m / 3) | 0], k = m % 3;
  const turns = k === 0 ? [true] : k === 1 ? [true, true] : [false];
  const a = NORMALS[face];
  let colors = FACELETS.map((f) => f.face);
  for (const cw of turns) {
    const next = new Array(54);
    FACELETS.forEach((f, i) => {
      const inLayer = a[0] * f.pos[0] + a[1] * f.pos[1] + a[2] * f.pos[2] === 1;
      const g = inLayer ? R.faceletIndex(R.rotate90(f.pos, a, cw), R.rotate90(f.n, a, cw)) : i;
      next[g] = colors[i];
    });
    colors = next;
  }
  assert.deepStrictEqual(R.toFacelets(mv), colors, 'geometry vs model: ' + R.moveName(m));
});
console.log('ok geometry == algebraic model (18 moves)');

// 2. Basic axioms
for (let f = 0; f < 6; f++) {
  const base = MOVES[f * 3];
  assert(base.multiply(base).multiply(base).multiply(base).isSolved(), 'X^4 = e');
  assert(R.order(base) === 4);
  assert(base.multiply(base.inverse()).isSolved());
  assert(MOVES[f * 3 + 2].equals(base.inverse()));
}
const ru = R.applyAlg(new Cube(), R.parseAlg('R U'));
assert.strictEqual(R.order(ru), 105);
let p = ru, n = 1; while (!p.isSolved()) { p = p.multiply(ru); n++; }
assert.strictEqual(n, 105);
console.log('ok order(R U) = 105 (formula and brute force)');

// 3. Group invariants on random states
for (let t = 0; t < 200; t++) {
  const c = R.applyAlg(new Cube(), R.randomScramble(30));
  assert.strictEqual(c.co.reduce((a, b) => a + b), c.co.reduce((a, b) => a + b) % 3 === 0 ? c.co.reduce((a, b) => a + b) : -1);
  assert.strictEqual(c.eo.reduce((a, b) => a + b) % 2, 0);
  assert.strictEqual(R.permParity(c.cp), R.permParity(c.ep));
  assert(c.multiply(c.inverse()).isSolved());
  let q = c, k = 1; while (!q.isSolved()) { q = q.multiply(c); k++; }
  assert.strictEqual(k, R.order(c), 'order');
}
console.log('ok invariants + order formula == brute force');

// 4. Algorithm algebra
const alg = R.parseAlg("R U R' U'");
assert(R.applyAlg(R.applyAlg(new Cube(), alg), R.invertAlg(alg)).isSolved());
assert.strictEqual(R.algToString(R.simplifyAlg(R.parseAlg("R R U U' R'"))), 'R');
console.log('ok algorithms');
})();
