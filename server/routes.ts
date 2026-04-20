import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { openai } from "./replit_integrations/audio/client";
import type { TripAlternative, CommitmentLevel, AiTripExtraction, AiAlternative } from "@shared/schema";
import { signup, login, loginWithGoogle, signToken, getUserById, authMiddleware, checkRateLimit, resetRateLimit, validateSignupInput, GOOGLE_CLIENT_ID } from "./auth";
import { db } from "./db";
import { participants, groups, tripPlans, users } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

function inferLodgingType(lodgingPreference: string | null | undefined): "hotel" | "rental" | null {
  if (!lodgingPreference) return null;
  const s = lodgingPreference.toLowerCase();
  if (/airbnb|vrbo|rental|house|cabin|villa|cottage|apartment|condo|chalet|bungalow/.test(s)) return "rental";
  if (/hotel|motel|hostel|inn|resort|marriott|hilton|hyatt|sheraton|westin|holiday inn/.test(s)) return "hotel";
  return null;
}

// ============================================================
//  AI ANALYSIS COOLDOWN
//  Only re-analyze after 5 new messages OR 3 minutes, whichever comes first.
// ============================================================

interface AnalysisCooldown {
  lastMessageCount: number;
  lastRunAt: number;
}
const analysisCooldowns = new Map<number, AnalysisCooldown>();
const COOLDOWN_MIN_MS = 45 * 1000;

function willAnalyze(groupId: number): boolean {
  const cooldown = analysisCooldowns.get(groupId);
  if (!cooldown) return true;
  return Date.now() - cooldown.lastRunAt >= COOLDOWN_MIN_MS;
}

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

// groupId -> timestamp when pip started thinking (cleared when pip responds)
const pipThinkingStore = new Map<number, number>();
const PIP_THINKING_TIMEOUT_MS = 30_000; // auto-clear after 30s as safety net

// groupId -> 'flights' | 'lodging' when Pip is waiting for a booking link
const pendingFinalizationStore = new Map<number, 'flights' | 'lodging'>();

export function setPipThinking(groupId: number) {
  pipThinkingStore.set(groupId, Date.now());
}
export function clearPipThinking(groupId: number) {
  pipThinkingStore.delete(groupId);
}
export function isPipThinking(groupId: number): boolean {
  const since = pipThinkingStore.get(groupId);
  if (!since) return false;
  if (Date.now() - since > PIP_THINKING_TIMEOUT_MS) {
    pipThinkingStore.delete(groupId);
    return false;
  }
  return true;
}

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
      // Resolve userId from token if present
      let createdByUserId: number | undefined;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const { verifyToken } = await import("./auth");
          createdByUserId = verifyToken(authHeader.slice(7)).userId;
        } catch { /* no-op */ }
      }
      const group = await storage.createGroup(input.name, createdByUserId);
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
      // Link to user account if token provided
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        try {
          const { verifyToken } = await import("./auth");
          const { userId } = verifyToken(authHeader.slice(7));
          await db.update(participants).set({ userId }).where(eq(participants.id, participant.id));
        } catch { /* no-op if token invalid */ }
      }
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

      // If Pip is waiting for a booking link, intercept any URL in any message
      const pendingFinalize = pendingFinalizationStore.get(groupId);
      const urlMatch = input.content.match(/https?:\/\/[^\s]+/);
      if (pendingFinalize && urlMatch) {
        pendingFinalizationStore.delete(groupId);
        setPipThinking(groupId);
        handlePendingFinalization(groupId, pendingFinalize, urlMatch[0]).catch(err => console.error("Pending finalization error:", err));
        return res.status(201).json({ ...message, pipAnalyzing: true });
      }

      const isPipMention = /@pip\b/i.test(input.content);
      // Only show thinking bubble if there's enough chat context for Pip to respond
      const existingMsgCount = await storage.getMessagesByGroup(groupId).then(m => m.length);
      const hasEnoughContext = existingMsgCount >= 3;
      const pipAnalyzing = isPipMention || (hasEnoughContext && willAnalyze(groupId));

      if (isPipMention) {
        const question = input.content.replace(/@pip\b/gi, "").trim();
        setPipThinking(groupId);
        respondToPipMention(groupId, question || input.content).catch(err => console.error("Pip mention error:", err));
      } else if (pipAnalyzing) {
        setPipThinking(groupId);
        analyzeTripChat(groupId).catch(err => console.error("Trip analysis error:", err));
      }

      res.status(201).json({ ...message, pipAnalyzing });
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

  // === TRIP LOCK ===

  app.post(api.tripLock.lock.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const { alternativeId } = req.body as { alternativeId?: number };

    const trip = await storage.getTripPlanByGroup(groupId);
    if (!trip) {
      return res.status(404).json({ message: "Trip plan not found" });
    }

    let dest = trip.destination;
    if (alternativeId) {
      const alt = await storage.getTripAlternativeById(alternativeId);
      if (alt?.destination) dest = alt.destination;
    }

    await storage.upsertTripPlan(groupId, {
      confidenceScore: 100,
      status: "Trip locked",
      winningAlternativeId: alternativeId ?? trip.winningAlternativeId,
    });

    const destLabel = dest ? ` to ${dest}` : "";
    await postPipMessage(
      groupId,
      `🔒 The trip${destLabel} is officially locked! Congrats everyone — time to get packing! Share the trip summary to let everyone know the final plan.`
    );

    res.json({ success: true });
  });

  app.post(api.tripLock.unlock.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const trip = await storage.getTripPlanByGroup(groupId);
    if (!trip) return res.status(404).json({ message: "Trip plan not found" });
    await storage.upsertTripPlan(groupId, { status: "Almost decided", confidenceScore: 85 });
    await postPipMessage(groupId, "Trip unlocked 🔓 — back to planning mode! Let me know if anything changed.");
    res.json({ success: true });
  });

  // === PIP MESSAGES (dedicated endpoint) ===

  app.get(api.pipMessages.list.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const msgs = await storage.getPipMessagesByGroup(groupId);
    res.json(msgs);
  });

  // === PINBOARD ===

  app.get(api.pinboard.list.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    res.json(await storage.getPinboardItems(groupId));
  });

  app.post(api.pinboard.add.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const { title, emoji, category, addedByName } = req.body;
    const item = await storage.addPinboardItem(groupId, title, emoji, category, addedByName);
    res.status(201).json(item);
  });

  app.delete(api.pinboard.remove.path, async (req, res) => {
    const itemId = Number(req.params.itemId);
    await storage.removePinboardItem(itemId);
    res.json({ success: true });
  });

  // === PRESENCE ===

  // GET /api/groups/:groupId/presence — returns online participants and typing status
  app.get("/api/groups/:groupId/presence", async (req, res) => {
    const groupId = Number(req.params.groupId);
    if (!groupId) return res.status(400).json({ message: "Invalid groupId" });

    const group = await storage.getGroupById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const online = getOnlinePresence(groupId);
    res.json({
      participants: online.map(e => ({
        participantId: e.participantId,
        name: e.name,
        isTyping: e.isTyping,
      })),
      pipIsThinking: isPipThinking(groupId),
    });
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

  // === AUTH ===

  app.post("/api/auth/signup", async (req, res) => {
    const ip = req.ip ?? "unknown";
    if (!checkRateLimit(ip)) return res.status(429).json({ message: "Too many attempts. Please wait 15 minutes." });
    const { email, password, name } = req.body;
    const validationError = validateSignupInput(email, password, name);
    if (validationError) return res.status(400).json({ message: validationError });
    try {
      const user = await signup(email, password, name);
      resetRateLimit(ip);
      const token = signToken(user.id);
      res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const ip = req.ip ?? "unknown";
    if (!checkRateLimit(ip)) return res.status(429).json({ message: "Too many attempts. Please wait 15 minutes." });
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    try {
      const user = await login(email, password);
      resetRateLimit(ip);
      const token = signToken(user.id);
      res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } });
    } catch (err: any) {
      res.status(401).json({ message: err.message });
    }
  });

  app.post("/api/auth/google", async (req, res) => {
    const ip = req.ip ?? "unknown";
    if (!checkRateLimit(ip)) return res.status(429).json({ message: "Too many attempts. Please wait 15 minutes." });
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: "idToken required" });
    try {
      const user = await loginWithGoogle(idToken);
      resetRateLimit(ip);
      const token = signToken(user.id);
      res.json({ token, user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl } });
    } catch (err: any) {
      res.status(401).json({ message: err.message });
    }
  });

  app.get("/api/auth/config", (_req, res) => {
    res.json({ googleClientId: GOOGLE_CLIENT_ID ?? null });
  });

  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    const user = await getUserById((req as any).userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl });
  });

  app.put("/api/users/me", authMiddleware, async (req, res) => {
    const userId = (req as any).userId;
    const { name, avatarUrl } = req.body;
    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return res.status(400).json({ message: "Name is required" });
    }
    const [updated] = await db.update(users)
      .set({ name: name.trim(), ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}) })
      .where(eq(users.id, userId))
      .returning();
    res.json({ id: updated.id, email: updated.email, name: updated.name, avatarUrl: updated.avatarUrl });
  });

  // === BOOKING COMMITMENTS ===

  app.get("/api/groups/:groupId/commitments", async (req, res) => {
    const groupId = Number(req.params.groupId);
    const commitments = await storage.getCommitments(groupId);
    res.json(commitments);
  });

  app.post("/api/groups/:groupId/commitments", async (req, res) => {
    const groupId = Number(req.params.groupId);
    const { participantId, flightBooked, lodgingStatus } = req.body;
    if (!participantId) return res.status(400).json({ message: "participantId required" });
    const result = await storage.upsertCommitment(groupId, participantId, { flightBooked, lodgingStatus });
    res.json(result);
  });

  // === INVITE BY EMAIL ===

  app.post("/api/groups/:groupId/invite", authMiddleware, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const userId = (req as any).userId;
    const { emails } = req.body;

    if (!Array.isArray(emails) || emails.length === 0)
      return res.status(400).json({ message: "At least one email required" });
    if (emails.length > 10)
      return res.status(400).json({ message: "Max 10 invites at a time" });

    const group = await storage.getGroupById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });

    const [inviter] = await db.select().from(users).where(eq(users.id, userId));
    const inviterName = inviter?.name || "Someone";
    const tripName = group.name;
    const slug = group.shareLinkSlug;

    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({ message: "Email not configured on this server." });
    }

    const { sendTripInvite } = await import("./email");
    const results = await Promise.allSettled(
      emails.map((email: string) =>
        sendTripInvite({ toEmail: email.trim(), inviterName, tripName, slug })
      )
    );

    const failed = results.filter(r => r.status === "rejected").length;
    if (failed === emails.length) return res.status(500).json({ message: "Failed to send invites." });

    res.json({ sent: emails.length - failed, failed });
  });

  // === GROUP MANAGEMENT ===

  app.patch("/api/groups/:groupId/name", authMiddleware, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const userId = (req as any).userId;
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ message: "Name required" });
    const group = await storage.getGroupById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (group.createdByUserId !== userId) return res.status(403).json({ message: "Not authorized" });
    const updated = await storage.updateGroupName(groupId, name.trim());
    res.json(updated);
  });

  app.delete("/api/groups/:groupId", authMiddleware, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const userId = (req as any).userId;
    const group = await storage.getGroupById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    if (group.createdByUserId !== userId) return res.status(403).json({ message: "Not authorized" });
    await storage.deleteGroup(groupId);
    res.json({ ok: true });
  });

  // === MY TRIPS ===

  app.get("/api/users/me/trips", authMiddleware, async (req, res) => {
    const userId = (req as any).userId;
    // Find all participant rows for this user
    const myParticipants = await db.select().from(participants).where(eq(participants.userId, userId));
    if (myParticipants.length === 0) return res.json([]);
    const groupIds = Array.from(new Set(myParticipants.map(p => p.groupId)));
    // Fetch groups + trip plans in parallel
    const [allGroups, allPlans] = await Promise.all([
      db.select().from(groups).where(inArray(groups.id, groupIds)),
      db.select().from(tripPlans).where(inArray(tripPlans.groupId, groupIds)),
    ]);
    const planByGroup = Object.fromEntries(allPlans.map(p => [p.groupId, p]));
    const result = allGroups.map(g => ({
      ...g,
      tripPlan: planByGroup[g.id] ?? null,
    }));
    // Sort newest first
    result.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    res.json(result);
  });

  // === LINK PARTICIPANT TO USER when joining ===
  // (handled inline in the join route — patching here via middleware on group join)

  return httpServer;
}

// ============================================================
//  PIP DIRECT RESPONSE (@pip mention)
// ============================================================

async function respondToPipMention(groupId: number, question: string): Promise<void> {
  const [msgs, plan, alts, participants, signals, pipMsgs] = await Promise.all([
    storage.getMessagesByGroup(groupId),
    storage.getTripPlanByGroup(groupId),
    storage.getTripAlternativesByGroup(groupId),
    storage.getParticipantsByGroup(groupId),
    storage.getSupportSignalsByGroup(groupId),
    storage.getPipMessagesByGroup(groupId),
  ]);

  // Detect "lock the trip" intent — broad matching, fires before flight/lodging check
  const lockPhrases = [
    /\block\s*(this\s*)?(trip|it|us|everything)\b/i,
    /\block\s*(it|us|this|the\s+trip)\s*in\b/i,
    /\block\s*(it\s+)?down\b/i,
    /\bwe('re| are)\s+(locked|set|doing\s+this|going\s+with|booked|all\s+in|done)\b/i,
    /\b(it'?s?(\s+all)?)\s+(happening|confirmed|official|a\s+go|locked\s+in)\b/i,
    /\bdone\s+deal\b/i,
    /\bwe\s+did\s+it\b/i,
    /\bwe('?re?)?\s+going\b/i,
    /\bbook\s+it\b/i,
    /\blet'?s?\s+(do\s+)?this\b/i,
    /\bwe'?re?\s+set\b/i,
    /\b(finalize|finalise)\s+(the\s+)?trip\b/i,
    /\bit'?s?\s+official\b/i,
    /\bwe'?re?\s+all\s+in\b/i,
  ];
  const flightLodgingPattern = /\b(flight|hotel|airbnb|vrbo|lodging|accommodation|booking)\b/i;
  const isTripLockIntent = lockPhrases.some(p => p.test(question)) && !flightLodgingPattern.test(question);
  if (isTripLockIntent) {
    const existingPlan = await storage.getTripPlanByGroup(groupId);
    if (existingPlan?.status === "Trip locked") {
      await postPipMessage(groupId, "The trip is already locked! 🔒 If you need to make changes, use the unlock button in the trip panel.");
    } else {
      const dest = existingPlan?.destination ?? "";
      const destLabel = dest ? ` to ${dest}` : "";
      await storage.upsertTripPlan(groupId, { confidenceScore: 100, status: "Trip locked" });
      await postPipMessage(groupId, `🔒 The trip${destLabel} is officially locked! Congrats everyone — time to get packing! Share the trip summary to let everyone know the final plan.`);
      generateActivitySuggestions(groupId, dest).catch(err => console.error("Activity gen failed:", err));
    }
    return;
  }

  // Detect finalize intent before going to the LLM
  const finalizePattern = /\b(finalize|finalise|lock\s*(in|it|this)|book\s*(it|this)|confirm(ed)?|go\s*with\s*this|this\s*one|done deal)\b/i;
  const flightPattern = /\bflight(s)?\b/i;
  const lodgingPattern = /\b(hotel|airbnb|vrbo|lodging|accommodation|place(s)?\s*to\s*stay|stay(ing)?)\b/i;

  if (finalizePattern.test(question)) {
    const isFlightFinalize = flightPattern.test(question) || (!lodgingPattern.test(question));
    const isLodgingFinalize = lodgingPattern.test(question);

    // Extract any URL included in the message
    const urlMatch = question.match(/https?:\/\/[^\s]+/);
    const providedUrl = urlMatch ? urlMatch[0] : null;

    if (isFlightFinalize && !plan?.flightsBooked) {
      if (providedUrl) {
        const details = await scrapeFlightDetails(providedUrl);
        await storage.upsertTripPlan(groupId, {
          flightsBooked: true,
          finalizedFlightUrl: providedUrl,
          flightDetails: details ? JSON.stringify(details) : null,
        } as any);
        await postPipMessage(groupId, `Flights finalized! ✈️ I've saved the link for everyone — tap "Flights" in the trip panel to access it.`);
      } else {
        const airlineMatch = question.match(/\b(united|delta|american|southwest|jetblue|alaska|spirit|frontier|allegiant|air canada|british airways|lufthansa|air france)\b/i);
        const airlineName = airlineMatch ? airlineMatch[1] : null;
        const flightRef = airlineName ? `the ${airlineName} flight` : "your flight";
        pendingFinalizationStore.set(groupId, 'flights');
        await postPipMessage(groupId, `Got it! To finalize ${flightRef}, drop the booking link here and I'll save it for everyone. ✈️`);
      }
      return;
    }
    if (isLodgingFinalize && !(plan as any)?.lodgingBooked) {
      if (providedUrl) {
        await storage.upsertTripPlan(groupId, { lodgingBooked: true, finalizedLodgingUrl: providedUrl } as any);
        await postPipMessage(groupId, `Lodging finalized! 🏠 I've saved the booking link — it's in the trip panel for everyone.`);
      } else {
        pendingFinalizationStore.set(groupId, 'lodging');
        await postPipMessage(groupId, `Got it! Drop the booking confirmation link here and I'll save it for everyone. 🏠`);
      }
      return;
    }
  }

  // Build interleaved conversation history (user + Pip) sorted by timestamp, last 10 turns
  const userTurns = msgs.map(m => ({
    at: new Date(m.createdAt ?? 0).getTime(),
    role: "user" as const,
    content: `${m.participantName}: ${m.content}`,
  }));
  const pipTurns = pipMsgs
    .filter(m => !m.content.startsWith("FLIGHT_REC:") && !m.content.startsWith("LODGING_REC:"))
    .map(m => ({
      at: new Date(m.createdAt ?? 0).getTime(),
      role: "assistant" as const,
      content: m.content,
    }));
  const conversationHistory = [...userTurns, ...pipTurns]
    .sort((a, b) => a.at - b.at)
    .slice(-10)
    .map(({ role, content }) => ({ role, content }));

  const availabilityLines = signals.length > 0
    ? signals.map(s => {
        const person = participants.find(p => p.id === s.participantId)?.name ?? `participant ${s.participantId}`;
        const target = s.alternativeId
          ? (alts.find(a => a.id === s.alternativeId)?.destination ?? "an alternative")
          : "the main plan";
        return `${person}: ${s.commitmentLevel} → ${target}`;
      }).join("\n")
    : "No explicit availability signals yet.";

  const tripContext = [
    plan?.destination && `Destination: ${plan.destination}`,
    plan?.startDate && plan?.endDate && `Dates: ${plan.startDate} – ${plan.endDate}`,
    plan?.budgetBand && `Budget: ${plan.budgetBand}`,
    alts.length > 0 && `Alternatives: ${alts.map(a => `${a.destination} (${a.dateRange ?? "dates TBD"})`).join(", ")}`,
    `Group members: ${participants.map(p => p.name).join(", ")}`,
    `Availability signals:\n${availabilityLines}`,
  ].filter(Boolean).join("\n");

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const systemPrompt = `You are Pip, a friendly AI travel planning assistant in a group chat. A user has directly asked you a question with @pip.
Today is ${today}.

Trip context:
${tripContext}

SCHEDULING RULES — apply these exactly when answering date/scheduling questions:
- "Weekend trip" means departing Friday, returning Sunday or Monday. NEVER suggest starting on a Saturday or Sunday.
- "A weekend" = Friday–Sunday (3 nights). "Long weekend" = Friday–Monday. Always name the specific Friday start date.
- To find the right weekend: (1) List each person's stated unavailability from the conversation history. (2) List candidate Fridays. (3) Pick the first Friday where everyone is free.
- When the user pushes back on a suggested date, pick a DIFFERENT date — do not repeat the same one.
- Always verify the day-of-week using today's date as a reference (e.g. if today is ${today}, count forward to find which dates fall on Fridays).
- Name exact dates (e.g. "May 23–25" not "the last weekend of May"). Do not include URLs.

The conversation history below shows what everyone said and what you (Pip) previously replied. Use it to give specific, contextual answers — reference people by name, acknowledge what you said before, and don't repeat suggestions you already made.

Answer the user's question directly in 1-3 sentences. Be warm and specific.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: question },
      ],
      max_tokens: 300,
      temperature: 0.5,
    });
    const answer = response.choices[0]?.message?.content?.trim();
    if (answer) {
      await postPipMessage(groupId, answer);
      // Re-sync trip plan so dates/details Pip just mentioned are reflected immediately
      analyzeTripChat(groupId, true).catch(err => console.error("Post-pip sync failed:", err));
    }
  } catch (err) {
    console.error("Pip mention response failed:", err);
  }
}

// ============================================================
//  ACTIVITY SUGGESTIONS (fires on trip lock)
// ============================================================

async function generateActivitySuggestions(groupId: number, destination: string): Promise<void> {
  if (!destination) return;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a travel expert. Return ONLY a valid JSON array of exactly 16 activity suggestions for a trip to ${destination}. Each item: {"emoji":"<single emoji>","title":"<short activity name, max 5 words>","category":"food|outdoor|nightlife|culture|adventure|relaxation"}. Vary the categories — no more than 3 of the same category. No markdown, no explanation.`,
        },
        { role: "user", content: `Give me 16 varied activities for ${destination}` },
      ],
      max_tokens: 700,
      temperature: 0.8,
    });
    const raw = response.choices[0]?.message?.content?.trim() ?? "[]";
    const items = JSON.parse(raw.replace(/^```json\n?|```$/g, ""));
    if (Array.isArray(items) && items.length > 0) {
      await postPipMessage(groupId, `ACTIVITY_REC:${JSON.stringify({ destination, items })}`);
    }
  } catch (err) {
    console.error("Activity suggestion failed:", err);
  }
}


// ─── Flight URL Scraper ───────────────────────────────────────────────────────

export interface FlightDetails {
  source: string;
  origin?: string;
  destination?: string;
  departDate?: string;
  returnDate?: string;
  title?: string;
}

function formatIsoDate(d: string): string {
  const dt = new Date(d + "T12:00:00Z");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatSkyscannerDate(d: string): string {
  const year = "20" + d.slice(0, 2);
  const month = d.slice(2, 4);
  const day = d.slice(4, 6);
  return formatIsoDate(`${year}-${month}-${day}`);
}

function domainLabel(host: string): string {
  const map: Record<string, string> = {
    "kayak.com": "Kayak", "google.com": "Google Flights",
    "expedia.com": "Expedia", "skyscanner.com": "Skyscanner",
    "skyscanner.net": "Skyscanner", "united.com": "United Airlines",
    "delta.com": "Delta", "aa.com": "American Airlines",
    "southwest.com": "Southwest", "jetblue.com": "JetBlue",
    "alaskaair.com": "Alaska Airlines", "spirit.com": "Spirit",
    "flyfrontier.com": "Frontier", "aircanada.com": "Air Canada",
    "britishairways.com": "British Airways", "lufthansa.com": "Lufthansa",
    "airfrance.com": "Air France",
  };
  return map[host] || host;
}

async function scrapeFlightDetails(url: string): Promise<FlightDetails | null> {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    // Kayak: kayak.com/flights/JFK-LAX/2024-08-15/2024-08-22
    const kayakMatch = url.match(/kayak\.[a-z.]+\/flights\/([A-Z]{3})-([A-Z]{3})\/(\d{4}-\d{2}-\d{2})(?:\/(\d{4}-\d{2}-\d{2}))?/i);
    if (kayakMatch) {
      return {
        source: "Kayak",
        origin: kayakMatch[1].toUpperCase(),
        destination: kayakMatch[2].toUpperCase(),
        departDate: formatIsoDate(kayakMatch[3]),
        ...(kayakMatch[4] ? { returnDate: formatIsoDate(kayakMatch[4]) } : {}),
      };
    }

    // Skyscanner: skyscanner.com/transport/flights/jfk/lax/240815/240822
    const skyMatch = url.match(/skyscanner\.[a-z.]+\/transport\/flights\/([a-z]{3})\/([a-z]{3})\/(\d{6})(?:\/(\d{6}))?/i);
    if (skyMatch) {
      return {
        source: "Skyscanner",
        origin: skyMatch[1].toUpperCase(),
        destination: skyMatch[2].toUpperCase(),
        departDate: formatSkyscannerDate(skyMatch[3]),
        ...(skyMatch[4] ? { returnDate: formatSkyscannerDate(skyMatch[4]) } : {}),
      };
    }

    // Google Flights with readable q param
    if (host === "google.com" && parsed.pathname.includes("/travel/flights")) {
      const q = parsed.searchParams.get("q");
      return { source: "Google Flights", ...(q ? { title: q } : {}) };
    }

    // Fetch page for title/OG tags (5s timeout)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
      });
      clearTimeout(timer);
      if (res.ok) {
        const html = await res.text();
        const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
        const pageTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
        const rawTitle = (ogTitle || pageTitle || "").trim().replace(/\s+/g, " ");
        if (rawTitle) return { source: domainLabel(host), title: rawTitle.slice(0, 80) };
      }
    } catch {
      clearTimeout(timer);
    }

    return { source: domainLabel(host) };
  } catch {
    return null;
  }
}

async function handlePendingFinalization(groupId: number, type: 'flights' | 'lodging', url: string): Promise<void> {
  if (type === 'flights') {
    const details = await scrapeFlightDetails(url);
    await storage.upsertTripPlan(groupId, {
      flightsBooked: true,
      finalizedFlightUrl: url,
      flightDetails: details ? JSON.stringify(details) : null,
    } as any);
    await postPipMessage(groupId, `Flights finalized! ✈️ I've saved the link for everyone — tap "Flights" in the trip panel to access it.`);
  } else {
    await storage.upsertTripPlan(groupId, { lodgingBooked: true, finalizedLodgingUrl: url } as any);
    await postPipMessage(groupId, `Lodging finalized! 🏠 I've saved the booking link — it's in the trip panel for everyone.`);
  }
}

// Wrapper so every pip post auto-clears the thinking indicator
async function postPipMessage(groupId: number, content: string) {
  await storage.createPipMessage(groupId, content);
  clearPipThinking(groupId);
}

// ============================================================
//  SERVER-SIDE URL BUILDER (avoids AI hallucinating wrong years)
// ============================================================

function parseDateToISO(dateStr: string): string | null {
  if (!dateStr) return null;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const now = new Date();
  // Try "May 24" or "May 24, 2025"
  let parsed = new Date(`${dateStr} ${now.getFullYear()}`);
  if (isNaN(parsed.getTime())) return null;
  // If the parsed date is more than 2 weeks in the past, bump to next year
  if (parsed.getTime() < now.getTime() - 14 * 24 * 60 * 60 * 1000) {
    parsed = new Date(`${dateStr} ${now.getFullYear() + 1}`);
  }
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
}

const IATA: Record<string, string> = {
  "new york": "JFK", "nyc": "JFK", "los angeles": "LAX", "la": "LAX",
  "chicago": "ORD", "san francisco": "SFO", "sf": "SFO", "seattle": "SEA",
  "miami": "MIA", "dallas": "DFW", "houston": "IAH", "boston": "BOS",
  "atlanta": "ATL", "denver": "DEN", "las vegas": "LAS", "phoenix": "PHX",
  "washington": "IAD", "dc": "IAD", "minneapolis": "MSP", "detroit": "DTW",
  "san diego": "SAN", "portland": "PDX", "charlotte": "CLT", "orlando": "MCO",
  "austin": "AUS", "nashville": "BNA", "new orleans": "MSY", "salt lake city": "SLC",
  "toronto": "YYZ", "montreal": "YUL", "london": "LHR", "paris": "CDG",
  "tokyo": "NRT", "dubai": "DXB", "cancun": "CUN", "mexico city": "MEX",
};

function cityToIATA(city: string): string {
  return IATA[city.toLowerCase()] ?? city.toUpperCase().slice(0, 3);
}

interface TripUrls {
  flightSearchUrl: string | null;
  kayakUrl: string | null;
  airbnbUrl: string | null;
  hotelsUrl: string | null;
}

function buildTripUrls(
  destination: string | null,
  startDate: string | null,
  endDate: string | null,
  originCity: string | null,
  guestCount: number,
  includeLodging: boolean,
): TripUrls {
  if (!destination || !startDate || !endDate) {
    return { flightSearchUrl: null, kayakUrl: null, airbnbUrl: null, hotelsUrl: null };
  }

  const startISO = parseDateToISO(startDate);
  const endISO = parseDateToISO(endDate);
  if (!startISO || !endISO) {
    return { flightSearchUrl: null, kayakUrl: null, airbnbUrl: null, hotelsUrl: null };
  }

  const destEnc = encodeURIComponent(destination);
  const destPlus = destination.replace(/\s+/g, "+");
  const guests = Math.max(1, guestCount);

  // Google Flights
  const flightSearchUrl = originCity
    ? `https://www.google.com/travel/flights?q=flights+from+${originCity.replace(/\s+/g, "+")}+to+${destPlus}+${startDate.replace(/\s+/g, "+")}+to+${endDate.replace(/\s+/g, "+")}`
    : `https://www.google.com/travel/flights?q=flights+to+${destPlus}+${startDate.replace(/\s+/g, "+")}+to+${endDate.replace(/\s+/g, "+")}`;

  // Kayak
  const destIATA = cityToIATA(destination);
  const kayakUrl = originCity
    ? `https://www.kayak.com/flights/${cityToIATA(originCity)}-${destIATA}/${startISO}/${endISO}`
    : `https://www.kayak.com/flights/anywhere/${destEnc}/${startISO}/${endISO}`;

  // Lodging
  const airbnbUrl = includeLodging
    ? `https://www.airbnb.com/s/${destEnc}/homes?checkin=${startISO}&checkout=${endISO}&adults=${guests}`
    : null;
  const hotelsUrl = includeLodging
    ? `https://www.booking.com/searchresults.html?ss=${destEnc}&checkin=${startISO}&checkout=${endISO}&group_adults=${guests}`
    : null;

  return { flightSearchUrl, kayakUrl, airbnbUrl, hotelsUrl };
}

// ============================================================
//  TRAVEL AI PIPELINE
// ============================================================

async function analyzeTripChat(groupId: number, bypassCooldown = false): Promise<void> {
  // Capture state BEFORE AI analysis for material-change comparison
  const [previousPlan, previousAlts, previousPipMsgs] = await Promise.all([
    storage.getTripPlanByGroup(groupId),
    storage.getTripAlternativesByGroup(groupId),
    storage.getPipMessagesByGroup(groupId),
  ]);

  const msgs = await storage.getMessagesByGroup(groupId);
  if (msgs.length === 0) return;

  // Cooldown check (skipped when bypassCooldown=true, e.g. after @pip response)
  const cooldown = analysisCooldowns.get(groupId);
  const now = Date.now();
  if (!bypassCooldown && cooldown) {
    const elapsed = now - cooldown.lastRunAt;
    if (elapsed < COOLDOWN_MIN_MS) return;
  }
  analysisCooldowns.set(groupId, { lastMessageCount: msgs.length, lastRunAt: now });

  const participantsList = await storage.getParticipantsByGroup(groupId);
  const participantNames = participantsList.map(p => p.name);

  // Include recent pip messages interleavd so the extractor sees Pip's own recommendations
  const pipMsgs = await storage.getPipMessagesByGroup(groupId);
  const allMessages = [
    ...msgs.map(m => ({ createdAt: m.createdAt, line: `${m.participantName}: ${m.content}` })),
    ...pipMsgs
      .filter(p => !p.content.startsWith("FLIGHT_REC:") && !p.content.startsWith("LODGING_REC:"))
      .map(p => ({ createdAt: p.createdAt, line: `Pip: ${p.content}` })),
  ].sort((a, b) => (a.createdAt ? new Date(a.createdAt).getTime() : 0) - (b.createdAt ? new Date(b.createdAt).getTime() : 0));

  const chatLog = allMessages
    .slice(-30)
    .map(m => m.line)
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
    "originCity": null,
    "flightsMentioned": false,
    "lodgingMentioned": false,
    "guestCount": null,
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
  "conflictDetected": false,
  "shouldPipSpeak": false,
  "pipMessage": null
}

RULES:
1. confidenceScore 0-100: base on destination consensus strength, date agreement, attendance clarity, conflict count.
2. Only create alternatives that have real chat evidence. Do NOT hallucinate. Each alternative must differ from main plan in destination or dates.
3. attendanceSignals — use exact member names from the list provided. "committed" = "book me in", "I'm in", "definitely"; "likely" = "planning to", "should be able to"; "interested" = "down for", "sounds fun", "maybe"; "unavailable" = "can't make it", "working that day", "won't be there".
4. conflictDetected: set true if ANY message in the chat proposes dates/months that ANOTHER participant has explicitly said they cannot do. This overrides all other conditions — if conflictDetected=true you MUST set shouldPipSpeak=true. Examples: someone says "I'm busy in June" and later anyone suggests June dates; someone says "I can't do July" and then July is proposed. Scan ALL messages — the unavailability and the conflict proposal do not have to be adjacent.
5. shouldPipSpeak = true when ANY of these apply: conflictDetected=true, a new strong option emerged, the main plan just shifted significantly, the group is visibly stuck (same topic debated 4+ times with no progress), one clarifying question would unblock everything, all three key details are known for the first time. NOT after routine messages where nothing important changed.
5b. pipMessage: warm but direct, max 2 sentences. For conflicts, ALWAYS name the person and the month/date explicitly (e.g. "Heads up — Akshay said he's busy in June, so those dates won't work for him. Want to look at a different month?"). For stalemates, be proactive: "You've been going back and forth on [topic] — want me to suggest [specific resolution]?" null if shouldPipSpeak is false.
6. unresolvedQuestions: list only genuinely open questions (budget disagreements, unconfirmed dates, missing attendee commitment, etc.).
7. If fewer than 3 messages or no clear travel intent, set confidenceScore to 5 and shouldPipSpeak to false.
8. flightsBooked and lodgingBooked are NEVER set by AI — only via explicit @pip finalize. Do not include these fields.
8b. originCity: extract city the group flies FROM if mentioned (e.g. "flying out of NYC", "leaving from Chicago"). Use city name only. Null if not mentioned.
9. flightPipMessage: write a helpful 2-3 sentence plain-text flight summary WHENEVER destination AND both dates are known. Include typical roundtrip price range, direct vs connecting, and flight time. No URLs or markdown. Null if dest or dates missing.
10. ORIGIN PROMPT — if destination AND startDate AND endDate known but originCity is null: set shouldPipSpeak=true, pipMessage="Dates are looking good! Quick question — where is everyone flying from? That'll help me find the best flights."
11. flightsMentioned: true if anyone in the chat mentions flights, flying, plane, airport, booking flights, or asks about flying to the destination. Otherwise false.
11b. lodgingMentioned: true if anyone mentions hotels, Airbnb, VRBO, places to stay, accommodation, lodging, where to stay, or bnb. Otherwise false.
12. guestCount: extract the number of people attending if known or estimable from likelyAttendeeNames/committedAttendeeNames. Set to the count of attendees if known, null if unclear.
13. GUEST PROMPT — if lodgingMentioned is true but guestCount is null: include in pipMessage "How many people are coming? I'll use that to show the right-sized places to stay."
14. LODGING PIP — if lodgingMentioned becomes true and destination AND dates are known: set shouldPipSpeak=true, pipMessage="I found some great places to stay in [destination]! Check the trip panel for Airbnb and Booking.com links."`;

  let extracted: AiTripExtraction;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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

  const { mainPlan, confidenceScore, conflictDetected, flightPipMessage, alternatives, attendanceSignals, shouldPipSpeak, pipMessage } = extracted;

  const boostedConfidenceScore = confidenceScore;

  // Compute status — never overwrite a manually-locked trip
  const existingPlan = await storage.getTripPlanByGroup(groupId);
  const alreadyLocked = existingPlan?.status === "Trip locked";
  const status = alreadyLocked ? "Trip locked" : computeTripStatus({
    confidenceScore: boostedConfidenceScore,
    messageCount: msgs.length,
    destination: mainPlan.destination,
    committedNames: mainPlan.committedAttendeeNames,
    unresolvedCount: mainPlan.unresolvedQuestions.length,
    alternativeCount: alternatives.length,
    likelyNames: mainPlan.likelyAttendeeNames,
    totalParticipants: participantNames.length,
  });

  // Build URLs server-side with correct current year and guest count
  const guestCount = mainPlan.guestCount
    ?? Math.max(mainPlan.committedAttendeeNames.length, mainPlan.likelyAttendeeNames.length);
  const builtUrls = buildTripUrls(
    mainPlan.destination,
    mainPlan.startDate,
    mainPlan.endDate,
    mainPlan.originCity,
    guestCount,
    mainPlan.lodgingMentioned,
  );

  // Upsert main trip plan — never overwrite flightsBooked/lodgingBooked (set only via @pip finalize)
  await storage.upsertTripPlan(groupId, {
    destination: mainPlan.destination,
    startDate: mainPlan.startDate,
    endDate: mainPlan.endDate,
    budgetBand: mainPlan.budgetBand,
    lodgingPreference: mainPlan.lodgingPreference,
    lodgingType: inferLodgingType(mainPlan.lodgingPreference),
    flightSearchUrl: builtUrls.flightSearchUrl,
    kayakUrl: builtUrls.kayakUrl,
    ...(mainPlan.originCity ? { originCity: mainPlan.originCity } : {}),
    ...(builtUrls.airbnbUrl ? { airbnbUrl: builtUrls.airbnbUrl } : {}),
    ...(builtUrls.hotelsUrl ? { hotelsUrl: builtUrls.hotelsUrl } : {}),
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

    // Conflicts bypass backend gating — post immediately (1 min cooldown only)
    const isConflictAlert = conflictDetected && shouldPipSpeak;
    const shouldPost = shouldPipSpeak && (
      (isConflictAlert && minutesSinceLastPip >= 1) ||
      (minutesSinceLastPip >= 3 && (materialChange || groupStuck || hasLowConfidenceWithChat))
    );

    if (shouldPost) {
      await postPipMessage(groupId, pipMessage);
    }
  }

  // Flight pip message — fires when flights are mentioned OR whenever destination+dates are all known.
  // Uses its own dedup key so it's independent of the regular pip cooldown.
  const hasFullFlightInfo = !!(mainPlan.destination && mainPlan.startDate && mainPlan.endDate);
  const shouldCheckFlight = mainPlan.flightsMentioned || hasFullFlightInfo;

  if (shouldCheckFlight) {
    const currentFlightKey = hasFullFlightInfo
      ? `${mainPlan.destination}|${mainPlan.originCity ?? "any"}|${mainPlan.startDate}|${mainPlan.endDate}`
      : `mention|${groupId}`;
    const latestPlan = await storage.getTripPlanByGroup(groupId);
    const alreadyPostedFlight = latestPlan?.lastFlightRecoKey === currentFlightKey;

    if (!alreadyPostedFlight) {
      if (hasFullFlightInfo && flightPipMessage) {
        const flightPayload = `FLIGHT_REC:${JSON.stringify({
          text: flightPipMessage,
          googleUrl: builtUrls.flightSearchUrl,
          kayakUrl: builtUrls.kayakUrl,
        })}`;
        await postPipMessage(groupId, flightPayload);
      } else if (!hasFullFlightInfo && mainPlan.flightsMentioned) {
        const dest = mainPlan.destination ? ` to ${mainPlan.destination}` : "";
        await postPipMessage(groupId, `On it! I'll pull up flights${dest} as soon as we lock in the dates. ✈️`);
      }
      await storage.upsertTripPlan(groupId, { lastFlightRecoKey: currentFlightKey });
    }
  }

  // Lodging pip message — fires on first mention of lodging, regardless of whether dates are set.
  if (mainPlan.lodgingMentioned) {
    const hasFullInfo = !!(mainPlan.destination && mainPlan.startDate && mainPlan.endDate && (builtUrls.airbnbUrl || builtUrls.hotelsUrl));
    const currentLodgingKey = hasFullInfo
      ? `${mainPlan.destination}|${mainPlan.startDate}|${mainPlan.endDate}`
      : `mention|${groupId}`;
    const latestPlan = await storage.getTripPlanByGroup(groupId);
    const alreadyPostedLodging = (latestPlan as any)?.lastLodgingRecoKey === currentLodgingKey;

    if (!alreadyPostedLodging) {
      if (hasFullInfo) {
        const lodgingPayload = `LODGING_REC:${JSON.stringify({
          destination: mainPlan.destination,
          airbnbUrl: builtUrls.airbnbUrl,
          hotelsUrl: builtUrls.hotelsUrl,
        })}`;
        await postPipMessage(groupId, lodgingPayload);
      } else {
        const dest = mainPlan.destination ? ` in ${mainPlan.destination}` : "";
        await postPipMessage(groupId, `Love it! I'll share Airbnb and hotel options${dest} once we have the dates. 🏠`);
      }
      await storage.upsertTripPlan(groupId, { lastLodgingRecoKey: currentLodgingKey } as any);
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

  // "Trip locked" is ONLY set via the explicit lock button — never auto-computed here.

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
      flightSearchUrl: null, // built server-side
      kayakUrl: null,        // built server-side
      originCity: (mainPlan.originCity as string) ?? null,
      airbnbUrl: null,       // built server-side
      hotelsUrl: null,       // built server-side
      flightsMentioned: mainPlan.flightsMentioned === true,
      lodgingMentioned: mainPlan.lodgingMentioned === true,
      guestCount: typeof mainPlan.guestCount === "number" ? mainPlan.guestCount : null,
      likelyAttendeeNames: Array.isArray(mainPlan.likelyAttendeeNames) ? mainPlan.likelyAttendeeNames as string[] : [],
      committedAttendeeNames: Array.isArray(mainPlan.committedAttendeeNames) ? mainPlan.committedAttendeeNames as string[] : [],
      unresolvedQuestions: Array.isArray(mainPlan.unresolvedQuestions) ? mainPlan.unresolvedQuestions as string[] : [],
    },
    confidenceScore: typeof raw.confidenceScore === "number" ? raw.confidenceScore : 5,
    conflictDetected: raw.conflictDetected === true,
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
