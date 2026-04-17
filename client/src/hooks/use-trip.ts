import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { api, buildUrl } from "@shared/routes";
import type { TripPlan, TripAlternative, CommitmentLevel, PipMessage } from "@shared/schema";

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
    },
  });
}
