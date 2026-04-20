import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

// Registers the device for push notifications and saves the Expo token to the backend.
// Only runs on native iOS/Android — no-ops on web.
export function usePushNotifications(authToken: string | null) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !authToken) return;

    async function register() {
      // Request permission
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== "granted") return;

      // Register with APNs
      await PushNotifications.register();

      // Listen for the token once
      const listener = await PushNotifications.addListener("registration", async (token) => {
        try {
          await fetch("/api/users/device-token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              token: token.value,
              platform: "ios",
            }),
          });
        } catch (err) {
          console.error("Failed to register push token:", err);
        }
        listener.remove();
      });

      // Log registration errors (don't crash the app)
      PushNotifications.addListener("registrationError", (err) => {
        console.error("Push registration error:", err);
      });
    }

    register().catch(console.error);
  }, [authToken]);
}
