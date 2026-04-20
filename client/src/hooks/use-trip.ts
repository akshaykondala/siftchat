import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { api, buildUrl } from "@shared/routes";
import type { TripPlan, TripAlternative, CommitmentLevel, PipMessage, SupportSignal, PinboardItem } from "@shared/schema";

export function useLockTrip(groupId: number) {
  return useMutation({
    mutationFn: async ({ alternativeId }: { alternativeId?: number }) => {
      const url = buildUrl(api.tripLock.lock.path, { groupId });
      return apiRequest("POST", url, { alternativeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tripPlan.get.path, groupId] });
      queryClient.invalidateQueries({ queryKey: [api.tripAlternatives.list.path, groupId] });
      queryClient.invalidateQueries({ queryKey: [api.pipMessages.list.path, groupId] });
    },
  });
}

export function useUnlockTrip(groupId: number) {
  return useMutation({
    mutationFn: async () => {
      const url = buildUrl(api.tripLock.unlock.path, { groupId });
      return apiRequest("POST", url, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tripPlan.get.path, groupId] });
      queryClient.invalidateQueries({ queryKey: [api.pipMessages.list.path, groupId] });
    },
  });
}

export function useTripPlan(groupId: number) {
  return useQuery<TripPlan | null>({
    queryKey: [api.tripPlan.get.path, groupId],
    queryFn: async () => {
      const url = buildUrl(api.tripPlan.get.path, { groupId });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch trip plan");
      return res.json();
    },
    enabled: !!groupId,
    refetchInterval: 5000,
  });
}

export function useTripAlternatives(groupId: number) {
  return useQuery<TripAlternative[]>({
    queryKey: [api.tripAlternatives.list.path, groupId],
    queryFn: async () => {
      const url = buildUrl(api.tripAlternatives.list.path, { groupId });
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!groupId,
    refetchInterval: 5000,
    initialData: [],
  });
}

export function usePipMessages(groupId: number) {
  return useQuery<PipMessage[]>({
    queryKey: [api.pipMessages.list.path, groupId],
    queryFn: async () => {
      const url = buildUrl(api.pipMessages.list.path, { groupId });
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!groupId,
    refetchInterval: 3000,
    initialData: [],
  });
}

export function useVoteAlternative(groupId: number) {
  return useMutation({
    mutationFn: async ({
      alternativeId,
      participantId,
    }: {
      alternativeId: number;
      participantId: number;
    }) => {
      const url = buildUrl(api.tripAlternatives.vote.path, { groupId, alternativeId });
      return apiRequest("POST", url, { participantId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [api.tripAlternatives.list.path, groupId],
      });
      queryClient.invalidateQueries({
        queryKey: [api.tripPlan.get.path, groupId],
      });
    },
  });
}

export function useMyAttendance(groupId: number, participantId: number | null) {
  return useQuery<SupportSignal[]>({
    queryKey: [api.tripAttendance.get.path, groupId, participantId],
    queryFn: async () => {
      if (!participantId) return [];
      const url = buildUrl(api.tripAttendance.get.path, { groupId }) + `?participantId=${participantId}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!groupId && !!participantId,
    refetchInterval: 5000,
    initialData: [],
  });
}

export function useAllAttendance(groupId: number) {
  return useQuery<SupportSignal[]>({
    queryKey: [api.tripAttendance.get.path, groupId, "all"],
    queryFn: async () => {
      const url = buildUrl(api.tripAttendance.get.path, { groupId });
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!groupId,
    refetchInterval: 5000,
    initialData: [],
  });
}

export function usePinboard(groupId: number) {
  return useQuery<PinboardItem[]>({
    queryKey: [api.pinboard.list.path, groupId],
    queryFn: async () => {
      const url = buildUrl(api.pinboard.list.path, { groupId });
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!groupId,
    refetchInterval: 5000,
    initialData: [],
  });
}

export function useAddPin(groupId: number) {
  return useMutation({
    mutationFn: async (item: { title: string; emoji: string; category: string; addedByName: string }) => {
      const url = buildUrl(api.pinboard.add.path, { groupId });
      return apiRequest("POST", url, item);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.pinboard.list.path, groupId] }),
  });
}

export function useRemovePin(groupId: number) {
  return useMutation({
    mutationFn: async (itemId: number) => {
      const url = buildUrl(api.pinboard.remove.path, { groupId, itemId });
      return apiRequest("DELETE", url, undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.pinboard.list.path, groupId] }),
  });
}

export function useUpdateAttendance(groupId: number) {
  return useMutation({
    mutationFn: async ({
      participantId,
      alternativeId,
      commitmentLevel,
    }: {
      participantId: number;
      alternativeId: number | null;
      commitmentLevel: CommitmentLevel;
    }) => {
      const url = buildUrl(api.tripAttendance.update.path, { groupId });
      return apiRequest("POST", url, {
        participantId,
        alternativeId,
        commitmentLevel,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [api.tripAlternatives.list.path, groupId],
      });
      queryClient.invalidateQueries({
        queryKey: [api.tripPlan.get.path, groupId],
      });
      queryClient.invalidateQueries({
        queryKey: [api.tripAttendance.get.path, groupId],
      });
    },
  });
}
