import { pgTable, text, serial, integer, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === TABLE DEFINITIONS ===

export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  shareLinkSlug: text("share_link_slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  name: text("name").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  participantId: integer("participant_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Legacy plan table — preserved for backwards compatibility
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().unique(),
  summary: text("summary").default(""),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
});

// Legacy vote table — preserved for backwards compatibility
export const planVotes = pgTable("plan_votes", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  participantId: integer("participant_id").notNull(),
  alternativeIndex: integer("alternative_index").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === NEW TRAVEL PLANNING TABLES ===

export const tripPlans = pgTable("trip_plans", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().unique(),
  destination: text("destination"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  budgetBand: text("budget_band"),
  lodgingPreference: text("lodging_preference"),
  flightsBooked: boolean("flights_booked").default(false),
  flightSearchUrl: text("flight_search_url"),
  lastFlightRecoKey: text("last_flight_reco_key"),
  confidenceScore: integer("confidence_score").default(0),
  status: text("status").default("Early ideas"),
  likelyAttendeeNames: text("likely_attendee_names").array(),
  committedAttendeeNames: text("committed_attendee_names").array(),
  unresolvedQuestions: text("unresolved_questions").array(),
  winningAlternativeId: integer("winning_alternative_id"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tripAlternatives = pgTable("trip_alternatives", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  destination: text("destination"),
  dateRange: text("date_range"),
  budgetBand: text("budget_band"),
  lodgingPreference: text("lodging_preference"),
  aiSummary: text("ai_summary"),
  supportScore: real("support_score").default(0),
  voteCount: integer("vote_count").default(0),
  likelyAttendeeNames: text("likely_attendee_names").array(),
  committedAttendeeNames: text("committed_attendee_names").array(),
  evidenceSummary: text("evidence_summary"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// AI-detected and explicit per-participant support signals
export const supportSignals = pgTable("support_signals", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  participantId: integer("participant_id").notNull(),
  alternativeId: integer("alternative_id"), // null = main plan
  commitmentLevel: text("commitment_level").notNull(), // interested | likely | committed | unavailable
  source: text("source").notNull().default("ai"), // "ai" | "explicit"
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Pip AI helper messages shown in chat
export const pipMessages = pgTable("pip_messages", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const groupsRelations = relations(groups, ({ many, one }) => ({
  participants: many(participants),
  messages: many(messages),
  plan: one(plans, {
    fields: [groups.id],
    references: [plans.groupId],
  }),
  tripPlan: one(tripPlans, {
    fields: [groups.id],
    references: [tripPlans.groupId],
  }),
}));

export const participantsRelations = relations(participants, ({ one, many }) => ({
  group: one(groups, {
    fields: [participants.groupId],
    references: [groups.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  group: one(groups, {
    fields: [messages.groupId],
    references: [groups.id],
  }),
  participant: one(participants, {
    fields: [messages.participantId],
    references: [participants.id],
  }),
}));

export const plansRelations = relations(plans, ({ one }) => ({
  group: one(groups, {
    fields: [plans.groupId],
    references: [groups.id],
  }),
}));

// === BASE SCHEMAS ===

export const insertGroupSchema = createInsertSchema(groups).omit({ id: true, createdAt: true, shareLinkSlug: true });
export const insertParticipantSchema = createInsertSchema(participants).omit({ id: true, joinedAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===

export type Group = typeof groups.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type PlanVote = typeof planVotes.$inferSelect;
export type TripPlan = typeof tripPlans.$inferSelect;
export type TripAlternative = typeof tripAlternatives.$inferSelect;
export type SupportSignal = typeof supportSignals.$inferSelect;
export type PipMessage = typeof pipMessages.$inferSelect;

export type CreateGroupRequest = { name: string };
export type JoinGroupRequest = { name: string };
export type CreateMessageRequest = { content: string; participantId: number };
export type PlanResponse = Plan;

export type GroupWithDetails = Group & {
  participants: Participant[];
  plan?: Plan;
};

export type MessageWithParticipant = Message & {
  participantName: string;
};

// Chat message union: regular user messages + Pip messages, sorted by time
export type ChatMessage = (MessageWithParticipant & { isPip: false }) | (PipMessage & { isPip: true; participantName: string });

export type TripStatus = "Early ideas" | "Narrowing options" | "Almost decided" | "Trip locked";
export type CommitmentLevel = "interested" | "likely" | "committed" | "unavailable";

// Typed structure for AI extraction output
export interface AiTripExtraction {
  mainPlan: {
    destination: string | null;
    startDate: string | null;
    endDate: string | null;
    budgetBand: string | null;
    lodgingPreference: string | null;
    flightsBooked: boolean;
    flightSearchUrl: string | null;
    likelyAttendeeNames: string[];
    committedAttendeeNames: string[];
    unresolvedQuestions: string[];
  };
  confidenceScore: number;
  flightPipMessage: string | null;
  alternatives: AiAlternative[];
  attendanceSignals: AiAttendanceSignal[];
  shouldPipSpeak: boolean;
  pipMessage: string | null;
}

export interface AiAlternative {
  destination: string | null;
  dateRange: string | null;
  budgetBand: string | null;
  lodgingPreference: string | null;
  aiSummary: string | null;
  evidenceSummary: string | null;
  supporterNames: string[];
  committedNames: string[];
}

export interface AiAttendanceSignal {
  participantName: string;
  commitmentLevel: string;
  targetOption: string;
}
