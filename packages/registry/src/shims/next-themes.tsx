// Derived from next-themes, Copyright (c) 2022 Paco Coursey, MIT License (https://opensource.org/license/mit)
// next-themes' useTheme without a ThemeProvider, which is all the sonner wrapper needs: its context default is
// { setTheme: noop, themes: [] }, so `theme` is undefined and the caller's default ("system") applies.
// shortcut: no ThemeProvider, so the theme never changes; sonner follows prefers-color-scheme. Add a context and provider (class on <html>) when an app wants to drive it.
interface UseThemeProps {
  themes: string[]
  forcedTheme?: string
  setTheme(theme: string): void
  theme?: string
  resolvedTheme?: string
  systemTheme?: "dark" | "light"
}

const noTheme: UseThemeProps = { setTheme() {}, themes: [] }

export const useTheme = () => noTheme
