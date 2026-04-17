# replit.md

## Overview

Sift Chat is an AI-powered group travel planning application. Users create trip groups with shareable links, join via their name (no account required), chat in real-time, and an AI (Pip) automatically extracts a structured trip plan from the conversation. The core use case is helping groups go from vague travel interest to a locked trip decision — covering destination, dates, budget, vibe, lodging, and who's actually coming.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state, with polling for real-time updates (3-5 second intervals)
- **UI Components**: Shadcn/ui component library with Radix primitives, styled with Tailwind CSS
- **Animations**: Framer Motion for smooth transitions and entry animations
- **Design System**: Custom violet/indigo color palette with CSS variables, using Outfit (display) and DM Sans (body) fonts

### Backend Architecture
- **Framework**: Express 5 running on Node.js with TypeScript
- **API Design**: REST endpoints defined in `shared/routes.ts` with Zod schemas for validation
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Build Process**: ESBuild for server bundling, Vite for client bundling

### Data Model
The application has nine entities (five legacy + four new travel planning tables):

**Legacy (preserved for backward compatibility):**
1. **Groups** - Trip containers with unique shareable slug URLs
2. **Participants** - Users who join groups (stored in localStorage per group)
3. **Messages** - Chat messages within groups
4. **Plans** - Legacy AI event summary (superseded by TripPlans)
5. **PlanVotes** - Legacy votes (superseded by TripAttendance)

**New Travel Planning Tables:**
6. **TripPlans** - Structured trip state: destination, dates, budget, vibe, lodging, confidence score, status, attendee lists, unresolved questions, winning alternative ID
7. **TripAlternatives** - Bundled trip options with support scores, vote counts, AI summary, evidence summary, attendee lists
8. **TripAttendance** - Per-participant commitment level (interested/likely/committed/unavailable) per alternative, from AI detection or explicit button press
9. **PipMessages** - Messages posted by the Pip AI helper bot, stored separately and interleaved in the chat feed

### Key Design Patterns
- **Shared Types**: Schema definitions in `shared/schema.ts` used by both client and server
- **Route Contracts**: API routes defined with Zod in `shared/routes.ts` for type-safe requests/responses
- **Storage Interface**: `IStorage` interface in `server/storage.ts` abstracts all database operations
- **Polling for Real-time**: Messages poll every 3s (includes Pip messages interleaved), trip plan polls every 5s
- **Welcome Back Flow**: Returning users get a modal to continue as their saved identity or join as someone new
  - Participant ID stored in localStorage per group (`evite_participant_${slug}`)
  - Participants are included in `/api/groups/:slug` response
- **Fire-and-Forget AI**: Every new message triggers `analyzeTripChat()` in the background (non-blocking)
- **Interleaved Chat**: `GET /api/groups/:groupId/messages` returns user messages and Pip messages merged and sorted by timestamp, each with `isPip: true/false`

### AI Pipeline — analyzeTripChat()
Located in `server/routes.ts`. Called on every new message (fire-and-forget).

1. Reads last 60 messages for the group
2. Calls OpenAI gpt-4o with JSON mode to extract:
   - Main plan: destination, startDate, endDate, budgetBand, vibe, lodgingPreference, attendee lists, unresolved questions, confidenceScore
   - Trip alternatives: each with destination, dateRange, budget, vibe, aiSummary, evidenceSummary, supporter names
   - Attendance signals: per-participant commitment levels toward main plan or specific alternatives
   - Pip message decision: shouldPipSpeak (bool) + pipMessage (1-2 sentences)
3. Upserts trip plan with derived status (Early ideas → Narrowing options → Almost decided → Trip locked)
4. Matches AI alternatives to existing alternatives by destination/dateRange to preserve vote counts; creates new ones or dismisses stale ones
5. Computes supportScore = voteCount×3 + committed×2 + likely×1; sets winningAlternativeId if top score > 4
6. Stores AI-detected attendance signals as TripAttendance with source="ai"
7. Posts Pip message only if shouldPipSpeak=true AND last Pip message was >3 minutes ago (anti-spam)

### Trip Confidence / Status System
- **Early ideas**: < 3 messages or no destination detected
- **Narrowing options**: Has destination and ≥ 3 messages
- **Almost decided**: confidenceScore ≥ 55 and has destination
- **Trip locked**: confidenceScore ≥ 80 and ≥ 1 committed attendee and has destination

### API Endpoints
- `POST /api/groups` — Create group
- `GET /api/groups/:slug` — Get group with participants
- `POST /api/groups/:slug/join` — Join as participant
- `GET /api/groups/:groupId/messages` — List messages (user + Pip, merged)
- `POST /api/groups/:groupId/messages` — Send message (triggers AI)
- `GET /api/groups/:groupId/trip` — Get current trip plan
- `GET /api/groups/:groupId/trip/alternatives` — List active alternatives
- `POST /api/groups/:groupId/trip/alternatives/:id/vote` — Vote on alternative
- `POST /api/groups/:groupId/trip/attendance` — Update attendance stance

### Replit AI Integrations
Pre-configured OpenAI client at `server/replit_integrations/audio/client.ts`.
Uses `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`.

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Drizzle Kit**: Schema migrations with `npm run db:push`

### AI Services
- **OpenAI API** (via Replit AI Integrations): gpt-4o for trip extraction and Pip messages

### Key NPM Packages
- `drizzle-orm` / `drizzle-zod`: Database ORM and schema validation
- `@tanstack/react-query`: Server state management
- `zod`: Runtime type validation
- `framer-motion`: Animation library
- `date-fns`: Date formatting
- `lucide-react`: Icon library
