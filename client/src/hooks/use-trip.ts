import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { TripPlan, TripAlternative, CommitmentLevel } from "@shared/schema";

export function useTripPlan(groupId: number) {
  return useQuery<TripPlan | null>({
    queryKey: ["/api/groups", groupId, "trip"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/trip`);
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
    queryKey: ["/api/groups", groupId, "trip", "alternatives"],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}/trip/alternatives`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!groupId,
    refetchInterval: 5000,
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
      return apiRequest(
        "POST",
        `/api/groups/${groupId}/trip/alternatives/${alternativeId}/vote`,
        { participantId }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/groups", groupId, "trip", "alternatives"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/groups", groupId, "trip"],
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
      return apiRequest("POST", `/api/groups/${groupId}/trip/attendance`, {
        participantId,
        alternativeId,
        commitmentLevel,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/groups", groupId, "trip", "alternatives"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/groups", groupId, "trip"],
      });
    },
  });
}
