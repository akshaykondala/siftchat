import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateGroup } from "@/hooks/use-groups";
import { Button } from "@/components/ui/button-animated";
import { Input } from "@/components/ui/input";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { PipCharacter } from "@/components/pip-character";

export default function Home() {
  const [name, setName] = useState("");
  const [, setLocation] = useLocation();
  const createGroup = useCreateGroup();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const group = await createGroup.mutateAsync({ name });
      setLocation(`/g/${group.shareLinkSlug}`);
    } catch {
      // handled in hook
    }
  };

  return (
    <div className="h-screen w-full bg-background flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex flex-col items-center gap-8 w-full max-w-xs"
      >
        <PipCharacter />

        <div className="text-center">
          <h1 className="text-4xl font-black tracking-tight text-foreground">siftchat</h1>
          <p className="text-sm text-muted-foreground mt-1">plan trips together</p>
        </div>

        <form onSubmit={handleCreate} className="w-full space-y-3">
          <Input
            placeholder="Name your trip…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 rounded-2xl text-base text-center bg-secondary/40 border-transparent focus:bg-background focus:border-primary/20 transition-all"
            autoFocus
          />
          <Button
            type="submit"
            size="lg"
            className="w-full rounded-2xl font-semibold h-12"
            isLoading={createGroup.isPending}
            disabled={!name.trim()}
          >
            Start Planning <ArrowRight className="ml-1.5 w-4 h-4" />
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
