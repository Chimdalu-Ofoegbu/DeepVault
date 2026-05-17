// dashboard/src/components/layout/ThemeToggle.tsx — Plan 04.1-05 Task 2.
//
// NEW control (D-02). A light/dark theme toggle pill for the `db-bar` top-bar
// pill row. It reuses the EXISTING `next-themes` provider — `main.tsx` already
// wraps the app in `<ThemeProvider attribute="class" defaultTheme="dark">`.
// No new provider is added here; `useTheme()` from next-themes gives the
// current theme + a setter, and next-themes itself handles localStorage
// persistence and the pre-paint flash guard (its own sanitized inline script).
//
// Theme mechanism (confirmed against globals.css, Plan 04.1-01): next-themes
// `attribute="class"` toggles `.dark` / `.light` on <html>. The dark token
// values live in both `:root` and `.dark`; the paper light override lives
// under `.light`. So `setTheme('light')` adds `.light` and the paper block
// applies; `setTheme('dark')` adds `.dark` (the default).
//
// SECURITY (threat T-04.1-14): the pre-paint theme application is next-themes'
// built-in sanitized inline script. This component writes NO custom pre-paint
// script and uses no dynamic-code-execution API — it only calls `setTheme`
// with a constrained 'light' | 'dark' value.

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

import { cn } from '@/lib/utils';

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  // next-themes hydration guard: `theme` is undefined on the server / first
  // client paint. Render a stable, non-interactive placeholder until mounted
  // so the markup matches and there is no hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <span
        className="db-pill mono"
        aria-hidden="true"
        style={{ visibility: 'hidden' }}
      >
        ☾ dark
      </span>
    );
  }

  // `resolvedTheme` reflects the actually-applied theme (handles the default).
  const current = theme === 'system' ? resolvedTheme : theme;
  const isDark = current !== 'light';
  const next = isDark ? 'light' : 'dark';

  return (
    <button
      type="button"
      className={cn('db-pill mono')}
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {isDark ? '☾ dark' : '☀ paper'}
    </button>
  );
}
