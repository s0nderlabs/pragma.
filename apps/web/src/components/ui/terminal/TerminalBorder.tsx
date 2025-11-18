"use client";

import { forwardRef, HTMLAttributes } from "react";
import { cn } from "../../../lib/utils";

interface TerminalBorderProps extends HTMLAttributes<HTMLDivElement> {
  type?: "single" | "double" | "dashed" | "ascii";
  title?: string;
  subtitle?: string;
}

export const TerminalBorder = forwardRef<HTMLDivElement, TerminalBorderProps>(
  ({ className, children, type = "single", title, subtitle, ...props }, ref) => {
    const getBorderChar = (position: string) => {
      switch (type) {
        case "double":
          switch (position) {
            case "tl": return "╔";
            case "tr": return "╗";
            case "bl": return "╚";
            case "br": return "╝";
            case "h": return "═";
            case "v": return "║";
            default: return "";
          }
        case "ascii":
          switch (position) {
            case "tl": return "+";
            case "tr": return "+";
            case "bl": return "+";
            case "br": return "+";
            case "h": return "-";
            case "v": return "|";
            default: return "";
          }
        case "dashed":
          switch (position) {
            case "h": return "┅";
            case "v": return "┊";
            default: return "";
          }
        default: // single
          switch (position) {
            case "tl": return "┌";
            case "tr": return "┐";
            case "bl": return "└";
            case "br": return "┘";
            case "h": return "─";
            case "v": return "│";
            default: return "";
          }
      }
    };

    return (
      <div ref={ref} className={cn("font-mono relative", className)} {...props}>
        {/* Top Border */}
        <div className="flex items-center text-border">
          <span>{getBorderChar("tl")}</span>
          {title ? (
            <>
              <span>{getBorderChar("h")}</span>
              <span className="px-1 text-foreground">{` ${title} `}</span>
              <span className="flex-1">{getBorderChar("h").repeat(50)}</span>
            </>
          ) : (
            <span className="flex-1">{getBorderChar("h").repeat(50)}</span>
          )}
          <span>{getBorderChar("tr")}</span>
        </div>

        {/* Content with side borders */}
        <div className="flex">
          <span className="text-border">{getBorderChar("v")}</span>
          <div className="flex-1 px-2 py-1">{children}</div>
          <span className="text-border">{getBorderChar("v")}</span>
        </div>

        {/* Bottom Border */}
        <div className="flex items-center text-border">
          <span>{getBorderChar("bl")}</span>
          {subtitle ? (
            <>
              <span className="flex-1">{getBorderChar("h").repeat(50)}</span>
              <span className="px-1 text-muted">{` ${subtitle} `}</span>
              <span>{getBorderChar("h")}</span>
            </>
          ) : (
            <span className="flex-1">{getBorderChar("h").repeat(50)}</span>
          )}
          <span>{getBorderChar("br")}</span>
        </div>
      </div>
    );
  }
);

TerminalBorder.displayName = "TerminalBorder";