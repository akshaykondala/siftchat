## 🔴 P0 — Critical
- [ ] Mobile UI overhaul — continued; keyboard input and bottom buffer fixed this session, but need full audit of all screens (dashboard, auth, group header spacing)
- [ ] Rebuild Xcode app after `npx cap sync ios` — open Xcode, Debug signing, add Push Notifications + Background Modes capabilities, select iPhone, hit Run ▶

## 🟠 P1 — High
- [ ] Money on the line (deposits) — everyone puts $$ in when joining a trip, get it back when flight+lodging checked off; flakes lose their stake to the group fund (requires Stripe)
- [ ] Pip as real action-taker — Pip searches flights, pulls Airbnb listings in budget, drops vote cards — does things, doesn't just chat
- [ ] One-tap group decision cards — structured micro-decisions (pick a weekend, pick a city) with voting that actually resolves; replaces open-ended chat
- [ ] "Trip alive vs dead" status — brutal public health bar; if 3/5 people haven't tapped "I'm in" after 48hrs, trip auto-archives with a RIP card
- [ ] Post-trip scrapbook (keepsake) — after the trip, the planning thread + photos becomes a shareable card; gives people a reason to start planning in siftchat

## 🟡 P2 — Medium
- [ ] Stripe trip deposit — per-person pledge via Stripe, refunded on booking confirmation (deferred: start fresh next session)
- [ ] Pip voice bubbles when tapping off iPhone screen
- [ ] og-image.png (1200×630) needed in client/public/ for full visual link previews in iMessage/social

## ⚪ P3 — Low / Nice-to-have

## ✅ Done
- [x] OG/Twitter meta tags — title, description, og:image, twitter:card for social/iMessage link previews
- [x] pip.svg standalone asset added to public/
- [x] iOS keyboard fix — chat input now visible above keyboard (h-dvh on group container)
- [x] iOS keyboard dismiss layout shift fix — body position:fixed restored (prevents WKWebView pre-scroll), h-dvh handles keyboard resize
- [x] Trip Plan bottom buffer — removed double-counted pb-20 in TravelWorkspace content
- [x] Trip Plan header top padding tightened (1.5rem → 0.5rem above safe-area-inset)
- [x] Tab bar tightened — pt-3→pt-1.5, icons 20→18px, gap-1→gap-0.5; column pb 3rem→2.5rem
- [x] Email invites — send join link directly from app via Resend
- [x] Commitment cards — per-person flight & lodging tracking with social visibility
- [x] iOS safe area / notch padding on all headers and auth page
- [x] Lock page scroll (no web-wrapper bounce feel on iOS)
- [x] Fix expo-server-sdk CJS bundling crash (Railway deploy)
- [x] Trip progress bar — 5-step visual bar in sidebar
- [x] Pip-guided phases — proactive phase messages
- [x] Commitment nudge wall — Pip calls out non-committed after 24hrs
- [x] capacitor.config.ts: contentInset "always" → "never" (committed)
- [x] Fix Pip SVG in invite email header
- [x] Pip character redesign — friendlier colors, visible cheeks/smile, ball antenna, sway animation
- [x] Pip chat avatar redesign — same treatment, gentle bob animation
- [x] PipThinkingBubble — darting eyes while thinking, larger character, scroll-to-view fix
- [x] Splash screen — dark violet globe animation, Pip centered in orbital rings, tagline, CTA
- [x] Auth drawer — Pip flies via layoutId from globe to above form card, draggable handle to dismiss back
- [x] Dashboard login animation — Pip tumbles in from above on mount
