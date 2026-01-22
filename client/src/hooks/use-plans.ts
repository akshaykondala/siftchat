import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function usePlan(groupId: number) {
  return useQuery({
    queryKey: [api.plans.get.path, groupId],
    queryFn: async () => {
      const url = buildUrl(api.plans.get.path, { groupId });
      const res = await fetch(url);
      if (res.status === 404) return null; // No plan yet
      if (!res.ok) throw new Error("Failed to fetch plan");
      return api.plans.get.responses[200].parse(await res.json());
    },
    enabled: !!groupId,
    refetchInterval: 5000, // Poll every 5s for AI updates
  });
}

export function useGeneratePlan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (groupId: number) => {
      const url = buildUrl(api.plans.generate.path, { groupId });
      const res = await fetch(url, { method: api.plans.generate.method });
      
      if (!res.ok) {
        throw new Error("Failed to generate plan");
      }
      return api.plans.generate.responses[200].parse(await res.json());
    },
    onSuccess: (_, groupId) => {
      queryClient.invalidateQueries({ queryKey: [api.plans.get.path, groupId] });
      toast({
        title: "Plan Updated",
        description: "The AI has analyzed the latest messages.",
      });
    },
    onError: () => {
      toast({
        title: "Analysis Failed",
        description: "Could not generate plan summary.",
        variant: "destructive",
      });
    }
  });
}
