'use client'

import { ToolTree } from './ToolTree'
import type { ToolMessage as ToolMessageType } from '@/lib/h2/types'

interface ToolMessageProps {
  message: ToolMessageType
}

/**
 * ToolMessage Component
 *
 * Renders a tool execution as a collapsible tree.
 * Shows nested steps if they exist, otherwise renders as leaf node.
 */
export function ToolMessage({ message }: ToolMessageProps) {
  const { toolName, description, status, steps } = message

  return (
    <div className="mb-4 py-2">
      <ToolTree
        toolName={description || toolName}
        status={status}
        steps={steps}
      />
    </div>
  )
}
