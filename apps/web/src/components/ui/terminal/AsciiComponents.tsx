"use client";

import { HTMLAttributes } from "react";
import { cn } from "../../../lib/utils";

// ASCII Progress Bar Component
interface AsciiProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number; // 0-100
  width?: number; // Number of characters
  showPercentage?: boolean;
}

export function AsciiProgress({
  value,
  width = 20,
  showPercentage = true,
  className,
  ...props
}: AsciiProgressProps) {
  const filled = Math.floor((value / 100) * width);
  const empty = width - filled;

  return (
    <div className={cn("font-mono flex items-center gap-2", className)} {...props}>
      <span className="text-muted">[</span>
      <span className="text-accent">{" █".repeat(filled)}</span>
      <span className="text-muted">{"░".repeat(empty)}</span>
      <span className="text-muted">]</span>
      {showPercentage && (
        <span className="text-foreground tabular-nums ml-1">{value.toString().padStart(3, " ")}%</span>
      )}
    </div>
  );
}

// ASCII Divider Component
interface AsciiDividerProps extends HTMLAttributes<HTMLDivElement> {
  type?: "single" | "double" | "dashed" | "dots";
  label?: string;
}

export function AsciiDivider({
  type = "single",
  label,
  className,
  ...props
}: AsciiDividerProps) {
  const getChar = () => {
    switch (type) {
      case "double": return "═";
      case "dashed": return "┅";
      case "dots": return "·";
      default: return "─";
    }
  };

  const char = getChar();
  const repeatCount = 40;

  return (
    <div className={cn("font-mono text-muted my-4 flex items-center", className)} {...props}>
      {label ? (
        <>
          <span>{char.repeat(4)}</span>
          <span className="px-2 text-foreground">{label}</span>
          <span className="flex-1">{char.repeat(repeatCount)}</span>
        </>
      ) : (
        <span className="w-full">{char.repeat(repeatCount)}</span>
      )}
    </div>
  );
}

// ASCII Header Component
interface AsciiHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  variant?: "box" | "banner" | "simple";
}

export function AsciiHeader({
  title,
  subtitle,
  variant = "box",
  className,
  ...props
}: AsciiHeaderProps) {
  if (variant === "banner") {
    return (
      <div className={cn("font-mono text-center my-4", className)} {...props}>
        <div className="text-accent">
          ╔═══════════════════════════════════════╗
        </div>
        <div className="flex justify-center items-center">
          <span className="text-accent">║</span>
          <span className="px-2 text-foreground font-semibold tracking-wider">
            {title.toUpperCase()}
          </span>
          <span className="text-accent">║</span>
        </div>
        {subtitle && (
          <div className="flex justify-center items-center">
            <span className="text-accent">║</span>
            <span className="px-2 text-muted text-sm">
              {subtitle}
            </span>
            <span className="text-accent">║</span>
          </div>
        )}
        <div className="text-accent">
          ╚═══════════════════════════════════════╝
        </div>
      </div>
    );
  }

  if (variant === "simple") {
    return (
      <div className={cn("font-mono my-4", className)} {...props}>
        <div className="text-foreground font-semibold">
          ## {title}
        </div>
        {subtitle && (
          <div className="text-muted text-sm">
            {subtitle}
          </div>
        )}
        <div className="text-muted">
          {"─".repeat(title.length + 3)}
        </div>
      </div>
    );
  }

  // Default box variant
  return (
    <div className={cn("font-mono my-4", className)} {...props}>
      <div className="text-muted">
        ┌─{` ${title} `}{"─".repeat(Math.max(0, 30 - title.length))}┐
      </div>
      {subtitle && (
        <div className="text-muted">
          │ <span className="text-muted text-sm">{subtitle}</span>
        </div>
      )}
      <div className="text-muted">
        └{"─".repeat(34)}┘
      </div>
    </div>
  );
}

// ASCII Status Indicator Component
interface AsciiStatusProps extends HTMLAttributes<HTMLSpanElement> {
  status: "active" | "inactive" | "pending" | "success" | "error" | "warning";
  label?: string;
}

export function AsciiStatus({
  status,
  label,
  className,
  ...props
}: AsciiStatusProps) {
  const getIndicator = () => {
    switch (status) {
      case "active": return { char: "●", color: "text-accent" };
      case "success": return { char: "✓", color: "text-accent" };
      case "error": return { char: "✗", color: "text-destructive" };
      case "warning": return { char: "!", color: "text-yellow-500" };
      case "pending": return { char: "◎", color: "text-muted" };
      case "inactive":
      default: return { char: "○", color: "text-muted" };
    }
  };

  const { char, color } = getIndicator();

  return (
    <span className={cn("font-mono inline-flex items-center gap-1", className)} {...props}>
      <span className={color}>{char}</span>
      {label && <span className="text-foreground">{label}</span>}
    </span>
  );
}

// ASCII Loading Spinner Component
interface AsciiSpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "md" | "lg";
}

export function AsciiSpinner({
  size = "md",
  className,
  ...props
}: AsciiSpinnerProps) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  const sizeClass = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg"
  }[size];

  return (
    <span className={cn("font-mono text-accent", sizeClass, className)} {...props}>
      {frames[frame]}
    </span>
  );
}

// ASCII Button Component
interface AsciiButtonProps extends HTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
}

export function AsciiButton({
  children,
  variant = "default",
  size = "md",
  disabled = false,
  className,
  onClick,
  ...props
}: AsciiButtonProps) {
  const variantClasses = {
    default: "border-border text-foreground hover:border-accent hover:text-accent",
    primary: "border-accent text-accent hover:bg-accent hover:text-background",
    danger: "border-destructive text-destructive hover:bg-destructive hover:text-background"
  };

  const sizeClasses = {
    sm: "px-2 py-1 text-sm",
    md: "px-3 py-1 text-base",
    lg: "px-4 py-2 text-lg"
  };

  return (
    <button
      className={cn(
        "font-mono border-2 transition-all duration-150",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      [ {children} ]
    </button>
  );
}

// ASCII Table Component
interface AsciiTableProps extends HTMLAttributes<HTMLDivElement> {
  headers: string[];
  rows: string[][];
  columnWidths?: number[];
}

export function AsciiTable({
  headers,
  rows,
  columnWidths,
  className,
  ...props
}: AsciiTableProps) {
  // Calculate column widths if not provided
  const widths = columnWidths || headers.map((h, i) => {
    const maxRowWidth = Math.max(...rows.map(r => (r[i] || "").length));
    return Math.max(h.length, maxRowWidth) + 2;
  });

  const formatCell = (content: string, width: number) => {
    return content.padEnd(width, " ");
  };

  return (
    <div className={cn("font-mono text-sm", className)} {...props}>
      {/* Top border */}
      <div className="text-muted">
        ┌{widths.map(w => "─".repeat(w)).join("┬")}┐
      </div>

      {/* Headers */}
      <div className="text-foreground font-semibold">
        │{headers.map((h, i) => formatCell(` ${h}`, widths[i])).join("│")}│
      </div>

      {/* Header separator */}
      <div className="text-muted">
        ├{widths.map(w => "─".repeat(w)).join("┼")}┤
      </div>

      {/* Rows */}
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="text-foreground">
          │{row.map((cell, i) => formatCell(` ${cell}`, widths[i])).join("│")}│
        </div>
      ))}

      {/* Bottom border */}
      <div className="text-muted">
        └{widths.map(w => "─".repeat(w)).join("┴")}┘
      </div>
    </div>
  );
}

// Add missing imports
import { useState, useEffect } from "react";