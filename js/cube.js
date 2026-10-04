/* Algebraic model of the Rubik's cube.
 *
 * A state is an element of the group G = (Z3^7 x Z2^11) ⋊ ((A8 x A12) ⋊ Z2):
 *   cp[i] = which corner sits at position i,  co[i] = its orientation (mod 3)
 *   ep[i] = which edge sits at position i,    eo[i] = its orientation (mod 2)
 * The product a.multiply(b) means "apply a, then b".
 */
const RC = (function () {
  const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
  const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];
  const FACE_LETTERS = 'URFDLB';
  const POWER_SUFFIX = ['', '2', "'"];

  const ci = (names) => names.split(' ').map((n) => CORNER_NAMES.indexOf(n));
  const ei = (names) => names.split(' ').map((n) => EDGE_NAMES.indexOf(n));

  class Cube {
    constructor(cp, co, ep, eo) {
      this.cp = cp ? cp.slice() : [0, 1, 2, 3, 4, 5, 6, 7];
      this.co = co ? co.slice() : new Array(8).fill(0);
      this.ep = ep ? ep.slice() : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      this.eo = eo ? eo.slice() : new Array(12).fill(0);
    }
    clone() { return new Cube(this.cp, this.co, this.ep, this.eo); }
    multiply(b) {
      const r = new Cube();
      for (let i = 0; i < 8; i++) {
        r.cp[i] = this.cp[b.cp[i]];
        r.co[i] = (this.co[b.cp[i]] + b.co[i]) % 3;
      }
      for (let i = 0; i < 12; i++) {
        r.ep[i] = this.ep[b.ep[i]];
        r.eo[i] = (this.eo[b.ep[i]] + b.eo[i]) % 2;
      }
      return r;
    }
    inverse() {
      const r = new Cube();
      for (let i = 0; i < 8; i++) {
        r.cp[this.cp[i]] = i;
        r.co[this.cp[i]] = (3 - this.co[i]) % 3;
      }
      for (let i = 0; i < 12; i++) {
        r.ep[this.ep[i]] = i;
        r.eo[this.ep[i]] = this.eo[i];
      }
      return r;
    }
    isSolved() {
      return this.cp.every((v, i) => v === i) && this.co.every((v) => v === 0) &&
             this.ep.every((v, i) => v === i) && this.eo.every((v) => v === 0);
    }
    equals(o) {
      return this.cp.every((v, i) => v === o.cp[i]) && this.co.every((v, i) => v === o.co[i]) &&
             this.ep.every((v, i) => v === o.ep[i]) && this.eo.every((v, i) => v === o.eo[i]);
    }
  }

  // ---- Generators: the six 90° clockwise face turns ----
  const BASE = {
    U: new Cube(ci('UBR URF UFL ULB DFR DLF DBL DRB'), [0, 0, 0, 0, 0, 0, 0, 0],
                ei('UB UR UF UL DR DF DL DB FR FL BL BR'), new Array(12).fill(0)),
    R: new Cube(ci('DFR UFL ULB URF DRB DLF DBL UBR'), [2, 0, 0, 1, 1, 0, 0, 2],
                ei('FR UF UL UB BR DF DL DB DR FL BL UR'), new Array(12).fill(0)),
    F: new Cube(ci('UFL DLF ULB UBR URF DFR DBL DRB'), [1, 2, 0, 0, 2, 1, 0, 0],
                ei('UR FL UL UB DR FR DL DB UF DF BL BR'), [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0]),
    D: new Cube(ci('URF UFL ULB UBR DLF DBL DRB DFR'), [0, 0, 0, 0, 0, 0, 0, 0],
                ei('UR UF UL UB DF DL DB DR FR FL BL BR'), new Array(12).fill(0)),
    L: new Cube(ci('URF ULB DBL UBR DFR UFL DLF DRB'), [0, 1, 2, 0, 0, 2, 1, 0],
                ei('UR UF BL UB DR DF FL DB FR UL DL BR'), new Array(12).fill(0)),
    B: new Cube(ci('URF UFL UBR DRB DFR DLF ULB DBL'), [0, 0, 1, 2, 0, 0, 2, 1],
                ei('UR UF UL BR DR DF DL BL FR FL UB DB'), [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1]),
  };

  // MOVES[face*3 + k]: face in order U R F D L B; k = 0 (X), 1 (X2), 2 (X')
  const MOVES = [];
  for (const f of FACE_LETTERS) {
    let p = new Cube();
    for (let k = 0; k < 3; k++) { p = p.multiply(BASE[f]); MOVES.push(p); }
  }
  const moveName = (m) => FACE_LETTERS[(m / 3) | 0] + POWER_SUFFIX[m % 3];
  const MOVE_NAMES = MOVES.map((_, m) => moveName(m));

  function parseAlg(str) {
    const out = [];
    const toks = str.replace(/[()\[\],]/g, ' ').trim().split(/\s+/).filter(Boolean);
    for (const t of toks) {
      const m = /^([URFDLB])(2|'|2')?$/.exec(t);
      if (!m) throw new Error('Invalid move: ' + t);
      const f = FACE_LETTERS.indexOf(m[1]);
      out.push(f * 3 + (m[2] === '2' || m[2] === "2'" ? 1 : m[2] === "'" ? 2 : 0));
    }
    return out;
  }
  const algToString = (moves) => moves.map(moveName).join(' ');
  const invertAlg = (moves) => moves.slice().reverse().map((m) => ((m / 3) | 0) * 3 + (2 - (m % 3)));
  function applyAlg(cube, moves) {
    let c = cube;
    for (const m of moves) c = c.multiply(MOVES[m]);
    return c;
  }
  // Merge consecutive turns of the same face (R R -> R2, R R' -> nothing)
  function simplifyAlg(moves) {
    const out = [];
    for (const m of moves) {
      const f = (m / 3) | 0, q = (m % 3) + 1 === 3 ? -1 : (m % 3) + 1;
      const last = out[out.length - 1];
      if (last !== undefined && ((last / 3) | 0) === f) {
        const lq = (last % 3) + 1 === 3 ? -1 : (last % 3) + 1;
        out.pop();
        const s = (((lq + q) % 4) + 4) % 4;
        if (s !== 0) out.push(f * 3 + (s === 1 ? 0 : s === 2 ? 1 : 2));
      } else out.push(m);
    }
    return out;
  }

  // ---- Group theory: cycles, order, parity ----
  function cycles(perm, ori, mod) {
    const seen = new Array(perm.length).fill(false), res = [];
    for (let i = 0; i < perm.length; i++) {
      if (seen[i]) continue;
      const pos = [];
      let j = i, twist = 0;
      while (!seen[j]) { seen[j] = true; pos.push(j); twist += ori[j]; j = perm[j]; }
      res.push({ positions: pos, length: pos.length, twist: twist % mod });
    }
    return res;
  }
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const lcm = (a, b) => (a / gcd(a, b)) * b;
  function permParity(perm) {
    return (perm.length - cycles(perm, new Array(perm.length).fill(0), 1).length) % 2;
  }
  // Element order: each cycle of length L with twist t contributes L (or L*mod if t != 0)
  function order(cube) {
    let o = 1;
    for (const c of cycles(cube.cp, cube.co, 3)) o = lcm(o, c.twist ? c.length * 3 : c.length);
    for (const c of cycles(cube.ep, cube.eo, 2)) o = lcm(o, c.twist ? c.length * 2 : c.length);
    return o;
  }

  function randomState(rng = Math.random) {
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const c = new Cube();
    shuffle(c.cp); shuffle(c.ep);
    if (permParity(c.cp) !== permParity(c.ep)) [c.ep[0], c.ep[1]] = [c.ep[1], c.ep[0]];
    let s = 0;
    for (let i = 0; i < 7; i++) { c.co[i] = Math.floor(rng() * 3); s += c.co[i]; }
    c.co[7] = (3 - (s % 3)) % 3;
    s = 0;
    for (let i = 0; i < 11; i++) { c.eo[i] = Math.floor(rng() * 2); s += c.eo[i]; }
    c.eo[11] = s % 2;
    return c;
  }
  function randomScramble(n = 25, rng = Math.random) {
    const out = []; let last = -1;
    while (out.length < n) {
      const f = Math.floor(rng() * 6);
      if (f === last || (last >= 0 && f % 3 === last % 3 && f < last)) continue;
      out.push(f * 3 + Math.floor(rng() * 3)); last = f;
    }
    return out;
  }

  // ---- Geometry: 54 stickers (Kociemba order: U R F D L B, 9 per face) ----
  const NORMALS = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
  const FACELETS = [];
  for (const f of FACE_LETTERS) {
    for (let k = 0; k < 9; k++) {
      const r = (k / 3) | 0, c = k % 3;
      const pos = { U: [c - 1, 1, r - 1], R: [1, 1 - r, 1 - c], F: [c - 1, 1 - r, 1], D: [c - 1, -1, 1 - r],
                    L: [-1, 1 - r, c - 1], B: [1 - c, 1 - r, -1] }[f];
      FACELETS.push({ face: f, pos, n: NORMALS[f] });
    }
  }
  const sameVec = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  const faceletIndex = (pos, n) => FACELETS.findIndex((f) => sameVec(f.pos, pos) && sameVec(f.n, n));
  // Cubie coordinates from a piece name ('URF' -> [1,1,1])
  function pieceCoords(name) {
    const v = [0, 0, 0];
    for (const ch of name) { const n = NORMALS[ch]; v[0] += n[0]; v[1] += n[1]; v[2] += n[2]; }
    return v;
  }
  // For each piece, the indices of its stickers in the order of its name
  const CORNER_FACELETS = CORNER_NAMES.map((nm) => [...nm].map((ch) => faceletIndex(pieceCoords(nm), NORMALS[ch])));
  const EDGE_FACELETS = EDGE_NAMES.map((nm) => [...nm].map((ch) => faceletIndex(pieceCoords(nm), NORMALS[ch])));

  // State -> 54 color letters (each letter = the face the sticker comes from)
  function toFacelets(cube) {
    const fl = new Array(54);
    for (let f = 0; f < 6; f++) fl[f * 9 + 4] = FACE_LETTERS[f]; // centers never move
    for (let i = 0; i < 8; i++) {
      const j = cube.cp[i], o = cube.co[i];
      for (let n = 0; n < 3; n++) fl[CORNER_FACELETS[i][(n + o) % 3]] = CORNER_NAMES[j][n];
    }
    for (let i = 0; i < 12; i++) {
      const j = cube.ep[i], o = cube.eo[i];
      for (let n = 0; n < 2; n++) fl[EDGE_FACELETS[i][(n + o) % 2]] = EDGE_NAMES[j][n];
    }
    return fl;
  }

  // Sticker permutation of a state: src[g] = index of the facelet where the sticker now at g started
  function stickerSource(cube) {
    const src = new Array(54);
    for (let f = 0; f < 6; f++) src[f * 9 + 4] = f * 9 + 4;
    for (let i = 0; i < 8; i++) {
      const j = cube.cp[i], o = cube.co[i];
      for (let n = 0; n < 3; n++) src[CORNER_FACELETS[i][(n + o) % 3]] = CORNER_FACELETS[j][n];
    }
    for (let i = 0; i < 12; i++) {
      const j = cube.ep[i], o = cube.eo[i];
      for (let n = 0; n < 2; n++) src[EDGE_FACELETS[i][(n + o) % 2]] = EDGE_FACELETS[j][n];
    }
    return src;
  }
  // Cycles of the sticker movement (each sticker travels from src[g] to g); fixed stickers are omitted
  function stickerCycles(cube) {
    const src = stickerSource(cube), dest = new Array(54);
    src.forEach((s, g) => (dest[s] = g));
    const seen = new Array(54).fill(false), res = [];
    for (let s = 0; s < 54; s++) {
      if (seen[s] || dest[s] === s) { seen[s] = true; continue; }
      const cyc = []; let x = s;
      while (!seen[x]) { seen[x] = true; cyc.push(x); x = dest[x]; }
      res.push(cyc);
    }
    return res;
  }

  // 90° rotation of an integer vector about the unit axis a (cw = clockwise when looking from a)
  function rotate90(v, a, cw) {
    const dot = a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
    const cr = [a[1] * v[2] - a[2] * v[1], a[2] * v[0] - a[0] * v[2], a[0] * v[1] - a[1] * v[0]];
    const s = cw ? -1 : 1;
    return [a[0] * dot + s * cr[0], a[1] * dot + s * cr[1], a[2] * dot + s * cr[2]];
  }

  return {
    Cube, MOVES, MOVE_NAMES, CORNER_NAMES, EDGE_NAMES, FACE_LETTERS, NORMALS, FACELETS,
    CORNER_FACELETS, EDGE_FACELETS, moveName, parseAlg, algToString, invertAlg, applyAlg, simplifyAlg,
    cycles, order, permParity, randomState, randomScramble, toFacelets, stickerSource, stickerCycles, rotate90, faceletIndex, lcm,
  };
})();
if (typeof module !== 'undefined') module.exports = RC;
