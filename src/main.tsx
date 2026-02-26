import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Agentation } from "agentation";
import App from "./App";
import SettingsPage from "./pages/SettingsPage";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        {import.meta.env.DEV && (
          <Agentation endpoint="http://localhost:4747" />
        )}
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
