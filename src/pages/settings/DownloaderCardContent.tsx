import type { ReactNode } from "react";

import { useTheme } from "../../contexts/ThemeContext";

interface DownloaderCardContentProps {
  versionLabel: ReactNode;
  description: string;
  descriptionTone?: "default" | "accent" | "warning";
  statusText: string;
  statusColor: string;
  indicator?: ReactNode;
  progressContent?: ReactNode;
  action?: ReactNode;
}

const bodyStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minHeight: 0,
  flex: 1,
} as const;

const metaRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  minWidth: 0,
} as const;

const statusSlotStyle = {
  width: 14,
  height: 14,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
} as const;

const descriptionStyle = {
  fontSize: 11,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  opacity: 0.94,
} as const;

const footerStyle = {
  display: "grid",
  gap: 4,
  marginTop: "auto",
  minWidth: 0,
} as const;

const statusTextStyle = {
  width: "100%",
  minWidth: 0,
  fontSize: 10,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  opacity: 0.85,
} as const;

const actionRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 6,
  minHeight: 28,
} as const;

export function DownloaderCardContent({
  versionLabel,
  description,
  descriptionTone = "default",
  statusText,
  statusColor,
  indicator,
  progressContent,
  action,
}: DownloaderCardContentProps) {
  const { colors } = useTheme();

  const descriptionColor = descriptionTone === "accent"
    ? colors.accentText
    : descriptionTone === "warning"
      ? colors.warningText
      : colors.textSecondary;

  return (
    <div style={bodyStyle}>
      <div style={metaRowStyle}>
        <span style={{ fontSize: 12, color: colors.textPrimary }}>
          {versionLabel}
        </span>
        {indicator ? (
          <span style={statusSlotStyle}>
            {indicator}
          </span>
        ) : null}
      </div>
      <span
        style={{
          color: descriptionColor,
          ...descriptionStyle,
        }}
        title={description}
      >
        {description}
      </span>
      {progressContent}
      <div style={footerStyle}>
        <span
          style={{
            color: statusColor,
            ...statusTextStyle,
          }}
          title={statusText}
        >
          {statusText}
        </span>
        {action ? (
          <div style={actionRowStyle}>
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
