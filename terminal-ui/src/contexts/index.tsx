/**
 * Provider 树：按 UI-DESIGN-AND-INTERACTION 第三节顺序嵌套
 * Exit → Toast → Route → SDK → Theme → Keybind → Dialog → Command → App
 */
import React from 'react';
import { ExitProvider } from './ExitContext.js';
import { ToastProvider } from './ToastContext.js';
import { RouteProvider } from './RouteContext.js';
import { SDKProvider } from './SDKContext.js';
import { ThemeProvider } from './ThemeContext.js';
import { KeybindProvider } from './KeybindContext.js';
import { DialogProvider } from './DialogContext.js';
import { CommandProvider } from './CommandContext.js';

export function AllProviders({
  children,
  onExit,
}: {
  children: React.ReactNode;
  onExit: (code?: number) => void;
}) {
  return (
    <ExitProvider onExit={onExit}>
      <ToastProvider>
        <RouteProvider>
          <SDKProvider>
            <ThemeProvider>
              <KeybindProvider>
                <DialogProvider>
                  <CommandProvider>
                    {children}
                  </CommandProvider>
                </DialogProvider>
              </KeybindProvider>
            </ThemeProvider>
          </SDKProvider>
        </RouteProvider>
      </ToastProvider>
    </ExitProvider>
  );
}

export { useExit } from './ExitContext.js';
export { useToast } from './ToastContext.js';
export { useRoute } from './RouteContext.js';
export { useSDK } from './SDKContext.js';
export { useTheme } from './ThemeContext.js';
export { useKeybind } from './KeybindContext.js';
export { useDialog } from './DialogContext.js';
export { useCommand } from './CommandContext.js';
export type { ToastOptions, ToastVariant } from './ToastContext.js';
export type { Route, RouteType } from './RouteContext.js';
export type { CommandOption } from './CommandContext.js';
export type { ThemeColors } from './ThemeContext.js';
