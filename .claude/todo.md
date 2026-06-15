## 🔴 P0 — Critical
- [ ] Mobile UI overhaul — full audit of all screens (dashboard, auth, group header spacing) on device
- [ ] Rebuild Xcode app after `npx cap sync ios` — open Xcode, Debug signing, add Push Notifications + Background Modes capabilities, select iPhone, hit Run ▶
- [ ] **Itinerary: Per-block autonomy override** — let a single day/block override the global dial (e.g. trip is "Plan it all" but Saturday evening is "we vote"). Global dial + inline edit shipped; per-block override deferred from first pass.
- [ ] **Itinerary: Event Radar ticketed APIs** — layer Ticketmaster/SeatGeek/Bandsintown/RA/Songkick behind the TripEvent interface. NOTE: events stay a BONUS ("oh btw there's an event here"), never a primary planner driver.
- [ ] **Itinerary: Event Radar proactive scan** — re-scan at T-2wk / T-1wk; ping ONLY for big new announcements, sellout risk, or book-by deadlines (max ~1/scan).

## 🟠 P1 — High
- [ ] Pip as real action-taker — Pip searches flights, pulls Airbnb listings in budget, drops vote cards — does things, doesn't just chat
- [ ] One-tap group decision cards — structured micro-decisions (pick a weekend, pick a city) with voting that actually resolves
- [ ] "Trip alive vs dead" status — brutal public health bar; if 3/5 people haven't tapped "I'm in" after 48hrs, trip auto-archives with a RIP card
- [ ] **Itinerary: Logistics auto-solver** — per-block travel time + geo-clustering, reservation lead-times, parking, hours, cash-only, dress code; wire "book-by" into deadlines/nudges
- [ ] **Itinerary: Source citations + social proof** — each event/spot links to its source (TikTok/IG/article) with "trending" signal so it feels current, not generic
- [ ] **Itinerary: Weather- & crew-aware scheduling** — forecast-driven indoor alternates + sunset times; respect each person's availability (late arrival / early exit auto-trims day 1 / last day)

## 🟡 P2 — Medium
- [ ] Money on the line (deposits) — everyone puts $$ in when joining a trip, get it back when flight+lodging checked off (requires Stripe)
- [ ] Post-trip scrapbook (keepsake) — planning thread + photos becomes a shareable card after the trip
- [ ] Pip voice bubbles when tapping off iPhone screen
- [ ] og-image.png (1200×630) needed in client/public/ for full visual link previews
- [ ] **Itinerary: Budget rollup** — per-person estimated cost computed from itinerary blocks
- [ ] **Itinerary: Booking handoffs** — one-tap deep links (Resy/OpenTable/Ticketmaster) that flow into commitment cards
- [ ] **Itinerary: Calendar export + shareable itinerary card**
- [ ] **Itinerary: During-trip "day-of" mode** — reshuffle on the fly ("running late, redo my afternoon")
- [ ] **Itinerary: Locals-only vs tourist toggle**

## ⚪ P3 — Low / Nice-to-have

## ✅ Done
- [x] Itinerary: Event Radar (web-search half) — date+location event scan woven in as a bonus, "Happening while you're there" feed with source links, auto-scan + Pip ping
- [x] Itinerary: Autonomy dial — global Plan-it-all / Suggest-&-vote / I'll-drive modes; one-tap full plan, blank scaffold + inline block editing for manual, vote flow gated by mode
- [x] Group availability panel collapsed by default in trip sidebar — one-tap reveal button, Pip uses it not users
- [x] Pip deduplication — prevent double messages in same processing run (phase guidance skips if pipMessage already posted this run)
- [x] Pip date/location extraction — improved prompt: handles natural language, relative dates, month-only ranges, always detecting destination + dates across all message formats
- [x] Itinerary suggestion apply — wipe old cost/transport/notes when suggestion wins majority vote
- [x] Trip sidebar reorg — 4 phase-aware collapsible sections (Trip/Crew/Book/Itinerary), removed "Crew in" progress step
- [x] Owner/Editor/Guest permissions — role column, server guards, Members panel, role gating
- [x] Trip Setup wizard — owner fast-path to fill/skip phases + Jump to Itinerary for already-booked groups
- [x] 5-step progress rail — pulsing current step, CTA text, Pip nudge per step (24hr dedup)
- [x] Flight options panel — per-participant multi-option tracking, cheapest badge, group price summary
- [x] Itinerary generator — intake form, GPT-4o day-by-day, collapsible accordion, block suggestions, upvote/apply
- [x] Availability calendar — binary busy/free, two-tap range selection, dashboard CTA banner
- [x] OG/Twitter meta tags — title, description, og:image, twitter:card for social/iMessage link previews
- [x] pip.svg standalone asset added to public/
- [x] iOS keyboard fix — chat input now visible above keyboard (h-dvh on group container)
- [x] iOS keyboard dismiss layout shift fix — body position:fixed restored, h-dvh handles keyboard resize
- [x] Trip Plan bottom buffer — removed double-counted pb-20 in TravelWorkspace content
- [x] Email invites — send join link directly from app via Resend
- [x] Commitment cards — per-person flight & lodging tracking with social visibility
- [x] iOS safe area / notch padding on all headers and auth page
- [x] Lock page scroll (no web-wrapper bounce feel on iOS)
- [x] Trip progress bar — 5-step visual bar in sidebar
- [x] Pip-guided phases — proactive phase messages
- [x] Commitment nudge wall — Pip calls out non-committed after 24hrs
- [x] Fix Pip SVG in invite email header
- [x] Pip character redesign — friendlier colors, visible cheeks/smile, ball antenna, sway animation
- [x] Pip chat avatar redesign — same treatment, gentle bob animation
- [x] PipThinkingBubble — darting eyes while thinking, larger character, scroll-to-view fix
- [x] Splash screen — dark violet globe animation, Pip centered in orbital rings, tagline, CTA
- [x] Auth drawer — Pip flies via layoutId from globe to above form card, draggable handle to dismiss back
- [x] Dashboard login animation — Pip tumbles in from above on mount
