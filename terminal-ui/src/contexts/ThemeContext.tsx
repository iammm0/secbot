import React, { createContext, useContext } from 'react';

/** 语义 token，对齐 UI-DESIGN-AND-INTERACTION 6.2 */
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
}

const defaultTheme: ThemeColors = {
  primary: 'cyan',
  secondary: 'blue',
  accent: 'magenta',
  error: 'red',
  warning: 'yellow',
  success: 'green',
  info: 'blue',
  text: 'white',
  textMuted: 'gray',
  background: 'black',
  backgroundPanel: 'gray',
  border: 'gray',
  borderActive: 'cyan',
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
