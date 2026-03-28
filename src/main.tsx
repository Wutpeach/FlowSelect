import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import SettingsPage from "./pages/SettingsPage";
import ContextMenuPage from "./pages/ContextMenuPage";
import { ThemeProvider } from "./contexts/ThemeContext";
import { desktopCurrentWindow } from "./desktop/runtime";
import { I18nRuntimeBridge } from "./i18n/I18nRuntimeBridge";
import { initializeI18n } from "./i18n";
import { resolveAppLanguage } from "./i18n/language";
import "./index.css";

const RENDERER_READY_FALLBACK_DELAY_MS = 180;
const UiLabPage = import.meta.env.DEV
  ? React.lazy(() => import("./pages/UiLabPage"))
  : null;

const scheduleRendererReadySignal = () => {
  if (!window.flowselect) {
    return;
  }

  let signaled = false;
  let fallbackTimerId: number | null = null;
  let firstFrameId: number | null = null;
  let secondFrameId: number | null = null;

  const signalReady = () => {
    if (signaled) {
      return;
    }

    signaled = true;
    if (fallbackTimerId !== null) {
      window.clearTimeout(fallbackTimerId);
    }
    if (firstFrameId !== null) {
      window.cancelAnimationFrame(firstFrameId);
    }
    if (secondFrameId !== null) {
      window.cancelAnimationFrame(secondFrameId);
    }

    void desktopCurrentWindow.rendererReady().catch((err) => {
      console.error("Failed to signal renderer ready:", err);
    });
  };

  fallbackTimerId = window.setTimeout(signalReady, RENDERER_READY_FALLBACK_DELAY_MS);

  if (typeof window.requestAnimationFrame === "function") {
    firstFrameId = window.requestAnimationFrame(() => {
      firstFrameId = null;
      secondFrameId = window.requestAnimationFrame(() => {
        secondFrameId = null;
        signalReady();
      });
    });
  }
};

const bootstrap = async () => {
  const expectsElectronBridge = (
    window.location.protocol === "file:"
    || navigator.userAgent.toLowerCase().includes("electron")
  );
  const fallbackLanguage = resolveAppLanguage(undefined, navigator.language);

  await initializeI18n(fallbackLanguage);

  if (expectsElectronBridge && !window.flowselect) {
    console.error("FlowSelect Electron bridge is unavailable in the renderer process.");
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "linear-gradient(180deg, #1f1d24 0%, #2a2730 100%)",
          color: "#f5f5f5",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
          <strong style={{ fontSize: 16, fontWeight: 700 }}>
            FlowSelect desktop bridge failed to load
          </strong>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(245,245,245,0.78)" }}>
            Restart the Electron dev process so the latest preload and main-process changes take effect.
          </span>
        </div>
      </div>,
    );
    return;
  }

  const Router = expectsElectronBridge
    ? HashRouter
    : BrowserRouter;

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <Router>
          <I18nRuntimeBridge />
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/context-menu" element={<ContextMenuPage />} />
            {UiLabPage ? (
              <Route
                path="/ui-lab"
                element={(
                  <React.Suspense fallback={null}>
                    <UiLabPage />
                  </React.Suspense>
                )}
              />
            ) : null}
          </Routes>
        </Router>
      </ThemeProvider>
    </React.StrictMode>,
  );

  scheduleRendererReadySignal();
};

void bootstrap();
