import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "../contexts/ThemeContext";
import { PresentationLab } from "./PresentationLab";
import { initializeLabI18n } from "./i18n";
import "./lab.css";

// Dev-only Browser Presentation Lab entry (lab.html). Pure browser page: no
// Electron bridge, no downloader runtime. i18n is initialized zh-CN first
// with no desktop bridge; ThemeProvider is mounted bridge-free so the shared
// production components can render inside the preview.
async function bootstrap() {
  await initializeLabI18n("zh-CN");
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <ThemeProvider initialTheme="black">
        <PresentationLab />
      </ThemeProvider>
    </StrictMode>,
  );
}

void bootstrap();
