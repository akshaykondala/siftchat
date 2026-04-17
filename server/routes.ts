import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { openai } from "./replit_integrations/audio/client";
import type { TripAlternative, CommitmentLevel } from "@shared/schema";

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
    const [userMsgs, pipMsgs] = await Promise.all([
      storage.getMessagesByGroup(groupId),
      storage.getPipMessagesByGroup(groupId),
    ]);

    // Normalize user messages
    const normalizedUser = userMsgs.map(m => ({
      id: m.id,
      groupId: m.groupId,
      participantId: m.participantId,
      content: m.content,
      createdAt: m.createdAt ? m.createdAt.toISOString() : null,
      participantName: m.participantName,
      isPip: false as const,
    }));

    // Normalize Pip messages (use a unique negative-space id to avoid collision)
    const normalizedPip = pipMsgs.map(p => ({
      id: p.id * -1,  // negative to avoid collision with user message IDs
      groupId: p.groupId,
      participantId: null,
      content: p.content,
      createdAt: p.createdAt ? p.createdAt.toISOString() : null,
      participantName: "Pip",
      isPip: true as const,
    }));

    // Merge and sort by createdAt
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
      const result = await analyzeTripChat(groupId);
      // Return legacy plan for compat
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
      const { participantId, alternativeIndex } = req.body;
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
      const { participantId } = req.body;
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

      // Record explicit commitment
      await storage.upsertTripAttendance(groupId, participantId, alternativeId, "committed", "explicit");

      // Recompute vote count for this alternative from explicit "committed" attendance
      const allAttendance = await storage.getTripAttendanceByGroup(groupId);
      const altAttendance = allAttendance.filter(
        a => a.alternativeId === alternativeId && a.source === "explicit"
      );
      const newVoteCount = altAttendance.length;

      await storage.updateAlternativeVoteCount(alternativeId, newVoteCount);

      // Recompute supportScore for this alternative
      const committedCount = (alt.committedAttendeeNames?.length ?? 0);
      const likelyCount = (alt.likelyAttendeeNames?.length ?? 0);
      const newSupportScore = newVoteCount * 3 + committedCount * 2 + likelyCount * 1;

      // Check if this alternative should become the winning one
      const tripPlan = await storage.getTripPlanByGroup(groupId);
      if (tripPlan) {
        const allAlts = await storage.getTripAlternativesByGroup(groupId);
        const topAlt = allAlts.reduce((best, a) => {
          const score = (a.id === alternativeId ? newSupportScore : (a.supportScore ?? 0));
          return score > (best?.supportScore ?? 0) ? { ...a, supportScore: score } : best;
        }, null as TripAlternative | null);

        if (topAlt && topAlt.supportScore && topAlt.supportScore > 4) {
          await storage.upsertTripPlan(groupId, { winningAlternativeId: topAlt.id });
        }
      }

      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to record vote" });
    }
  });

  // === TRIP ATTENDANCE (explicit button presses) ===

  app.post(api.tripAttendance.update.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    try {
      const input = api.tripAttendance.update.input.parse(req.body);
      const { participantId, alternativeId, commitmentLevel } = input;

      const participant = await storage.getParticipant(participantId);
      if (!participant || participant.groupId !== groupId) {
        return res.status(403).json({ message: "Invalid participant for this group" });
      }

      await storage.upsertTripAttendance(
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

  return httpServer;
}

// ============================================================
//  TRAVEL AI PIPELINE
// ============================================================

async function analyzeTripChat(groupId: number): Promise<void> {
  const messages = await storage.getMessagesByGroup(groupId);
  if (messages.length === 0) return;

  const participantsList = await storage.getParticipantsByGroup(groupId);
  const participantNames = participantsList.map(p => p.name);

  const chatLog = messages
    .slice(-60) // last 60 messages for context
    .map(m => `${m.participantName}: ${m.content}`)
    .join("\n");

  // Build extraction prompt
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
    "unresolvedQuestions": ["short descriptions of unresolved questions"]
  },
  "confidenceScore": 0-100,
  "alternatives": [
    {
      "destination": "city or region",
      "dateRange": "e.g. May 24-27 or early June",
      "budgetBand": "Budget-friendly / Moderate / Splurge / null",
      "vibe": "short description",
      "lodgingPreference": "Airbnb / Hotel / null",
      "aiSummary": "one short punchy label e.g. 'Budget beach weekend'",
      "evidenceSummary": "1-2 sentences explaining what chat evidence created this option",
      "supporterNames": ["names of people who supported this alternative"],
      "committedNames": ["names who seem committed to this specific alternative"]
    }
  ],
  "attendanceSignals": [
    {
      "participantName": "name matching the group member list",
      "commitmentLevel": "interested / likely / committed / unavailable",
      "targetOption": "main or the destination/dateRange of the alternative they're interested in"
    }
  ],
  "shouldPipSpeak": true or false,
  "pipMessage": "A helpful 1-2 sentence message from Pip to post in chat, or null if shouldPipSpeak is false"
}

RULES:
1. confidenceScore: 0 = no idea, 100 = fully locked trip. Base it on: strength of destination consensus, date agreement, attendance clarity, unresolved conflicts.
2. Only create alternatives for options that have real chat evidence (specific destination or dates mentioned). Do NOT hallucinate.
3. An alternative must differ from the main plan in at least destination or date.
4. For attendanceSignals: "committed" = "book me in", "I'm in", "definitely"; "likely" = "planning to", "should be able to"; "interested" = "down for", "sounds fun", "maybe"; "unavailable" = "can't make it", "working that day", "won't be there".
5. Pip should speak when: a new strong option emerged, the main plan shifted, the group seems stuck, or a single clarifying question would help. Pip should NOT speak after every message or when nothing changed.
6. Pip's message should be warm, concise, and action-oriented. Max 2 sentences.
7. If fewer than 3 messages exist or there's no clear travel intent, set confidenceScore to 5 and shouldPipSpeak to false.`;

  let extracted: any;
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

    extracted = JSON.parse(response.choices[0].message.content || "{}");
  } catch (err) {
    console.error("AI extraction failed:", err);
    return;
  }

  const { mainPlan, confidenceScore = 0, alternatives = [], attendanceSignals = [], shouldPipSpeak, pipMessage } = extracted;

  // Compute status from confidence score and data
  const status = computeTripStatus(
    confidenceScore,
    messages.length,
    mainPlan?.destination,
    mainPlan?.committedAttendeeNames ?? []
  );

  // Upsert the main trip plan
  await storage.upsertTripPlan(groupId, {
    destination: mainPlan?.destination ?? null,
    startDate: mainPlan?.startDate ?? null,
    endDate: mainPlan?.endDate ?? null,
    budgetBand: mainPlan?.budgetBand ?? null,
    vibe: mainPlan?.vibe ?? null,
    lodgingPreference: mainPlan?.lodgingPreference ?? null,
    confidenceScore: Math.max(0, Math.min(100, confidenceScore)),
    status,
    likelyAttendeeNames: mainPlan?.likelyAttendeeNames ?? [],
    committedAttendeeNames: mainPlan?.committedAttendeeNames ?? [],
    unresolvedQuestions: mainPlan?.unresolvedQuestions ?? [],
  });

  // Process alternatives — match existing ones to preserve vote counts
  const existingAlts = await storage.getTripAlternativesByGroup(groupId);

  const matchedIds = new Set<number>();
  const processedAlts: TripAlternative[] = [];

  for (const aiAlt of alternatives) {
    if (!aiAlt.destination && !aiAlt.dateRange) continue; // skip empty alternatives

    // Try to find an existing matching alternative
    const existing = existingAlts.find(e =>
      !matchedIds.has(e.id) && alternativesMatch(e, aiAlt)
    );

    const likelyNames: string[] = aiAlt.supporterNames ?? [];
    const committedNames: string[] = aiAlt.committedNames ?? [];
    const baseVoteCount = existing?.voteCount ?? 0;
    const supportScore = computeSupportScore(baseVoteCount, committedNames.length, likelyNames.length);

    if (existing) {
      matchedIds.add(existing.id);
      // Update existing — preserve voteCount
      const [updated] = await Promise.all([
        storage.upsertTripAlternative(groupId, {
          destination: aiAlt.destination,
          dateRange: aiAlt.dateRange,
          budgetBand: aiAlt.budgetBand ?? null,
          vibe: aiAlt.vibe ?? null,
          lodgingPreference: aiAlt.lodgingPreference ?? null,
          aiSummary: aiAlt.aiSummary ?? null,
          evidenceSummary: aiAlt.evidenceSummary ?? null,
          likelyAttendeeNames: likelyNames,
          committedAttendeeNames: committedNames,
          supportScore,
          voteCount: baseVoteCount,
          status: "active",
        }),
      ]);
      processedAlts.push(updated);
    } else {
      // Create new alternative
      const created = await storage.upsertTripAlternative(groupId, {
        destination: aiAlt.destination,
        dateRange: aiAlt.dateRange,
        budgetBand: aiAlt.budgetBand ?? null,
        vibe: aiAlt.vibe ?? null,
        lodgingPreference: aiAlt.lodgingPreference ?? null,
        aiSummary: aiAlt.aiSummary ?? null,
        evidenceSummary: aiAlt.evidenceSummary ?? null,
        likelyAttendeeNames: likelyNames,
        committedAttendeeNames: committedNames,
        supportScore,
        voteCount: 0,
        status: "active",
      });
      processedAlts.push(created);
    }
  }

  // Dismiss existing alternatives that are no longer in the AI output
  for (const existing of existingAlts) {
    if (!matchedIds.has(existing.id)) {
      await storage.dismissAlternative(existing.id);
    }
  }

  // Determine winning alternative (highest supportScore, must exceed threshold)
  const topAlt = processedAlts.reduce((best, a) => {
    return (a.supportScore ?? 0) > (best?.supportScore ?? 0) ? a : best;
  }, null as TripAlternative | null);

  const winningAltId = (topAlt && (topAlt.supportScore ?? 0) > 4) ? topAlt.id : null;
  await storage.upsertTripPlan(groupId, { winningAlternativeId: winningAltId ?? undefined });

  // Process attendance signals from AI
  for (const signal of attendanceSignals) {
    const participant = participantsList.find(
      p => p.name.toLowerCase() === signal.participantName?.toLowerCase()
    );
    if (!participant) continue;

    const level = normalizeCommitmentLevel(signal.commitmentLevel);
    if (!level) continue;

    if (signal.targetOption === "main" || !signal.targetOption) {
      await storage.upsertTripAttendance(groupId, participant.id, null, level, "ai");
    } else {
      // Try to match to a processed alternative by destination
      const matchingAlt = processedAlts.find(a =>
        a.destination?.toLowerCase().includes(signal.targetOption?.toLowerCase()) ||
        signal.targetOption?.toLowerCase().includes((a.destination ?? "").toLowerCase())
      );
      if (matchingAlt) {
        await storage.upsertTripAttendance(groupId, participant.id, matchingAlt.id, level, "ai");
      }
    }
  }

  // Pip message — only post if shouldPipSpeak and not too soon after last message
  if (shouldPipSpeak && pipMessage) {
    const lastPip = await storage.getLastPipMessage(groupId);
    const now = Date.now();
    const lastPipTime = lastPip?.createdAt ? new Date(lastPip.createdAt).getTime() : 0;
    const minutesSinceLastPip = (now - lastPipTime) / (1000 * 60);

    // Don't post if last Pip message was within 3 minutes
    if (minutesSinceLastPip >= 3) {
      await storage.createPipMessage(groupId, pipMessage);
    }
  }
}

// ============================================================
//  HELPERS
// ============================================================

function computeTripStatus(
  confidenceScore: number,
  messageCount: number,
  destination: string | null | undefined,
  committedNames: string[]
): string {
  if (confidenceScore >= 80 && committedNames.length >= 1 && destination) {
    return "Trip locked";
  }
  if (confidenceScore >= 55 && destination) {
    return "Almost decided";
  }
  if (messageCount >= 3 && destination) {
    return "Narrowing options";
  }
  return "Early ideas";
}

function computeSupportScore(voteCount: number, committedCount: number, likelyCount: number): number {
  return voteCount * 3 + committedCount * 2 + likelyCount * 1;
}

function alternativesMatch(existing: TripAlternative, aiAlt: any): boolean {
  const destMatch =
    existing.destination &&
    aiAlt.destination &&
    existing.destination.toLowerCase().trim() === aiAlt.destination.toLowerCase().trim();

  const dateMatch =
    existing.dateRange &&
    aiAlt.dateRange &&
    existing.dateRange.toLowerCase().trim() === aiAlt.dateRange.toLowerCase().trim();

  return !!(destMatch || dateMatch);
}

function normalizeCommitmentLevel(level: string): CommitmentLevel | null {
  const map: Record<string, CommitmentLevel> = {
    interested: "interested",
    likely: "likely",
    committed: "committed",
    unavailable: "unavailable",
  };
  return map[level?.toLowerCase()] ?? null;
}
