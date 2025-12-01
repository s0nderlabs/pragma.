'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useMeasure from 'react-use-measure'
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToolStep } from '@/lib/h2/types'

// ============================================================================
// TreeNode Component
// ============================================================================

interface TreeNodeProps {
  name: string | React.ReactNode
  status?: 'pending' | 'running' | 'completed' | 'error'
  children?: React.ReactNode
  defaultOpen?: boolean
  style?: React.CSSProperties
  isRoot?: boolean
}

function TreeNode({
  name,
  status = 'pending',
  children,
  defaultOpen = false,
  style,
  isRoot = false,
}: TreeNodeProps) {
  const [isOpen, setOpen] = useState(defaultOpen)
  const [ref, { height: viewHeight }] = useMeasure()
  const hasChildren = React.Children.count(children) > 0
  const previousOpen = useRef(isOpen)

  // Auto-open when status changes to running
  useEffect(() => {
    if (status === 'running' && !isOpen) {
      setOpen(true)
    }
  }, [status, isOpen])

  // Track previous open state for animation
  useEffect(() => {
    previousOpen.current = isOpen
  }, [isOpen])

  // Status-based colors - dimmer for children
  const getStatusColor = () => {
    const dimFactor = isRoot ? '' : '/60'
    switch (status) {
      case 'error':
        return 'text-red-500'
      case 'completed':
        return isRoot ? 'text-foreground/80' : 'text-foreground/50'
      case 'running':
        return isRoot ? 'text-foreground' : `text-foreground${dimFactor}`
      default:
        return 'text-muted-foreground'
    }
  }

  // Determine chevron icon based on state
  const ChevronIcon = hasChildren
    ? (isOpen ? ChevronDown : ChevronRight)
    : ChevronRight

  return (
    <div>
      {/* Toggle icon and title */}
      <div className={cn(
        "flex items-center py-0.5",
        !isRoot && "pl-4" // Indent for hierarchy
      )}>
        <ChevronIcon
          className={cn(
            "w-4 h-4 mr-1.5 flex-shrink-0 transition-all",
            hasChildren ? "cursor-pointer opacity-100 hover:opacity-70" : "opacity-20",
            isRoot && "w-[18px] h-[18px]" // Slightly larger for root
          )}
          onClick={() => hasChildren && setOpen(!isOpen)}
        />
        <span
          className={cn(
            "font-mono text-sm max-lg:break-all",
            getStatusColor(),
            isRoot && "font-semibold" // Bold for root
          )}
          style={style}
        >
          {name}
        </span>

        {/* Running indicator - spinning loader */}
        {status === 'running' && (
          <Loader2 className={cn(
            "ml-2 animate-spin text-accent",
            isRoot ? "w-4 h-4" : "w-3 h-3"
          )} />
        )}
      </div>

      {/* Collapsible children */}
      <AnimatePresence initial={false}>
        {hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: isOpen ? viewHeight : 0,
              opacity: isOpen ? 1 : 0,
            }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
            className="overflow-hidden"
          >
            <div
              ref={ref}
              className="relative ml-2"
            >
              <motion.div
                initial={{ y: 10 }}
                animate={{ y: isOpen ? 0 : 10 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                }}
              >
                {children}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================================================
// ToolTree Component (Main Export)
// ============================================================================

interface ToolTreeProps {
  toolName: string
  status: 'running' | 'completed' | 'error'
  steps: ToolStep[]
  defaultOpen?: boolean
}

export function ToolTree({
  toolName,
  status,
  steps,
  defaultOpen = true
}: ToolTreeProps) {
  // Recursive step renderer
  const renderStep = (step: ToolStep) => (
    <TreeNode
      key={step.id}
      name={step.name}
      status={step.status}
      defaultOpen={step.status === 'running' || step.children?.some(c => c.status === 'running')}
      isRoot={false}
    >
      {step.children?.map(renderStep)}
    </TreeNode>
  )

  return (
    <div className="font-mono text-sm select-none">
      <TreeNode
        name={toolName}
        status={status === 'completed' ? 'completed' : status === 'error' ? 'error' : 'running'}
        defaultOpen={defaultOpen}
        isRoot={true}
      >
        {steps.map(renderStep)}
      </TreeNode>
    </div>
  )
}

export { TreeNode }
