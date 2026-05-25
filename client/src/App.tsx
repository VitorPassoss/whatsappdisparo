import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Dispatch from "./pages/Dispatch";
import History from "./pages/History";
import ContactLists from "./pages/ContactLists";
import Sessions from "./pages/Sessions";
import FacebookCallback from "./pages/FacebookCallback";
import Privacy from "./pages/Privacy";
import Inbox from "./pages/Inbox";
import Automations from "./pages/Automations";
import Admin from "./pages/Admin";
import AdminSettings from "./pages/AdminSettings";
import { useAuth } from "./_core/hooks/useAuth";
import DashboardLayout from "./components/DashboardLayout";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) {
    window.location.replace("/login");
    return null;
  }
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/dispatch" component={() => <ProtectedRoute component={Dispatch} />} />
      <Route path="/history" component={() => <ProtectedRoute component={History} />} />
      <Route path="/contacts" component={() => <ProtectedRoute component={ContactLists} />} />
      <Route path="/sessions" component={() => <ProtectedRoute component={Sessions} />} />
      <Route path="/inbox" component={() => <ProtectedRoute component={Inbox} />} />
      <Route path="/automations" component={() => <ProtectedRoute component={Automations} />} />
      <Route path="/admin" component={() => <ProtectedRoute component={Admin} />} />
      <Route path="/admin/settings" component={() => <ProtectedRoute component={AdminSettings} />} />
      <Route path="/auth/facebook/callback" component={FacebookCallback} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster richColors position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
