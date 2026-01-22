import { storage } from "./storage";

async function seed() {
  const existing = await storage.getGroupBySlug("friday-dinner-sample");
  if (existing) return;

  console.log("Seeding database...");
  
  const group = await storage.createGroup("Friday Dinner");
  // Override slug for predictability in demo
  // Note: In a real app we wouldn't update slug manually, but for seeding it's fine or we could just use the generated one. 
  // Actually, let's just create it and print it.
  
  const participant = await storage.createParticipant(group.id, "Host");
  
  await storage.createMessage(group.id, participant.id, "Hey everyone! Let's plan dinner for this Friday.");
  await storage.createMessage(group.id, participant.id, "I was thinking 7pm at that new Italian place?");
  
  // Trigger initial plan
  await storage.updatePlan(group.id, "Proposed: Friday Dinner at 7pm (Italian place). Status: Planning.");
  
  console.log("Seeded Group:", group);
}

seed().catch(console.error);
