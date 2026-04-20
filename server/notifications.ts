export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// Lazy-loaded because expo-server-sdk is ESM-only and cannot be require()'d.
// Dynamic import() works from CJS modules in Node.js 12+.
let _expoInstance: any = null;
let _ExpoClass: any = null;

async function getExpo() {
  if (!_expoInstance) {
    const mod = await import("expo-server-sdk");
    _ExpoClass = mod.Expo ?? mod.default;
    _expoInstance = new _ExpoClass({ accessToken: process.env.EXPO_ACCESS_TOKEN });
  }
  return { expo: _expoInstance, Expo: _ExpoClass };
}

export async function sendPushNotifications(
  tokens: string[],
  payload: PushPayload
): Promise<void> {
  const { expo, Expo } = await getExpo();
  const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t));
  if (validTokens.length === 0) return;

  const messages = validTokens.map((to: string) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));

  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of tickets as any[]) {
        if (ticket.status === "error") {
          console.error("Push notification error:", ticket.message, ticket.details);
        }
      }
    } catch (err) {
      console.error("Push chunk send failed:", err);
    }
  }
}

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

  if (body.length > 150) body = body.slice(0, 147) + "…";

  return {
    title: groupName ? `Pip · ${groupName}` : "Pip",
    body,
    data: { type: "pip_message" },
  };
}
