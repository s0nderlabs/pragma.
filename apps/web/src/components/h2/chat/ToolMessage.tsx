'use client'

import { ToolTree, TreeNode } from './ToolTree'
import type { ToolMessage as ToolMessageType } from '@/lib/h2/types'

interface ToolMessageProps {
  message: ToolMessageType
}

/**
 * ToolMessage Component
 *
 * Renders a tool execution as a collapsible tree.
 * Shows nested steps if they exist, otherwise renders as leaf node.
 *
 * For batch operations (parallel execution), renders as:
 * - Parent container with count (e.g., "getSwapQuote (3)")
 *   - Child 1 with its steps
 *   - Child 2 with its steps
 *   - Child 3 with its steps
 */
export function ToolMessage({ message }: ToolMessageProps) {
  const { toolName, description, status, steps, isParent, children } = message

  // Handle batch operations (parent with children)
  if (isParent && children && children.length > 0) {
    return (
      <div className="mb-4 py-2 font-mono text-sm select-none">
        <TreeNode
          name={description || `${toolName} (${children.length})`}
          status={status === 'completed' ? 'completed' : status === 'error' ? 'error' : 'running'}
          defaultOpen={true}
        >
          {children.map((child) => (
            <TreeNode
              key={child.id}
              name={child.description || child.toolName}
              status={child.status === 'completed' ? 'completed' : child.status === 'error' ? 'error' : 'running'}
              defaultOpen={child.status === 'running' || child.steps.length > 0}
            >
              {/* Render steps for each child */}
              {child.steps.map((step) => (
                <TreeNode
                  key={step.id}
                  name={step.name}
                  status={step.status}
                  defaultOpen={false}
                />
              ))}
            </TreeNode>
          ))}
        </TreeNode>
      </div>
    )
  }

  // Standard single tool rendering
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
