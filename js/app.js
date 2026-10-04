/* UI: 3D viewer (three.js), animated move queue, group-structure panel and solver. */
(function () {
  const { Cube, MOVES, FACELETS, NORMALS, FACE_LETTERS, CORNER_NAMES, EDGE_NAMES } = RC;
  const $ = (id) => document.getElementById(id);
  const COLORS = { U: 0xffffff, R: 0xc8102e, F: 0x00a651, D: 0xffd500, L: 0xff6a13, B: 0x0051ba };
  const mvName = RC.moveName;

  let state = new Cube();
  let solution = null, solIndex = 0;
  const queue = [];
  let busy = false;
  const history = [];                        // moves made by the user, for Undo

  // =========================================================== 3D
  const stage = $('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 8.4);
  const view = new THREE.Group();           // rotated by dragging
  scene.add(view);
  view.quaternion.setFromEuler(new THREE.Euler(0.55, -0.7, 0, 'XYZ'));
  const cubeGroup = new THREE.Group();
  view.add(cubeGroup);

  const cubies = [];                         // {mesh, home}
  const cubieAt = {};
  const bodyGeo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0d });
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const mesh = new THREE.Mesh(bodyGeo, bodyMat);
    mesh.position.set(x, y, z);
    cubeGroup.add(mesh);
    const c = { mesh, home: new THREE.Vector3(x, y, z) };
    cubies.push(c); cubieAt[[x, y, z]] = c;
  }
  const stickerGeo = new THREE.PlaneGeometry(0.84, 0.84);
  const stickers = FACELETS.map((f) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    const m = new THREE.Mesh(stickerGeo, mat);
    const n = new THREE.Vector3(...f.n);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    m.position.copy(n).multiplyScalar(0.482);
    cubieAt[f.pos].mesh.add(m);
    return m;
  });

  function solvedMask() {
    const ok = new Array(54).fill(false);
    for (let i = 0; i < 8; i++) if (state.cp[i] === i && state.co[i] === 0) RC.CORNER_FACELETS[i].forEach((k) => (ok[k] = true));
    for (let i = 0; i < 12; i++) if (state.ep[i] === i && state.eo[i] === 0) RC.EDGE_FACELETS[i].forEach((k) => (ok[k] = true));
    for (let f = 0; f < 6; f++) ok[f * 9 + 4] = true;
    return ok;
  }
  function updateColors() {
    const fl = RC.toFacelets(state), hl = $('chkHighlight').checked, ok = hl ? solvedMask() : null;
    stickers.forEach((s, i) => {
      s.material.color.setHex(COLORS[fl[i]]);
      if (hl && ok[i]) s.material.color.lerp(new THREE.Color(0x2a2d36), 0.78);
    });
  }

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage); resize();
  (function loop() { renderer.render(scene, camera); requestAnimationFrame(loop); })();

  // Pointer: drag a sticker to turn its layer; drag the background (or a middle layer) to rotate the view.
  const raycaster = new THREE.Raycaster();
  const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));
  const LAYER_FACE = [['L', 'R'], ['D', 'U'], ['B', 'F']];       // [axis][c < 0 ? 0 : 1]
  const screenOf = (v) => {
    const p = v.clone().project(camera), r = stage.getBoundingClientRect();
    return [((p.x + 1) / 2) * r.width, ((1 - p.y) / 2) * r.height];
  };
  function hitSticker(e) {
    const r = stage.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    view.updateMatrixWorld(true);
    const hit = raycaster.intersectObjects(stickers, false)[0];
    return hit ? stickers.indexOf(hit.object) : -1;
  }
  // Which move does dragging (tx, ty) pixels starting on sticker i mean? Returns a move index or -1.
  function turnFromDrag(i, tx, ty) {
    const f = FACELETS[i], n = new THREE.Vector3(...f.n);
    const P = new THREE.Vector3(...f.pos).addScaledVector(n, 0.5);
    view.updateMatrixWorld(true);
    const s0 = screenOf(cubeGroup.localToWorld(P.clone()));
    let best = null;
    for (const t of AXES) {                                      // tangent directions on this face
      if (Math.abs(t.dot(n)) > 0.5) continue;
      const s1 = screenOf(cubeGroup.localToWorld(P.clone().addScaledVector(t, 0.5)));
      const sx = s1[0] - s0[0], sy = s1[1] - s0[1];
      const score = (sx * tx + sy * ty) / ((Math.hypot(sx, sy) || 1) * Math.hypot(tx, ty));
      if (!best || score > best.score) best = { t, score };
    }
    if (!best || best.score < 0.35) return -1;
    const A = new THREE.Vector3().crossVectors(n, best.t);        // rotation axis that moves the sticker along t
    const ax = Math.abs(A.x) > 0.5 ? 0 : Math.abs(A.y) > 0.5 ? 1 : 2, sgn = A.getComponent(ax) > 0 ? 1 : -1;
    const c = f.pos[ax];
    if (c === 0) return -1;                                      // middle layers are not generators: orbit instead
    const face = FACE_LETTERS.indexOf(LAYER_FACE[ax][c < 0 ? 0 : 1]);
    return face * 3 + (c > 0 ? (sgn > 0 ? 2 : 0) : (sgn > 0 ? 0 : 2));
  }

  let drag = null;                                                // i: sticker index, -1 = orbit, -2 = turn already issued
  stage.addEventListener('pointerdown', (e) => {
    const i = !busy && !queue.length ? hitSticker(e) : -1;
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, i };
    stage.setPointerCapture(e.pointerId); stage.style.cursor = i >= 0 ? 'pointer' : 'grabbing';
  });
  stage.addEventListener('pointerup', () => { drag = null; stage.style.cursor = 'grab'; });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.i >= 0) {
      const tx = e.clientX - drag.sx, ty = e.clientY - drag.sy;
      if (Math.hypot(tx, ty) < 14) return;
      const m = turnFromDrag(drag.i, tx, ty);
      if (m >= 0) { userMoves([m]); drag.i = -2; return; }
      drag.i = -1; drag.x = e.clientX; drag.y = e.clientY;         // not a layer turn: fall back to orbiting
      return;
    }
    if (drag.i === -2) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    view.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dy * 0.008, dx * 0.008, 0, 'XYZ')));
  });
  const DEFAULT_VIEW = new THREE.Euler(0.55, -0.7, 0, 'XYZ');
  $('btnResetView').onclick = () => view.quaternion.setFromEuler(DEFAULT_VIEW);

  // animate one layer turn
  function animateMove(m, dur) {
    return new Promise((resolve) => {
      if (dur <= 0) return resolve();
      const face = FACE_LETTERS[(m / 3) | 0], k = m % 3;
      const n = new THREE.Vector3(...NORMALS[face]);
      const layer = cubies.filter((c) => c.home.dot(n) > 0.5);
      const pivot = new THREE.Group();
      cubeGroup.add(pivot);
      layer.forEach((c) => pivot.add(c.mesh));
      const total = -(Math.PI / 2) * (k === 2 ? -1 : k + 1);
      const t0 = performance.now();
      (function tick(now) {
        const t = Math.min(1, (now - t0) / (dur * (k === 1 ? 1.5 : 1)));
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        pivot.quaternion.setFromAxisAngle(n, total * e);
        if (t < 1) return requestAnimationFrame(tick);
        layer.forEach((c) => { cubeGroup.add(c.mesh); c.mesh.position.copy(c.home); c.mesh.quaternion.identity(); });
        cubeGroup.remove(pivot);
        resolve();
      })(t0);
    });
  }
  const duration = () => { const v = +$('speed').value; return v >= 100 ? 0 : 520 - 4.9 * v; };

  // =========================================================== move queue
  function enqueue(moves, tag) { moves.forEach((m) => queue.push({ m, tag })); pump(); }
  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const it = queue.shift();
      await animateMove(it.m, duration());
      state = state.multiply(MOVES[it.m]);
      if (it.tag === 'user') history.push(it.m);
      updateColors();
      if (it.tag === 'sol') { solIndex++; renderSolution(); }
      if (!queue.length || duration() > 0) refresh();
    }
    busy = false;
    refresh();
  }
  function userMoves(moves) { clearSolution(); enqueue(moves, 'user'); }
  function setState(c) { queue.length = 0; history.length = 0; state = c; clearSolution(); updateColors(); refresh(); }
  $('btnUndo').onclick = () => {
    if (busy || !history.length) return;
    const m = history.pop();
    clearSolution(); enqueue([((m / 3) | 0) * 3 + (2 - (m % 3))], 'undo');
  };

  // =========================================================== solver UI
  function clearSolution() { solution = null; solIndex = 0; renderSolution(); }
  function renderSolution() {
    const box = $('solution'); box.innerHTML = '';
    $('btnPlay').disabled = $('btnStep').disabled = !solution || solIndex >= solution.moves.length;
    if (!solution) return;
    solution.moves.forEach((m, i) => {
      const s = document.createElement('span');
      s.className = 'chip ' + (i < solution.p1 ? 'p1' : 'p2') + (i < solIndex ? ' done' : '');
      s.textContent = mvName(m); box.appendChild(s);
    });
  }
  $('btnSolve').onclick = () => {
    if (state.isSolved()) { $('solveMsg').textContent = 'Already solved.'; return; }
    $('solveMsg').textContent = 'Solving… (the first run builds the pruning tables)';
    $('btnSolve').disabled = true;
    setTimeout(() => {
      const r = RCSolver.solve(state, { timeMs: 1200 });
      $('btnSolve').disabled = false;
      if (!r.moves) { $('solveMsg').textContent = 'No solution found (invalid state?)'; return; }
      // phase 1 length is capped to the simplified solution length (used for coloring)
      solution = { moves: r.moves, p1: Math.min(r.phase1Length, r.moves.length) };
      solIndex = 0; renderSolution();
      $('solveMsg').innerHTML = `${r.moves.length} moves in ${r.ms} ms · <span style="color:var(--accent)">phase 1: ${solution.p1}</span> · <span style="color:var(--accent2)">phase 2: ${r.moves.length - solution.p1}</span>`;
    }, 30);
  };
  $('btnPlay').onclick = () => { if (!solution) return; enqueue(solution.moves.slice(solIndex), 'sol'); };
  $('btnStep').onclick = () => { if (solution && solIndex < solution.moves.length && !busy) enqueue([solution.moves[solIndex]], 'sol'); };

  // =========================================================== controls
  const mb = $('moveButtons');
  for (let k = 0; k < 3; k++) for (let f = 0; f < 6; f++) {
    const b = document.createElement('button');
    b.textContent = mvName(f * 3 + k); b.className = 'mono';
    b.onclick = () => userMoves([f * 3 + k]);
    mb.appendChild(b);
  }
  $('btnScramble').onclick = () => { const s = RC.randomScramble(25); userMoves(s); $('solveMsg').textContent = 'Scramble: ' + RC.algToString(s); };
  $('btnRandom').onclick = () => setState(RC.randomState());
  $('btnReset').onclick = () => setState(new Cube());
  $('chkHighlight').onchange = updateColors;
  window.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const f = 'urfdlb'.indexOf(e.key.toLowerCase());
    if (f >= 0) userMoves([f * 3 + (e.shiftKey ? 2 : 0)]);
  });

  // =========================================================== group panel
  const fmt = (n) => n.toLocaleString('en-US').replace(/,/g, ' ');
  const SIZES = (() => {
    const g3 = 663552n, g2 = g3 * 29400n, g1 = g2 * 1082565n, g0 = g1 * 2048n;
    return { g0, g1, g2, g3 };
  })();

  // G3 = <U2,D2,R2,L2,F2,B2>: enumerated once by BFS (663,552 elements) and queried by hash
  let g3Set = null;
  const halfTurns = [1, 4, 7, 10, 13, 16].map((m) => MOVES[m]);
  const key = (cp, ep) => cp.join('') + ',' + ep.join('.');
  function inG3(c) {
    if (c.co.some((v) => v) || c.eo.some((v) => v)) return false;
    if (!g3Set) {
      g3Set = new Set(); const id = new Cube();
      let frontier = [[id.cp, id.ep]]; g3Set.add(key(id.cp, id.ep));
      while (frontier.length) {
        const next = [];
        for (const [cp, ep] of frontier) for (const h of halfTurns) {
          const ncp = h.cp.map((x) => cp[x]), nep = h.ep.map((x) => ep[x]), k = key(ncp, nep);
          if (!g3Set.has(k)) { g3Set.add(k); next.push([ncp, nep]); }
        }
        frontier = next;
      }
    }
    return g3Set.has(key(c.cp, c.ep));
  }

  function levels(c) {
    const g1 = c.eo.every((v) => v === 0);
    const g2 = g1 && c.co.every((v) => v === 0) && [8, 9, 10, 11].every((i) => c.ep[i] >= 8);
    const g3 = g2 && inG3(c);
    return [
      { name: 'G₀ = ⟨U, D, R, L, F, B⟩', size: SIZES.g0, in: true, note: 'the whole cube group' },
      { name: 'G₁ = ⟨U, D, R, L, F2, B2⟩', size: SIZES.g1, in: g1, note: 'all edges correctly oriented (index 2048)' },
      { name: "G₂ = ⟨U, D, R2, L2, F2, B2⟩  (= Kociemba's H)", size: SIZES.g2, in: g2, note: 'corners oriented and middle-slice edges inside their slice (index 2187·495)' },
      { name: 'G₃ = ⟨U2, D2, R2, L2, F2, B2⟩', size: SIZES.g3, in: g3, note: 'half turns only (index 29,400)' },
      { name: 'G₄ = {e}', size: 1n, in: c.isSolved(), note: 'only the solved cube' },
    ];
  }

  const sgn = (n) => (n === 0 ? '0' : '+' + n);
  function cycleChips(names, cyc, mod) {
    let fixedOk = 0; const parts = [];
    for (const cy of cyc) {
      if (cy.length === 1 && cy.twist === 0) { fixedOk++; continue; }
      const body = cy.positions.map((p) => names[p]).join(' → ');
      const info = cy.twist ? `<span class="chip tw" title="sum of the cycle's orientations (mod ${mod})">⟲ ${sgn(cy.twist)}</span>` : '';
      parts.push(`<span class="chip">(${body})</span>${info}`);
    }
    return `<div class="chips">${parts.join('') || '<span class="tag ok">identity</span>'}</div>
            <div class="msg">${fixedOk} fixed piece(s) with no twist · cycle type: ${cyc.filter((c) => c.length > 1 || c.twist).map((c) => c.length + (c.twist ? '*' : '')).sort((a, b) => parseInt(b) - parseInt(a)).join(' ') || '—'}</div>`;
  }

  function refresh() {
    const c = state;
    const cc = RC.cycles(c.cp, c.co, 3), ec = RC.cycles(c.ep, c.eo, 2);
    const ord = RC.order(c);
    const [tw, fl, sl] = RCSolver.coordsPhase1(c);
    const pc = RC.permParity(c.cp), pe = RC.permParity(c.ep);
    const sumCo = c.co.reduce((a, b) => a + b, 0) % 3, sumEo = c.eo.reduce((a, b) => a + b, 0) % 2;
    const badC = c.cp.filter((v, i) => v !== i || c.co[i]).length, badE = c.ep.filter((v, i) => v !== i || c.eo[i]).length;
    const tag = (ok, t) => `<span class="tag ${ok ? 'ok' : 'bad'}">${t}</span>`;
    $('summary').innerHTML = `
      <dt>State</dt><dd>${c.isSolved() ? tag(true, 'identity (solved)') : 'non-trivial element'}</dd>
      <dt>Order of g</dt><dd><b>${ord}</b> <span class="msg">— g<sup>${ord}</sup> = e</span></dd>
      <dt>Misplaced</dt><dd>${badC} corners · ${badE} edges</dd>
      <dt>Parity</dt><dd>corners ${pc ? 'odd' : 'even'} · edges ${pe ? 'odd' : 'even'} ${tag(pc === pe, pc === pe ? 'equal ✓' : 'different')}</dd>
      <dt>Σ corner twist</dt><dd>${sumCo} (mod 3) ${tag(sumCo === 0, 'invariant ✓')}</dd>
      <dt>Σ edge flip</dt><dd>${sumEo} (mod 2) ${tag(sumEo === 0, 'invariant ✓')}</dd>
      <dt>Coset G₀/H</dt><dd class="mono">twist ${tw} · flip ${fl} · slice ${sl}</dd>`;
    $('cycles').innerHTML = `<b>Corners</b> (σ ∈ S₈, twist ∈ Z₃)${cycleChips(CORNER_NAMES, cc, 3)}
      <div style="height:8px"></div><b>Edges</b> (τ ∈ S₁₂, flip ∈ Z₂)${cycleChips(EDGE_NAMES, ec, 2)}`;
    const row = (names, perm, ori, i) => `<tr><td>${names[i]}</td><td class="${perm[i] !== i ? 'moved' : ''}">${names[perm[i]]}</td><td class="${ori[i] ? 'moved' : ''}">${ori[i]}</td></tr>`;
    $('tblCorners').innerHTML = '<tr><th>pos</th><th>piece</th><th>co</th></tr>' + c.cp.map((_, i) => row(CORNER_NAMES, c.cp, c.co, i)).join('');
    $('tblEdges').innerHTML = '<tr><th>pos</th><th>piece</th><th>eo</th></tr>' + c.ep.map((_, i) => row(EDGE_NAMES, c.ep, c.eo, i)).join('');

    const lv = levels(c);
    let cur = 0; lv.forEach((l, i) => { if (l.in) cur = i; });
    $('chain').innerHTML = lv.map((l, i) => `<div class="level ${l.in ? 'in' : 'out'} ${i === cur ? 'cur' : ''}">
        <span class="mk">${l.in ? '✓' : '✗'}</span><div><span class="mono">${l.name}</span><small>${l.note}</small></div>
        <span class="tag">|·| = ${fmt(l.size)}</span></div>`).join('');
    $('chainMsg').textContent = cur === 0
      ? 'This element is in G₀ but not in G₁. Phase 1 of the solver would bring it into G₂ = H.'
      : cur === 4 ? 'This is the identity: it belongs to every subgroup.'
      : `The smallest subgroup in the chain containing it is G${'₀₁₂₃₄'[cur]}.`;
  }

  // =========================================================== sticker rings of algorithm A
  // Six faces (9 dots each) sit on a hexagon. Every sticker cycle of A is a ring: stickers that stay on one face turn
  // around that face's centre; stickers spread over several faces ride a big concentric circle. Dots keep the colour of
  // the sticker they represent, so stepping A moves them along their rings and A^order brings them all home.
  const HEX_ORDER = ['R', 'F', 'U', 'L', 'B', 'D'], HEX_R = 3.8, DOT_GAP = 0.6, DOT_R = 0.22;
  const faceAngle = (f) => HEX_ORDER.indexOf(f) * 60 - 90;                  // degrees, SVG orientation (y down)
  const faceCenter = (f) => { const a = (faceAngle(f) * Math.PI) / 180; return [HEX_R * Math.cos(a), HEX_R * Math.sin(a)]; };
  const gridPos = (i) => {
    const [cx, cy] = faceCenter(FACE_LETTERS[(i / 9) | 0]), k = i % 9;
    return [cx + ((k % 3) - 1) * DOT_GAP, cy + (((k / 3) | 0) - 1) * DOT_GAP];
  };
  const CSS_COLORS = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, '#' + v.toString(16).padStart(6, '0')]));
  const normDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
  const STEP_MS = 900;

  let rings = [], ringOrder = 1, ringInfo = '';
  const ringAnim = { k: 0, t: 0, mode: 'idle', last: 0 };      // mode: idle | step (finish current step) | play

  function buildRings(g) {
    const cycles = RC.stickerCycles(g), moving = new Set(cycles.flat());
    const sides = [];                                           // cycles that ride a big circle
    rings = cycles.map((cyc) => {
      const faces = new Set(cyc.map((s) => (s / 9) | 0));
      if (faces.size === 1) {                                   // all on one face: turn around its centre
        const [cx, cy] = faceCenter(FACE_LETTERS[[...faces][0]]);
        const nodes = cyc.map((s) => { const [x, y] = gridPos(s); return { ang: (Math.atan2(y - cy, x - cx) * 180) / Math.PI, rad: Math.hypot(x - cx, y - cy) }; });
        if (nodes.every((n) => n.rad > 1e-6 && Math.abs(n.rad - nodes[0].rad) < 1e-6)) return { cyc, cx, cy, rad: nodes[0].rad, nodes };
      }
      const r = { cyc, cx: 0, cy: 0, rad: 0, nodes: cyc.map((s) => ({ ang: faceAngle(FACE_LETTERS[(s / 9) | 0]) + (((s % 9) % 3) - 1) * 5 })) };
      sides.push(r);
      return r;
    });
    const spacing = Math.min(0.62, 2.4 / Math.max(sides.length, 1));
    sides.forEach((r, gi) => { r.rad = HEX_R + (gi - (sides.length - 1) / 2) * spacing; });
    rings.forEach((r, ri) => { r.color = `hsl(${Math.round((360 * ri) / rings.length)} 90% 62%)`; });
    ringOrder = RC.order(g);
    const lens = {};
    cycles.forEach((c) => (lens[c.length] = (lens[c.length] || 0) + 1));
    const desc = Object.keys(lens).map((l) => `${lens[l]} ring${lens[l] > 1 ? 's' : ''} of ${l}`).join(' + ');
    ringInfo = cycles.length
      ? `${desc} (${54 - moving.size} stickers stay put). Step A and every sticker moves one place along its ring; after ${ringOrder} step${ringOrder > 1 ? 's' : ''} they are all back home.`
      : 'A is the identity: no sticker moves.';
  }

  function renderRings() {
    const ease = ringAnim.mode === 'idle' ? 0 : ringAnim.t * ringAnim.t * (3 - 2 * ringAnim.t);
    const p = ringAnim.k + ease, a = Math.floor(p), f = p - a, out = [], dots = [];
    rings.forEach((r) => {
      out.push(`<circle cx="${r.cx}" cy="${r.cy}" r="${r.rad}" fill="none" stroke="${r.color}" stroke-width="0.04" opacity="0.7"/>`);
      const L = r.cyc.length;
      r.cyc.forEach((s, j) => {
        const n0 = r.nodes[(j + a) % L], n1 = r.nodes[(j + a + 1) % L];
        const ang = ((n0.ang + normDeg(n1.ang - n0.ang) * f) * Math.PI) / 180;
        dots.push(`<circle cx="${r.cx + r.rad * Math.cos(ang)}" cy="${r.cy + r.rad * Math.sin(ang)}" r="${DOT_R}" fill="${CSS_COLORS[FACELETS[s].face]}" stroke="#0b0b0d" stroke-width="0.04"/>`);
      });
    });
    const centers = HEX_ORDER.map((fl) => {                     // centres never move
      const [x, y] = faceCenter(fl), i = FACE_LETTERS.indexOf(fl) * 9 + 4;
      return `<circle cx="${x}" cy="${y}" r="${DOT_R}" fill="${CSS_COLORS[FACELETS[i].face]}" stroke="#0b0b0d" stroke-width="0.04" opacity="0.55"/>`;
    });
    const labels = HEX_ORDER.map((fl) => {
      const [x, y] = faceCenter(fl), s = 1 + 1.75 / HEX_R;
      return `<text x="${x * s}" y="${y * s}" fill="#e6e8ee" font-size="0.55" font-weight="700" text-anchor="middle" dominant-baseline="middle">${fl}</text>`;
    });
    $('net').innerHTML = out.join('') + centers.join('') + dots.join('') + labels.join('');
    $('netMsg').textContent = `A^${ringOrder > 1 ? ringAnim.k % ringOrder : 0} · ` + ringInfo;
    $('btnRingPlay').textContent = ringAnim.mode === 'play' ? 'Pause' : 'Play ⟳';
  }

  function tickRings(now) {
    if (ringAnim.mode === 'idle') return;
    ringAnim.t += (now - ringAnim.last) / STEP_MS;
    ringAnim.last = now;
    if (ringAnim.t >= 1) {
      ringAnim.k++; ringAnim.t = 0;
      if (ringAnim.mode === 'step') ringAnim.mode = 'idle';
    }
    renderRings();
    if (ringAnim.mode !== 'idle') requestAnimationFrame(tickRings);
  }
  function startRings(mode) {
    const wasIdle = ringAnim.mode === 'idle';
    ringAnim.mode = mode;
    if (wasIdle) { ringAnim.last = performance.now(); requestAnimationFrame(tickRings); }
    renderRings();
  }
  function drawNet() {
    let g;
    try { g = RC.applyAlg(new Cube(), RC.parseAlg($('algA').value)); } catch (e) { return; }   // invalid text: keep last drawing
    ringAnim.k = 0; ringAnim.t = 0; ringAnim.mode = 'idle';
    buildRings(g); renderRings();
  }
  $('algA').addEventListener('input', drawNet);
  $('btnRingStep').onclick = () => { if (ringAnim.mode === 'idle') startRings('step'); };
  $('btnRingPlay').onclick = () => startRings(ringAnim.mode === 'play' ? 'step' : 'play');
  $('btnRingReset').onclick = () => { ringAnim.k = 0; ringAnim.t = 0; ringAnim.mode = 'idle'; renderRings(); };

  // =========================================================== algorithm explorer
  let powers = [];
  function parseField(id) {
    try { $('orderOut').innerHTML = ''; return RC.parseAlg($(id).value); }
    catch (e) { $('orderOut').innerHTML = `<span class="err">${e.message}</span>`; return null; }
  }
  $('btnApplyA').onclick = () => { const a = parseField('algA'); if (a) userMoves(a); };
  $('btnInv').onclick = () => { const a = parseField('algA'); if (a) $('algA').value = RC.algToString(RC.invertAlg(a)); };
  $('btnComm').onclick = () => {
    const a = parseField('algA'), b = parseField('algB'); if (!a || !b) return;
    userMoves([...a, ...b, ...RC.invertAlg(a), ...RC.invertAlg(b)]);
  };
  $('btnConj').onclick = () => {
    const a = parseField('algA'), b = parseField('algB'); if (!a || !b) return;
    userMoves([...b, ...a, ...RC.invertAlg(b)]);
  };
  $('btnOrder').onclick = () => {
    const a = parseField('algA'); if (!a) return;
    const g = RC.applyAlg(new Cube(), a), o = RC.order(g);
    powers = [new Cube()]; for (let k = 1; k < o; k++) powers.push(powers[k - 1].multiply(g));
    const cc = RC.cycles(g.cp, g.co, 3), ec = RC.cycles(g.ep, g.eo, 2);
    const lens = (cy) => cy.filter((x) => x.length > 1 || x.twist).map((x) => x.length + (x.twist ? '*' : '')).join(', ') || '—';
    $('orderOut').innerHTML = `<dl class="kv">
      <dt>g</dt><dd class="mono">${RC.algToString(a) || 'identity'}</dd>
      <dt>Order of g</dt><dd><b>${o}</b> → the cyclic subgroup ⟨g⟩ has ${o} elements</dd>
      <dt>Corner cycles</dt><dd class="mono">${lens(cc)}</dd>
      <dt>Edge cycles</dt><dd class="mono">${lens(ec)}</dd></dl>
      <div class="msg">* = cycle with non-zero twist (multiplies the cycle's order by 3 for corners, 2 for edges). Order = lcm of everything.</div>`;
    $('powerRow').style.display = 'flex';
    $('powSlider').max = o - 1; $('powSlider').value = 0; $('powLabel').textContent = 'g^0 = e';
    setState(new Cube());
  };
  $('powSlider').oninput = (e) => {
    const k = +e.target.value; $('powLabel').textContent = k === 0 ? 'g^0 = e' : 'g^' + k;
    setState(powers[k].clone());
  };

  updateColors(); refresh(); renderSolution(); drawNet();
})();
