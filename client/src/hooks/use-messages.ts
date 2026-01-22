import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { CreateMessageRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useMessages(groupId: number) {
  return useQuery({
    queryKey: [api.messages.list.path, groupId],
    queryFn: async () => {
      const url = buildUrl(api.messages.list.path, { groupId });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch messages");
      return api.messages.list.responses[200].parse(await res.json());
    },
    enabled: !!groupId,
    refetchInterval: 3000, // Poll every 3s for new messages
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ groupId, ...data }: { groupId: number } & CreateMessageRequest) => {
      const validated = api.messages.create.input.parse(data);
      const url = buildUrl(api.messages.create.path, { groupId });
      
      const res = await fetch(url, {
        method: api.messages.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        throw new Error("Failed to send message");
      }
      return api.messages.create.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.messages.list.path, variables.groupId] });
      // Also invalidate plan since new message might trigger plan update
      queryClient.invalidateQueries({ queryKey: [api.plans.get.path, variables.groupId] });
    },
    onError: () => {
      toast({
        title: "Failed to send",
        variant: "destructive",
      });
    }
  });
}
