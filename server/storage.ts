import { db } from "./db";
import {
  groups, participants, messages, plans, planVotes,
  tripPlans, tripAlternatives, supportSignals, pipMessages, pinboardItems, bookingCommitments, deviceTokens, users,
  userAvailability, flightOptions, itinerarySuggestions,
  type Group, type Participant, type Message, type Plan, type PlanVote,
  type TripPlan, type TripAlternative, type SupportSignal, type PipMessage, type PinboardItem,
  type BookingCommitment, type CommitmentLevel, type DeviceToken, type UserAvailability,
  type FlightOption, type ItinerarySuggestion,
} from "@shared/schema";
import { eq, desc, and, isNull, gte, lte, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  // Groups
  createGroup(name: string, createdByUserId?: number): Promise<Group>;
  getGroupBySlug(slug: string): Promise<Group | undefined>;
  getGroupById(id: number): Promise<Group | undefined>;

  // Participants
  createParticipant(groupId: number, name: string, role?: string): Promise<Participant>;
  getParticipant(id: number): Promise<Participant | undefined>;
  getParticipantsByGroup(groupId: number): Promise<Participant[]>;
  updateParticipantRole(groupId: number, participantId: number, role: string): Promise<Participant | undefined>;

  // Messages
  createMessage(groupId: number, participantId: number, content: string): Promise<Message>;
  getMessagesByGroup(groupId: number): Promise<(Message & { participantName: string })[]>;

  // Legacy plans (preserved)
  getPlanByGroup(groupId: number): Promise<Plan | undefined>;
  updatePlan(groupId: number, summary: string): Promise<Plan>;

  // Legacy votes (preserved)
  getVotesByGroup(groupId: number): Promise<PlanVote[]>;
  addVote(groupId: number, participantId: number, alternativeIndex: number): Promise<PlanVote>;
  removeVote(groupId: number, participantId: number): Promise<void>;

  // Trip Plans
  getTripPlanByGroup(groupId: number): Promise<TripPlan | undefined>;
  upsertTripPlan(groupId: number, data: Partial<Omit<TripPlan, "id" | "groupId">>): Promise<TripPlan>;

  // Trip Alternatives
  getTripAlternativesByGroup(groupId: number): Promise<TripAlternative[]>;
  getTripAlternativeById(id: number): Promise<TripAlternative | undefined>;
  insertTripAlternative(groupId: number, data: Partial<Omit<TripAlternative, "id" | "groupId" | "createdAt">>): Promise<TripAlternative>;
  updateTripAlternative(id: number, data: Partial<Omit<TripAlternative, "id" | "groupId" | "createdAt">>): Promise<TripAlternative>;
  dismissAlternative(id: number): Promise<void>;

  // Support Signals (AI-detected and explicit)
  getSupportSignalsByGroup(groupId: number): Promise<SupportSignal[]>;
  getSupportSignalsByParticipant(groupId: number, participantId: number): Promise<SupportSignal[]>;
  getSupportSignalsByAlternative(groupId: number, alternativeId: number): Promise<SupportSignal[]>;
  upsertSupportSignal(groupId: number, participantId: number, alternativeId: number | null, commitmentLevel: CommitmentLevel, source: "ai" | "explicit"): Promise<SupportSignal>;
  removeAiSupportSignalsByAlternative(groupId: number, alternativeId: number): Promise<void>;
  removeSupportSignal(groupId: number, participantId: number, alternativeId: number | null): Promise<void>;

  // Pip Messages
  getPipMessagesByGroup(groupId: number): Promise<PipMessage[]>;
  createPipMessage(groupId: number, content: string): Promise<PipMessage>;
  getLastPipMessage(groupId: number): Promise<PipMessage | undefined>;

  // Pinboard
  getPinboardItems(groupId: number): Promise<PinboardItem[]>;
  addPinboardItem(groupId: number, title: string, emoji: string, category: string, addedByName: string): Promise<PinboardItem>;
  removePinboardItem(id: number): Promise<void>;

  // Booking Commitments
  getCommitments(groupId: number): Promise<BookingCommitment[]>;
  upsertCommitment(groupId: number, participantId: number, data: { flightBooked?: boolean; lodgingStatus?: string }): Promise<BookingCommitment>;

  // User Availability
  getUserAvailability(userId: number, start?: string, end?: string): Promise<UserAvailability[]>;
  upsertUserAvailability(userId: number, entries: {date: string, status: string}[]): Promise<void>;
  getGroupAvailability(groupId: number, start?: string, end?: string): Promise<{
    participantId: number; participantName: string; userId: number; date: string; status: string;
  }[]>;

  // Flight Options
  getFlightOptions(groupId: number): Promise<FlightOption[]>;
  addFlightOption(groupId: number, data: { participantId: number; participantName: string; origin: string; airline?: string; price?: number; departureAt?: string; url?: string }): Promise<FlightOption>;
  deleteFlightOption(id: number): Promise<void>;
  selectFlightOption(groupId: number, participantId: number, optionId: number): Promise<void>;

  // Itinerary
  saveItineraryPrefs(groupId: number, prefs: Record<string, string>): Promise<void>;
  saveItinerary(groupId: number, itinerary: unknown): Promise<void>;
  saveTripEvents(groupId: number, events: unknown, scanKey: string): Promise<void>;
  getItinerarySuggestions(groupId: number): Promise<ItinerarySuggestion[]>;
  addItinerarySuggestion(groupId: number, data: { dayIndex: number; blockIndex: number; suggestion: string; proposedBy: string }): Promise<ItinerarySuggestion>;
  voteItinerarySuggestion(id: number, delta: 1 | -1): Promise<ItinerarySuggestion>;
  applyItinerarySuggestion(id: number): Promise<void>;

  // Group management
  updateGroupName(groupId: number, name: string): Promise<Group>;
  deleteGroup(groupId: number): Promise<void>;
  removeParticipant(groupId: number, participantId: number): Promise<void>;

  // Device tokens (push notifications)
  saveDeviceToken(userId: number, token: string, platform: string): Promise<DeviceToken>;
  getDeviceTokensByUserId(userId: number): Promise<string[]>;
  getDeviceTokensByGroup(groupId: number): Promise<string[]>;
  removeDeviceToken(userId: number, token: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createGroup(name: string, createdByUserId?: number): Promise<Group> {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomBytes(3).toString('hex');
    const [group] = await db.insert(groups).values({ name, shareLinkSlug: slug, createdByUserId }).returning();
    return group;
  }

  async getGroupBySlug(slug: string): Promise<Group | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.shareLinkSlug, slug));
    return group;
  }

  async getGroupById(id: number): Promise<Group | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    return group;
  }

  async createParticipant(groupId: number, name: string, role?: string): Promise<Participant> {
    const [participant] = await db.insert(participants).values({ groupId, name, ...(role ? { role } : {}) }).returning();
    return participant;
  }

  async updateParticipantRole(groupId: number, participantId: number, role: string): Promise<Participant | undefined> {
    const [participant] = await db.update(participants)
      .set({ role })
      .where(and(eq(participants.id, participantId), eq(participants.groupId, groupId)))
      .returning();
    return participant;
  }

  async getParticipant(id: number): Promise<Participant | undefined> {
    const [participant] = await db.select().from(participants).where(eq(participants.id, id));
    return participant;
  }

  async getParticipantsByGroup(groupId: number): Promise<Participant[]> {
    return db.select().from(participants).where(eq(participants.groupId, groupId));
  }

  async createMessage(groupId: number, participantId: number, content: string): Promise<Message> {
    const [message] = await db.insert(messages).values({ groupId, participantId, content }).returning();
    return message;
  }

  async getMessagesByGroup(groupId: number): Promise<(Message & { participantName: string })[]> {
    const result = await db
      .select({
        id: messages.id,
        groupId: messages.groupId,
        participantId: messages.participantId,
        content: messages.content,
        createdAt: messages.createdAt,
        participantName: participants.name,
      })
      .from(messages)
      .innerJoin(participants, eq(messages.participantId, participants.id))
      .where(eq(messages.groupId, groupId))
      .orderBy(messages.createdAt);
    return result;
  }

  async getPlanByGroup(groupId: number): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.groupId, groupId));
    return plan;
  }

  async updatePlan(groupId: number, summary: string): Promise<Plan> {
    const existing = await this.getPlanByGroup(groupId);
    if (existing) {
      const [updated] = await db
        .update(plans)
        .set({ summary, lastUpdatedAt: new Date() })
        .where(eq(plans.groupId, groupId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(plans).values({ groupId, summary }).returning();
      return created;
    }
  }

  async getVotesByGroup(groupId: number): Promise<PlanVote[]> {
    return db.select().from(planVotes).where(eq(planVotes.groupId, groupId));
  }

  async addVote(groupId: number, participantId: number, alternativeIndex: number): Promise<PlanVote> {
    await this.removeVote(groupId, participantId);
    const [vote] = await db.insert(planVotes).values({ groupId, participantId, alternativeIndex }).returning();
    return vote;
  }

  async removeVote(groupId: number, participantId: number): Promise<void> {
    await db.delete(planVotes).where(
      and(eq(planVotes.groupId, groupId), eq(planVotes.participantId, participantId))
    );
  }

  // === TRIP PLAN METHODS ===

  async getTripPlanByGroup(groupId: number): Promise<TripPlan | undefined> {
    const [plan] = await db.select().from(tripPlans).where(eq(tripPlans.groupId, groupId));
    return plan;
  }

  async upsertTripPlan(groupId: number, data: Partial<Omit<TripPlan, "id" | "groupId">>): Promise<TripPlan> {
    const existing = await this.getTripPlanByGroup(groupId);
    if (existing) {
      const [updated] = await db
        .update(tripPlans)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(tripPlans.groupId, groupId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(tripPlans)
        .values({ groupId, ...data })
        .returning();
      return created;
    }
  }

  // === TRIP ALTERNATIVE METHODS ===

  async getTripAlternativesByGroup(groupId: number): Promise<TripAlternative[]> {
    return db
      .select()
      .from(tripAlternatives)
      .where(and(eq(tripAlternatives.groupId, groupId), eq(tripAlternatives.status, "active")))
      .orderBy(desc(tripAlternatives.supportScore));
  }

  async getTripAlternativeById(id: number): Promise<TripAlternative | undefined> {
    const [alt] = await db.select().from(tripAlternatives).where(eq(tripAlternatives.id, id));
    return alt;
  }

  async insertTripAlternative(
    groupId: number,
    data: Partial<Omit<TripAlternative, "id" | "groupId" | "createdAt">>
  ): Promise<TripAlternative> {
    const [created] = await db
      .insert(tripAlternatives)
      .values({ groupId, ...data, updatedAt: new Date() })
      .returning();
    return created;
  }

  async updateTripAlternative(
    id: number,
    data: Partial<Omit<TripAlternative, "id" | "groupId" | "createdAt">>
  ): Promise<TripAlternative> {
    const [updated] = await db
      .update(tripAlternatives)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tripAlternatives.id, id))
      .returning();
    return updated;
  }

  async dismissAlternative(id: number): Promise<void> {
    await db
      .update(tripAlternatives)
      .set({ status: "dismissed", updatedAt: new Date() })
      .where(eq(tripAlternatives.id, id));
  }

  // === SUPPORT SIGNAL METHODS ===

  async getSupportSignalsByGroup(groupId: number): Promise<SupportSignal[]> {
    return db.select().from(supportSignals).where(eq(supportSignals.groupId, groupId));
  }

  async getSupportSignalsByParticipant(groupId: number, participantId: number): Promise<SupportSignal[]> {
    return db.select().from(supportSignals).where(
      and(eq(supportSignals.groupId, groupId), eq(supportSignals.participantId, participantId))
    );
  }

  async upsertSupportSignal(
    groupId: number,
    participantId: number,
    alternativeId: number | null,
    commitmentLevel: CommitmentLevel,
    source: "ai" | "explicit"
  ): Promise<SupportSignal> {
    // Explicit signals clear ALL existing rows (AI + explicit) for this slot — user choice wins.
    // AI signals only clear previous AI rows — they must not overwrite an explicit user choice.
    const whereClause = alternativeId === null
      ? and(eq(supportSignals.groupId, groupId), eq(supportSignals.participantId, participantId), isNull(supportSignals.alternativeId))
      : and(eq(supportSignals.groupId, groupId), eq(supportSignals.participantId, participantId), eq(supportSignals.alternativeId, alternativeId));
    if (source === "explicit") {
      await db.delete(supportSignals).where(whereClause);
    } else {
      await db.delete(supportSignals).where(and(whereClause, eq(supportSignals.source, "ai")));
    }
    const [record] = await db
      .insert(supportSignals)
      .values({ groupId, participantId, alternativeId, commitmentLevel, source, updatedAt: new Date() })
      .returning();
    return record;
  }

  async getSupportSignalsByAlternative(groupId: number, alternativeId: number): Promise<SupportSignal[]> {
    return db.select().from(supportSignals).where(
      and(eq(supportSignals.groupId, groupId), eq(supportSignals.alternativeId, alternativeId))
    );
  }

  async removeAiSupportSignalsByAlternative(groupId: number, alternativeId: number): Promise<void> {
    await db.delete(supportSignals).where(
      and(
        eq(supportSignals.groupId, groupId),
        eq(supportSignals.alternativeId, alternativeId),
        eq(supportSignals.source, "ai")
      )
    );
  }

  async removeSupportSignal(groupId: number, participantId: number, alternativeId: number | null): Promise<void> {
    if (alternativeId === null) {
      await db.delete(supportSignals).where(
        and(
          eq(supportSignals.groupId, groupId),
          eq(supportSignals.participantId, participantId),
          isNull(supportSignals.alternativeId)
        )
      );
    } else {
      await db.delete(supportSignals).where(
        and(
          eq(supportSignals.groupId, groupId),
          eq(supportSignals.participantId, participantId),
          eq(supportSignals.alternativeId, alternativeId)
        )
      );
    }
  }

  // === PIP MESSAGE METHODS ===

  async getPipMessagesByGroup(groupId: number): Promise<PipMessage[]> {
    return db
      .select()
      .from(pipMessages)
      .where(eq(pipMessages.groupId, groupId))
      .orderBy(pipMessages.createdAt);
  }

  async createPipMessage(groupId: number, content: string): Promise<PipMessage> {
    const [msg] = await db.insert(pipMessages).values({ groupId, content }).returning();
    return msg;
  }

  async getLastPipMessage(groupId: number): Promise<PipMessage | undefined> {
    const [msg] = await db
      .select()
      .from(pipMessages)
      .where(eq(pipMessages.groupId, groupId))
      .orderBy(desc(pipMessages.createdAt))
      .limit(1);
    return msg;
  }

  // === PINBOARD METHODS ===

  async getPinboardItems(groupId: number): Promise<PinboardItem[]> {
    return db.select().from(pinboardItems).where(eq(pinboardItems.groupId, groupId)).orderBy(pinboardItems.createdAt);
  }

  async addPinboardItem(groupId: number, title: string, emoji: string, category: string, addedByName: string): Promise<PinboardItem> {
    const [item] = await db.insert(pinboardItems).values({ groupId, title, emoji, category, addedByName }).returning();
    return item;
  }

  async removePinboardItem(id: number): Promise<void> {
    await db.delete(pinboardItems).where(eq(pinboardItems.id, id));
  }

  // === BOOKING COMMITMENT METHODS ===

  async getCommitments(groupId: number): Promise<BookingCommitment[]> {
    return db.select().from(bookingCommitments).where(eq(bookingCommitments.groupId, groupId));
  }

  async upsertCommitment(groupId: number, participantId: number, data: { flightBooked?: boolean; lodgingStatus?: string }): Promise<BookingCommitment> {
    const [existing] = await db.select().from(bookingCommitments).where(
      and(eq(bookingCommitments.groupId, groupId), eq(bookingCommitments.participantId, participantId))
    );
    if (existing) {
      const [updated] = await db.update(bookingCommitments)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(bookingCommitments.groupId, groupId), eq(bookingCommitments.participantId, participantId)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(bookingCommitments)
      .values({ groupId, participantId, ...data })
      .returning();
    return created;
  }

  // === FLIGHT OPTIONS ===

  async getFlightOptions(groupId: number): Promise<FlightOption[]> {
    return db.select().from(flightOptions).where(eq(flightOptions.groupId, groupId)).orderBy(flightOptions.price);
  }

  async addFlightOption(groupId: number, data: { participantId: number; participantName: string; origin: string; airline?: string; price?: number; departureAt?: string; url?: string }): Promise<FlightOption> {
    const [opt] = await db.insert(flightOptions).values({ groupId, ...data }).returning();
    return opt;
  }

  async deleteFlightOption(id: number): Promise<void> {
    await db.delete(flightOptions).where(eq(flightOptions.id, id));
  }

  async selectFlightOption(groupId: number, participantId: number, optionId: number): Promise<void> {
    // Deselect all options for this participant, then select the chosen one
    await db.update(flightOptions).set({ selected: false })
      .where(and(eq(flightOptions.groupId, groupId), eq(flightOptions.participantId, participantId)));
    await db.update(flightOptions).set({ selected: true })
      .where(and(eq(flightOptions.id, optionId), eq(flightOptions.participantId, participantId)));
  }

  // === ITINERARY ===

  async saveItineraryPrefs(groupId: number, prefs: Record<string, string>): Promise<void> {
    await this.upsertTripPlan(groupId, { itineraryPrefs: JSON.stringify(prefs) });
  }

  async saveItinerary(groupId: number, itinerary: unknown): Promise<void> {
    await this.upsertTripPlan(groupId, { itinerary: JSON.stringify(itinerary) });
  }

  async saveTripEvents(groupId: number, events: unknown, scanKey: string): Promise<void> {
    await this.upsertTripPlan(groupId, { events: JSON.stringify(events), eventsScanKey: scanKey, eventsScannedAt: new Date() });
  }

  async getItinerarySuggestions(groupId: number): Promise<ItinerarySuggestion[]> {
    return db.select().from(itinerarySuggestions).where(eq(itinerarySuggestions.groupId, groupId)).orderBy(desc(itinerarySuggestions.votes));
  }

  async addItinerarySuggestion(groupId: number, data: { dayIndex: number; blockIndex: number; suggestion: string; proposedBy: string }): Promise<ItinerarySuggestion> {
    const [s] = await db.insert(itinerarySuggestions).values({ groupId, ...data }).returning();
    return s;
  }

  async voteItinerarySuggestion(id: number, delta: 1 | -1): Promise<ItinerarySuggestion> {
    const [s] = await db.update(itinerarySuggestions)
      .set({ votes: sql`${itinerarySuggestions.votes} + ${delta}` })
      .where(eq(itinerarySuggestions.id, id))
      .returning();
    return s;
  }

  async applyItinerarySuggestion(id: number): Promise<void> {
    await db.update(itinerarySuggestions).set({ applied: true }).where(eq(itinerarySuggestions.id, id));
  }

  async updateGroupName(groupId: number, name: string): Promise<Group> {
    const [group] = await db.update(groups).set({ name }).where(eq(groups.id, groupId)).returning();
    return group;
  }

  async deleteGroup(groupId: number): Promise<void> {
    await db.delete(flightOptions).where(eq(flightOptions.groupId, groupId));
    await db.delete(itinerarySuggestions).where(eq(itinerarySuggestions.groupId, groupId));
    await db.delete(bookingCommitments).where(eq(bookingCommitments.groupId, groupId));
    await db.delete(pinboardItems).where(eq(pinboardItems.groupId, groupId));
    await db.delete(pipMessages).where(eq(pipMessages.groupId, groupId));
    await db.delete(supportSignals).where(eq(supportSignals.groupId, groupId));
    await db.delete(tripAlternatives).where(eq(tripAlternatives.groupId, groupId));
    await db.delete(tripPlans).where(eq(tripPlans.groupId, groupId));
    await db.delete(messages).where(eq(messages.groupId, groupId));
    await db.delete(participants).where(eq(participants.groupId, groupId));
    await db.delete(groups).where(eq(groups.id, groupId));
  }

  async removeParticipant(groupId: number, participantId: number): Promise<void> {
    await db.delete(bookingCommitments).where(
      and(eq(bookingCommitments.groupId, groupId), eq(bookingCommitments.participantId, participantId))
    );
    await db.delete(flightOptions).where(
      and(eq(flightOptions.groupId, groupId), eq(flightOptions.participantId, participantId))
    );
    await db.delete(participants).where(
      and(eq(participants.id, participantId), eq(participants.groupId, groupId))
    );
  }

  // === DEVICE TOKEN METHODS ===

  async saveDeviceToken(userId: number, token: string, platform: string): Promise<DeviceToken> {
    // Upsert — if the token already exists just reactivate it
    const existing = await db.select().from(deviceTokens).where(eq(deviceTokens.token, token));
    if (existing.length > 0) {
      const [updated] = await db.update(deviceTokens)
        .set({ userId, platform, isActive: true })
        .where(eq(deviceTokens.token, token))
        .returning();
      return updated;
    }
    const [record] = await db.insert(deviceTokens)
      .values({ userId, token, platform, isActive: true })
      .returning();
    return record;
  }

  async getDeviceTokensByUserId(userId: number): Promise<string[]> {
    const rows = await db.select({ token: deviceTokens.token })
      .from(deviceTokens)
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.isActive, true)));
    return rows.map((r) => r.token);
  }

  async getDeviceTokensByGroup(groupId: number): Promise<string[]> {
    // participants(groupId) → userId → device_tokens
    const rows = await db
      .select({ token: deviceTokens.token })
      .from(participants)
      .innerJoin(deviceTokens, eq(deviceTokens.userId, participants.userId))
      .where(and(eq(participants.groupId, groupId), eq(deviceTokens.isActive, true)));
    // Deduplicate in case a user is in the group multiple times
    return Array.from(new Set(rows.map((r) => r.token)));
  }

  async removeDeviceToken(userId: number, token: string): Promise<void> {
    await db.update(deviceTokens)
      .set({ isActive: false })
      .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token)));
  }

  // === USER AVAILABILITY METHODS ===

  async getUserAvailability(userId: number, start?: string, end?: string): Promise<UserAvailability[]> {
    const conditions = [eq(userAvailability.userId, userId)];
    if (start) conditions.push(gte(userAvailability.date, start));
    if (end) conditions.push(lte(userAvailability.date, end));
    return db.select().from(userAvailability).where(and(...conditions)).orderBy(userAvailability.date);
  }

  async upsertUserAvailability(userId: number, entries: {date: string, status: string}[]): Promise<void> {
    const toUpsert = entries.filter(e => e.status !== "unset" && e.status);
    const toDelete = entries.filter(e => e.status === "unset" || !e.status).map(e => e.date);

    if (toUpsert.length > 0) {
      await db.insert(userAvailability)
        .values(toUpsert.map(e => ({ userId, date: e.date, status: e.status })))
        .onConflictDoUpdate({
          target: [userAvailability.userId, userAvailability.date],
          set: { status: sql`excluded.status`, updatedAt: new Date() },
        });
    }
    if (toDelete.length > 0) {
      await db.delete(userAvailability).where(
        and(eq(userAvailability.userId, userId), inArray(userAvailability.date, toDelete))
      );
    }
  }

  async getGroupAvailability(groupId: number, start?: string, end?: string): Promise<{
    participantId: number; participantName: string; userId: number; date: string; status: string;
  }[]> {
    const groupParticipants = await db
      .select({ id: participants.id, name: participants.name, userId: participants.userId })
      .from(participants)
      .where(eq(participants.groupId, groupId));

    const linkedParticipants = groupParticipants.filter(p => p.userId !== null);
    if (linkedParticipants.length === 0) return [];

    const userIds = linkedParticipants.map(p => p.userId!);
    const conditions = [inArray(userAvailability.userId, userIds)];
    if (start) conditions.push(gte(userAvailability.date, start));
    if (end) conditions.push(lte(userAvailability.date, end));

    const avail = await db.select().from(userAvailability).where(and(...conditions));

    const userToParticipant = new Map(linkedParticipants.map(p => [p.userId!, p]));

    return avail.map(a => {
      const p = userToParticipant.get(a.userId)!;
      return { participantId: p.id, participantName: p.name, userId: a.userId, date: a.date, status: a.status };
    });
  }
}

export const storage = new DatabaseStorage();
