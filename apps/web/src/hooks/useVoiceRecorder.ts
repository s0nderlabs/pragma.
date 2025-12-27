/**
 * useVoiceRecorder Hook
 *
 * Handles audio recording with MediaRecorder API, including:
 * - Permission handling (getUserMedia)
 * - Click vs hold detection (200ms threshold)
 * - Audio analyser for waveform visualization
 * - Safari compatibility (audio/mp4 fallback)
 * - Recording limits (500ms min, 60s max)
 */

import { useState, useRef, useCallback, useEffect } from 'react'

// Recording constraints
const MIN_RECORDING_DURATION = 500 // 500ms minimum
const MAX_RECORDING_DURATION = 60000 // 60 seconds maximum
const HOLD_THRESHOLD = 200 // 200ms to distinguish click vs hold

// Error types
export type VoiceRecorderError =
  | 'permission_denied'
  | 'no_microphone'
  | 'browser_unsupported'
  | 'recording_too_short'
  | 'unknown'

export interface VoiceRecorderState {
  isRecording: boolean
  isTranscribing: boolean
  error: VoiceRecorderError | null
  analyserNode: AnalyserNode | null
  duration: number
}

export interface UseVoiceRecorderReturn extends VoiceRecorderState {
  startRecording: () => Promise<void>
  stopRecording: () => Promise<Blob | null>
  cancelRecording: () => void
  clearError: () => void
}

/**
 * Detect best supported audio MIME type for current browser
 * Safari doesn't fully support audio/webm, needs mp4 fallback
 */
function getSupportedMimeType(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: 'audio/webm', extension: 'webm' }
  }

  // Priority order: opus (best compression) > webm > mp4 > wav
  const types = [
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
    { mimeType: 'audio/webm', extension: 'webm' },
    { mimeType: 'audio/mp4', extension: 'mp4' },
    { mimeType: 'audio/wav', extension: 'wav' },
  ]

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type.mimeType)) {
      return type
    }
  }

  // Fallback (browser will use default)
  return { mimeType: '', extension: 'webm' }
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<VoiceRecorderError | null>(null)
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null)
  const [duration, setDuration] = useState(0)

  // Refs for cleanup and state tracking
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number>(0)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const maxDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const mimeTypeRef = useRef<{ mimeType: string; extension: string }>({ mimeType: '', extension: 'webm' })

  // Cleanup function
  const cleanup = useCallback(() => {
    // Stop duration tracking
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    // Clear max duration timeout
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current)
      maxDurationTimeoutRef.current = null
    }

    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        // Ignore errors during cleanup
      }
    }
    mediaRecorderRef.current = null

    // Stop all tracks in stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close()
      } catch {
        // Ignore errors during cleanup
      }
    }
    audioContextRef.current = null

    // Clear chunks
    chunksRef.current = []

    // Reset state
    setAnalyserNode(null)
    setDuration(0)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  /**
   * Start recording audio
   */
  const startRecording = useCallback(async () => {
    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('browser_unsupported')
      return
    }

    // Cleanup any previous recording
    cleanup()
    setError(null)

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      // Detect supported MIME type
      mimeTypeRef.current = getSupportedMimeType()

      // Create MediaRecorder
      const options: MediaRecorderOptions = {}
      if (mimeTypeRef.current.mimeType) {
        options.mimeType = mimeTypeRef.current.mimeType
      }

      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      // Set up audio analyser for waveform visualization
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)
      setAnalyserNode(analyser)

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      // Start recording
      mediaRecorder.start(100) // Collect data every 100ms
      startTimeRef.current = Date.now()
      setIsRecording(true)

      // Track duration
      durationIntervalRef.current = setInterval(() => {
        setDuration(Date.now() - startTimeRef.current)
      }, 100)

      // Auto-stop at max duration
      maxDurationTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          stopRecording()
        }
      }, MAX_RECORDING_DURATION)

    } catch (err) {
      cleanup()

      // Handle specific errors
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError('permission_denied')
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError('no_microphone')
        } else {
          console.error('[VoiceRecorder] Error:', err)
          setError('unknown')
        }
      } else {
        setError('unknown')
      }
    }
  }, [cleanup])

  /**
   * Stop recording and return audio blob
   */
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current
      const recordingDuration = Date.now() - startTimeRef.current

      // Clear timers
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }
      if (maxDurationTimeoutRef.current) {
        clearTimeout(maxDurationTimeoutRef.current)
        maxDurationTimeoutRef.current = null
      }

      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        cleanup()
        setIsRecording(false)
        resolve(null)
        return
      }

      // Check minimum duration
      if (recordingDuration < MIN_RECORDING_DURATION) {
        cleanup()
        setIsRecording(false)
        setError('recording_too_short')
        resolve(null)
        return
      }

      // Handle recording stop
      mediaRecorder.onstop = () => {
        const mimeType = mimeTypeRef.current.mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: mimeType })

        // Cleanup
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop())
          streamRef.current = null
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close()
          audioContextRef.current = null
        }

        chunksRef.current = []
        mediaRecorderRef.current = null
        setAnalyserNode(null)
        setIsRecording(false)
        setDuration(0)

        resolve(blob)
      }

      // Stop recording
      try {
        mediaRecorder.stop()
      } catch {
        cleanup()
        setIsRecording(false)
        resolve(null)
      }
    })
  }, [cleanup])

  /**
   * Cancel recording without returning blob
   */
  const cancelRecording = useCallback(() => {
    cleanup()
    setIsRecording(false)
  }, [cleanup])

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    isRecording,
    isTranscribing,
    error,
    analyserNode,
    duration,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  }
}

/**
 * Get file extension for the recorded audio
 */
export function getAudioExtension(): string {
  return getSupportedMimeType().extension
}
