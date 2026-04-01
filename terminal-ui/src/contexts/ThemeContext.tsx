import React, { createContext, useContext } from 'react';

export type ThemeColor = string | undefined;

/** 语义 token：强调色保持品牌风格，基础文字/背景默认继承终端主题。 */
export interface ThemeColors {
  primary: ThemeColor;
  secondary: ThemeColor;
  accent: ThemeColor;
  error: ThemeColor;
  warning: ThemeColor;
  success: ThemeColor;
  info: ThemeColor;
  text: ThemeColor;
  textMuted: ThemeColor;
  background: ThemeColor;
  backgroundPanel: ThemeColor;
  border: ThemeColor;
  borderActive: ThemeColor;
  /** 品牌强调色板（用于 Logo/标识） */
  cyberRainbow: string[];
}

const defaultTheme: ThemeColors = {
  primary: 'green',
  secondary: 'cyan',
  accent: 'magenta',
  error: 'red',
  warning: 'yellow',
  success: 'greenBright',
  info: 'cyan',
  // 基础文字与背景默认跟随终端主题，避免黑底/白底被应用强制覆盖。
  text: undefined,
  textMuted: 'gray',
  background: undefined,
  backgroundPanel: undefined,
  border: 'gray',
  borderActive: 'green',
  cyberRainbow: ['green', 'cyan', 'magenta', 'yellow', 'greenBright', 'blue', 'cyanBright', 'magentaBright'],
};

const ThemeContext = createContext<ThemeColors>(defaultTheme);

export function ThemeProvider({
  children,
  theme = defaultTheme,
}: {
  children: React.ReactNode;
  theme?: Partial<ThemeColors>;
}) {
  const value = { ...defaultTheme, ...theme };
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeColors {
  return useContext(ThemeContext);
}
