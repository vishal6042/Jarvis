import { Navigate, Route, Routes } from "react-router-dom";
import { isAuthed } from "@/api";
import AppShell from "@/components/AppShell";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Analytics from "@/pages/Analytics";
import Accounts from "@/pages/Accounts";
import Investments from "@/pages/Investments";
import Loans from "@/pages/Loans";
import Calendar from "@/pages/Calendar";
import Assistant from "@/pages/Assistant";
import Settings from "@/pages/Settings";
import Profile from "@/pages/Profile";
import type { ReactNode } from "react";

function Protected({ children }: { children: ReactNode }) {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/accounts" element={<Protected><Accounts /></Protected>} />
      <Route path="/investments" element={<Protected><Investments /></Protected>} />
      <Route path="/loans" element={<Protected><Loans /></Protected>} />
      <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
      <Route path="/assistant" element={<Protected><Assistant /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="*" element={<Navigate to={isAuthed() ? "/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
