# EventFlow

**The AI Operating System for Events** — Plan. Budget. Cater. Automate.

Premium enterprise web application for Czech event agencies. Built with Vite + React + TypeScript.

## Features

- Fullscreen hero & interactive dashboard (metrics, calendar, charts)
- Agency registration with VOP/GDPR consent gating & 4-tier subscriptions
- Neural AI Planner (Czech prompts → timeline, budget, catering, checklist)
- Automatic document IDs (CN/SOD/F/PP + 2026)
- AI Vision menu scanner & printable PDF layouts
- Staff management & WhatsApp coordinator
- Client portal with canvas signature & Smart-Faktura (QR Platba)
- AI legal audit & debt collection forms

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
| BUSINESS | 2,890 CZK/mo | AI Scanner, VAT budget, portal, legal |
| ENTERPRISE | 5,990 CZK/mo | AI Vision photo scan, print PDF, Supabase-ready |

## Stack

Vite · React 19 · TypeScript · Zustand · Framer Motion · Recharts · jsPDF · qrcode.react
