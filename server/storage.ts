import { db } from "./db";
import { groups, participants, messages, plans, planVotes, messagePollVotes, type Group, type Participant, type Message, type Plan, type PlanVote, type MessagePollVote } from "@shared/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
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

  // Plans
  getPlanByGroup(groupId: number): Promise<Plan | undefined>;
  updatePlan(groupId: number, summary: string): Promise<Plan>;

  // Votes
  getVotesByGroup(groupId: number): Promise<PlanVote[]>;
  addVote(groupId: number, participantId: number, alternativeIndex: number): Promise<PlanVote>;
  removeVote(groupId: number, participantId: number): Promise<void>;

  // Message Poll Votes
  getPollVotesByMessages(messageIds: number[]): Promise<MessagePollVote[]>;
  addPollVote(messageId: number, participantId: number, optionIndex: number): Promise<MessagePollVote>;
  removePollVote(messageId: number, participantId: number): Promise<void>;
  getMessageById(messageId: number): Promise<Message | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createGroup(name: string): Promise<Group> {
    // Generate a simple slug
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
    // Check if plan exists
    const existing = await this.getPlanByGroup(groupId);
    if (existing) {
      const [updated] = await db
        .update(plans)
        .set({ summary, lastUpdatedAt: new Date() })
        .where(eq(plans.groupId, groupId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(plans)
        .values({ groupId, summary })
        .returning();
      return created;
    }
  }

  async getVotesByGroup(groupId: number): Promise<PlanVote[]> {
    return db.select().from(planVotes).where(eq(planVotes.groupId, groupId));
  }

  async addVote(groupId: number, participantId: number, alternativeIndex: number): Promise<PlanVote> {
    // Remove existing vote first (one vote per participant)
    await this.removeVote(groupId, participantId);
    const [vote] = await db.insert(planVotes).values({ groupId, participantId, alternativeIndex }).returning();
    return vote;
  }

  async removeVote(groupId: number, participantId: number): Promise<void> {
    await db.delete(planVotes).where(
      and(eq(planVotes.groupId, groupId), eq(planVotes.participantId, participantId))
    );
  }

  async getPollVotesByMessages(messageIds: number[]): Promise<MessagePollVote[]> {
    if (messageIds.length === 0) return [];
    return db.select().from(messagePollVotes).where(inArray(messagePollVotes.messageId, messageIds));
  }

  async getMessageById(messageId: number): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, messageId));
    return message;
  }

  async addPollVote(messageId: number, participantId: number, optionIndex: number): Promise<MessagePollVote> {
    // Remove existing vote first (one vote per participant per message)
    await this.removePollVote(messageId, participantId);
    const [vote] = await db.insert(messagePollVotes).values({ messageId, participantId, optionIndex }).returning();
    return vote;
  }

  async removePollVote(messageId: number, participantId: number): Promise<void> {
    await db.delete(messagePollVotes).where(
      and(eq(messagePollVotes.messageId, messageId), eq(messagePollVotes.participantId, participantId))
    );
  }
}

export const storage = new DatabaseStorage();
