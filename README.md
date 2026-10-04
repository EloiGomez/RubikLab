# RubikLab

**[Try it online](https://EloiGomez.github.io/RubikLab/)**

A Rubik's cube simulator, a two-phase (Kociemba) solver and a visualizer for the group structure of the cube. Everything runs in the browser; there is nothing to build.

## What's inside

- **3D simulator** (three.js): all 18 face turns, animation, random scramble and uniformly random state.
- **Two-phase solver**: uses the chain `G ⊃ H = ⟨U, D, R2, L2, F2, B2⟩`. Solutions of about 20 moves in roughly 1 s.
- **Group visualizer**: cycles, element order, invariants (twist, flip, parity), the subgroup chain G₀ ⊃ G₁ ⊃ G₂ ⊃ G₃ ⊃ {e}, commutators, conjugates and powers g^k.

## Model

A state is an element of `G ≅ (Z₃⁷ × Z₂¹¹) ⋊ ((A₈ × A₁₂) ⋊ Z₂)`, with |G| = 43,252,003,274,489,856,000. It is stored as four arrays: `cp`, `co` (corners) and `ep`, `eo` (edges). The product `A·B` means "apply A, then B".

## Usage

An internet connection is needed (three.js is loaded from a CDN). Serve the folder with any static server:

```bash
python -m http.server 8000
```

and open `http://localhost:8000`. Keys: `U R F D L B` (hold Shift for the inverse turn).

## Tests

Open `http://localhost:8000/test/index.html`. They check that:

- the 18 generators match real geometric layer rotations,
- the order computed by formula matches brute force,
- the solver solves random states.

## Layout

| File | Contents |
| --- | --- |
| `js/cube.js` | Group model, cycles, order, sticker geometry |
| `js/solver.js` | Coordinates, move and pruning tables, IDA* search |
| `js/app.js` | 3D viewer, animation queue, group panel |

## License

MIT
