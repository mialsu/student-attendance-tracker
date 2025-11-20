import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminProtectedRoute from "@/components/AdminProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import TeacherDashboard from "./pages/TeacherDashboard";
import ClassView from "./pages/ClassView";
import Settings from "./pages/Settings";
import AdminAuth from "./pages/admin/AdminAuth";
import AdminDashboard from "./pages/admin/AdminDashboard";
import RegistrationCodes from "./pages/admin/RegistrationCodes";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<ProtectedRoute><TeacherDashboard /></ProtectedRoute>} />
            <Route path="/class/:classId" element={<ProtectedRoute><ClassView /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/admin/auth" element={<AdminAuth />} />
            <Route path="/admin/dashboard" element={<AdminProtectedRoute><AdminDashboard /></AdminProtectedRoute>} />
            <Route path="/admin/registration-codes" element={<AdminProtectedRoute><RegistrationCodes /></AdminProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
