import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateGroup } from "@/hooks/use-groups";
import { Button } from "@/components/ui/button-animated";
import { Input } from "@/components/ui/input";
import { Sparkles, Calendar, ArrowRight, MessageCircle } from "lucide-react";
import { ShinyCard } from "@/components/ui/shiny-card";

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
    } catch (error) {
      // Toast handled in hook
    }
  };

  return (
    <div className="min-h-screen w-full bg-background selection:bg-primary/20 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* Abstract Background Shapes */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="absolute top-[20%] right-[10%] w-64 h-64 bg-accent/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-[20%] left-[10%] w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>

      <main className="relative z-10 container mx-auto px-4 h-screen flex flex-col items-center justify-center">
        <div className="max-w-2xl w-full text-center space-y-8 animate-in-fade">
          
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-secondary text-secondary-foreground text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4" />
              <span>AI-Powered Event Planning</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground">
              Plan it. <span className="text-primary bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">Together.</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto">
              Create a group, share the link, and let our AI summarize your plans as you chat. No more scrolling up to find the time.
            </p>
          </div>

          <ShinyCard className="max-w-md mx-auto transform transition-all hover:scale-[1.01]">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2 text-left">
                <label className="text-sm font-medium text-foreground ml-1">Event Name</label>
                <Input
                  placeholder="e.g. Saturday Night Dinner"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-12 rounded-xl border-2 focus-visible:ring-primary/20 text-lg"
                  autoFocus
                />
              </div>
              <Button 
                type="submit" 
                size="lg" 
                className="w-full text-lg font-semibold"
                isLoading={createGroup.isPending}
              >
                Start Planning <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </form>
          </ShinyCard>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 text-left">
            {[
              { icon: MessageCircle, title: "Chat Naturally", desc: "Discuss plans in a simple group chat interface." },
              { icon: Sparkles, title: "AI Summaries", desc: "Our AI reads the chat and extracts time, place, and details." },
              { icon: Calendar, title: "Always Ready", desc: "Get a formatted plan instantly, whenever you need it." },
            ].map((item, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-white/10 backdrop-blur-sm">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                  <item.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}
