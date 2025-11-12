/**
 * SSE Client Utilities
 *
 * Handles Server-Sent Events (SSE) connection to H2 agent API.
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Event parsing and type safety
 * - Connection state management
 * - Mobile-friendly (handles background/foreground transitions)
 */

import type { SSEEvent, MessageTuple, H2SessionState, AllowedToken } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface SSEClientConfig {
  apiUrl: string;
  messages: MessageTuple[];
  userAddress: string;
  sessionData?: H2SessionState;
  quickMode?: boolean;
  allowedTokens?: AllowedToken[];
  onEvent: (event: SSEEvent) => void;
  onError?: (error: Error) => void;
  onConnectionStateChange?: (state: SSEConnectionState) => void;
}

export type SSEConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

// ============================================================================
// SSE Client Class
// ============================================================================

export class SSEClient {
  private config: SSEClientConfig;
  private abortController: AbortController | null = null;
  private connectionState: SSEConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private baseReconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 10000; // Max 10 seconds
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(config: SSEClientConfig) {
    this.config = config;
  }

  /**
   * Start SSE connection
   */
  async connect(): Promise<void> {
    // Cancel any existing connection
    this.disconnect();

    // Create new abort controller
    this.abortController = new AbortController();

    // Update state
    this.setConnectionState("connecting");

    try {
      // Make POST request to API
      const response = await fetch(this.config.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: this.config.messages,
          userAddress: this.config.userAddress,
          sessionData: this.config.sessionData,
          quickMode: this.config.quickMode,
          allowedTokens: this.config.allowedTokens,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${errorText}`);
      }

      // Check content type
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("text/event-stream")) {
        throw new Error(`Unexpected content type: ${contentType}`);
      }

      // Connection established
      this.setConnectionState("connected");
      this.reconnectAttempts = 0; // Reset reconnect counter on successful connection

      // Process SSE stream
      await this.processStream(response.body);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Connection was intentionally cancelled
        this.setConnectionState("disconnected");
        return;
      }

      // Connection error - attempt reconnect
      console.error("SSE connection error:", error);
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Process SSE stream
   */
  private async processStream(body: ReadableStream<Uint8Array> | null): Promise<void> {
    if (!body) {
      throw new Error("Response body is null");
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Stream complete
          this.setConnectionState("disconnected");
          break;
        }

        // Decode chunk
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events (ends with \n\n)
        const events = buffer.split("\n\n");
        buffer = events.pop() || ""; // Keep incomplete event in buffer

        for (const eventText of events) {
          if (!eventText.trim()) continue;

          // Parse SSE event (format: "data: {...}")
          const match = eventText.match(/^data: (.*)$/m);
          if (!match) continue;

          try {
            const event = JSON.parse(match[1]) as SSEEvent;
            this.config.onEvent(event);

            // Handle done event
            if (event.type === "done") {
              this.setConnectionState("disconnected");
              reader.cancel();
              return;
            }

            // Handle error event
            if (event.type === "error") {
              const error = new Error(event.error || "Stream error");
              this.handleConnectionError(error);
              reader.cancel();
              return;
            }
          } catch (parseError) {
            console.error("Failed to parse SSE event:", parseError, eventText);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // Intentional cancellation
        return;
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle connection error with exponential backoff
   */
  private handleConnectionError(error: Error): void {
    this.config.onError?.(error);

    // Check if we should retry
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setConnectionState("error");
      return;
    }

    // Calculate backoff delay (exponential with jitter)
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;
    this.setConnectionState("reconnecting");

    console.log(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    // Schedule reconnect
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  /**
   * Disconnect from SSE stream
   */
  disconnect(): void {
    // Cancel reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Abort fetch request
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.setConnectionState("disconnected");
  }

  /**
   * Get current connection state
   */
  getConnectionState(): SSEConnectionState {
    return this.connectionState;
  }

  /**
   * Set connection state and notify listeners
   */
  private setConnectionState(state: SSEConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.config.onConnectionStateChange?.(state);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionState === "connected";
  }

  /**
   * Reset reconnect state (call this to retry after max attempts reached)
   */
  resetReconnectState(): void {
    this.reconnectAttempts = 0;
    this.setConnectionState("disconnected");
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create and start SSE client
 */
export function createSSEClient(config: SSEClientConfig): SSEClient {
  const client = new SSEClient(config);
  client.connect().catch((error) => {
    console.error("Failed to start SSE client:", error);
    config.onError?.(error);
  });
  return client;
}

/**
 * Simple SSE connection without class instance
 * Returns cleanup function
 */
export function connectSSE(config: SSEClientConfig): () => void {
  const client = new SSEClient(config);
  client.connect().catch((error) => {
    console.error("SSE connection failed:", error);
    config.onError?.(error);
  });

  return () => {
    client.disconnect();
  };
}
