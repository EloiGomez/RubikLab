/* Two-phase solver (Kociemba) based on the subgroup chain G0 ⊃ H = <U,D,R2,L2,F2,B2>.
 *
 * Phase 1: bring the cube into H, i.e. twist = flip = slice = 0 (coordinates of the quotient space G0/H).
 * Phase 2: solve inside H using the 10 moves that generate it.
 * Every coordinate has a move table and the IDA* searches use pruning tables built by BFS.
 */
const RCSolver = (function (RC) {
  const { Cube, MOVES } = RC;
  const P2_MOVES = [0, 1, 2, 9, 10, 11, 4, 7, 13, 16]; // U U2 U' D D2 D' R2 F2 L2 B2 (índices de MOVES)

  const CNK = Array.from({ length: 13 }, () => new Array(13).fill(0));
  for (let n = 0; n < 13; n++) { CNK[n][0] = 1; for (let k = 1; k <= n; k++) CNK[n][k] = CNK[n - 1][k - 1] + (k <= n - 1 ? CNK[n - 1][k] : 0); }
  const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];

  // ---- coordinates ----
  const twistOf = (co) => { let t = 0; for (let i = 0; i < 7; i++) t = t * 3 + co[i]; return t; };
  function setTwist(co, t) {
    let s = 0;
    for (let i = 6; i >= 0; i--) { co[i] = t % 3; s += co[i]; t = (t / 3) | 0; }
    co[7] = (3 - (s % 3)) % 3;
  }
  const flipOf = (eo) => { let f = 0; for (let i = 0; i < 11; i++) f = f * 2 + eo[i]; return f; };
  function setFlip(eo, f) {
    let s = 0;
    for (let i = 10; i >= 0; i--) { eo[i] = f & 1; s += eo[i]; f >>= 1; }
    eo[11] = s % 2;
  }
  // slice: which 4 positions hold the edges FR FL BL BR (combinatorial rank, solved = 494)
  function sliceOf(ep) {
    let a = 0, x = 0;
    for (let j = 0; j < 12; j++) if (ep[j] >= 8) { x++; a += CNK[j][x]; }
    return a;
  }
  function setSlice(ep, s) {
    const isSlice = new Array(12).fill(false);
    let x = 4;
    for (let j = 11; j >= 0 && x > 0; j--) if (s >= CNK[j][x]) { isSlice[j] = true; s -= CNK[j][x]; x--; }
    let a = 0, b = 8;
    for (let j = 0; j < 12; j++) ep[j] = isSlice[j] ? b++ : a++;
  }
  // Lehmer rank of the first n entries of a permutation with values 0..n-1
  function permRank(arr, off, n, base) {
    let r = 0;
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let j = i + 1; j < n; j++) if (arr[off + j] < arr[off + i]) c++;
      r += c * FACT[n - 1 - i];
    }
    return r;
  }
  function permUnrank(r, n) {
    const pool = Array.from({ length: n }, (_, i) => i), out = [];
    for (let i = 0; i < n; i++) { const f = FACT[n - 1 - i], k = (r / f) | 0; r -= k * f; out.push(pool.splice(k, 1)[0]); }
    return out;
  }
  const cpRank = (cp) => permRank(cp, 0, 8);
  const epRank = (ep) => permRank(ep, 0, 8);
  const spRank = (ep) => { const t = [ep[8] - 8, ep[9] - 8, ep[10] - 8, ep[11] - 8]; return permRank(t, 0, 4); };

  const coordsPhase1 = (c) => [twistOf(c.co), flipOf(c.eo), sliceOf(c.ep)];
  const SOLVED_SLICE = sliceOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

  // ---- tables (built once) ----
  let T = null;
  function build() {
    if (T) return T;
    const t0 = Date.now();
    const nm1 = 18, nm2 = P2_MOVES.length;
    const twistMove = new Int16Array(2187 * nm1), flipMove = new Int16Array(2048 * nm1), sliceMove = new Int16Array(495 * nm1);
    for (let t = 0; t < 2187; t++) { const c = new Cube(); setTwist(c.co, t); for (let m = 0; m < nm1; m++) twistMove[t * nm1 + m] = twistOf(c.multiply(MOVES[m]).co); }
    for (let f = 0; f < 2048; f++) { const c = new Cube(); setFlip(c.eo, f); for (let m = 0; m < nm1; m++) flipMove[f * nm1 + m] = flipOf(c.multiply(MOVES[m]).eo); }
    for (let s = 0; s < 495; s++) { const c = new Cube(); setSlice(c.ep, s); for (let m = 0; m < nm1; m++) sliceMove[s * nm1 + m] = sliceOf(c.multiply(MOVES[m]).ep); }

    // phase 2: permute plain arrays directly for speed
    const cpMove = new Int32Array(40320 * nm2), epMove = new Int32Array(40320 * nm2), spMove = new Int16Array(24 * nm2);
    for (let r = 0; r < 40320; r++) {
      const p = permUnrank(r, 8);
      for (let k = 0; k < nm2; k++) {
        const mv = MOVES[P2_MOVES[k]];
        cpMove[r * nm2 + k] = permRank(mv.cp.map((x) => p[x]), 0, 8);
        epMove[r * nm2 + k] = permRank(mv.ep.slice(0, 8).map((x) => p[x]), 0, 8);
      }
    }
    for (let r = 0; r < 24; r++) {
      const p = permUnrank(r, 4), ep = [0, 1, 2, 3, 4, 5, 6, 7, p[0] + 8, p[1] + 8, p[2] + 8, p[3] + 8];
      for (let k = 0; k < nm2; k++) { const mv = MOVES[P2_MOVES[k]]; spMove[r * nm2 + k] = spRank(mv.ep.map((x) => ep[x])); }
    }

    // pruning tables: BFS over the product of two coordinates
    const bfs = (nA, nB, moveA, moveB, nm, startA, startB) => {
      const d = new Uint8Array(nA * nB).fill(255);
      d[startA * nB + startB] = 0;
      let frontier = [startA * nB + startB], depth = 0;
      while (frontier.length) {
        const next = [];
        for (const s of frontier) {
          const a = (s / nB) | 0, b = s - a * nB;
          for (let m = 0; m < nm; m++) {
            const ns = moveA[a * nm + m] * nB + moveB[b * nm + m];
            if (d[ns] === 255) { d[ns] = depth + 1; next.push(ns); }
          }
        }
        frontier = next; depth++;
      }
      return d;
    };
    const pruneTS = bfs(2187, 495, twistMove, sliceMove, nm1, 0, SOLVED_SLICE);
    const pruneFS = bfs(2048, 495, flipMove, sliceMove, nm1, 0, SOLVED_SLICE);
    const pruneCP = bfs(40320, 24, cpMove, spMove, nm2, 0, 0);
    const pruneEP = bfs(40320, 24, epMove, spMove, nm2, 0, 0);
    T = { nm1, nm2, twistMove, flipMove, sliceMove, cpMove, epMove, spMove, pruneTS, pruneFS, pruneCP, pruneEP, ms: Date.now() - t0 };
    return T;
  }

  const skip = (face, last) => face === last || (last >= 0 && face % 3 === last % 3 && face < last);

  /** Solves `cube`. Returns {moves, phase1Length, ms}. Keeps searching for shorter solutions until timeMs. */
  function solve(cube, { maxLength = 30, timeMs = 1500 } = {}) {
    const tb = build();
    const t0 = Date.now();
    const [t0c, f0c, s0c] = coordsPhase1(cube);
    let best = null, bestP1 = 0, timedOut = false, nodes = 0;
    const path = [];

    const phase2 = (c, limit) => {
      const cp = cpRank(c.cp), ep = epRank(c.ep), sp = spRank(c.ep);
      const nm2 = tb.nm2, p2 = [];
      const dfs = (cpc, epc, spc, depth, last) => {
        const h = Math.max(tb.pruneCP[cpc * 24 + spc], tb.pruneEP[epc * 24 + spc]);
        if (h > depth) return false;
        if (depth === 0) return h === 0;
        for (let k = 0; k < nm2; k++) {
          const face = (P2_MOVES[k] / 3) | 0;
          if (skip(face, last)) continue;
          p2.push(P2_MOVES[k]);
          if (dfs(tb.cpMove[cpc * nm2 + k], tb.epMove[epc * nm2 + k], tb.spMove[spc * nm2 + k], depth - 1, face)) return true;
          p2.pop();
        }
        return false;
      };
      for (let d = 0; d <= limit; d++) { p2.length = 0; if (dfs(cp, ep, sp, d, path.length ? (path[path.length - 1] / 3) | 0 : -1)) return p2.slice(); }
      return null;
    };

    const dfs1 = (t, f, s, depth, last) => {
      if (timedOut) return;
      if ((++nodes & 0x3fff) === 0 && best && Date.now() - t0 > timeMs) { timedOut = true; return; }
      const h = Math.max(tb.pruneTS[t * 495 + s], tb.pruneFS[f * 495 + s]);
      if (h > depth) return;
      if (depth === 0) {
        if (h !== 0) return;
        const limit = Math.min((best ? best.length : maxLength + 1) - 1 - path.length, 18);
        if (limit < 0) return;
        const c = RC.applyAlg(cube, path);
        const sol = phase2(c, limit);
        if (sol) { best = path.concat(sol); bestP1 = path.length; }
        return;
      }
      for (let m = 0; m < 18; m++) {
        const face = (m / 3) | 0;
        if (skip(face, last)) continue;
        path.push(m);
        dfs1(tb.twistMove[t * 18 + m], tb.flipMove[f * 18 + m], tb.sliceMove[s * 18 + m], depth - 1, face);
        path.pop();
        if (timedOut) return;
      }
    };

    for (let d1 = 0; d1 <= 12 && !timedOut; d1++) {
      if (best && d1 >= best.length) break;
      dfs1(t0c, f0c, s0c, d1, -1);
      if (best && Date.now() - t0 > timeMs) break;
    }
    if (!best) return { moves: null, ms: Date.now() - t0 };
    const moves = RC.simplifyAlg(best);
    return { moves, phase1Length: bestP1, ms: Date.now() - t0 };
  }

  return { build, solve, coordsPhase1, twistOf, flipOf, sliceOf, setTwist, setFlip, setSlice, SOLVED_SLICE, P2_MOVES, CNK };
})(typeof RC !== 'undefined' ? RC : require('./cube.js'));
if (typeof module !== 'undefined') module.exports = RCSolver;
