# RubikLab

Simulador de cubo de Rubik, solver de dos fases (Kociemba) y visualizador de su estructura de grupo. Todo corre en el navegador, sin compilar nada.

## Qué incluye

- **Simulador 3D** (three.js): los 18 giros de cara, animación, mezcla aleatoria y estado uniforme aleatorio.
- **Solver de dos fases**: usa la cadena `G ⊃ H = ⟨U, D, R2, L2, F2, B2⟩`. Soluciones de ~20 movimientos en torno a 1 s.
- **Visualizador de grupo**: ciclos, orden del elemento, invariantes (torsión, volteo, paridad), cadena de subgrupos G₀ ⊃ G₁ ⊃ G₂ ⊃ G₃ ⊃ {e}, conmutadores, conjugados y potencias g^k.

## Modelo

Un estado es un elemento de `G ≅ (Z₃⁷ × Z₂¹¹) ⋊ ((A₈ × A₁₂) ⋊ Z₂)`, con |G| = 43 252 003 274 489 856 000. Se guarda como cuatro arrays: `cp`, `co` (esquinas) y `ep`, `eo` (aristas). El producto `A·B` significa "aplicar A y luego B".

## Uso

Necesita internet (three.js se carga desde un CDN). Sirve la carpeta con cualquier servidor estático:

```bash
python -m http.server 8000
```

y abre `http://localhost:8000`. Teclas: `U R F D L B` (con Mayús, el giro inverso).

## Tests

Abre `http://localhost:8000/test/index.html`. Comprueban que:

- los 18 generadores coinciden con rotaciones geométricas reales de la capa,
- el orden calculado por fórmula coincide con la fuerza bruta,
- el solver resuelve estados aleatorios.

## Estructura

| Archivo | Contenido |
| --- | --- |
| `js/cube.js` | Modelo del grupo, ciclos, orden, geometría de pegatinas |
| `js/solver.js` | Coordenadas, tablas de movimiento y poda, búsqueda IDA* |
| `js/app.js` | Visor 3D, cola de animación, panel de grupo |

## Licencia

MIT
