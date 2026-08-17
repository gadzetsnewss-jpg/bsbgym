# BSB FitForge

Professional cloud-based **Gym Management ERP / SaaS** for fitness businesses in 2026.

This repository currently contains the **Phase 0 foundation** — a clean, scalable application shell and design system that all future modules plug into without restructuring the project.

> **Phase 0 scope:** application shell, design system, navigation, dashboard with mock data, login-ready structure. No database, no real authentication, no billing/GST logic yet.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Web framework | [Next.js](https://nextjs.org) (App Router, TypeScript) |
| Styling | [Tailwind CSS](https://tailwindcss.com) v4 (CSS-first theme) |
| Backend / database | Supabase / PostgreSQL (Phase 1+, environment-ready) |
| Auth | Supabase Auth (Phase 1+) |
| Security | Supabase RLS + RBAC (Phase 1+) |
| Storage / Realtime | Supabase Storage / Realtime (Phase 1+) |
| Icons | [lucide-react](https://lucide.dev) |

Native Android apps (Kotlin + Jetpack Compose) and AI features are planned for later phases.

---

## Getting started

```bash
# Install dependencies
npm install

# Copy env template (values only needed in Phase 1)
cp .env.example .env.local

# Start the dev server
npm run dev
```

Open http://localhost:3000 — the app redirects to the `/dashboard` route.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | Run the TypeScript checker (`tsc --noEmit`) |

---

## Project structure

```
src/
├── app/
│   ├── (app)/            # Authenticated shell (sidebar, header, pages)
│   │   ├── dashboard/    # Phase 0 dashboard (mock data)
│   │   └── …/            # Module placeholder routes (members, billing, …)
│   ├── (auth)/login/     # Login-ready screen (Supabase Auth in Phase 1)
│   ├── layout.tsx        # Root layout (fonts, toasts)
│   └── globals.css       # Design tokens & theme
├── components/
│   ├── ui/               # Reusable primitives (Button, DataTable, Modal, …)
│   ├── layout/           # Sidebar, Header, breadcrumbs, logo, shell
│   ├── dashboard/        # Dashboard building blocks
│   └── modules/          # Module placeholder page component
├── config/
│   └── navigation.ts     # Single source of truth for all routes/sections
├── data/                 # Mock data layer (swap for Supabase in Phase 1)
├── hooks/                # useSidebar, useMediaQuery, …
├── lib/
│   ├── env.ts            # Centralized environment access
│   ├── supabase/         # Client/server helpers + type stubs (Phase 1)
│   └── utils.ts          # cn() class-merge helper
└── types/                # Shared TypeScript contracts
```

---

## Design system

All primitives live in `src/components/ui/` and are reused by every future module:

`Button` · `Card` · `Badge`/`StatusBadge` · `Input` · `Textarea` · `Select` · `Checkbox` · `Label` · `DataTable` · `Pagination` · `SearchBar` · `FilterBar` · `FormSection` · `FormField` · `Modal` · `Drawer` · `ConfirmDialog` · `Dropdown` · `Tabs` · `EmptyState` · `LoadingState` · `ErrorState` · `Skeleton` · `Toast` · `PageHeader` · SVG `chart` primitives

### Visual language

- **80–90% clean neutral surfaces** (white / light grey), 10–20% brand color
- **Teal/Cyan** primary brand color, deep teal for navigation & primary actions
- **Purple/Magenta** used sparingly as an accent (e.g. the logo gradient)
- Dark charcoal text, rounded cards, subtle borders, minimal shadows
- Responsive: desktop-first, fully responsive; mobile has an off-canvas sidebar

### Accessibility

Semantic HTML, labelled controls, visible focus rings, keyboard-friendly menus/tabs/dialogs, focus trapping, `prefers-reduced-motion` support, ARIA landmarks and live regions for toasts.

---

## Architecture notes

- **Navigation is data-driven.** Add a new module by appending an entry to `src/config/navigation.ts` — the sidebar, breadcrumbs, global search and page headers pick it up automatically.
- **Business logic stays out of the UI.** Mock data lives in `src/data/`; Phase 1 replaces these modules with Supabase-backed repositories that return the same shapes (`src/types/`).
- **No fake credentials.** Supabase helpers (`src/lib/supabase/`) only create a client when real env vars exist. Copy `.env.example` → `.env.local` when ready.

---

## Phase roadmap (high level)

| Phase | Focus |
| --- | --- |
| **0 (this)** | Application shell, design system, navigation, dashboard with mock data |
| **1** | Supabase schema, Auth, RLS/RBAC, replace mock data with real repositories |
| **2** | Members, memberships, billing, invoices, GST, payments |
| **3** | Attendance, trainers, fitness, classes, POS, inventory |
| **4** | CRM, finance, reports, notifications, member portal |
| **5** | Native Android apps (Member / Trainer / Owner) |

---

## Deployment

The app deploys to Vercel as a standard Next.js project. Configure the `NEXT_PUBLIC_SUPABASE_*` environment variables when Phase 1 is implemented.
