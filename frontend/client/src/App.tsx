/* Kith Soft Spatial Studio: playful warmth, tactile confirmation, spatial clarity, and responsible delight. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Demo from "./pages/Demo";
import Feed from "./pages/Feed";
import HowItWorks from "./pages/HowItWorks";
import Setup from "./pages/Setup";
import LegalRouter from "./pages/LegalAndDocs";
import NotFound from "./pages/NotFound";
import { OnboardingModal } from "./components/OnboardingModal";

function Router() {
  return (
    <>
      <OnboardingModal />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/demo" component={Demo} />
        <Route path="/demo/feed" component={Feed} />
        <Route path="/how-it-works" component={HowItWorks} />
        <Route path="/setup" component={Setup} />
        <Route path="/docs" component={LegalRouter} />
        <Route path="/privacy" component={LegalRouter} />
        <Route path="/terms" component={LegalRouter} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
