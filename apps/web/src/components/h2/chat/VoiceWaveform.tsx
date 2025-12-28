'use client'

/**
 * VoiceWaveform Component
 *
 * Renders a wave-style audio visualization during voice recording.
 * Uses Web Audio API's AnalyserNode for real-time frequency data.
 *
 * Design:
 * - Smooth sine-wave that responds to audio amplitude
 * - Siri-style aesthetic with fluid animation
 * - Terracotta color for brand consistency
 */

import { useEffect, useRef, memo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface VoiceWaveformProps {
  analyserNode: AnalyserNode | null
  isRecording: boolean
  className?: string
}

// Wave configuration
const NUM_BARS = 64
const BAR_WIDTH = 2
const BAR_GAP = 3
const MIN_HEIGHT = 2
const MAX_HEIGHT = 8

function VoiceWaveformComponent({
  analyserNode,
  isRecording,
  className,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !analyserNode || !isRecording) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set up data array for frequency data
    const bufferLength = analyserNode.frequencyBinCount
    dataArrayRef.current = new Uint8Array(bufferLength)

    // Calculate canvas dimensions
    const width = NUM_BARS * (BAR_WIDTH + BAR_GAP) - BAR_GAP
    const height = MAX_HEIGHT * 2
    canvas.width = width
    canvas.height = height

    // Always use terracotta for waveform
    const barColor = '#D4622A' // terracotta

    const draw = () => {
      if (!dataArrayRef.current || !ctx || !analyserNode) return

      // Get frequency data
      analyserNode.getByteFrequencyData(dataArrayRef.current)

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      // Calculate average amplitude for each bar
      const step = Math.floor(bufferLength / NUM_BARS)

      for (let i = 0; i < NUM_BARS; i++) {
        // Get average value for this bar's frequency range
        let sum = 0
        const startIdx = i * step
        for (let j = 0; j < step; j++) {
          sum += dataArrayRef.current[startIdx + j] || 0
        }
        const avg = sum / step

        // Map to bar height (with minimum height for visual interest)
        const normalizedHeight = avg / 255
        const barHeight = Math.max(MIN_HEIGHT, normalizedHeight * MAX_HEIGHT)

        // Calculate x position (centered)
        const x = i * (BAR_WIDTH + BAR_GAP)

        // Draw bar from center (mirrored effect)
        const centerY = height / 2

        // Set color with opacity based on height
        const opacity = 0.5 + normalizedHeight * 0.5
        ctx.fillStyle = barColor
        ctx.globalAlpha = opacity

        // Draw rounded rectangle from center up
        ctx.beginPath()
        ctx.roundRect(x, centerY - barHeight, BAR_WIDTH, barHeight, BAR_WIDTH / 2)
        ctx.fill()

        // Draw rounded rectangle from center down (mirror)
        ctx.beginPath()
        ctx.roundRect(x, centerY, BAR_WIDTH, barHeight, BAR_WIDTH / 2)
        ctx.fill()
      }

      ctx.globalAlpha = 1

      // Continue animation
      animationRef.current = requestAnimationFrame(draw)
    }

    // Start animation
    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [analyserNode, isRecording])

  // Idle state when not recording
  if (!isRecording || !analyserNode) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex items-center justify-center',
        className
      )}
    >
      <canvas
        ref={canvasRef}
        className="block"
        style={{
          width: NUM_BARS * (BAR_WIDTH + BAR_GAP) - BAR_GAP,
          height: MAX_HEIGHT * 2,
        }}
      />
    </motion.div>
  )
}

export const VoiceWaveform = memo(VoiceWaveformComponent)
