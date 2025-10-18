"use client";

import type { DelegationArtifact } from "@pragma/core/delegations/types";
import type { AllowedToken } from "@pragma/core/monorail/tokens";

export interface AgentRequestPayload {
  message: string;
  delegation: {
    artifact: DelegationArtifact;
    tokens: AllowedToken[];
  };
  quickMode?: boolean;
}

export interface AgentResponseBase {
  type: string;
  warnings?: string[];
}

export interface AgentIntentResponse extends AgentResponseBase {
  type: "intent";
  intent: unknown;
  meta?: unknown;
}

export interface AgentClarificationResponse extends AgentResponseBase {
  type: "clarification";
  clarification: unknown;
}

export interface AgentInsightResponse extends AgentResponseBase {
  type: "insight";
  title: string;
  body: string;
}

export interface AgentErrorResponse extends AgentResponseBase {
  type: "error";
  violations: unknown[];
}

export type AgentResponse =
  | AgentIntentResponse
  | AgentClarificationResponse
  | AgentInsightResponse
  | AgentErrorResponse;

export interface AgentControlEvent {
  type: string;
  payload: unknown;
}

export interface CallAgentOptions {
  onStream?: (chunk: string) => void;
  onControl?: (event: AgentControlEvent) => void;
}

export const callAgent = async (
  payload: AgentRequestPayload,
  options?: CallAgentOptions,
): Promise<AgentResponse> => {
  const response = await fetch("/api/chat/respond", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream")) {
    if (!response.body) {
      throw new Error("Agent returned an empty stream");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let aggregated = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex).trim();
        buffer = buffer.slice(separatorIndex + 2);
        if (!rawEvent.startsWith("data:")) continue;
        const jsonPayload = rawEvent.slice(5).trim();
        if (jsonPayload.length === 0) continue;
        let event: { type?: string; content?: string; message?: string; control?: AgentControlEvent };
        try {
          event = JSON.parse(jsonPayload) as { type?: string; content?: string; message?: string; control?: AgentControlEvent };
        } catch (error) {
          console.warn("Failed to parse agent stream event", error, jsonPayload);
          continue;
        }

        if (event.type === "chunk" && typeof event.content === "string") {
          aggregated += event.content;
          options?.onStream?.(event.content);
        } else if (event.type === "control" && event.control) {
          options?.onControl?.(event.control);
        } else if (event.type === "error") {
          throw new Error(event.message ?? "Agent streaming error");
        } else if (event.type === "done") {
          const bodyText = aggregated.trim();
          // Parse title from first line if it looks like a heading (short line followed by blank line)
          const lines = bodyText.split("\n");
          const firstLine = (lines[0] || "").trim();
          const secondLine = lines.length > 1 ? (lines[1] || "").trim() : null;
          const isHeading = 
            firstLine.length > 0 && 
            firstLine.length < 60 && 
            !firstLine.endsWith(":") && 
            !firstLine.endsWith(".") &&
            secondLine === "" && 
            lines.length > 2;
          const title = isHeading ? firstLine : "Pragma Insight";
          const body = isHeading ? lines.slice(2).join("\n").trim() : bodyText;
          
          return {
            type: "insight",
            title,
            body: body.length > 0 ? body : "No additional insight is available for this request.",
          } satisfies AgentInsightResponse;
        }
      }
    }

    const bodyText = aggregated.trim();
    // Parse title from first line if it looks like a heading (short line followed by blank line)
    const lines = bodyText.split("\n");
    const firstLine = (lines[0] || "").trim();
    const secondLine = lines.length > 1 ? (lines[1] || "").trim() : null;
    const isHeading = 
      firstLine.length > 0 && 
      firstLine.length < 60 && 
      !firstLine.endsWith(":") && 
      !firstLine.endsWith(".") &&
      secondLine === "" && 
      lines.length > 2;
    const title = isHeading ? firstLine : "Pragma Insight";
    const body = isHeading ? lines.slice(2).join("\n").trim() : bodyText;
    
    return {
      type: "insight",
      title,
      body: body.length > 0 ? body : "No additional insight is available for this request.",
    } satisfies AgentInsightResponse;
  }

  if (!response.ok) {
    let message = `Agent request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (body?.error) {
        message = typeof body.error === "string" ? body.error : JSON.stringify(body.error);
      }
    } catch (error) {
      console.warn("Failed to parse agent error response", error);
    }
    throw new Error(message);
  }

  return (await response.json()) as AgentResponse;
};
