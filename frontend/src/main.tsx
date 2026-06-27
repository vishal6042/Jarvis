import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "@/App";
import { ThemeProvider } from "@/theme";
import { FamilyProvider } from "@/lib/store";
import { Toaster } from "@/components/ui/sonner";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <FamilyProvider>
        <BrowserRouter>
          <App />
          <Toaster richColors position="top-right" />
        </BrowserRouter>
      </FamilyProvider>
    </ThemeProvider>
  </React.StrictMode>
);
