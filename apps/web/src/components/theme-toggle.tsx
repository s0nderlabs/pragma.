"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "./ui/button";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const nextTheme = () => {
    if (!mounted) {
      return;
    }

    const target = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(target);
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
