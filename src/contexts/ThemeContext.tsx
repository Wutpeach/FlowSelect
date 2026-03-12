import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';

export type Theme = 'black' | 'white';
const DEFAULT_THEME: Theme = 'black';

interface ThemeColors {
  // 背景
  bgPrimary: string;
  bgSecondary: string;
  bgGradientStart: string;
  bgGradientEnd: string;
  fieldBg: string;
  fieldHoverBg: string;
  fieldInset: string;
  // 边框
  borderStart: string;
  borderEnd: string;
  fieldBorder: string;
  fieldBorderStrong: string;
  // 文字
  textPrimary: string;
  textSecondary: string;
  accentText: string;
  dangerText: string;
  // 阴影
  shadowColor: string;
  shadowSpread: string;
  panelShadow: string;
  panelShadowStrong: string;
  accentGlow: string;
  dangerGlow: string;
  // 交互
  accentSolid: string;
  accentSurface: string;
  accentSurfaceStrong: string;
  accentBorder: string;
  dangerSolid: string;
  dangerSurface: string;
  dangerBorder: string;
  controlMuted: string;
  controlMutedHover: string;
  controlStroke: string;
  controlStrokeHover: string;
  knobBg: string;
  // 进度环
  progressBgStroke: string;
  progressFgStroke: string;
  progressText: string;
  progressSpeedText: string;
  progressCancelIcon: string;
  progressCancelHoverBg: string;
  progressCancelHoverIcon: string;
  queueBadgeBg: string;
  queueBadgeGlow: string;
  queueBadgeText: string;
  queueBadgeBorder: string;
  queueBadgeShadow: string;
  queueBadgeOpenBg: string;
  queueBadgeOpenGlow: string;
  queueBadgeOpenBorder: string;
  queueBadgeOpenText: string;
  queueBadgeOpenShadow: string;
  queueStatusBg: string;
  queueStatusBorder: string;
  transcodeSolid: string;
  transcodeText: string;
  transcodeMutedText: string;
  transcodeSurface: string;
  transcodeBorder: string;
  transcodeGlow: string;
  transcodeTrack: string;
  // Status icons
  successIcon: string;
  errorIcon: string;
}

const themes: Record<Theme, ThemeColors> = {
  black: {
    bgPrimary: '#201E25',
    bgSecondary: '#323137',
    bgGradientStart: '#201E25',
    bgGradientEnd: '#323137',
    fieldBg: '#2B2A31',
    fieldHoverBg: 'rgba(255,255,255,0.06)',
    fieldInset: 'rgba(255,255,255,0.05)',
    borderStart: '#4B4951',
    borderEnd: '#313036',
    fieldBorder: '#4B4951',
    fieldBorderStrong: 'rgba(96,165,250,0.48)',
    textPrimary: '#EEEEEE',
    textSecondary: '#AAAAAA',
    accentText: '#60a5fa',
    dangerText: '#fca5a5',
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowSpread: '#0D0D0D',
    panelShadow: '0 10px 28px rgba(0,0,0,0.34)',
    panelShadowStrong: '0 16px 32px rgba(0,0,0,0.46)',
    accentGlow: 'rgba(59,130,246,0.38)',
    dangerGlow: 'rgba(239,68,68,0.32)',
    accentSolid: '#3b82f6',
    accentSurface: 'rgba(59,130,246,0.1)',
    accentSurfaceStrong: 'rgba(59,130,246,0.18)',
    accentBorder: 'rgba(96,165,250,0.42)',
    dangerSolid: '#ef4444',
    dangerSurface: 'rgba(239,68,68,0.14)',
    dangerBorder: 'rgba(248,113,113,0.34)',
    controlMuted: '#56555c',
    controlMutedHover: '#9a98a3',
    controlStroke: '#4c4b52',
    controlStrokeHover: '#8b8993',
    knobBg: '#f7f7f7',
    progressBgStroke: '#3a3a3a',
    progressFgStroke: '#3b82f6',
    progressText: '#60a5fa',
    progressSpeedText: '#808080',
    progressCancelIcon: '#606060',
    progressCancelHoverBg: 'rgba(239,68,68,0.2)',
    progressCancelHoverIcon: '#f87171',
    queueBadgeBg: 'rgba(51,65,85,0.88)',
    queueBadgeGlow: 'rgba(71,85,105,0.98)',
    queueBadgeText: '#f8fafc',
    queueBadgeBorder: 'rgba(148,163,184,0.34)',
    queueBadgeShadow: 'rgba(15,23,42,0.34)',
    queueBadgeOpenBg: 'rgba(63,78,98,0.92)',
    queueBadgeOpenGlow: 'rgba(90,105,128,0.98)',
    queueBadgeOpenBorder: 'rgba(148,163,184,0.4)',
    queueBadgeOpenText: '#f8fafc',
    queueBadgeOpenShadow: 'rgba(59,130,246,0.18)',
    queueStatusBg: 'rgba(148,163,184,0.12)',
    queueStatusBorder: 'rgba(148,163,184,0.24)',
    transcodeSolid: '#f59e0b',
    transcodeText: '#fbbf24',
    transcodeMutedText: '#d7b15a',
    transcodeSurface: 'rgba(245,158,11,0.12)',
    transcodeBorder: 'rgba(251,191,36,0.34)',
    transcodeGlow: 'rgba(245,158,11,0.34)',
    transcodeTrack: 'rgba(120,73,18,0.44)',
    successIcon: '#707070',
    errorIcon: '#f87171',
  },
  white: {
    bgPrimary: '#E3E3E3',
    bgSecondary: '#F5F5F5',
    bgGradientStart: '#E3E3E3',
    bgGradientEnd: '#EFEFEF',
    fieldBg: '#F7F7F8',
    fieldHoverBg: 'rgba(0,0,0,0.04)',
    fieldInset: 'rgba(255,255,255,0.74)',
    borderStart: '#FDFDFD',
    borderEnd: '#F1F1F1',
    fieldBorder: '#D8D8DA',
    fieldBorderStrong: 'rgba(37,99,235,0.28)',
    textPrimary: '#333333',
    textSecondary: '#666666',
    accentText: '#2563eb',
    dangerText: '#dc2626',
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowSpread: 'rgba(0,0,0,0.16)',
    panelShadow: '0 8px 22px rgba(34,34,34,0.12)',
    panelShadowStrong: '0 12px 28px rgba(34,34,34,0.16)',
    accentGlow: 'rgba(37,99,235,0.22)',
    dangerGlow: 'rgba(239,68,68,0.24)',
    accentSolid: '#2563eb',
    accentSurface: 'rgba(37,99,235,0.08)',
    accentSurfaceStrong: 'rgba(37,99,235,0.14)',
    accentBorder: 'rgba(37,99,235,0.26)',
    dangerSolid: '#ef4444',
    dangerSurface: 'rgba(239,68,68,0.1)',
    dangerBorder: 'rgba(239,68,68,0.24)',
    controlMuted: '#767676',
    controlMutedHover: '#404040',
    controlStroke: '#787878',
    controlStrokeHover: '#404040',
    knobBg: '#FFFFFF',
    progressBgStroke: '#d1d5db',
    progressFgStroke: '#2563eb',
    progressText: '#1d4ed8',
    progressSpeedText: '#6b7280',
    progressCancelIcon: '#9ca3af',
    progressCancelHoverBg: 'rgba(239,68,68,0.15)',
    progressCancelHoverIcon: '#ef4444',
    queueBadgeBg: 'rgba(226,232,240,0.92)',
    queueBadgeGlow: 'rgba(203,213,225,0.98)',
    queueBadgeText: '#1f2937',
    queueBadgeBorder: 'rgba(100,116,139,0.24)',
    queueBadgeShadow: 'rgba(148,163,184,0.24)',
    queueBadgeOpenBg: 'rgba(219,228,239,0.96)',
    queueBadgeOpenGlow: 'rgba(203,213,225,0.98)',
    queueBadgeOpenBorder: 'rgba(100,116,139,0.28)',
    queueBadgeOpenText: '#111827',
    queueBadgeOpenShadow: 'rgba(37,99,235,0.12)',
    queueStatusBg: 'rgba(148,163,184,0.12)',
    queueStatusBorder: 'rgba(100,116,139,0.18)',
    transcodeSolid: '#d97706',
    transcodeText: '#b45309',
    transcodeMutedText: '#a16207',
    transcodeSurface: 'rgba(245,158,11,0.12)',
    transcodeBorder: 'rgba(217,119,6,0.26)',
    transcodeGlow: 'rgba(217,119,6,0.22)',
    transcodeTrack: 'rgba(251,191,36,0.22)',
    successIcon: '#666666',
    errorIcon: '#ef4444',
  },
};

const isTheme = (value: unknown): value is Theme => value === 'black' || value === 'white';

const getThemeFromConfigString = (configStr: string): Theme => {
  try {
    const cfg = JSON.parse(configStr) as { theme?: unknown };
    return isTheme(cfg.theme) ? cfg.theme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

const ThemeContext = createContext<{
  theme: Theme;
  colors: ThemeColors;
  setTheme: (t: Theme) => void;
} | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
};

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme ?? DEFAULT_THEME);

  useEffect(() => {
    // 启动时从配置读取
    let isDisposed = false;

    if (initialTheme === undefined) {
      void invoke<string>('get_config')
        .then((cfgStr) => {
          if (isDisposed) {
            return;
          }
          setThemeState(getThemeFromConfigString(cfgStr));
        })
        .catch((err) => {
          console.error('Failed to load theme config:', err);
        });
    }

    // 监听其他窗口的主题变更
    const unlisten = listen<Theme>('theme-changed', (event) => {
      setThemeState(event.payload);
    });

    return () => {
      isDisposed = true;
      unlisten.then(fn => fn());
    };
  }, [initialTheme]);

  const setTheme = async (t: Theme) => {
    setThemeState(t);
    // 通知其他窗口
    await emit('theme-changed', t);
    // 广播到浏览器扩展
    await invoke('broadcast_theme', { theme: t });
    // 保存到配置
    const cfgStr = await invoke<string>('get_config');
    const cfg = JSON.parse(cfgStr);
    await invoke('save_config', { json: JSON.stringify({ ...cfg, theme: t }) });
  };

  return (
    <ThemeContext.Provider value={{ theme, colors: themes[theme], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
