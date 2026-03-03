import React, { createContext, useContext } from 'react';

/** 语义 token，对齐 UI-DESIGN-AND-INTERACTION 6.2 — 赛博朋克风：主色绿 + 霓虹七彩 */
export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  error: string;
  warning: string;
  success: string;
  info: string;
  text: string;
  textMuted: string;
  background: string;
  backgroundPanel: string;
  border: string;
  borderActive: string;
  /** 赛博彩虹色板（用于 Logo/标识）：绿主色 + 霓虹七彩 */
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
  text: 'white',
  textMuted: 'gray',
  background: 'black',
  backgroundPanel: 'gray',
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
