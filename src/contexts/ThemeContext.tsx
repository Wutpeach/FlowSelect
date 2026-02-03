import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

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
  },
};

const ThemeContext = createContext<{
  theme: Theme;
  colors: ThemeColors;
  setTheme: (t: Theme) => void;
} | null>(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('black');

  useEffect(() => {
    // 启动时从配置读取
    invoke<any>('get_config').then(cfg => {
      if (cfg.theme) setThemeState(cfg.theme);
    });
  }, []);

  const setTheme = async (t: Theme) => {
    setThemeState(t);
    // 保存到配置
    const cfg = await invoke<any>('get_config');
    await invoke('save_config', { config: { ...cfg, theme: t } });
  };

  return (
    <ThemeContext.Provider value={{ theme, colors: themes[theme], setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
