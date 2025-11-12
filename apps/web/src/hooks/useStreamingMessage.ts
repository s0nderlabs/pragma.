/**
 * useStreamingMessage Hook
 *
 * Manages smooth token-by-token message streaming with buffering.
 * Similar to CLI's buffering pattern for smooth character-by-character display.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import type { ChatMessage } from "@/lib/h2/types";

// ============================================================================
// Constants
// ============================================================================

const IMMEDIATE_THRESHOLD_MS = 80; // Flush buffer if elapsed time > 80ms
const AUTO_FLUSH_INTERVAL_MS = 300; // Auto-flush every 300ms

// ============================================================================
// Hook
// ============================================================================

export interface UseStreamingMessageOptions {
  message: ChatMessage;
  enabled?: boolean; // Only stream if enabled (e.g., message.isStreaming)
}

export function useStreamingMessage({ message, enabled = true }: UseStreamingMessageOptions) {
  const [displayedContent, setDisplayedContent] = useState(message.content);
  const bufferRef = useRef("");
  const lastFlushTimeRef = useRef(Date.now());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const contentLengthRef = useRef(message.content.length);

  /**
   * Flush buffer to displayed content
   */
  const flushBuffer = useCallback((force = false) => {
    const elapsed = Date.now() - lastFlushTimeRef.current;

    if (force || (bufferRef.current.length > 0 && elapsed >= IMMEDIATE_THRESHOLD_MS)) {
      setDisplayedContent((prev) => prev + bufferRef.current);
      bufferRef.current = "";
      lastFlushTimeRef.current = Date.now();
    }
  }, []);

  /**
   * Update displayed content when message content changes
   */
  useEffect(() => {
    if (!enabled) {
      // Not streaming - show full content immediately
      setDisplayedContent(message.content);
      return;
    }

    // Calculate delta (new content since last update)
    const currentLength = message.content.length;
    const previousLength = contentLengthRef.current;

    if (currentLength > previousLength) {
      const delta = message.content.slice(previousLength);
      bufferRef.current += delta;
      contentLengthRef.current = currentLength;

      // Flush if enough time has passed
      flushBuffer();
    } else if (currentLength < previousLength) {
      // Content was reset (e.g., new message) - reset state
      setDisplayedContent(message.content);
      bufferRef.current = "";
      contentLengthRef.current = currentLength;
      lastFlushTimeRef.current = Date.now();
    }
  }, [message.content, enabled, flushBuffer]);

  /**
   * Set up auto-flush interval
   */
  useEffect(() => {
    if (!enabled) return;

    intervalRef.current = setInterval(() => {
      flushBuffer();
    }, AUTO_FLUSH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, flushBuffer]);

  /**
   * Force flush on unmount or when streaming stops
   */
  useEffect(() => {
    return () => {
      flushBuffer(true);
    };
  }, [flushBuffer]);

  /**
   * Force flush when message stops streaming
   */
  useEffect(() => {
    if (!message.isStreaming && bufferRef.current.length > 0) {
      flushBuffer(true);
    }
  }, [message.isStreaming, flushBuffer]);

  return {
    displayedContent,
    isBuffering: bufferRef.current.length > 0,
    flushBuffer: () => flushBuffer(true),
  };
}

// ============================================================================
// Utility Hook - useStreamingText
// ============================================================================

/**
 * Simple streaming text hook without message object
 * Useful for standalone text streaming
 */
export interface UseStreamingTextOptions {
  text: string;
  enabled?: boolean;
}

export function useStreamingText({ text, enabled = true }: UseStreamingTextOptions) {
  const [displayedText, setDisplayedText] = useState(text);
  const textIndexRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDisplayedText(text);
      return;
    }

    // Reset if text changed completely (not an append)
    if (!text.startsWith(displayedText)) {
      setDisplayedText("");
      textIndexRef.current = 0;
    }

    // Character-by-character reveal
    if (textIndexRef.current < text.length) {
      intervalRef.current = setInterval(() => {
        if (textIndexRef.current < text.length) {
          setDisplayedText(text.slice(0, textIndexRef.current + 1));
          textIndexRef.current++;
        } else {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
        }
      }, 30); // ~33 characters per second

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [text, enabled, displayedText]);

  return {
    displayedText,
    isComplete: textIndexRef.current >= text.length,
  };
}
