"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "@/stores/useThemeStore";

import { Button } from "./ui/button";

export function ThemeToggle() {
  const { theme: pragmaTheme, toggleTheme } = useThemeStore();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const nextTheme = () => {
    if (!mounted) {
      return;
    }

    toggleTheme();
  };

  return (
    <Button
      aria-label="Toggle theme"
      data-testid="theme-toggle"
      variant="ghost"
      size="icon"
      className="relative"
      onClick={nextTheme}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all duration-200 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all duration-200 dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
      {!mounted && (
        <span className="absolute inset-0 animate-pulse rounded-full bg-muted" aria-hidden />
      )}
    </Button>
  );
}
