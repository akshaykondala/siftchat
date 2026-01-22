import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { openai } from "./replit_integrations/audio/client"; // Re-using the configured OpenAI client

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Groups
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
    const participants = await storage.getParticipantsByGroup(group.id);
    res.json({ ...group, participants });
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

  // Messages
  app.get(api.messages.list.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const messages = await storage.getMessagesByGroup(groupId);
    res.json(messages);
  });

  app.post(api.messages.create.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    try {
      const input = api.messages.create.input.parse(req.body);
      // Verify participant belongs to group
      const participant = await storage.getParticipant(input.participantId);
      if (!participant || participant.groupId !== groupId) {
        return res.status(403).json({ message: "Invalid participant" });
      }

      const message = await storage.createMessage(groupId, input.participantId, input.content);
      
      // OPTIONAL: Trigger background plan update (fire and forget)
      // We don't await this so the message send is fast
      generatePlanSummary(groupId).catch(console.error);

      res.status(201).json(message);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // Plans
  app.get(api.plans.get.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    const plan = await storage.getPlanByGroup(groupId);
    if (!plan) {
      // If no plan exists, return empty or trigger generation
      return res.status(404).json({ message: "No plan generated yet" });
    }
    res.json(plan);
  });

  app.post(api.plans.generate.path, async (req, res) => {
    const groupId = Number(req.params.groupId);
    try {
      const plan = await generatePlanSummary(groupId);
      res.json(plan);
    } catch (err) {
      console.error("Plan generation error:", err);
      res.status(500).json({ message: "Failed to generate plan" });
    }
  });

  // Votes
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
      if (alternativeIndex < 0) {
        return res.status(400).json({ message: "alternativeIndex must be non-negative" });
      }
      // Validate participant belongs to group
      const participant = await storage.getParticipant(participantId);
      if (!participant || participant.groupId !== groupId) {
        return res.status(403).json({ message: "Invalid participant for this group" });
      }
      const vote = await storage.addVote(groupId, participantId, alternativeIndex);
      res.status(201).json(vote);
    } catch (err) {
      console.error("Vote error:", err);
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
      // Validate participant belongs to group
      const participant = await storage.getParticipant(participantId);
      if (!participant || participant.groupId !== groupId) {
        return res.status(403).json({ message: "Invalid participant for this group" });
      }
      await storage.removeVote(groupId, participantId);
      res.status(204).send();
    } catch (err) {
      console.error("Vote removal error:", err);
      res.status(500).json({ message: "Failed to remove vote" });
    }
  });

  return httpServer;
}

async function generatePlanSummary(groupId: number) {
  // 1. Get recent messages (e.g., last 50)
  const messages = await storage.getMessagesByGroup(groupId);
  
  if (messages.length === 0) {
    return storage.updatePlan(groupId, "No messages yet to summarize.");
  }

  // 2. Format for AI
  const chatLog = messages.map(m => `${m.participantName}: ${m.content}`).join("\n");

  // 3. Call OpenAI
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an event planning assistant. 
        Your goal is to read the chat log and extract the current agreed-upon details for the event.
        
        Output a JSON object with the following structure:
        {
          "what": "Brief event name",
          "when": "TIME/DATE ONLY - e.g. '7pm Friday' or 'Saturday at noon'. NO location info here. Use 'Undecided' if unclear.",
          "where": "LOCATION ONLY - e.g. 'Italian Restaurant' or 'Central Park'. NO time info here. Use 'Undecided' if unclear.",
          "mainPlanSupporters": ["Names of people who support the main when/where"],
          "rivalPlans": [
            { 
              "title": "Short descriptive name (e.g. 'Thai Place Option')", 
              "when": "TIME/DATE for this alternative",
              "where": "LOCATION for this alternative",
              "supporters": ["Names of people who suggested or prefer this"]
            }
          ],
          "who": [
            { "name": "Name", "status": "can_make_it" | "cannot_make_it" | "undecided", "reason": "Reason if provided" }
          ],
          "actions": [
            { "task": "What needs to be done", "assignee": "Name or 'Unassigned'" }
          ]
        }

        CRITICAL RULES:
        1. WHEN = time/date ONLY. WHERE = location ONLY. NEVER mix them. Keep them clean and separate.
        2. FAVOR "undecided" STATUS: Only mark someone as "cannot_make_it" if they EXPLICITLY say they are BUSY, UNAVAILABLE, or CANNOT ATTEND at that time. Examples:
           - "I'm working that day" = cannot_make_it
           - "I have plans" = cannot_make_it  
           - "I don't like that place" = undecided (they CAN go, just prefer not to)
           - "I prefer somewhere else" = undecided
           - "That time doesn't work for me" = cannot_make_it (explicit unavailability)
           - "I'd rather do 8pm" = undecided (preference, not unavailability)
        3. ANYONE who PROPOSES a time or place should be marked as "can_make_it" for that option.
        4. Count supporters accurately. If 3 people discuss and 2 agree on a plan, those 2 are supporters.
        5. Be extremely strict with 'actions' - ONLY include items explicitly agreed upon as tasks.
        6. For rivalPlans, each alternative must have separate when/where fields, not mixed together.`
      },
      {
        role: "user",
        content: `Chat Log:\n${chatLog}`
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const summary = response.choices[0].message.content || "{}";

  // 4. Save to DB
  return storage.updatePlan(groupId, summary);
}
