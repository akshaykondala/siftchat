import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "xyz.siftchat.app",
  appName: "siftchat",
  // Live URL mode — loads the deployed web app directly.
  // This means every web deploy auto-updates the app with no App Store submission needed.
  webDir: "dist/public",
  server: {
    url: "https://siftchat.xyz",
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  ios: {
    contentInset: "never",
  },
};

export default config;
