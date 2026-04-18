import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useCallback } from "react";

export interface PresenceUser {
  participantId: number;
  name: string;
  isTyping: boolean;
}

interface PresenceResponse {
  participants: PresenceUser[];
  pipIsThinking: boolean;
}

const HEARTBEAT_INTERVAL_MS = 8_000;   // send keepalive every 8s regardless of state
const TYPING_REFRESH_MS = 2_000;       // re-send isTyping=true every 2s while composing
const POLL_INTERVAL_MS = 2_000;        // poll for others' presence every 2s

async function postPresence(groupId: number, participantId: number, isTyping: boolean) {
  try {
    await fetch(`/api/groups/${groupId}/presence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, isTyping }),
    });
  } catch {
    // Ignore network errors — presence is best-effort
  }
}

export function usePresence(
  groupId: number,
  participantId: number | null,
  isTyping: boolean
) {
  const isTypingRef = useRef<boolean>(false);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendPresence = useCallback(
    (typing: boolean) => {
      if (!groupId || !participantId) return;
      postPresence(groupId, participantId, typing);
    },
    [groupId, participantId]
  );

  // ── Heartbeat: always running, keeps lastSeenAt fresh ───────────────────────
  // Sends the current isTyping state every HEARTBEAT_INTERVAL_MS.
  // This ensures the user stays "online" even during prolonged typing sessions.
  useEffect(() => {
    if (!participantId || !groupId) return;

    // Send immediate heartbeat on mount / participantId change
    sendPresence(isTypingRef.current);

    heartbeatTimerRef.current = setInterval(() => {
      sendPresence(isTypingRef.current);
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [participantId, groupId, sendPresence]);

  // ── Typing state sync: re-send while typing to keep server TTL alive ────────
  useEffect(() => {
    if (!participantId || !groupId) return;

    const wasTyping = isTypingRef.current;
    isTypingRef.current = isTyping;

    // Always send when state changes (false→true or true→false)
    if (isTyping !== wasTyping) {
      sendPresence(isTyping);
    }

    // While typing, keep refreshing every TYPING_REFRESH_MS to beat the 5s server TTL
    if (isTyping) {
      typingRefreshTimerRef.current = setInterval(() => {
        if (isTypingRef.current) {
          sendPresence(true);
        }
      }, TYPING_REFRESH_MS);
    } else {
      if (typingRefreshTimerRef.current) {
        clearInterval(typingRefreshTimerRef.current);
        typingRefreshTimerRef.current = null;
      }
    }

    return () => {
      if (typingRefreshTimerRef.current) {
        clearInterval(typingRefreshTimerRef.current);
        typingRefreshTimerRef.current = null;
      }
    };
  }, [isTyping, participantId, groupId, sendPresence]);

  // ── Poll for others' presence ────────────────────────────────────────────────
  const query = useQuery<PresenceResponse>({
    queryKey: ["/api/groups/presence", groupId],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/presence`);
      if (!res.ok) return { participants: [], pipIsThinking: false };
      return res.json();
    },
    enabled: !!groupId && !!participantId,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const onlineUsers = query.data?.participants ?? [];
  const pipIsThinking = query.data?.pipIsThinking ?? false;

  // Exclude ourselves from the lists shown to the user
  const otherOnline = onlineUsers.filter((u) => u.participantId !== participantId);
  const typingUsers = otherOnline.filter((u) => u.isTyping);

  return {
    onlineUsers,
    otherOnline,
    typingUsers,
    pipIsThinking,
  };
}
