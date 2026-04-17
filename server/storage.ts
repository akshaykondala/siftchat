import { db } from "./db";
import {
  groups, participants, messages, plans, planVotes,
  tripPlans, tripAlternatives, supportSignals, pipMessages,
  type Group, type Participant, type Message, type Plan, type PlanVote,
  type TripPlan, type TripAlternative, type SupportSignal, type PipMessage,
  type CommitmentLevel,
} from "@shared/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  // Groups
  createGroup(name: string): Promise<Group>;
  getGroupBySlug(slug: string): Promise<Group | undefined>;
  getGroupById(id: number): Promise<Group | undefined>;

  // Participants
  createParticipant(groupId: number, name: string): Promise<Participant>;
  getParticipant(id: number): Promise<Participant | undefined>;
  getParticipantsByGroup(groupId: number): Promise<Participant[]>;

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
  getSupportSignalsByAlternative(groupId: number, alternativeId: number): Promise<SupportSignal[]>;
  upsertSupportSignal(groupId: number, participantId: number, alternativeId: number | null, commitmentLevel: CommitmentLevel, source: "ai" | "explicit"): Promise<SupportSignal>;
  removeSupportSignal(groupId: number, participantId: number, alternativeId: number | null): Promise<void>;

  // Pip Messages
  getPipMessagesByGroup(groupId: number): Promise<PipMessage[]>;
  createPipMessage(groupId: number, content: string): Promise<PipMessage>;
  getLastPipMessage(groupId: number): Promise<PipMessage | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createGroup(name: string): Promise<Group> {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + randomBytes(3).toString('hex');
    const [group] = await db.insert(groups).values({ name, shareLinkSlug: slug }).returning();
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

  async createParticipant(groupId: number, name: string): Promise<Participant> {
    const [participant] = await db.insert(participants).values({ groupId, name }).returning();
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

  async upsertSupportSignal(
    groupId: number,
    participantId: number,
    alternativeId: number | null,
    commitmentLevel: CommitmentLevel,
    source: "ai" | "explicit"
  ): Promise<SupportSignal> {
    // Only delete records of the SAME source — AI signals must not overwrite explicit user input
    if (alternativeId === null) {
      await db.delete(supportSignals).where(
        and(
          eq(supportSignals.groupId, groupId),
          eq(supportSignals.participantId, participantId),
          isNull(supportSignals.alternativeId),
          eq(supportSignals.source, source)
        )
      );
    } else {
      await db.delete(supportSignals).where(
        and(
          eq(supportSignals.groupId, groupId),
          eq(supportSignals.participantId, participantId),
          eq(supportSignals.alternativeId, alternativeId),
          eq(supportSignals.source, source)
        )
      );
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
}

export const storage = new DatabaseStorage();
