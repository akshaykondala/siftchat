# siftchat — Project Context for Claude

## What this app is
A group trip planning app that makes trips "make it out the groupchat." The core problem: friend groups always talk about trips but never commit. siftchat spoon-feeds the planning and holds everyone accountable through social visibility.

**Live site:** https://siftchat.xyz  
**Stack:** React + TypeScript + Tailwind + Framer Motion, Express + Drizzle ORM + PostgreSQL, Railway deployment  
**AI assistant:** Pip (the purple character) — powered by GPT-4o

---

## Core product thesis
The problem isn't planning — it's commitment and accountability. When your friend hasn't booked their flight and everyone can see it, social pressure does the work. Make flaking visible.

---

## Bug fixes / polish todo
<!-- Add items here anytime. Priorities: P0 = fix now, P1 = soon, P2 = nice to have -->

| Priority | Item | Notes |
|----------|------|-------|
| P1 | Email Pip icon looks weird | The Pip SVG in the invite email header looks off — needs fixing |

---

## Roadmap (priority order)

### 1. Email invites (start here)
- Invite friends to a trip scrapbook directly via email from inside the app
- Sends a join link — no more manually copying and sharing URLs
- Should feel personal, not spammy

### 2. Commitment cards (core accountability feature)
- Each participant gets a personal checklist card per trip:
  - "Booked my flight" ✓
  - "Booked the Airbnb / lodging" ✓
- Everyone can see everyone else's status (green = booked, red/gray = not yet)
- Social visibility is the whole mechanic — you don't want to be the only red card
- This replaces the current "flightsBooked" boolean on the trip level with per-person tracking

### 3. Deadlines + Pip nudges
- Set a "book by" date for flights and lodging when creating/planning the trip
- Pip automatically sends a reminder message as the deadline approaches for anyone who hasn't checked off
- One nudge, not spam

### 4. Trip deposit / commitment pledge (longer term)
- Optional: each person puts a small stake in via Stripe to prove they're serious
- Refunded when they check off their booking confirmation
- Creates real skin in the game

---

## Current app state (as of April 2026)
- Auth: email/password + Google OAuth (JWT-based)
- Dashboard: polaroid-style scrapbook cards per trip
- Group/trip page: Pip AI chat, trip plan sidebar, alternatives voting, activity suggestions
- Trip locking: "Lock this trip" feature exists
- Flight scraping: when a flight URL is finalized via @pip, it scrapes route/date info
- Presence indicators and typing indicators in chat
- Deployed on Railway, custom domain siftchat.xyz, DB on Railway Postgres

## Key files
- `client/src/pages/dashboard.tsx` — scrapbook home page
- `client/src/pages/group.tsx` — main trip planning page (very large)
- `server/routes.ts` — all API routes + Pip AI logic
- `server/storage.ts` — all DB queries
- `shared/schema.ts` — Drizzle schema (source of truth for DB)
- `client/src/hooks/use-auth.ts` — shared auth store
- `client/src/components/pip-character.tsx` — Pip SVG character

## Deployment
- Railway auto-deploys on push to `main`
- Build command: `npm install --include=dev && npm run build && npm run db:push`
- Start command: `npm start`
- After schema changes always run: `DATABASE_URL="postgresql://postgres:REDACTED@roundhouse.proxy.rlwy.net:23925/railway" npm run db:push`
