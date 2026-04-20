import Expo, { type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushNotifications(
  tokens: string[],
  payload: PushPayload
): Promise<void> {
  const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t));
  if (validTokens.length === 0) return;

  const messages: ExpoPushMessage[] = validTokens.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));

  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);

      for (const ticket of tickets) {
        if (ticket.status === "error") {
          console.error("Push notification error:", ticket.message, ticket.details);
        }
      }
    } catch (err) {
      console.error("Push chunk send failed:", err);
    }
  }
}

// Derives a short human-readable title from a Pip message for the notification preview.
// Strips structured payloads (FLIGHT_REC, LODGING_REC, ACTIVITY_REC) down to readable text.
export function pipMessageToNotification(content: string, groupName: string): PushPayload {
  let body = content;

  if (content.startsWith("FLIGHT_REC:")) {
    try {
      const parsed = JSON.parse(content.slice("FLIGHT_REC:".length));
      body = parsed.text ?? "Pip found flight options for your trip.";
    } catch {
      body = "Pip found flight options for your trip. ✈️";
    }
  } else if (content.startsWith("LODGING_REC:")) {
    try {
      const parsed = JSON.parse(content.slice("LODGING_REC:".length));
      body = `Pip found places to stay in ${parsed.destination ?? "your destination"}. 🏠`;
    } catch {
      body = "Pip found lodging options for your trip. 🏠";
    }
  } else if (content.startsWith("ACTIVITY_REC:")) {
    body = "Pip added activity ideas to your trip board. 🎉";
  }

  // Truncate long messages for notification preview
  if (body.length > 150) body = body.slice(0, 147) + "…";

  return {
    title: groupName ? `Pip · ${groupName}` : "Pip",
    body,
    data: { type: "pip_message" },
  };
}
