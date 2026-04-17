import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { openai } from "./replit_integrations/audio/client";
import type { TripAlternative, CommitmentLevel, AiTripExtraction, AiAlternative } from "@shared/schema";

// ============================================================
//  IN-MEMORY PRESENCE STORE
// ============================================================

interface PresenceEntry {
  participantId: number;
  name: string;
  lastSeenAt: number; // ms since epoch
  isTyping: boolean;
  typingClearedAt?: number; // auto-clear typing after this time
}

// groupId -> Map<participantId, PresenceEntry>
const presenceStore = new Map<number, Map<number, PresenceEntry>>();

const ONLINE_TIMEOUT_MS = 30_000;   // 30s — participant is "online"
const TYPING_TIMEOUT_MS = 20_000;   // 20s — safety net auto-clear; client refreshes every 2s while actively typing

function getGroupPresence(groupId: number): Map<number, PresenceEntry> {
  if (!presenceStore.has(groupId)) {
    presenceStore.set(groupId, new Map());
  }
  return presenceStore.get(groupId)!;
}

function getOnlinePresence(groupId: number): PresenceEntry[] {
  const group = getGroupPresence(groupId);
  const now = Date.now();
  const online: PresenceEntry[] = [];
  for (const [pid, entry] of group.entries()) {
    if (now - entry.lastSeenAt < ONLINE_TIMEOUT_MS) {
      // Auto-clear stale typing signals
      if (entry.isTyping && entry.typingClearedAt && now > entry.typingClearedAt) {
        entry.isTyping = false;
      }
      online.push({ ...entry });
    } else {
      // Prune expired participant entries to avoid unbounded memory growth
      group.delete(pid);
    }
  }
  // Remove the group map entirely when it becomes empty
  if (group.size === 0) {
    presenceStore.delete(groupId);
  }
  return online;
}

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

  // DEPRECATED: This endpoint now runs analyzeTripChat but does NOT write to the legacy plans table.
  // New clients should use GET /api/groups/:groupId/trip and the trip/alternatives endpoints instead.
  // Legacy plans.summary will remain empty/stale — this endpoint is preserved for backward compat only.
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

      // Recount only committed explicit signals — not interested/likely/unavailable
      await recomputeAlternativeScore(groupId, alternativeId);

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

  app.get(api.tripAttendance.get.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const participantId = req.query.participantId ? Number(req.query.participantId) : null;
    if (participantId !== null && !isNaN(participantId)) {
      const signals = await storage.getSupportSignalsByParticipant(groupId, participantId);
      return res.json(signals);
    }
    const signals = await storage.getSupportSignalsByGroup(groupId);
    res.json(signals);
  });

  app.post(api.tripAttendance.update.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    try {
      const input = api.tripAttendance.update.input.parse(req.body);
      const { participantId, alternativeId, commitmentLevel } = input;

      const participant = await storage.getParticipant(participantId);
      if (!participant || participant.groupId !== groupId) {
        return res.status(403).json({ message: "Invalid participant for this group" });
      }

      // Validate that alternativeId belongs to this group (prevents cross-group tampering)
      if (alternativeId !== null) {
        const alt = await storage.getTripAlternativeById(alternativeId);
        if (!alt || alt.groupId !== groupId) {
          return res.status(403).json({ message: "Alternative does not belong to this group" });
        }
      }

      await storage.upsertSupportSignal(
        groupId,
        participantId,
        alternativeId,
        commitmentLevel as CommitmentLevel,
        "explicit"
      );

      // If this signal is for a specific alternative, recompute its score and update winner
      if (alternativeId !== null) {
        await recomputeAlternativeScore(groupId, alternativeId);
        await recalculateWinner(groupId);
      }

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

  // === PRESENCE ===

  // GET /api/groups/:groupId/presence — returns online participants and typing status
  app.get("/api/groups/:groupId/presence", async (req, res) => {
    const groupId = Number(req.params.groupId);
    if (!groupId) return res.status(400).json({ message: "Invalid groupId" });

    const group = await storage.getGroupById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const online = getOnlinePresence(groupId);
    res.json(online.map(e => ({
      participantId: e.participantId,
      name: e.name,
      isTyping: e.isTyping,
    })));
  });

  // POST /api/groups/:groupId/presence — heartbeat + typing update
  app.post("/api/groups/:groupId/presence", async (req, res) => {
    const groupId = Number(req.params.groupId);
    const bodySchema = z.object({
      participantId: z.number(),
      isTyping: z.boolean().optional().default(false),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request" });
    }

    const { participantId, isTyping } = parsed.data;

    // Validate participant belongs to this group
    const participant = await storage.getParticipant(participantId);
    if (!participant || participant.groupId !== groupId) {
      return res.status(403).json({ message: "Invalid participant" });
    }

    const group = getGroupPresence(groupId);
    const now = Date.now();
    const existing = group.get(participantId);

    group.set(participantId, {
      participantId,
      name: participant.name,
      lastSeenAt: now,
      isTyping: isTyping ?? false,
      typingClearedAt: isTyping ? now + TYPING_TIMEOUT_MS : existing?.typingClearedAt,
    });

    res.json({ ok: true });
  });

  return httpServer;
}

// ============================================================
//  TRAVEL AI PIPELINE
// ============================================================

async function analyzeTripChat(groupId: number): Promise<void> {
  // Capture state BEFORE AI analysis for material-change comparison
  const [previousPlan, previousAlts, previousPipMsgs] = await Promise.all([
    storage.getTripPlanByGroup(groupId),
    storage.getTripAlternativesByGroup(groupId),
    storage.getPipMessagesByGroup(groupId),
  ]);

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
    "lodgingPreference": "Airbnb / Hotel / Hostel / Camping / null",
    "flightsBooked": false,
    "flightSearchUrl": null,
    "likelyAttendeeNames": ["names of people likely attending main plan"],
    "committedAttendeeNames": ["names of people committed to main plan"],
    "unresolvedQuestions": ["short descriptions of unresolved questions, 1 per item"]
  },
  "confidenceScore": 0,
  "flightPipMessage": null,
  "alternatives": [
    {
      "destination": "city or region",
      "dateRange": "e.g. May 24-27 or early June",
      "budgetBand": "Budget-friendly / Moderate / Splurge / null",
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
7. If fewer than 3 messages or no clear travel intent, set confidenceScore to 5 and shouldPipSpeak to false.
8. FLIGHTS — flightsBooked: set true if chat contains explicit confirmation that flights are booked (e.g. "I booked my flights", "got my ticket", "flights are sorted", "just booked"). Otherwise false.
9. FLIGHTS — flightSearchUrl: ONLY set this when destination AND both startDate AND endDate are known. Use format: https://www.google.com/travel/flights?q=flights+to+DESTINATION+STARTDATE+to+ENDDATE (URL-encode spaces as +). Set to null if destination or either date is missing.
10. FLIGHTS — flightPipMessage: write a helpful 2-3 sentence flight recommendation message as Pip WHENEVER destination AND both startDate AND endDate are all known (the backend handles deduplication so you don't need to worry about posting it multiple times). Include: typical roundtrip price range based on your knowledge, whether flights are typically direct or connecting, estimated flight time, and two search links formatted as markdown: [Search Google Flights](URL) and [Check Kayak](KAYAK_URL). For Kayak URL use format: https://www.kayak.com/flights/anywhere/CITY/STARTDATE_ISO/ENDDATE_ISO where CITY is the destination city name and dates are YYYY-MM-DD. Set flightPipMessage to null only if destination or either date is missing.`;

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

  const { mainPlan, confidenceScore, flightPipMessage, alternatives, attendanceSignals, shouldPipSpeak, pipMessage } = extracted;

  // Boost confidence when flights are booked — real commitment signal
  const boostedConfidenceScore = mainPlan.flightsBooked
    ? Math.min(100, confidenceScore + 15)
    : confidenceScore;

  // Compute status using enriched signals
  const status = computeTripStatus({
    confidenceScore: boostedConfidenceScore,
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
    lodgingPreference: mainPlan.lodgingPreference,
    flightsBooked: mainPlan.flightsBooked,
    flightSearchUrl: mainPlan.flightSearchUrl,
    confidenceScore: Math.max(0, Math.min(100, boostedConfidenceScore)),
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

  // Refresh AI per-alternative supporter signals in support_signals table:
  // 1. Clear old AI signals for this alternative (prevents stale inflation)
  // 2. Write current AI detections as support_signals rows
  // 3. recomputeAlternativeScore then merges AI + explicit signals (explicit beats AI per-participant)
  for (const processedAlt of processedAlts) {
    const aiAlt = alternatives.find(a => alternativesMatch(processedAlt, a));

    // Clear stale AI signals for this alternative before writing fresh ones
    await storage.removeAiSupportSignalsByAlternative(groupId, processedAlt.id);

    if (!aiAlt) continue;

    const supporterNames = aiAlt.supporterNames ?? [];
    const committedNames = aiAlt.committedNames ?? [];

    for (const name of supporterNames) {
      const participant = participantsList.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (participant) {
        await storage.upsertSupportSignal(groupId, participant.id, processedAlt.id, "likely", "ai");
      }
    }
    for (const name of committedNames) {
      const participant = participantsList.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (participant) {
        await storage.upsertSupportSignal(groupId, participant.id, processedAlt.id, "committed", "ai");
      }
    }
  }

  // Recompute scores for all processed alternatives from support_signals (AI + explicit combined)
  for (const alt of processedAlts) {
    await recomputeAlternativeScore(groupId, alt.id);
  }
  await recalculateWinner(groupId);

  // Process general attendance signals from AI (source="ai") — main plan and cross-option stances
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

  // Pip posting: trust AI shouldPipSpeak + enforce anti-spam cooldown + backend conditions
  if (pipMessage) {
    const newPlan = await storage.getTripPlanByGroup(groupId);
    const newAlts = await storage.getTripAlternativesByGroup(groupId);
    const lastPip = await storage.getLastPipMessage(groupId);
    const now = Date.now();
    const lastPipTime = lastPip?.createdAt ? new Date(lastPip.createdAt).getTime() : 0;
    const minutesSinceLastPip = (now - lastPipTime) / (1000 * 60);

    // Backend material-change signals (required for non-clarifying cases)
    const destinationChanged = (newPlan?.destination ?? null) !== (previousPlan?.destination ?? null);
    const winnerChanged = (newPlan?.winningAlternativeId ?? null) !== (previousPlan?.winningAlternativeId ?? null);
    const newAltAppeared = newAlts.length > previousAlts.length;
    const confidenceJump = Math.abs((newPlan?.confidenceScore ?? 0) - (previousPlan?.confidenceScore ?? 0)) >= 15;
    const materialChange = destinationChanged || winnerChanged || newAltAppeared || confidenceJump;

    // Group stuck: 8+ messages since last Pip with no material change
    const msgsSinceLastPip = previousPipMsgs.length === 0
      ? msgs.length
      : msgs.filter(m => m.createdAt && m.createdAt > new Date(lastPipTime)).length;
    const groupStuck = msgsSinceLastPip >= 8 && !materialChange;

    // A low-confidence group that hasn't gotten clarity yet benefits from a clarifying question
    const hasLowConfidenceWithChat = (newPlan?.confidenceScore ?? 0) < 30 && msgs.length >= 4;

    // Post when AI recommends AND cooldown met AND one backend condition is true
    const shouldPost = shouldPipSpeak && minutesSinceLastPip >= 3
      && (materialChange || groupStuck || hasLowConfidenceWithChat);

    if (shouldPost) {
      await storage.createPipMessage(groupId, pipMessage);
    }
  }

  // Flight Pip message: post once per unique destination+startDate+endDate pair,
  // respecting the same anti-spam cooldown as regular Pip messages (≥ 3 min).
  if (flightPipMessage && mainPlan.destination && mainPlan.startDate && mainPlan.endDate) {
    const currentFlightKey = `${mainPlan.destination}|${mainPlan.startDate}|${mainPlan.endDate}`;
    const latestPlan = await storage.getTripPlanByGroup(groupId);
    const alreadyPostedForThisPair = latestPlan?.lastFlightRecoKey === currentFlightKey;

    if (!alreadyPostedForThisPair) {
      // Use the same cooldown signal as regular Pip messages
      const lastPipForFlight = await storage.getLastPipMessage(groupId);
      const nowMs = Date.now();
      const lastPipTime = lastPipForFlight?.createdAt ? new Date(lastPipForFlight.createdAt).getTime() : 0;
      const minutesSinceLastPip = (nowMs - lastPipTime) / (1000 * 60);

      if (minutesSinceLastPip >= 3) {
        await storage.createPipMessage(groupId, flightPipMessage);
        await storage.upsertTripPlan(groupId, { lastFlightRecoKey: currentFlightKey });
      }
    }
  }
}

// ============================================================
//  HELPERS
// ============================================================

async function recomputeAlternativeScore(groupId: number, alternativeId: number): Promise<void> {
  // Verify alternative belongs to this group before recomputing
  const alt = await storage.getTripAlternativeById(alternativeId);
  if (!alt || alt.groupId !== groupId) return;

  const altSignals = await storage.getSupportSignalsByAlternative(groupId, alternativeId);

  // Deduplicate per participant: explicit beats AI for the same participant
  const bestByParticipant = new Map<number, { commitmentLevel: string; source: string }>();
  for (const signal of altSignals) {
    const existing = bestByParticipant.get(signal.participantId);
    if (!existing || signal.source === "explicit") {
      bestByParticipant.set(signal.participantId, {
        commitmentLevel: signal.commitmentLevel,
        source: signal.source,
      });
    }
  }

  const deduped = Array.from(bestByParticipant.values());
  const committedCount = deduped.filter(s => s.commitmentLevel === "committed").length;
  const likelyCount = deduped.filter(s => s.commitmentLevel === "likely").length;

  // Vote count = only committed explicit signals (a true voluntary vote)
  const explicitVoteCount = altSignals.filter(
    s => s.source === "explicit" && s.commitmentLevel === "committed"
  ).length;

  const newSupportScore = computeSupportScore(explicitVoteCount, committedCount, likelyCount);

  await storage.updateTripAlternative(alternativeId, {
    voteCount: explicitVoteCount,
    supportScore: newSupportScore,
  });
}

async function recalculateWinner(groupId: number): Promise<void> {
  const alts = await storage.getTripAlternativesByGroup(groupId);
  if (alts.length === 0) {
    await storage.upsertTripPlan(groupId, { winningAlternativeId: null });
    return;
  }

  const top = alts.reduce((best, a) =>
    (a.supportScore ?? 0) > (best.supportScore ?? 0) ? a : best
  );

  // Only designate a winner if score exceeds minimum threshold (> 4); explicitly null otherwise
  const winnerId = (top.supportScore ?? 0) > 4 ? top.id : null;
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
      lodgingPreference: (mainPlan.lodgingPreference as string) ?? null,
      flightsBooked: mainPlan.flightsBooked === true,
      flightSearchUrl: (mainPlan.flightSearchUrl as string) ?? null,
      likelyAttendeeNames: Array.isArray(mainPlan.likelyAttendeeNames) ? mainPlan.likelyAttendeeNames as string[] : [],
      committedAttendeeNames: Array.isArray(mainPlan.committedAttendeeNames) ? mainPlan.committedAttendeeNames as string[] : [],
      unresolvedQuestions: Array.isArray(mainPlan.unresolvedQuestions) ? mainPlan.unresolvedQuestions as string[] : [],
    },
    confidenceScore: typeof raw.confidenceScore === "number" ? raw.confidenceScore : 5,
    flightPipMessage: (raw.flightPipMessage as string) ?? null,
    alternatives: Array.isArray(raw.alternatives) ? (raw.alternatives as Record<string, unknown>[]).map(a => ({
      destination: (a.destination as string) ?? null,
      dateRange: (a.dateRange as string) ?? null,
      budgetBand: (a.budgetBand as string) ?? null,
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
