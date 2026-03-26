import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import SettingsPage from "./pages/SettingsPage";
import ContextMenuPage from "./pages/ContextMenuPage";
import { ThemeProvider, type Theme } from "./contexts/ThemeContext";
import { desktopCommands } from "./desktop/runtime";
import { I18nRuntimeBridge } from "./i18n/I18nRuntimeBridge";
import { initializeI18n } from "./i18n";
import { resolveAppLanguage, resolveAppLanguageFromConfigString } from "./i18n/language";
import "./index.css";

const DEFAULT_THEME: Theme = "black";

const getThemeFromConfigString = (configStr: string): Theme => {
  try {
    const cfg = JSON.parse(configStr) as { theme?: unknown };
    return cfg.theme === "white" || cfg.theme === "black" ? cfg.theme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

const resolveBootstrapState = async (): Promise<{
  initialTheme: Theme;
  initialLanguage: "en" | "zh-CN";
}> => {
  try {
    const configStr = await desktopCommands.invoke<string>("get_config");
    return {
      initialTheme: getThemeFromConfigString(configStr),
      initialLanguage: resolveAppLanguageFromConfigString(configStr, navigator.language),
    };
  } catch (err) {
    console.error("Failed to resolve bootstrap config:", err);
    return {
      initialTheme: DEFAULT_THEME,
      initialLanguage: resolveAppLanguage(undefined, navigator.language),
    };
  }
};

const bootstrap = async () => {
  const { initialTheme, initialLanguage } = await resolveBootstrapState();
  await initializeI18n(initialLanguage);
  const Router = window.flowselect && window.location.protocol === "file:"
    ? HashRouter
    : BrowserRouter;

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider initialTheme={initialTheme}>
        <Router>
          <I18nRuntimeBridge />
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/context-menu" element={<ContextMenuPage />} />
          </Routes>
        </Router>
      </ThemeProvider>
    </React.StrictMode>,
  );
};

void bootstrap();
