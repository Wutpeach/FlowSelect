import { useState } from "react";
import { Eye, RotateCcw, X } from "lucide-react";

import { NeonButton, NeonIconButton, NeonSection } from "../components/ui";
import { getPanelShellStyle } from "../components/ui/shared-styles";
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

const scenarioGroups: Array<{
  title: string;
  hint: string;
  scenarios: UiLabScenario[];
}> = [
  {
    title: "Runtime",
    hint: "Preview automatic dependency bootstrap states and failure recovery.",
    scenarios: [
      {
        id: "runtime-auto-config",
        label: "Auto Config",
        description: "Shows the runtime indicator in automatic download mode with hoverable progress.",
      },
      {
        id: "runtime-failed",
        label: "Failed",
        description: "Shows the retryable failure state for the runtime reminder.",
      },
    ],
  },
  {
    title: "Download",
    hint: "Drive the main window's active download and queue surfaces without a real network transfer.",
    scenarios: [
      {
        id: "download-active",
        label: "Active",
        description: "Single active download with live progress, speed, and ETA.",
      },
      {
        id: "download-queued",
        label: "Queued",
        description: "One active download plus two pending tasks for queue review.",
      },
    ],
  },
  {
    title: "Transcode",
    hint: "Preview transcode progress and failure handling without invoking FFmpeg.",
    scenarios: [
      {
        id: "transcode-active",
        label: "Active",
        description: "Active transcode with a pending follow-up task.",
      },
      {
        id: "transcode-failed",
        label: "Failed",
        description: "Failure card, error text, and transcode failure notice state.",
      },
    ],
  },
  {
    title: "Mixed",
    hint: "Stress the compact shell with concurrent download and transcode activity.",
    scenarios: [
      {
        id: "mixed-busy",
        label: "Mixed Busy",
        description: "Download merging plus transcode finalization at the same time.",
      },
    ],
  },
];

export default function UiLabPage() {
  const { colors } = useTheme();
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [pendingScenario, setPendingScenario] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const closeWindow = () => {
    void desktopCurrentWindow.close().catch((err) => {
      console.error("Failed to close UI Lab window:", err);
    });
  };

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

  const resetScenario = async () => {
    setPendingScenario("reset");
    setErrorMessage(null);
    try {
      await desktopCommands.invoke<void>("dev_ui_lab_apply_scenario", {
        scenario: "reset",
      });
      setActiveScenario(null);
    } catch (err) {
      console.error("Failed to reset UI Lab scenario:", err);
      setErrorMessage(String(err));
    } finally {
      setPendingScenario(null);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        ...getPanelShellStyle(colors, {
          radius: 18,
          boxShadow: `inset 0 0 0 1px ${colors.borderStart}, inset 0 1px 0 ${colors.fieldInset}, ${colors.panelShadowStrong}`,
        }),
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 18px 14px",
          borderBottom: `1px solid ${colors.borderStart}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>
            UI Lab
          </h2>
          <span style={{ fontSize: 11, lineHeight: 1.35, color: colors.textSecondary, maxWidth: 250 }}>
            Dev-only state presets for reviewing the real main-window UI without running actual downloads
            or transcodes.
          </span>
        </div>
        <NeonIconButton onClick={closeWindow} tone="danger" size={20}>
          <X size={16} />
        </NeonIconButton>
      </div>

      <div
        style={{
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto",
        }}
        className="hide-scrollbar"
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <NeonButton
            onClick={() => void focusMainWindow()}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Eye size={14} />
            Reveal Main Window
          </NeonButton>
          <NeonButton
            onClick={() => void resetScenario()}
            disabled={pendingScenario === "reset"}
            variant="outline"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <RotateCcw size={14} />
            Reset To Live State
          </NeonButton>
        </div>

        <div
          style={{
            fontSize: 11,
            color: colors.textSecondary,
            lineHeight: 1.45,
            padding: "10px 12px",
            borderRadius: 12,
            background: colors.fieldBg,
            boxShadow: `inset 0 0 0 1px ${colors.fieldBorder}`,
          }}
        >
          Active preset: <strong style={{ color: colors.textPrimary }}>{activeScenario ?? "live app state"}</strong>
        </div>

        {errorMessage ? (
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.45,
              color: colors.dangerText,
              padding: "10px 12px",
              borderRadius: 12,
              background: colors.fieldBg,
              boxShadow: `inset 0 0 0 1px ${colors.dangerBorder}`,
            }}
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
