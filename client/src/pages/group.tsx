import React, { useEffect, useState, useRef } from "react";
import { useRoute } from "wouter";
import { useGroup, useJoinGroup } from "@/hooks/use-groups";
import { useMessages, useSendMessage } from "@/hooks/use-messages";
import { usePlan, useGeneratePlan } from "@/hooks/use-plans";
import { Button } from "@/components/ui/button-animated";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PlanVote } from "@shared/schema";
import { 
  Send, Users, Sparkles, Copy, Calendar, RefreshCw, 
  Menu, X, Loader2, MapPin, Clock, AlignLeft, MessageCircle,
  CheckCircle2, Info, UserCheck, UserMinus, HelpCircle,
  Split, ClipboardCheck, User, ThumbsUp, Crown
} from "lucide-react";
import { format } from "date-fns";
import { ShinyCard } from "@/components/ui/shiny-card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  slug,
  groupId,
  participantId,
  votes,
  onVote,
  onRemoveVote
}: { 
  plan: string, 
  isLoading: boolean, 
  onRefresh: () => void, 
  isRefreshing: boolean,
  isOpen: boolean,
  onClose: () => void,
  groupName: string,
  slug: string,
  groupId: number,
  participantId: number,
  votes: PlanVote[],
  onVote: (alternativeIndex: number) => void,
  onRemoveVote: () => void
}) {
  const { toast } = useToast();
  const [votingIndex, setVotingIndex] = useState<number | null>(null);
  
  // Get current user's vote
  const myVote = votes.find(v => v.participantId === participantId);
  
  // Count votes per alternative
  const voteCounts = votes.reduce((acc, v) => {
    acc[v.alternativeIndex] = (acc[v.alternativeIndex] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);
  
  const handleVote = (index: number) => {
    setVotingIndex(index);
    onVote(index);
    setTimeout(() => setVotingIndex(null), 1000);
  };
  
  const handleRemoveVote = () => {
    setVotingIndex(-1);
    onRemoveVote();
    setTimeout(() => setVotingIndex(null), 1000);
  };

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
            ) : plan ? (() => {
              try {
                const data = JSON.parse(plan);
                
                // Calculate popularity for each plan (supporters + votes)
                const mainPlanPopularity = (data.mainPlanSupporters?.length || 0);
                
                // Calculate popularity for each alternative
                const alternativePopularities = (data.rivalPlans || []).map((alt: any, i: number) => ({
                  index: i,
                  popularity: (alt.supporters?.length || 0) + (voteCounts[i] || 0),
                  votes: voteCounts[i] || 0,
                  plan: alt
                }));
                
                // Find the most popular alternative
                const mostPopularAlt = alternativePopularities.reduce((best: any, curr: any) => 
                  curr.popularity > (best?.popularity || 0) ? curr : best, null);
                
                // Only swap if alternative is MORE popular than main plan
                const shouldSwap = mostPopularAlt && mostPopularAlt.popularity > mainPlanPopularity;
                const swappedIndex = shouldSwap ? mostPopularAlt.index : -1;
                
                // Build the display data
                const displayWhen = shouldSwap ? mostPopularAlt.plan.when : data.when;
                const displayWhere = shouldSwap ? mostPopularAlt.plan.where : data.where;
                const displayPopularity = shouldSwap ? mostPopularAlt.popularity : mainPlanPopularity;
                
                // Adjust attendees when displaying a swapped alternative
                // People who supported the NEW main plan are "going"
                // People who only supported the ORIGINAL plan are "undecided" for this option
                let displayWho = data.who || [];
                if (shouldSwap && mostPopularAlt?.plan?.supporters) {
                  const altSupporters = new Set(mostPopularAlt.plan.supporters.map((s: string) => s.toLowerCase().trim()));
                  const existingNames = new Set((data.who || []).map((p: any) => p.name.toLowerCase().trim()));
                  
                  // First, update existing entries
                  displayWho = (data.who || []).map((person: any) => {
                    const personLower = person.name.toLowerCase().trim();
                    // If this person supported the alternative (now main), mark as going
                    if (altSupporters.has(personLower)) {
                      return { ...person, status: 'can_make_it', reason: person.reason || 'Supported this option' };
                    }
                    // If person was "can_make_it" for the ORIGINAL plan but didn't support this alternative,
                    // mark them as undecided for this new main plan (unless they explicitly can't make it)
                    if (person.status === 'can_make_it') {
                      return { ...person, status: 'undecided', reason: 'Has not confirmed for this option' };
                    }
                    // Keep cannot_make_it and undecided as-is
                    return person;
                  });
                  
                  // Then, add supporters who weren't in the original who array
                  const missingSupporters = mostPopularAlt.plan.supporters
                    .filter((s: string) => !existingNames.has(s.toLowerCase().trim()))
                    .map((s: string) => ({
                      name: s,
                      status: 'can_make_it',
                      reason: 'Supported this option'
                    }));
                  displayWho = [...displayWho, ...missingSupporters];
                }
                
                // Build alternatives list
                const alternatives = (data.rivalPlans || [])
                  .map((p: any, i: number) => ({ 
                    ...p, 
                    originalIndex: i,
                    isSwapped: i === swappedIndex
                  }))
                  .filter((p: any) => !p.isSwapped)
                  .concat(shouldSwap ? [{
                    title: "Original Suggestion",
                    when: data.when,
                    where: data.where,
                    supporters: data.mainPlanSupporters || [],
                    originalIndex: -1,
                    isOriginal: true
                  }] : []);
                
                return (
                  <div className="space-y-6 animate-in-slide-up">
                    {/* Main Plan with Most Popular indicator */}
                    <div className="relative">
                      {displayPopularity > 0 && (
                        <div className="absolute -top-2 -right-2 z-10">
                          <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-white border-0 shadow-md text-[9px] px-2 gap-1">
                            <Crown className="w-2.5 h-2.5" /> {displayPopularity} supporter{displayPopularity !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      )}
                      {/* Unvote button when main plan is a voted alternative */}
                      {shouldSwap && myVote?.alternativeIndex === swappedIndex && (
                        <div className="mb-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full h-7 gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
                            onClick={handleRemoveVote}
                            disabled={votingIndex !== null}
                            data-testid="button-unvote-main"
                          >
                            {votingIndex === -1 ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <ThumbsUp className="w-3 h-3" />
                            )}
                            Your vote - Click to Remove
                          </Button>
                        </div>
                      )}
                      {/* Show source indicator when displaying voted alternative */}
                      {shouldSwap && (
                        <div className="mb-2 px-1">
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                            <ThumbsUp className="w-3 h-3" /> Based on popular vote
                          </span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white/40 dark:bg-black/20 p-3 rounded-2xl border border-primary/5 shadow-sm">
                          <div className="flex items-center gap-2 text-xs font-bold text-primary mb-1">
                            <Clock className="w-3 h-3" /> WHEN
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <div className="text-sm font-semibold truncate cursor-pointer hover:text-primary transition-colors">
                                {displayWhen}
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-60 p-3 text-sm bg-card shadow-xl" side="bottom">
                              <div className="font-bold mb-1 text-primary flex items-center gap-2">
                                <Clock className="w-3 h-3" /> Event Time
                              </div>
                              <p className="text-muted-foreground leading-relaxed">{displayWhen}</p>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="bg-white/40 dark:bg-black/20 p-3 rounded-2xl border border-primary/5 shadow-sm">
                          <div className="flex items-center gap-2 text-xs font-bold text-primary mb-1">
                            <MapPin className="w-3 h-3" /> WHERE
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <div className="text-sm font-semibold truncate cursor-pointer hover:text-primary transition-colors">
                                {displayWhere}
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-60 p-3 text-sm bg-card shadow-xl" side="bottom">
                              <div className="font-bold mb-1 text-primary flex items-center gap-2">
                                <MapPin className="w-3 h-3" /> Event Location
                              </div>
                              <p className="text-muted-foreground leading-relaxed">{displayWhere}</p>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    </div>

                    {/* Rival Plans */}
                    {alternatives.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest px-1">
                          <Split className="w-3.5 h-3.5" /> Alternative Options
                        </div>
                        <div className="space-y-3">
                          {alternatives.map((alt: any, displayIndex: number) => {
                            const actualIndex = alt.isOriginal ? -1 : alt.originalIndex;
                            const voteCount = actualIndex >= 0 ? (voteCounts[actualIndex] || 0) : 0;
                            const hasMyVote = actualIndex >= 0 && myVote?.alternativeIndex === actualIndex;
                            
                            return (
                              <div key={displayIndex} className="relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl blur opacity-20 group-hover:opacity-30 transition duration-1000"></div>
                                <div className="relative bg-white/60 dark:bg-black/40 border border-amber-500/20 rounded-2xl p-4 shadow-sm">
                                  <div className="flex items-center justify-between mb-2 gap-2">
                                    <div className="text-sm font-bold text-foreground flex-1">{alt.title}</div>
                                    {!alt.isOriginal && (
                                      <Button
                                        variant={hasMyVote ? "default" : "outline"}
                                        size="sm"
                                        className={cn(
                                          "h-7 gap-1.5 text-xs",
                                          hasMyVote && "bg-amber-500 hover:bg-amber-600 text-white"
                                        )}
                                        onClick={() => hasMyVote ? handleRemoveVote() : handleVote(actualIndex)}
                                        disabled={votingIndex !== null}
                                        data-testid={`button-vote-${actualIndex}`}
                                      >
                                        {votingIndex === actualIndex || (votingIndex === -1 && hasMyVote) ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <ThumbsUp className="w-3 h-3" />
                                        )}
                                        {voteCount > 0 && <span>{voteCount}</span>}
                                        {hasMyVote ? "Voted" : "Vote"}
                                      </Button>
                                    )}
                                  </div>
                                  <div className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/10 space-y-1">
                                    {alt.when && (
                                      <p className="text-xs text-muted-foreground leading-relaxed flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-primary/60" /> <span className="font-medium">{alt.when}</span>
                                      </p>
                                    )}
                                    {alt.where && (
                                      <p className="text-xs text-muted-foreground leading-relaxed flex items-center gap-1">
                                        <MapPin className="w-3 h-3 text-primary/60" /> <span className="font-medium">{alt.where}</span>
                                      </p>
                                    )}
                                  </div>
                                  {/* Supporters from AI + vote count */}
                                  {(alt.supporters?.length > 0 || voteCount > 0) && (
                                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                                      <span className="text-[10px] text-muted-foreground font-medium">
                                        {(alt.supporters?.length || 0) + voteCount} supporter{(alt.supporters?.length || 0) + voteCount !== 1 ? 's' : ''}:
                                      </span>
                                      {alt.supporters?.map((name: string) => (
                                        <Badge key={name} variant="outline" className="text-[9px] bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                                          {name}
                                        </Badge>
                                      ))}
                                      {voteCount > 0 && (
                                        <Badge variant="outline" className="text-[9px] bg-amber-100 dark:bg-amber-800/30 border-amber-300 dark:border-amber-700">
                                          +{voteCount} vote{voteCount !== 1 ? 's' : ''}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        <Users className="w-3 h-3" /> Attendees
                      </div>
                      
                      <div className="space-y-4">
                        {/* Can Make It */}
                        {displayWho?.some((p: any) => p.status === 'can_make_it') && (
                          <div className="space-y-2">
                            <div className="text-[10px] font-bold text-green-600 dark:text-green-400 flex items-center gap-1.5 px-1">
                              <UserCheck className="w-3 h-3" /> GOING
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {displayWho.filter((p: any) => p.status === 'can_make_it').map((p: any) => (
                                <Popover key={p.name}>
                                  <PopoverTrigger asChild>
                                    <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800/30 rounded-lg py-0.5 px-2.5 cursor-pointer hover-elevate">
                                      {p.name}
                                    </Badge>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-60 p-3 text-xs bg-card border-green-100 shadow-xl" side="top">
                                    <div className="font-bold mb-1 text-green-600">{p.name}</div>
                                    <p className="text-muted-foreground leading-relaxed">{p.reason || "Confirmed attendance"}</p>
                                  </PopoverContent>
                                </Popover>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Cannot Make It */}
                        {displayWho?.some((p: any) => p.status === 'cannot_make_it') && (
                          <div className="space-y-2">
                            <div className="text-[10px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5 px-1">
                              <UserMinus className="w-3 h-3" /> CAN'T MAKE IT
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {displayWho.filter((p: any) => p.status === 'cannot_make_it').map((p: any) => (
                                <Popover key={p.name}>
                                  <PopoverTrigger asChild>
                                    <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/30 rounded-lg py-0.5 px-2.5 cursor-help hover-elevate">
                                      {p.name}
                                    </Badge>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-60 p-3 text-xs bg-card border-red-100 shadow-xl" side="top">
                                    <div className="font-bold mb-1 text-red-600">{p.name}'s Reason</div>
                                    <p className="text-muted-foreground leading-relaxed">{p.reason || "No reason specified"}</p>
                                  </PopoverContent>
                                </Popover>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Undecided */}
                        {displayWho?.some((p: any) => p.status === 'undecided') && (
                          <div className="space-y-2">
                            <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 px-1">
                              <HelpCircle className="w-3 h-3" /> UNDECIDED
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {displayWho.filter((p: any) => p.status === 'undecided').map((p: any) => (
                                <Popover key={p.name}>
                                  <PopoverTrigger asChild>
                                    <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/30 rounded-lg py-0.5 px-2.5 cursor-help hover-elevate">
                                      {p.name}
                                    </Badge>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-60 p-3 text-xs bg-card border-amber-100 shadow-xl" side="top">
                                    <div className="font-bold mb-1 text-amber-600">{p.name}'s Input</div>
                                    <p className="text-muted-foreground leading-relaxed">{p.reason || "Hasn't confirmed yet"}</p>
                                  </PopoverContent>
                                </Popover>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {data.actions?.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                          <ClipboardCheck className="w-3 h-3" /> Action Items
                        </div>
                        <div className="grid gap-2">
                          {data.actions.map((action: any, i: number) => (
                            <div key={i} className="flex items-center justify-between gap-3 text-xs bg-white/40 dark:bg-black/20 p-2.5 rounded-xl border border-primary/5 shadow-sm">
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 h-4 w-4 rounded-full border-2 border-primary/30 flex items-center justify-center shrink-0">
                                  <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                                </div>
                                <span className="font-medium text-foreground/90">{action.task}</span>
                              </div>
                              <Badge variant="outline" className="shrink-0 text-[9px] px-1.5 py-0 bg-primary/5 border-primary/10">
                                <User className="w-2.5 h-2.5 mr-1" /> {action.assignee}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              } catch (e) {
                return (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 font-medium bg-white/40 p-4 rounded-xl border">
                    {plan}
                  </div>
                );
              }
            })() : (
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
  
  // Fetch votes for this group
  const { data: votes = [] } = useQuery<PlanVote[]>({
    queryKey: ['/api/groups', group?.id, 'votes'],
    enabled: !!group?.id,
    refetchInterval: 5000
  });
  
  const joinGroup = useJoinGroup();
  const sendMessage = useSendMessage();
  const generatePlan = useGeneratePlan();
  
  // Vote mutations
  const addVoteMutation = useMutation({
    mutationFn: async ({ groupId, participantId, alternativeIndex }: { groupId: number; participantId: number; alternativeIndex: number }) => {
      return apiRequest('POST', `/api/groups/${groupId}/votes`, { participantId, alternativeIndex });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/groups', group?.id, 'votes'] });
    }
  });
  
  const removeVoteMutation = useMutation({
    mutationFn: async ({ groupId, participantId }: { groupId: number; participantId: number }) => {
      return apiRequest('DELETE', `/api/groups/${groupId}/votes`, { participantId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/groups', group?.id, 'votes'] });
    }
  });

  const [messageText, setMessageText] = useState("");
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [forceShowJoin, setForceShowJoin] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check localStorage for existing participant ID
  const storedParticipantId = slug ? localStorage.getItem(`evite_participant_${slug}`) : null;
  
  // Participants are included in the group response
  const participants = group?.participants;

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleJoin = async (name: string) => {
    try {
      const participant = await joinGroup.mutateAsync({ slug, name });
      localStorage.setItem(`evite_participant_${slug}`, String(participant.id));
      setParticipantId(participant.id);
      setForceShowJoin(false);
    } catch (e) {
      // Error handled in hook
    }
  };
  
  const handleContinueAsExisting = () => {
    if (storedParticipantId) {
      setParticipantId(Number(storedParticipantId));
    }
  };
  
  const handleJoinAsNew = () => {
    localStorage.removeItem(`evite_participant_${slug}`);
    setForceShowJoin(true);
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

  // Check if stored participant exists in loaded participants
  // Since participants are included in group response, they're available when group loads
  const validStoredParticipant = storedParticipantId && participants 
    ? participants.find(p => p.id === Number(storedParticipantId))
    : null;

  // Show welcome back choice if we have a valid stored participant
  if (validStoredParticipant && !participantId && !forceShowJoin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-3xl p-8 shadow-2xl border border-primary/10 w-full max-w-md text-center"
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent mx-auto mb-6 flex items-center justify-center">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold font-display mb-2">Welcome Back!</h2>
          <p className="text-muted-foreground mb-6">
            You've been here before as <span className="font-semibold text-primary">{validStoredParticipant.name}</span>
          </p>
          
          <div className="space-y-3">
            <Button
              className="w-full h-12 rounded-xl text-base"
              onClick={handleContinueAsExisting}
              data-testid="button-continue-as"
            >
              Continue as {validStoredParticipant.name}
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl text-base"
              onClick={handleJoinAsNew}
              data-testid="button-join-as-new"
            >
              Join as someone else
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Show join modal if no participant
  if (!participantId) {
    return <JoinModal groupName={group.name} onJoin={handleJoin} isLoading={joinGroup.isPending} />;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden relative pt-[env(safe-area-inset-top)]">
      
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
        isLoading={!planData && (messages?.length ?? 0) > 0} 
        onRefresh={() => generatePlan.mutate(group.id)}
        isRefreshing={generatePlan.isPending}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        groupName={group.name}
        slug={slug}
        groupId={group.id}
        participantId={participantId}
        votes={votes}
        onVote={(alternativeIndex) => addVoteMutation.mutate({ groupId: group.id, participantId, alternativeIndex })}
        onRemoveVote={() => removeVoteMutation.mutate({ groupId: group.id, participantId })}
      />
    </div>
  );
}
