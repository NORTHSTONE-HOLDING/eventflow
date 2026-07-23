# EventFlow

**The AI Operating System for Events** — Plan. Budget. Cater. Automate.

Premium enterprise web application for Czech event agencies. Built with Vite + React + TypeScript.

## Features

- Fullscreen hero & interactive dashboard (metrics, calendar, charts, warehouse alerts)
- Agency registration with VOP/GDPR consent gating & 4-tier subscriptions
- Neural AI Planner (Czech prompts → timeline, budget, catering, checklist, warehouse)
- Automatic document IDs (CN/SOD/F/PP + 2026)
- **Event POS / Mobilní Kasa** — table map, split/mixed payments, custom items, live inventory odepisování
- **Sklad & Inventura (Supabase)** — cloud `inventory` + `inventory_logs`, AI Vision naskladnění faktury, mobilní inventura s EAN, A4 inventurní sestavy
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

### Optional cloud / AI keys (`.env`)

```bash
VITE_OPENAI_API_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Without Supabase keys the inventory module runs in **offline fallback** (localStorage). Apply SQL from `supabase/migrations/001_inventory.sql` in the Supabase SQL editor when going online.

## Subscription gating

| Tier | Price | Unlocks |
|------|-------|---------|
| LITE | 490 CZK/mo | Basic planning |
| TEAM | 1,490 CZK/mo | WhatsApp staff + billing |
| BUSINESS | 2,890 CZK/mo | AI Scanner, VAT budget, portal, legal, **Event POS**, **Sklad & Inventura** |
| ENTERPRISE | 5,990 CZK/mo | AI Vision photo scan, print PDF, full cloud |

## Stack

Vite · React 19 · TypeScript · Zustand · Supabase · Framer Motion · Recharts · jsPDF · qrcode.react
