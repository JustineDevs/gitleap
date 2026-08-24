# GitLeap Design System

## Visual Theme & Atmosphere

GitLeap is a high-performance, low-latency **Terminal-Plus** environment for
AST compilation pipelines, repository transmutations, and live developer event
tracking.

The interface uses maximal data density, precise grid splits, and contiguous
run-length encoding. Linear gradients are prohibited across the interface
except for the single animated cosine-bell highlight sweep reserved for the
wordmark sheen and active progression metrics.

## Color Palette & Semantic Roles

All color assignments use exact hex values.

| Token | Hex Value | Semantic System Role |
| :--- | :--- | :--- |
| `COLOR.accent` | `#00E5A3` | Transmuter Cyan: Primary action focus, active cursor pins, successful execution states. |
| `COLOR.primary` | `#7C3AED` | Pipeline Purple: Git/AI orchestration space background anchor and base progress metric color. |
| `COLOR.textNormal` | `#F8FAFC` | Token Text: Crisp, high-contrast off-white for reading configurations and raw terminal logs. |
| `COLOR.textMuted` | `#64748B` | Diminished Text: Muted slate for file paths, commit hashes, inactive tabs, timestamp data. |
| `COLOR.bgCanvas` | `#0B0F19` | Deep Terminal Canvas: Dark, saturated blue-gray background canvas. |
| `COLOR.good` | `#00E5A3` | Success Flag: Pristine states, complete refactors, stable compilation. |
| `COLOR.warn` | `#F59E0B` | Worker Warning: Amber indicator for cache misses, rate limits, AI self-correction loops. |
| `COLOR.bad` | `#EF4444` | Compile Error: Crimson indicator for syntax failures, blockages, malicious injection attempts. |

## Typography & Interface Glyphs

Terminal interfaces rely on monospace box-drawing primitives and diagnostic
character glyphs.

```typescript
export const ICON = {
  success: '✓',
  prompt: '❯',
  pause: '⏸',
  folder: '📂',
  primitive: '🔹',
  manifest: '⚙',
  guide: '📝',
  package: '📦',
  spinner: '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
} as const;
```

## Layout & Focus-Aware Boxing

GitLeap uses explicit visual boxes with structural panel borders. Borders adapt
dynamically to terminal focus.

```typescript
export const RULE = {
  borderFocused: '#00E5A3',
  borderUnfocused: '#1E293B',
  dividerHorizontal: '#1E293B'
} as const;

export const GUTTER = {
  paddingLeft: 2,
  paddingRight: 2
} as const;
```

Split panel geometry uses `╭─ Title ───╮`. Focused geometry renders in
`#00E5A3`; unfocused geometry renders in `#1E293B`.

## Animation Mathematical Equations

Animation is stateless and deterministic. The headless cosine-bell
configuration provides identical output for live terminal frames and static
Markdown SVG vectors.

```typescript
export const SHEEN_CONFIG = {
  SHEEN_PEAK: 1.0,
  SHEEN_RADIUS: 6.0,
  SHEEN_TICK_MS: 50,
  SHEEN_SPEED: 0.4,
  SHEEN_MAX: 100,
} as const;
```

The cosine-bell intensity distribution is:

```text
Distance = |cellIndex - sheenCenter|
If Distance >= SHEEN_RADIUS => Intensity = 0
Else => Intensity = 0.5 * (1 + cos(pi * Distance / SHEEN_RADIUS)) * SHEEN_PEAK
```

The intensity factor is passed into `lerpHex` to morph base
`COLOR.primary` (`#7C3AED`) into the bright brand sheen highlight
`COLOR.accent` (`#00E5A3`).

## Implementation Architecture

GitLeap is Rezi-first. React and Ink primitives are fully deprecated for canvas
layout and terminal rendering. Layout calculations map raw bytes or strings to
flat text grids.

Adjacent cells sharing identical hex colors are collected into combined `Run[]`
structures before writing to the terminal stream. Directional lists, tabs, and
menus use strict modulo wrapping:

```typescript
(nextIndex + length) % length
```

The pure implementation lives in `packages/design/src/`. The CLI consumes the
package through its compatibility surface in `apps/cli/src/theme.ts`.

## Design System AI Guardrails

### Do

- Reuse the global `lerpHex` helper for cell transitions.
- Use `COLOR.textMuted` (`#64748B`) for structural metadata, file locations,
  hashes, and timestamps.
- Swap boundary lines to `RULE.borderFocused` when a component intercepts active
  keyboard input.
- Apply `GUTTER` horizontal padding to standard layout elements.

### Do not

- Introduce full multi-color backgrounds or rainbow terminal styles.
- Render gradients anywhere except designated wordmark canvas lines and active
  `ProgressBar` ticks.
- Drop standard elements into the layout without the `GUTTER` offsets.
