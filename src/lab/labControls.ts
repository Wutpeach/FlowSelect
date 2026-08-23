import type { CSSProperties } from "react";
import type { ThemeColors } from "../contexts/ThemeContext";
import {
  getCompactLabelStyle,
  getSelectableOptionStyle,
} from "../components/ui/shared-styles";

export type LabChipState = Readonly<{
  selected?: boolean;
  hovered?: boolean;
  disabled?: boolean;
}>;

type LabControlStyle = CSSProperties & { "--lab-focus-ring": string };

export const getLabChipStyle = (
  colors: ThemeColors,
  {
    selected = false,
    hovered = false,
    disabled = false,
  }: LabChipState = {},
): LabControlStyle => ({
  ...getSelectableOptionStyle(colors, selected, hovered),
  "--lab-focus-ring": colors.accentBorder,
  minHeight: 0,
  padding: "5px 10px",
  borderRadius: 8,
  fontFamily: "inherit",
  ...(disabled
    ? {
        opacity: 0.4,
        cursor: "default",
        color: colors.textSecondary,
      }
    : null),
});

export const getLabGroupLabelStyle = (colors: ThemeColors): CSSProperties => ({
  ...getCompactLabelStyle(colors),
  margin: 0,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
});
