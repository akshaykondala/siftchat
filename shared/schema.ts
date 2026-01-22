import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// === TABLE DEFINITIONS ===

export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  shareLinkSlug: text("share_link_slug").notNull().unique(), // e.g. "dinner-friday-123"
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

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().unique(), // One plan per group
  summary: text("summary").default(""), // AI generated summary
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
});

// === RELATIONS ===

export const groupsRelations = relations(groups, ({ many, one }) => ({
  participants: many(participants),
  messages: many(messages),
  plan: one(plans, {
    fields: [groups.id],
    references: [plans.groupId],
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

export type CreateGroupRequest = { name: string };
export type JoinGroupRequest = { name: string }; // Participant name
export type CreateMessageRequest = { content: string; participantId: number };
export type PlanResponse = Plan;

export type GroupWithDetails = Group & {
  participants: Participant[];
  plan?: Plan;
};

export type MessageWithParticipant = Message & {
  participantName: string;
};
