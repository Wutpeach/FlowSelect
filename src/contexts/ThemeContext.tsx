import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, emit } from '@tauri-apps/api/event';

type Theme = 'black' | 'white';

interface ThemeColors {
  // 背景
  bgPrimary: string;
  bgSecondary: string;
  bgGradientStart: string;
  bgGradientEnd: string;
  // 边框
  borderStart: string;
  borderEnd: string;
  // 文字
  textPrimary: string;
  textSecondary: string;
  // 阴影
  shadowColor: string;
  shadowSpread: string;
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
  queueBadgeDot: string;
  queueBadgeShadow: string;
  queueCloseBg: string;
  queueCloseGlow: string;
  queueCloseBorder: string;
  queueCloseIcon: string;
  queueStatusBg: string;
  queueStatusBorder: string;
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
    borderStart: '#4B4951',
    borderEnd: '#313036',
    textPrimary: '#EEEEEE',
    textSecondary: '#AAAAAA',
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowSpread: '#0D0D0D',
    progressBgStroke: '#3a3a3a',
    progressFgStroke: '#3b82f6',
    progressText: '#60a5fa',
    progressSpeedText: '#808080',
    progressCancelIcon: '#606060',
    progressCancelHoverBg: 'rgba(239,68,68,0.2)',
    progressCancelHoverIcon: '#f87171',
    queueBadgeBg: 'rgba(16,185,129,0.86)',
    queueBadgeGlow: 'rgba(5,150,105,0.98)',
    queueBadgeText: '#ecfdf5',
    queueBadgeBorder: 'rgba(167,243,208,0.5)',
    queueBadgeDot: '#86efac',
    queueBadgeShadow: 'rgba(5,150,105,0.28)',
    queueCloseBg: 'rgba(220,38,38,0.88)',
    queueCloseGlow: 'rgba(239,68,68,0.96)',
    queueCloseBorder: 'rgba(252,165,165,0.44)',
    queueCloseIcon: '#fef2f2',
    queueStatusBg: 'rgba(16,185,129,0.12)',
    queueStatusBorder: 'rgba(110,231,183,0.28)',
    successIcon: '#707070',
    errorIcon: '#f87171',
  },
  white: {
    bgPrimary: '#E3E3E3',
    bgSecondary: '#F5F5F5',
    bgGradientStart: '#E3E3E3',
    bgGradientEnd: '#EFEFEF',
    borderStart: '#FDFDFD',
    borderEnd: '#F1F1F1',
    textPrimary: '#333333',
    textSecondary: '#666666',
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowSpread: 'rgba(0,0,0,0.16)',
    progressBgStroke: '#d1d5db',
    progressFgStroke: '#2563eb',
    progressText: '#1d4ed8',
    progressSpeedText: '#6b7280',
    progressCancelIcon: '#9ca3af',
    progressCancelHoverBg: 'rgba(239,68,68,0.15)',
    progressCancelHoverIcon: '#ef4444',
    queueBadgeBg: 'rgba(5,150,105,0.9)',
    queueBadgeGlow: 'rgba(16,185,129,0.98)',
    queueBadgeText: '#f0fdf4',
    queueBadgeBorder: 'rgba(16,185,129,0.34)',
    queueBadgeDot: '#34d399',
    queueBadgeShadow: 'rgba(5,150,105,0.22)',
    queueCloseBg: 'rgba(239,68,68,0.9)',
    queueCloseGlow: 'rgba(248,113,113,0.96)',
    queueCloseBorder: 'rgba(239,68,68,0.3)',
    queueCloseIcon: '#fff1f2',
    queueStatusBg: 'rgba(5,150,105,0.1)',
    queueStatusBorder: 'rgba(5,150,105,0.22)',
    successIcon: '#666666',
    errorIcon: '#ef4444',
  },
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('black');

  useEffect(() => {
    // 启动时从配置读取
    invoke<string>('get_config').then(cfgStr => {
      const cfg = JSON.parse(cfgStr);
      if (cfg.theme) setThemeState(cfg.theme);
    });

    // 监听其他窗口的主题变更
    const unlisten = listen<Theme>('theme-changed', (event) => {
      setThemeState(event.payload);
    });

    return () => { unlisten.then(fn => fn()); };
  }, []);

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
