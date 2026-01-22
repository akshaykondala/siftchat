# replit.md

## Overview

This is an AI-powered collaborative event planning application. Users create groups with shareable links, join via those links, chat in real-time, and an AI automatically summarizes the conversation into an actionable plan. The core use case is coordinating group events (dinners, meetups) without scrolling through chat history to find key details like time and location.

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
The application has five core entities:
1. **Groups** - Event containers with unique shareable slug URLs
2. **Participants** - Users who join groups (stored in localStorage per group)
3. **Messages** - Chat messages within groups
4. **Plans** - AI-generated summaries of group conversations (one per group)
5. **PlanVotes** - User votes on alternative event options (one vote per participant per group)

### Key Design Patterns
- **Shared Types**: Schema definitions in `shared/schema.ts` used by both client and server
- **Route Contracts**: API routes defined with Zod in `shared/routes.ts` for type-safe requests/responses
- **Storage Interface**: `IStorage` interface in `server/storage.ts` abstracts database operations
- **Polling for Real-time**: Messages poll every 3s, plans every 5s (simple approach vs WebSockets)

### Replit AI Integrations
Pre-configured OpenAI client modules exist in `server/replit_integrations/` for:
- Audio/voice chat with speech-to-text and text-to-speech
- Image generation
- Chat completions with streaming
- Batch processing utilities

These use environment variables `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`.

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Drizzle Kit**: Schema migrations with `npm run db:push`

### AI Services
- **OpenAI API** (via Replit AI Integrations): Used for generating plan summaries from chat messages
- Configured through `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Key NPM Packages
- `drizzle-orm` / `drizzle-zod`: Database ORM and schema validation
- `@tanstack/react-query`: Server state management
- `zod`: Runtime type validation
- `framer-motion`: Animation library
- `date-fns`: Date formatting
- `lucide-react`: Icon library