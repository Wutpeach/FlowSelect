import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import SettingsPage from "./pages/SettingsPage";
import ContextMenuPage from "./pages/ContextMenuPage";
import { AgentationDevTools } from "./components/AgentationDevTools";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./index.css";

const AGENTATION_ENABLED_PATHS = new Set(["/settings"]);
const shouldRenderAgentation =
  import.meta.env.DEV && AGENTATION_ENABLED_PATHS.has(window.location.pathname);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/context-menu" element={<ContextMenuPage />} />
        </Routes>
        {shouldRenderAgentation && <AgentationDevTools />}
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
