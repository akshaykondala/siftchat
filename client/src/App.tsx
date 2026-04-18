import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getStoredToken } from "@/hooks/use-auth";
import Dashboard from "@/pages/dashboard";
import AuthPage from "@/pages/auth";
import GroupPage from "@/pages/group";
import NotFound from "@/pages/not-found";

function Router() {
  const isLoggedIn = !!getStoredToken();

  return (
    <Switch>
      <Route path="/">
        {isLoggedIn ? <Dashboard /> : <AuthPage />}
      </Route>
      <Route path="/login" component={AuthPage} />
      <Route path="/g/:slug" component={GroupPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
