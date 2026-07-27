# EventFlow — Agent Guide

EventFlow is a **client-side single-page app** (Vite + React 19 + TypeScript, Zustand state).
It has no backend of its own; Supabase and OpenAI are optional cloud add-ons.

## Cursor Cloud specific instructions

### Running the app
- Install deps: `npm install` (also handled by the startup update script).
- Dev server: `npm run dev` → http://localhost:5173/ (Vite). This is the command to use for development.
- Lint: `npm run lint` (oxlint). Build: `npm run build` (`tsc -b && vite build`).
- Node 20.19+/22.12+ is required (Vite 8). The default VM Node (v22.x) works.

### Env keys are optional (offline fallback)
- `.env` keys (`VITE_OPENAI_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) are all **optional**; see `.env.example`.
- Without OpenAI, the AI Planner + invoice Vision use a client-side Czech simulation.
- Without Supabase, inventory/sync run in an **offline fallback** backed by `localStorage`.
- Because state persists in `localStorage`, a returning session may skip the hero screen or show prior projects. Use a fresh/incognito profile to reproduce first-run flows.

### Routing notes
- Standalone routes exist for terminals/displays: `/pos-terminal`, `/pos/customer`, `/pos/kds`, `/portal`, `/staff-checkin`. The main workspace is at `/`.
- UI copy is primarily in Czech.

### Repo layout note
- The full application currently lives on the `cursor/eventflow-enterprise-app-60aa` branch. The `main` branch contains only a placeholder `README.md`, so a checkout of `main` will have no app code or `package.json`.
