import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { CreateGroupRequest, JoinGroupRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useGroup(slug: string) {
  return useQuery({
    queryKey: [api.groups.get.path, slug],
    queryFn: async () => {
      const url = buildUrl(api.groups.get.path, { slug });
      const res = await fetch(url);
      if (res.status === 404) throw new Error("Group not found");
      if (!res.ok) throw new Error("Failed to fetch group");
      return api.groups.get.responses[200].parse(await res.json());
    },
    enabled: !!slug,
  });
}

export function useCreateGroup() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: CreateGroupRequest) => {
      const validated = api.groups.create.input.parse(data);
      const res = await fetch(api.groups.create.path, {
        method: api.groups.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.groups.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create group");
      }
      return api.groups.create.responses[201].parse(await res.json());
    },
    onError: (err) => {
      toast({
        title: "Error creating group",
        description: err.message,
        variant: "destructive",
      });
    }
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ slug, name }: { slug: string } & JoinGroupRequest) => {
      const validated = api.groups.join.input.parse({ name });
      const url = buildUrl(api.groups.join.path, { slug });
      
      const res = await fetch(url, {
        method: api.groups.join.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.groups.join.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        if (res.status === 404) throw new Error("Group not found");
        throw new Error("Failed to join group");
      }
      return api.groups.join.responses[201].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.groups.get.path, variables.slug] });
    },
    onError: (err) => {
      toast({
        title: "Could not join group",
        description: err.message,
        variant: "destructive",
      });
    }
  });
}
