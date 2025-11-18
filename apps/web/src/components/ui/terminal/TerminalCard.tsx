"use client";

import { forwardRef, HTMLAttributes, useState } from "react";
import { cn } from "../../../lib/utils";
import "./terminal-theme.css";

interface TerminalCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "active" | "hover";
  noPadding?: boolean;
  title?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export const TerminalCard = forwardRef<HTMLDivElement, TerminalCardProps>(
  ({
    className,
    children,
    variant = "default",
    noPadding = false,
    title,
    collapsible = false,
    defaultCollapsed = false,
    ...props
  }, ref) => {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    return (
      <div
        ref={ref}
        className={cn(
          "terminal-box",
          variant === "hover" && "terminal-box-hover",
          variant === "active" && "terminal-box-active",
          !noPadding && "p-4",
          className
        )}
        {...props}
      >
        {title && (
          <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-border">
            <h3 className="terminal-text-md font-semibold">{title}</h3>
            {collapsible && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="text-muted hover:text-foreground transition-colors"
                aria-label={collapsed ? "Expand" : "Collapse"}
              >
                <span className="font-mono text-sm">
                  {collapsed ? "[+]" : "[-]"}
                </span>
              </button>
            )}
          </div>
        )}
        {!collapsed && children}
      </div>
    );
  }
);

TerminalCard.displayName = "TerminalCard";