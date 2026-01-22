import React, { useEffect, useState, useRef } from "react";
import { useRoute } from "wouter";
import { useGroup, useJoinGroup } from "@/hooks/use-groups";
import { useMessages, useSendMessage } from "@/hooks/use-messages";
import { usePlan, useGeneratePlan } from "@/hooks/use-plans";
import { Button } from "@/components/ui/button-animated";
import { Input } from "@/components/ui/input";
import { 
  Send, Users, Sparkles, Copy, Calendar, RefreshCw, 
  Menu, X, Loader2, MapPin, Clock, AlignLeft, MessageCircle 
} from "lucide-react";
import { format } from "date-fns";
import { ShinyCard } from "@/components/ui/shiny-card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

// --- Sub-component: Join Modal ---
function JoinModal({ groupName, onJoin, isLoading }: { groupName: string, onJoin: (name: string) => void, isLoading: boolean }) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onJoin(name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <ShinyCard className="w-full max-w-md animate-in-fade">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary mb-4">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold">Join {groupName}</h2>
          <p className="text-muted-foreground">Enter your name to start chatting and planning.</p>
          
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <Input
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 text-lg text-center rounded-xl"
              autoFocus
            />
            <Button type="submit" size="lg" className="w-full" isLoading={isLoading} disabled={!name.trim()}>
              Join Group
            </Button>
          </form>
        </div>
      </ShinyCard>
    </div>
  );
}

// --- Sub-component: Plan Sidebar ---
function PlanSidebar({ 
  plan, 
  isLoading, 
  onRefresh, 
  isRefreshing, 
  isOpen, 
  onClose,
  groupName,
  slug
}: { 
  plan: string, 
  isLoading: boolean, 
  onRefresh: () => void, 
  isRefreshing: boolean,
  isOpen: boolean,
  onClose: () => void,
  groupName: string,
  slug: string
}) {
  const { toast } = useToast();

  const copyLink = () => {
    const url = `${window.location.origin}/g/${slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link Copied", description: "Share it with your friends!" });
  };

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Panel */}
      <motion.aside
        className={cn(
          "fixed top-0 right-0 h-full w-full sm:w-[400px] bg-card border-l z-50 shadow-2xl lg:translate-x-0 lg:static lg:w-96 lg:shadow-none transition-transform duration-300 ease-out flex flex-col",
          !isOpen && "translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-6 border-b flex items-center justify-between bg-secondary/30">
          <div className="flex items-center gap-2 text-primary font-bold text-lg">
            <Sparkles className="w-5 h-5" />
            <span>Current Plan</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-2xl font-bold font-display">{groupName}</h3>
            <Button variant="outline" className="w-full gap-2 rounded-xl" onClick={copyLink}>
              <Copy className="w-4 h-4" /> Copy Invite Link
            </Button>
          </div>

          <div className="bg-gradient-to-br from-primary/5 to-accent/10 rounded-2xl p-6 border border-primary/10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Summary</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 w-8 p-0 hover:bg-white/50" 
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
              </Button>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">Analyzing chat...</span>
              </div>
            ) : plan ? (
              <div className="prose prose-sm prose-purple max-w-none">
                 {/* 
                    We could parse the AI summary better if it returned JSON, 
                    but for now assuming it returns markdown text 
                 */}
                 <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 font-medium">
                   {plan}
                 </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-center p-4">
                <MessageCircle className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">Start chatting to generate a plan!</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-4 border-t bg-secondary/10 text-center text-xs text-muted-foreground">
           Summaries update automatically as you chat.
        </div>
      </motion.aside>
    </>
  );
}


export default function GroupPage() {
  const [match, params] = useRoute("/g/:slug");
  const slug = match ? params.slug : "";
  const { data: group, isLoading: groupLoading, error: groupError } = useGroup(slug);
  const { data: messages, isLoading: messagesLoading } = useMessages(group?.id || 0);
  const { data: planData } = usePlan(group?.id || 0);
  
  const joinGroup = useJoinGroup();
  const sendMessage = useSendMessage();
  const generatePlan = useGeneratePlan();

  const [messageText, setMessageText] = useState("");
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load participant ID from local storage on mount
  useEffect(() => {
    if (slug) {
      const stored = localStorage.getItem(`evite_participant_${slug}`);
      if (stored) setParticipantId(Number(stored));
    }
  }, [slug]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleJoin = async (name: string) => {
    try {
      const participant = await joinGroup.mutateAsync({ slug, name });
      localStorage.setItem(`evite_participant_${slug}`, String(participant.id));
      setParticipantId(participant.id);
    } catch (e) {
      // Error handled in hook
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !group || !participantId) return;

    const content = messageText;
    setMessageText(""); // Optimistic clear

    try {
      await sendMessage.mutateAsync({
        groupId: group.id,
        participantId,
        content
      });
    } catch (e) {
      setMessageText(content); // Restore on fail
    }
  };

  if (groupLoading) {
    return <div className="h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (groupError || !group) {
    return <div className="h-screen flex items-center justify-center text-destructive">Group not found</div>;
  }

  if (!participantId) {
    return <JoinModal groupName={group.name} onJoin={handleJoin} isLoading={joinGroup.isPending} />;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Header */}
        <header className="h-16 border-b flex items-center justify-between px-4 bg-white/50 backdrop-blur-md sticky top-0 z-10">
          <div className="font-bold text-lg truncate flex-1">{group.name}</div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="lg:hidden text-primary"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Sparkles className="w-5 h-5" />
          </Button>
        </header>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-center text-xs text-muted-foreground my-4">
            Group created {format(new Date(group.createdAt || new Date()), "MMM d, yyyy")}
          </div>
          
          {messages?.map((msg) => {
            const isMe = msg.participantId === participantId;
            return (
              <div 
                key={msg.id} 
                className={cn("flex flex-col max-w-[85%] sm:max-w-[70%]", isMe ? "ml-auto items-end" : "items-start")}
              >
                <div className="flex items-center gap-2 mb-1">
                  {!isMe && <span className="text-xs font-semibold text-muted-foreground">{msg.participantName}</span>}
                </div>
                <div 
                  className={cn(
                    "px-4 py-2 rounded-2xl text-sm shadow-sm leading-relaxed break-words",
                    isMe 
                      ? "bg-primary text-primary-foreground rounded-tr-none" 
                      : "bg-white dark:bg-zinc-800 border rounded-tl-none"
                  )}
                >
                  {msg.content}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 opacity-60">
                  {format(new Date(msg.createdAt || new Date()), "h:mm a")}
                </span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-background border-t">
          <form onSubmit={handleSend} className="flex gap-2 max-w-4xl mx-auto">
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type a message..."
              className="rounded-full pl-6 bg-secondary/50 border-transparent focus:bg-background focus:border-primary/20 transition-all shadow-inner"
            />
            <Button 
              type="submit" 
              size="icon" 
              className="rounded-full h-10 w-10 shrink-0 shadow-md"
              disabled={!messageText.trim() || sendMessage.isPending}
            >
              <Send className="w-4 h-4 ml-0.5" />
            </Button>
          </form>
        </div>
      </div>

      {/* Plan Sidebar */}
      <PlanSidebar 
        plan={planData?.summary || ""} 
        isLoading={!planData && messages?.length > 0} 
        onRefresh={() => generatePlan.mutate(group.id)}
        isRefreshing={generatePlan.isPending}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        groupName={group.name}
        slug={slug}
      />
    </div>
  );
}
