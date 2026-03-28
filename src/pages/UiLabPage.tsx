import { useState } from "react";
import { Eye, RotateCcw, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { NeonButton, NeonIconButton, NeonSection } from "../components/ui";
import {
  WINDOW_NO_DRAG_REGION_STYLE,
  getNoticeStyle,
  getWindowBodyStyle,
  getWindowHeaderStyle,
  getWindowShellStyle,
} from "../components/ui/shared-styles";
import { useTheme } from "../contexts/ThemeContext";
import { desktopCommands, desktopCurrentWindow, desktopWindows } from "../desktop/runtime";

type UiLabScenarioId =
  | "runtime-auto-config"
  | "runtime-failed"
  | "download-active"
  | "download-queued"
  | "transcode-active"
  | "transcode-failed"
  | "mixed-busy";

type UiLabScenario = {
  id: UiLabScenarioId;
  label: string;
  description: string;
};

export default function UiLabPage() {
  const { t } = useTranslation("desktop");
  const { theme, colors } = useTheme();
  const [activeScenario, setActiveScenario] = useState<UiLabScenarioId | null>(null);
  const [pendingScenario, setPendingScenario] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scenarioGroups: Array<{
    title: string;
    hint: string;
    scenarios: UiLabScenario[];
  }> = [
    {
      title: t("settings.uiLab.groups.runtime.title"),
      hint: t("settings.uiLab.groups.runtime.hint"),
      scenarios: [
        {
          id: "runtime-auto-config",
          label: t("settings.uiLab.scenarios.runtimeAutoConfig.label"),
          description: t("settings.uiLab.scenarios.runtimeAutoConfig.description"),
        },
        {
          id: "runtime-failed",
          label: t("settings.uiLab.scenarios.runtimeFailed.label"),
          description: t("settings.uiLab.scenarios.runtimeFailed.description"),
        },
      ],
    },
    {
      title: t("settings.uiLab.groups.download.title"),
      hint: t("settings.uiLab.groups.download.hint"),
      scenarios: [
        {
          id: "download-active",
          label: t("settings.uiLab.scenarios.downloadActive.label"),
          description: t("settings.uiLab.scenarios.downloadActive.description"),
        },
        {
          id: "download-queued",
          label: t("settings.uiLab.scenarios.downloadQueued.label"),
          description: t("settings.uiLab.scenarios.downloadQueued.description"),
        },
      ],
    },
    {
      title: t("settings.uiLab.groups.transcode.title"),
      hint: t("settings.uiLab.groups.transcode.hint"),
      scenarios: [
        {
          id: "transcode-active",
          label: t("settings.uiLab.scenarios.transcodeActive.label"),
          description: t("settings.uiLab.scenarios.transcodeActive.description"),
        },
        {
          id: "transcode-failed",
          label: t("settings.uiLab.scenarios.transcodeFailed.label"),
          description: t("settings.uiLab.scenarios.transcodeFailed.description"),
        },
      ],
    },
    {
      title: t("settings.uiLab.groups.mixed.title"),
      hint: t("settings.uiLab.groups.mixed.hint"),
      scenarios: [
        {
          id: "mixed-busy",
          label: t("settings.uiLab.scenarios.mixedBusy.label"),
          description: t("settings.uiLab.scenarios.mixedBusy.description"),
        },
      ],
    },
  ];

  const allScenarios = scenarioGroups.flatMap((group) => group.scenarios);
  const activeScenarioLabel = activeScenario
    ? allScenarios.find((scenario) => scenario.id === activeScenario)?.label ?? activeScenario
    : t("settings.uiLab.status.liveAppState");

  const focusMainWindow = async () => {
    try {
      await desktopWindows.focus("main");
    } catch (err) {
      console.error("Failed to focus main window from UI Lab:", err);
      setErrorMessage(String(err));
    }
  };

  const applyScenario = async (scenarioId: UiLabScenarioId) => {
    setPendingScenario(scenarioId);
    setErrorMessage(null);
    try {
      await desktopCommands.invoke<void>("dev_ui_lab_apply_scenario", {
        scenario: scenarioId,
      });
      setActiveScenario(scenarioId);
    } catch (err) {
      console.error("Failed to apply UI Lab scenario:", err);
      setErrorMessage(String(err));
    } finally {
      setPendingScenario(null);
    }
  };

  const resetScenario = async (): Promise<boolean> => {
    setPendingScenario("reset");
    setErrorMessage(null);
    try {
      await desktopCommands.invoke<void>("dev_ui_lab_apply_scenario", {
        scenario: "reset",
      });
      setActiveScenario(null);
      return true;
    } catch (err) {
      console.error("Failed to reset UI Lab scenario:", err);
      setErrorMessage(String(err));
      return false;
    } finally {
      setPendingScenario(null);
    }
  };

  const closeWindow = () => {
    void (async () => {
      try {
        if (activeScenario !== null) {
          const resetSucceeded = await resetScenario();
          if (!resetSucceeded) {
            return;
          }
        }
        await desktopCurrentWindow.close();
      } catch (err) {
        console.error("Failed to close UI Lab window:", err);
        setErrorMessage(String(err));
      }
    })();
  };

  return (
    <div
      style={getWindowShellStyle(colors, theme, {
        radius: 18,
        elevation: "strong",
      })}
    >
      <div
        style={getWindowHeaderStyle(colors, {
          padding: "16px 18px 14px",
          dragRegion: true,
        })}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
            {t("settings.uiLab.title")}
          </h2>
          <span style={{ fontSize: 11, lineHeight: 1.35, color: colors.textSecondary, maxWidth: 250 }}>
            {t("settings.uiLab.subtitle")}
          </span>
        </div>
        <NeonIconButton
          onClick={closeWindow}
          tone="danger"
          size={20}
          title={t("settings.uiLab.actions.closeWindow")}
          aria-label={t("settings.uiLab.actions.closeWindow")}
          style={WINDOW_NO_DRAG_REGION_STYLE}
        >
          <X size={16} />
        </NeonIconButton>
      </div>

      <div
        style={getWindowBodyStyle()}
        className="hide-scrollbar"
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <NeonButton
            onClick={() => void focusMainWindow()}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Eye size={14} />
            {t("settings.uiLab.actions.revealMainWindow")}
          </NeonButton>
          <NeonButton
            onClick={() => void resetScenario()}
            disabled={pendingScenario === "reset"}
            variant="outline"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <RotateCcw size={14} />
            {t("settings.uiLab.actions.resetToLiveState")}
          </NeonButton>
        </div>

        <div
          style={getNoticeStyle(colors)}
        >
          {t("settings.uiLab.status.activePreset")}{" "}
          <strong style={{ color: colors.textPrimary }}>{activeScenarioLabel}</strong>
        </div>

        {errorMessage ? (
          <div
            style={getNoticeStyle(colors, {
              tone: "danger",
            })}
          >
            {errorMessage}
          </div>
        ) : null}

        {scenarioGroups.map((group) => (
          <NeonSection key={group.title} title={group.title} hint={group.hint}>
            <div style={{ display: "grid", gap: 10 }}>
              {group.scenarios.map((scenario) => {
                const isPending = pendingScenario === scenario.id;
                const isActive = activeScenario === scenario.id;
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => void applyScenario(scenario.id)}
                    disabled={isPending}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "11px 12px",
                      borderRadius: 12,
                      border: "none",
                      cursor: isPending ? "wait" : "pointer",
                      background: colors.fieldBg,
                      boxShadow: isActive
                        ? `inset 0 0 0 1px ${colors.accentBorder}, inset 0 1px 0 ${colors.fieldInset}, 0 0 0 1px ${colors.accentBorder}`
                        : `inset 0 0 0 1px ${colors.fieldBorder}, inset 0 1px 0 ${colors.fieldInset}`,
                      display: "grid",
                      gap: 4,
                      color: colors.textPrimary,
                      opacity: isPending ? 0.82 : 1,
                      transition: "box-shadow 0.18s ease, transform 0.18s ease, opacity 0.18s ease",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                      {scenario.label}
                    </span>
                    <span style={{ fontSize: 11, lineHeight: 1.4, color: colors.textSecondary }}>
                      {scenario.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </NeonSection>
        ))}
      </div>
    </div>
  );
}
