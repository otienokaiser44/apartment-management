"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/components/ui/cn";
import { THEME_STORAGE_KEY, type ThemeChoice } from "./theme";

const OPTIONS: { value: ThemeChoice; label: string; hint: string; icon: LucideIcon }[] = [
  { value: "system", label: "System", hint: "Match your device", icon: Monitor },
  { value: "light", label: "Light", hint: "Always light", icon: Sun },
  { value: "dark", label: "Dark", hint: "Always dark", icon: Moon },
];

const CHANGE_EVENT = "theme-change";

function read(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // another tab changed it
  window.addEventListener(CHANGE_EVENT, onChange); // this tab changed it
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* storage may be blocked; the choice still applies for this page view */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Appearance picker. Stored on this device (localStorage) and applied instantly. */
export function ThemeSwitcher() {
  // Server render and first client render both say "system"; the real value is read after hydration.
  const choice = useSyncExternalStore(subscribe, read, () => "system" as ThemeChoice);

  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
      {OPTIONS.map(({ value, label, hint, icon: Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => apply(value)}
            className={cn(
              "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
              active ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-lg",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
