# EventFlow — Agent Guide

EventFlow V1 is a **client-side single-page app** (Vite + React 19 + TypeScript, Tailwind CSS,
Zustand state). It has no backend of its own; all state is in-memory and everything runs on
localhost with zero native/desktop (Tauri) dependencies.

## Cursor Cloud specific instructions

### Running the app
- Install deps: `npm install` (also handled by the startup update script).
- Dev server: `npm run dev` → http://localhost:5173/ (Vite).
- Lint: `npm run lint` (oxlint). Build: `npm run build` (`tsc -b && vite build`).
- Node 20.19+/22.12+ is required (Vite 8). The default VM Node (v22.x) works.

### Stack notes
- Styling is **Tailwind CSS v3** (classic setup): `tailwind.config.js` + `postcss.config.js` +
  `@tailwind` directives in `src/index.css`. Custom brand color is `gold` (#D4AF37) and reusable
  component classes (`.btn`, `.card`, `.input`, `.badge`) live in the `@layer components` block.
- State is split into Zustand stores in `src/store/` (`useAuthStore`, `usePosStore`, `useKdsStore`,
  `useShiftStore`, `useCctvStore`, `useAuditStore`). Stores call each other via `getState()` — e.g.
  sending a POS order pushes KDS tickets and audit logs. State is **not persisted**, so a full page
  reload resets onboarding and shift data.
- TypeScript config is strict about erasable syntax: `verbatimModuleSyntax` + `erasableSyntaxOnly`
  are on, so use `import type` for type-only imports and avoid enums / parameter properties.

### Routing (react-router-dom v7)
- `/` — onboarding wizard until finished, then the main workspace (Dashboard, AI Plánovač,
  Tiskový lístek, Audit).
- Isolated terminals (guarded; redirect to `/` until onboarding is done):
  `/pos-terminal`, `/kds-kitchen`, `/kds-bar`, `/cctv-wall`.

### Demo gotchas
- Manager PIN for unlocking sent items, AI key, and shift closure is **1234** (`MANAGER_PIN`).
- ARES lookup (`src/lib/ares.ts`) tries the live public ARES API and silently falls back to a local
  simulation when the network/CORS blocks it — so the company step always resolves.
- Audio beeps use the Web Audio API and only start after a user gesture (browser autoplay policy);
  `navigator.vibrate` is a no-op on desktop. Neither is required for functionality.
- UI copy is in Czech.
