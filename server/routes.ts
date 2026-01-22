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
          "when": "Agreed time/date or 'Undecided'",
          "where": "Location or 'Undecided'",
          "rivalPlans": [
            { "title": "Alternative Option Title", "details": "When/Where details for this option" }
          ],
          "who": [
            { "name": "Name", "status": "can_make_it" | "cannot_make_it" | "undecided", "reason": "MUST specify the exact reason if provided in chat (e.g., 'Working late', 'Too far', 'Proposed 7pm instead')" }
          ],
          "actions": [
            { "task": "What needs to be done", "assignee": "Name or 'Unassigned'" }
          ]
        }

        Be extremely strict with 'actions' - ONLY include items that were explicitly agreed upon or requested as tasks. Do not include vague discussion items.
        Be extremely diligent in extracting 'reason' for EACH person. If a user says 'I can't because X', 'reason' MUST be 'X'. If they propose an alternative, that is their 'reason'.
        For 'rivalPlans', list EACH popular alternative being discussed as a separate object in the array.
        For 'actions', extract clear tasks and who is supposed to do them based on the chat.`
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
