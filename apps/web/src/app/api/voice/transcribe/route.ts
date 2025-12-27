/**
 * Voice Transcription API Route
 *
 * Proxies audio to Groq Whisper API for speech-to-text transcription.
 * Uses authMiddleware for security (consistent with other API routes).
 *
 * @endpoint POST /api/voice/transcribe
 * @body FormData with 'audio' file
 * @returns { text: string } or { error: string }
 */

import { NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/authMiddleware";

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_MODEL = "whisper-large-v3-turbo";

export async function POST(request: Request) {
  // ✅ SECURITY: Authenticate request (same as other routes)
  const authError = await authMiddleware(request);
  if (authError) return authError;

  // Validate Groq API key is configured
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error("[Voice] GROQ_API_KEY not configured");
    return NextResponse.json(
      { error: "Voice transcription not configured" },
      { status: 500 }
    );
  }

  // Parse FormData and extract audio file
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("[Voice] Failed to parse FormData:", error);
    return NextResponse.json(
      { error: "Invalid request format" },
      { status: 400 }
    );
  }

  const audioFile = formData.get("audio") as File | null;

  if (!audioFile) {
    return NextResponse.json(
      { error: "No audio file provided" },
      { status: 400 }
    );
  }

  // Validate file size (25MB limit for Groq free tier)
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
  if (audioFile.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "Audio file too large (max 25MB)" },
      { status: 413 }
    );
  }

  // Forward to Groq API
  const groqFormData = new FormData();
  groqFormData.append("file", audioFile);
  groqFormData.append("model", GROQ_MODEL);
  groqFormData.append("language", "en");
  groqFormData.append("response_format", "json");
  groqFormData.append("temperature", "0");

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: groqFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Voice] Groq API error:", response.status, errorText);

      // Handle specific error codes
      if (response.status === 429) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please try again later." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "Transcription failed. Please try again." },
        { status: response.status }
      );
    }

    const result = await response.json();

    // Validate response has text
    if (typeof result.text !== "string") {
      console.error("[Voice] Invalid Groq response:", result);
      return NextResponse.json(
        { error: "Invalid transcription response" },
        { status: 502 }
      );
    }

    return NextResponse.json({ text: result.text });
  } catch (error) {
    console.error("[Voice] Network error:", error);
    return NextResponse.json(
      { error: "Network error. Please check your connection." },
      { status: 502 }
    );
  }
}
