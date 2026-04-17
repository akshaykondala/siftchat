import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { openai } from "./replit_integrations/audio/client";
import type { TripAlternative, CommitmentLevel, AiTripExtraction, AiAlternative } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === GROUPS ===

  app.post(api.groups.create.path, async (req, res) => {
    try {
      const input = api.groups.create.input.parse(req.body);
      const group = await storage.createGroup(input.name);
      res.status(201).json(group);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get(api.groups.get.path, async (req, res) => {
    const group = await storage.getGroupBySlug(req.params.slug);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }
    const participantsList = await storage.getParticipantsByGroup(group.id);
    res.json({ ...group, participants: participantsList });
  });

  app.post(api.groups.join.path, async (req, res) => {
    const group = await storage.getGroupBySlug(req.params.slug);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }
    try {
      const input = api.groups.join.input.parse(req.body);
      const participant = await storage.createParticipant(group.id, input.name);
      res.status(201).json(participant);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // === MESSAGES (interleaved with Pip messages) ===

  app.get(api.messages.list.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const [userMsgs, pipMsgsList] = await Promise.all([
      storage.getMessagesByGroup(groupId),
      storage.getPipMessagesByGroup(groupId),
    ]);

    const normalizedUser = userMsgs.map(m => ({
      id: m.id,
      groupId: m.groupId,
      participantId: m.participantId,
      content: m.content,
      createdAt: m.createdAt ? m.createdAt.toISOString() : null,
      participantName: m.participantName,
      isPip: false as const,
    }));

    // Use negative IDs to avoid collision with user message IDs in frontend
    const normalizedPip = pipMsgsList.map(p => ({
      id: p.id * -1,
      groupId: p.groupId,
      participantId: null,
      content: p.content,
      createdAt: p.createdAt ? p.createdAt.toISOString() : null,
      participantName: "Pip",
      isPip: true as const,
    }));

    const combined = [...normalizedUser, ...normalizedPip].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });

    res.json(combined);
  });

  app.post(api.messages.create.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    try {
      const input = api.messages.create.input.parse(req.body);
      const participant = await storage.getParticipant(input.participantId);
      if (!participant || participant.groupId !== groupId) {
        return res.status(403).json({ message: "Invalid participant" });
      }

      const message = await storage.createMessage(groupId, input.participantId, input.content);

      // Fire-and-forget travel AI analysis
      analyzeTripChat(groupId).catch(err => console.error("Trip analysis error:", err));

      res.status(201).json(message);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // === LEGACY PLAN ENDPOINTS (preserved for backward compat) ===

  app.get(api.plans.get.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const plan = await storage.getPlanByGroup(groupId);
    if (!plan) {
      return res.status(404).json({ message: "No plan generated yet" });
    }
    res.json(plan);
  });

  app.post(api.plans.generate.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    try {
      await analyzeTripChat(groupId);
      const plan = await storage.getPlanByGroup(groupId);
      res.json(plan || { groupId, summary: "{}", lastUpdatedAt: new Date() });
    } catch (err) {
      console.error("Plan generation error:", err);
      res.status(500).json({ message: "Failed to generate plan" });
    }
  });

  // === LEGACY VOTES (preserved for backward compat) ===

  app.get("/api/groups/:groupId/votes", async (req, res) => {
    const groupId = Number(req.params.groupId);
    const votes = await storage.getVotesByGroup(groupId);
    res.json(votes);
  });

  app.post("/api/groups/:groupId/votes", async (req, res) => {
    const groupId = Number(req.params.groupId);
    try {
      const { participantId, alternativeIndex } = req.body as { participantId: unknown; alternativeIndex: unknown };
      if (typeof participantId !== "number" || typeof alternativeIndex !== "number") {
        return res.status(400).json({ message: "participantId and alternativeIndex required" });
      }
      const participant = await storage.getParticipant(participantId);
      if (!participant || participant.groupId !== groupId) {
        return res.status(403).json({ message: "Invalid participant for this group" });
      }
      const vote = await storage.addVote(groupId, participantId, alternativeIndex);
      res.status(201).json(vote);
    } catch (err) {
      res.status(500).json({ message: "Failed to record vote" });
    }
  });

  app.delete("/api/groups/:groupId/votes", async (req, res) => {
    const groupId = Number(req.params.groupId);
    try {
      const { participantId } = req.body as { participantId: unknown };
      if (typeof participantId !== "number") {
        return res.status(400).json({ message: "participantId required" });
      }
      const participant = await storage.getParticipant(participantId);
      if (!participant || participant.groupId !== groupId) {
        return res.status(403).json({ message: "Invalid participant for this group" });
      }
      await storage.removeVote(groupId, participantId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Failed to remove vote" });
    }
  });

  // === TRIP PLAN ===

  app.get(api.tripPlan.get.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const plan = await storage.getTripPlanByGroup(groupId);
    if (!plan) {
      return res.status(404).json({ message: "No trip plan yet" });
    }
    res.json(plan);
  });

  // === TRIP ALTERNATIVES ===

  app.get(api.tripAlternatives.list.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const alts = await storage.getTripAlternativesByGroup(groupId);
    res.json(alts);
  });

  app.post(api.tripAlternatives.vote.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const alternativeId = Number(req.params.alternativeId);

    try {
      const input = api.tripAlternatives.vote.input.parse(req.body);
      const { participantId } = input;

      const participant = await storage.getParticipant(participantId);
      if (!participant || participant.groupId !== groupId) {
        return res.status(403).json({ message: "Invalid participant for this group" });
      }

      const alt = await storage.getTripAlternativeById(alternativeId);
      if (!alt || alt.groupId !== groupId) {
        return res.status(404).json({ message: "Alternative not found" });
      }

      // Record explicit commitment signal
      await storage.upsertSupportSignal(groupId, participantId, alternativeId, "committed", "explicit");

      // Recount explicit votes for this alternative from support signals
      const allSignals = await storage.getSupportSignalsByGroup(groupId);
      const altExplicitVotes = allSignals.filter(
        s => s.alternativeId === alternativeId && s.source === "explicit"
      );
      const newVoteCount = altExplicitVotes.length;

      // Recompute supportScore and persist it
      const committedCount = alt.committedAttendeeNames?.length ?? 0;
      const likelyCount = alt.likelyAttendeeNames?.length ?? 0;
      const newSupportScore = computeSupportScore(newVoteCount, committedCount, likelyCount);

      await storage.updateTripAlternative(alternativeId, {
        voteCount: newVoteCount,
        supportScore: newSupportScore,
      });

      // Recalculate winner
      await recalculateWinner(groupId);

      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to record vote" });
    }
  });

  // === TRIP ATTENDANCE / SUPPORT SIGNALS (explicit button presses) ===

  app.post(api.tripAttendance.update.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    try {
      const input = api.tripAttendance.update.input.parse(req.body);
      const { participantId, alternativeId, commitmentLevel } = input;

      const participant = await storage.getParticipant(participantId);
      if (!participant || participant.groupId !== groupId) {
        return res.status(403).json({ message: "Invalid participant for this group" });
      }

      await storage.upsertSupportSignal(
        groupId,
        participantId,
        alternativeId,
        commitmentLevel as CommitmentLevel,
        "explicit"
      );

      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update attendance" });
    }
  });

  // === PIP MESSAGES (dedicated endpoint) ===

  app.get(api.pipMessages.list.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const msgs = await storage.getPipMessagesByGroup(groupId);
    res.json(msgs);
  });

  return httpServer;
}

// ============================================================
//  TRAVEL AI PIPELINE
// ============================================================

async function analyzeTripChat(groupId: number): Promise<void> {
  const msgs = await storage.getMessagesByGroup(groupId);
  if (msgs.length === 0) return;

  const participantsList = await storage.getParticipantsByGroup(groupId);
  const participantNames = participantsList.map(p => p.name);

  const chatLog = msgs
    .slice(-60)
    .map(m => `${m.participantName}: ${m.content}`)
    .join("\n");

  const systemPrompt = `You are Pip, an AI travel planning assistant embedded in a group chat.
Your job is to read the chat and extract structured trip planning data.

The group has these members: ${participantNames.join(", ")}.

Return ONLY a valid JSON object with this exact structure:
{
  "mainPlan": {
    "destination": "city or region name, or null if undecided",
    "startDate": "start date string like 'May 24' or null",
    "endDate": "end date string like 'May 27' or null",
    "budgetBand": "one of: Budget-friendly / Moderate / Splurge / null",
    "vibe": "short vibe description like 'beach + nightlife' or null",
    "lodgingPreference": "Airbnb / Hotel / Hostel / Camping / null",
    "likelyAttendeeNames": ["names of people likely attending main plan"],
    "committedAttendeeNames": ["names of people committed to main plan"],
    "unresolvedQuestions": ["short descriptions of unresolved questions, 1 per item"]
  },
  "confidenceScore": 0,
  "alternatives": [
    {
      "destination": "city or region",
      "dateRange": "e.g. May 24-27 or early June",
      "budgetBand": "Budget-friendly / Moderate / Splurge / null",
      "vibe": "short description",
      "lodgingPreference": "Airbnb / Hotel / null",
      "aiSummary": "one short punchy label e.g. 'Budget beach weekend'",
      "evidenceSummary": "1-2 sentences explaining what chat evidence created this option",
      "supporterNames": ["names who supported this alternative"],
      "committedNames": ["names who seem committed to this specific alternative"]
    }
  ],
  "attendanceSignals": [
    {
      "participantName": "name matching the group member list",
      "commitmentLevel": "interested / likely / committed / unavailable",
      "targetOption": "main or the destination of the alternative"
    }
  ],
  "shouldPipSpeak": false,
  "pipMessage": null
}

RULES:
1. confidenceScore 0-100: base on destination consensus strength, date agreement, attendance clarity, conflict count.
2. Only create alternatives that have real chat evidence. Do NOT hallucinate. Each alternative must differ from main plan in destination or dates.
3. attendanceSignals — use exact member names from the list provided. "committed" = "book me in", "I'm in", "definitely"; "likely" = "planning to", "should be able to"; "interested" = "down for", "sounds fun", "maybe"; "unavailable" = "can't make it", "working that day", "won't be there".
4. shouldPipSpeak = true ONLY when: a new strong option emerged, the main plan just shifted significantly, the group is visibly stuck, or one clarifying question would unblock everything. NOT after every message.
5. pipMessage: warm, concise, max 2 sentences. null if shouldPipSpeak is false.
6. unresolvedQuestions: list only genuinely open questions (budget disagreements, unconfirmed dates, missing attendee commitment, etc.).
7. If fewer than 3 messages or no clear travel intent, set confidenceScore to 5 and shouldPipSpeak to false.`;

  let extracted: AiTripExtraction;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Chat log:\n${chatLog}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const raw = JSON.parse(response.choices[0].message.content || "{}");
    extracted = normalizeAiExtraction(raw);
  } catch (err) {
    console.error("AI extraction failed:", err);
    return;
  }

  const { mainPlan, confidenceScore, alternatives, attendanceSignals, shouldPipSpeak, pipMessage } = extracted;

  // Compute status using enriched signals
  const status = computeTripStatus({
    confidenceScore,
    messageCount: msgs.length,
    destination: mainPlan.destination,
    committedNames: mainPlan.committedAttendeeNames,
    unresolvedCount: mainPlan.unresolvedQuestions.length,
    alternativeCount: alternatives.length,
    likelyNames: mainPlan.likelyAttendeeNames,
    totalParticipants: participantNames.length,
  });

  // Upsert main trip plan
  await storage.upsertTripPlan(groupId, {
    destination: mainPlan.destination,
    startDate: mainPlan.startDate,
    endDate: mainPlan.endDate,
    budgetBand: mainPlan.budgetBand,
    vibe: mainPlan.vibe,
    lodgingPreference: mainPlan.lodgingPreference,
    confidenceScore: Math.max(0, Math.min(100, confidenceScore)),
    status,
    likelyAttendeeNames: mainPlan.likelyAttendeeNames,
    committedAttendeeNames: mainPlan.committedAttendeeNames,
    unresolvedQuestions: mainPlan.unresolvedQuestions,
  });

  // Process alternatives — true upsert: update matched by ID, insert new, dismiss stale
  const existingAlts = await storage.getTripAlternativesByGroup(groupId);
  const matchedExistingIds = new Set<number>();
  const processedAlts: TripAlternative[] = [];

  for (const aiAlt of alternatives) {
    if (!aiAlt.destination && !aiAlt.dateRange) continue;

    const existing = existingAlts.find(
      e => !matchedExistingIds.has(e.id) && alternativesMatch(e, aiAlt)
    );

    const likelyNames = aiAlt.supporterNames ?? [];
    const committedNames = aiAlt.committedNames ?? [];

    if (existing) {
      matchedExistingIds.add(existing.id);
      // Update existing row — preserve voteCount from explicit votes
      const preservedVoteCount = existing.voteCount ?? 0;
      const newSupportScore = computeSupportScore(preservedVoteCount, committedNames.length, likelyNames.length);
      const updated = await storage.updateTripAlternative(existing.id, {
        destination: aiAlt.destination,
        dateRange: aiAlt.dateRange,
        budgetBand: aiAlt.budgetBand,
        vibe: aiAlt.vibe,
        lodgingPreference: aiAlt.lodgingPreference,
        aiSummary: aiAlt.aiSummary,
        evidenceSummary: aiAlt.evidenceSummary,
        likelyAttendeeNames: likelyNames,
        committedAttendeeNames: committedNames,
        supportScore: newSupportScore,
        voteCount: preservedVoteCount,
        status: "active",
      });
      processedAlts.push(updated);
    } else {
      const newSupportScore = computeSupportScore(0, committedNames.length, likelyNames.length);
      const created = await storage.insertTripAlternative(groupId, {
        destination: aiAlt.destination,
        dateRange: aiAlt.dateRange,
        budgetBand: aiAlt.budgetBand,
        vibe: aiAlt.vibe,
        lodgingPreference: aiAlt.lodgingPreference,
        aiSummary: aiAlt.aiSummary,
        evidenceSummary: aiAlt.evidenceSummary,
        likelyAttendeeNames: likelyNames,
        committedAttendeeNames: committedNames,
        supportScore: newSupportScore,
        voteCount: 0,
        status: "active",
      });
      processedAlts.push(created);
    }
  }

  // Dismiss stale alternatives not referenced by AI anymore
  for (const existing of existingAlts) {
    if (!matchedExistingIds.has(existing.id)) {
      await storage.dismissAlternative(existing.id);
    }
  }

  // Determine winning alternative and persist
  await recalculateWinner(groupId);

  // Process attendance signals from AI (source="ai")
  for (const signal of attendanceSignals) {
    const participant = participantsList.find(
      p => p.name.toLowerCase() === signal.participantName?.toLowerCase()
    );
    if (!participant) continue;

    const level = normalizeCommitmentLevel(signal.commitmentLevel);
    if (!level) continue;

    if (signal.targetOption === "main" || !signal.targetOption) {
      await storage.upsertSupportSignal(groupId, participant.id, null, level, "ai");
    } else {
      const matchingAlt = processedAlts.find(a =>
        a.destination?.toLowerCase().includes(signal.targetOption?.toLowerCase() ?? "") ||
        (signal.targetOption ?? "").toLowerCase().includes((a.destination ?? "").toLowerCase())
      );
      if (matchingAlt) {
        await storage.upsertSupportSignal(groupId, participant.id, matchingAlt.id, level, "ai");
      }
    }
  }

  // Pip message — only if shouldPipSpeak and not posted too recently
  if (shouldPipSpeak && pipMessage) {
    const lastPip = await storage.getLastPipMessage(groupId);
    const now = Date.now();
    const lastPipTime = lastPip?.createdAt ? new Date(lastPip.createdAt).getTime() : 0;
    const minutesSinceLastPip = (now - lastPipTime) / (1000 * 60);

    if (minutesSinceLastPip >= 3) {
      await storage.createPipMessage(groupId, pipMessage);
    }
  }
}

// ============================================================
//  HELPERS
// ============================================================

async function recalculateWinner(groupId: number): Promise<void> {
  const alts = await storage.getTripAlternativesByGroup(groupId);
  if (alts.length === 0) {
    await storage.upsertTripPlan(groupId, { winningAlternativeId: undefined });
    return;
  }

  const top = alts.reduce((best, a) =>
    (a.supportScore ?? 0) > (best.supportScore ?? 0) ? a : best
  );

  // Only designate a winner if score exceeds minimum threshold (> 4)
  const winnerId = (top.supportScore ?? 0) > 4 ? top.id : undefined;
  await storage.upsertTripPlan(groupId, { winningAlternativeId: winnerId });
}

interface TripStatusInput {
  confidenceScore: number;
  messageCount: number;
  destination: string | null | undefined;
  committedNames: string[];
  unresolvedCount: number;
  alternativeCount: number;
  likelyNames: string[];
  totalParticipants: number;
}

function computeTripStatus(input: TripStatusInput): string {
  const {
    confidenceScore,
    messageCount,
    destination,
    committedNames,
    unresolvedCount,
    alternativeCount,
    likelyNames,
    totalParticipants,
  } = input;

  // Trip locked: high confidence, committed attendees, destination set, few conflicts, few open alternatives
  if (
    confidenceScore >= 80 &&
    committedNames.length >= 1 &&
    destination &&
    unresolvedCount <= 1 &&
    alternativeCount <= 1
  ) {
    return "Trip locked";
  }

  // Almost decided: decent confidence, most participants have a stance
  const participantsWithStance = committedNames.length + likelyNames.length;
  const coverageRatio = totalParticipants > 0 ? participantsWithStance / totalParticipants : 0;
  if (confidenceScore >= 55 && destination && coverageRatio >= 0.5) {
    return "Almost decided";
  }

  // Narrowing options: has a destination and meaningful discussion
  if (messageCount >= 3 && destination) {
    return "Narrowing options";
  }

  return "Early ideas";
}

function computeSupportScore(voteCount: number, committedCount: number, likelyCount: number): number {
  return voteCount * 3 + committedCount * 2 + likelyCount * 1;
}

function alternativesMatch(existing: TripAlternative, aiAlt: AiAlternative): boolean {
  const destMatch =
    !!existing.destination &&
    !!aiAlt.destination &&
    existing.destination.toLowerCase().trim() === aiAlt.destination.toLowerCase().trim();

  const dateMatch =
    !!existing.dateRange &&
    !!aiAlt.dateRange &&
    existing.dateRange.toLowerCase().trim() === aiAlt.dateRange.toLowerCase().trim();

  return destMatch || dateMatch;
}

function normalizeCommitmentLevel(level: string | undefined): CommitmentLevel | null {
  const map: Record<string, CommitmentLevel> = {
    interested: "interested",
    likely: "likely",
    committed: "committed",
    unavailable: "unavailable",
  };
  return (level && map[level.toLowerCase()]) ? map[level.toLowerCase()] : null;
}

function normalizeAiExtraction(raw: Record<string, unknown>): AiTripExtraction {
  const mainPlan = (raw.mainPlan as Record<string, unknown>) ?? {};
  return {
    mainPlan: {
      destination: (mainPlan.destination as string) ?? null,
      startDate: (mainPlan.startDate as string) ?? null,
      endDate: (mainPlan.endDate as string) ?? null,
      budgetBand: (mainPlan.budgetBand as string) ?? null,
      vibe: (mainPlan.vibe as string) ?? null,
      lodgingPreference: (mainPlan.lodgingPreference as string) ?? null,
      likelyAttendeeNames: Array.isArray(mainPlan.likelyAttendeeNames) ? mainPlan.likelyAttendeeNames as string[] : [],
      committedAttendeeNames: Array.isArray(mainPlan.committedAttendeeNames) ? mainPlan.committedAttendeeNames as string[] : [],
      unresolvedQuestions: Array.isArray(mainPlan.unresolvedQuestions) ? mainPlan.unresolvedQuestions as string[] : [],
    },
    confidenceScore: typeof raw.confidenceScore === "number" ? raw.confidenceScore : 5,
    alternatives: Array.isArray(raw.alternatives) ? (raw.alternatives as Record<string, unknown>[]).map(a => ({
      destination: (a.destination as string) ?? null,
      dateRange: (a.dateRange as string) ?? null,
      budgetBand: (a.budgetBand as string) ?? null,
      vibe: (a.vibe as string) ?? null,
      lodgingPreference: (a.lodgingPreference as string) ?? null,
      aiSummary: (a.aiSummary as string) ?? null,
      evidenceSummary: (a.evidenceSummary as string) ?? null,
      supporterNames: Array.isArray(a.supporterNames) ? a.supporterNames as string[] : [],
      committedNames: Array.isArray(a.committedNames) ? a.committedNames as string[] : [],
    })) : [],
    attendanceSignals: Array.isArray(raw.attendanceSignals) ? (raw.attendanceSignals as Record<string, unknown>[]).map(s => ({
      participantName: (s.participantName as string) ?? "",
      commitmentLevel: (s.commitmentLevel as string) ?? "",
      targetOption: (s.targetOption as string) ?? "main",
    })) : [],
    shouldPipSpeak: raw.shouldPipSpeak === true,
    pipMessage: (raw.pipMessage as string) ?? null,
  };
}
