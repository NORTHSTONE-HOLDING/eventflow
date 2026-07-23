# EventFlow

**The AI Operating System for Events** — Plan. Budget. Cater. Automate.

Premium enterprise web application for Czech event agencies. Built with Vite + React + TypeScript.

## Features

- Fullscreen hero & interactive dashboard (metrics, calendar, charts, warehouse alerts)
- Agency registration with VOP/GDPR consent gating & 4-tier subscriptions
- Neural AI Planner (Czech prompts → timeline, budget, catering, checklist, warehouse)
- Automatic document IDs (CN/SOD/F/PP + 2026)
- **Event POS / Mobilní Kasa** — touch menu grid, live metrics, card/invoice/all-inclusive payments, 80mm receipt print, live inventory odepisování, doplatková faktura
- AI Vision menu scanner & printable PDF layouts
- Staff management & WhatsApp coordinator
- Client portal with canvas signature & Smart-Faktura (QR Platba)
- AI legal audit & debt collection forms

## Lifecycle loop

1. Czech AI prompt → 2. Quote + recipes + multi-VAT inventory → 3. Client signs via WhatsApp portal → 4. Deposit QR invoice → 5. **POS Kasa unlocks** → 6. Closure generates **Doplatková faktura** with bar extras

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Optional: set `VITE_OPENAI_API_KEY` in `.env` for live OpenAI parsing (client-side simulation is the default fallback).

## Subscription gating

| Tier | Price | Unlocks |
|------|-------|---------|
| LITE | 490 CZK/mo | Basic planning |
| TEAM | 1,490 CZK/mo | WhatsApp staff + billing |
| BUSINESS | 2,890 CZK/mo | AI Scanner, VAT budget, portal, legal, **Event POS** |
| ENTERPRISE | 5,990 CZK/mo | AI Vision photo scan, print PDF, Supabase-ready |

## Stack

Vite · React 19 · TypeScript · Zustand · Framer Motion · Recharts · jsPDF · qrcode.react
