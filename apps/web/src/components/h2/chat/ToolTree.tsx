'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useMeasure from 'react-use-measure'
import { cn } from '@/lib/utils'
import type { ToolStep } from '@/lib/h2/types'

// ============================================================================
// Icons
// ============================================================================

const MinusSquare: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} viewBox="64 -65 897 897" fill="currentColor">
    <path d="M888 760v0v0v-753v0h-752v0v753v0h752zM888 832h-752q-30 0 -51 -21t-21 -51v-753q0 -29 21 -50.5t51 -21.5h753q29 0 50.5 21.5t21.5 50.5v753q0 30 -21.5 51t-51.5 21v0zM732 347h-442q-14 0 -25 10.5t-11 25.5v0q0 15 11 25.5t25 10.5h442q14 0 25 -10.5t11 -25.5v0q0 -15 -11 -25.5t-25 -10.5z" />
  </svg>
)

const PlusSquare: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} viewBox="64 -65 897 897" fill="currentColor">
    <path d="M888 760v0v0v-753v0h-752v0v753v0h752zM888 832h-752q-30 0 -51 -21t-21 -51v-753q0 -29 21 -50.5t51 -21.5h753q29 0 50.5 21.5t21.5 50.5v753q0 30 -21.5 51t-51.5 21v0zM732 420h-184v183q0 15 -10.5 25.5t-25.5 10.5v0q-14 0 -25 -10.5t-11 -25.5v-183h-184q-15 0 -25.5 -11t-10.5 -25v0q0 -15 10.5 -25.5t25.5 -10.5h184v-183q0 -15 11 -25.5t25 -10.5v0q15 0 25.5 10.5t10.5 25.5v183h184q15 0 25.5 10.5t10.5 25.5v0q0 14 -10.5 25t-25.5 11z" />
  </svg>
)

const CloseSquare: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg {...props} viewBox="64 -65 897 897" fill="currentColor">
    <path d="M717.5 589.5q-10.5 10.5 -25.5 10.5t-26 -10l-154 -155l-154 155q-11 10 -26 10t-25.5 -10.5t-10.5 -25.5t11 -25l154 -155l-154 -155q-11 -10 -11 -25t10.5 -25.5t25.5 -10.5t26 10l154 155l154 -155q11 -10 26 -10t25.5 10.5t10.5 25t-11 25.5l-154 155l154 155q11 10 11 25t-10.5 25.5zM888 760v0v0v-753v0h-752v0v753v0h752zM888 832h-752q-30 0 -51 -21t-21 -51v-753q0 -29 21 -50.5t51 -21.5h753q29 0 50.5 21.5t21.5 50.5v753q0 30 -21.5 51t-51.5 21v0z" />
  </svg>
)

// ============================================================================
// TreeNode Component
// ============================================================================

interface TreeNodeProps {
  name: string | React.ReactNode
  status?: 'pending' | 'running' | 'completed' | 'error'
  children?: React.ReactNode
  defaultOpen?: boolean
  style?: React.CSSProperties
}

function TreeNode({
  name,
  status = 'pending',
  children,
  defaultOpen = false,
  style
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

  // Determine icon based on state
  const Icon = hasChildren
    ? (isOpen ? MinusSquare : PlusSquare)
    : CloseSquare

  // Status-based colors - use inherited foreground for consistency with AIMessage
  const getStatusColor = () => {
    switch (status) {
      case 'error':
        return 'text-red-500'
      case 'completed':
        return 'text-foreground opacity-70'
      case 'running':
        return 'text-foreground'
      default:
        return 'text-muted-foreground'
    }
  }

  return (
    <div className="relative py-1">
      {/* Toggle icon and title */}
      <div className="flex items-center">
        <Icon
          className={cn(
            "w-4 h-4 mr-2.5 cursor-pointer flex-shrink-0",
            hasChildren ? "opacity-100" : "opacity-30",
            "hover:opacity-80 transition-opacity"
          )}
          onClick={() => hasChildren && setOpen(!isOpen)}
        />
        <span
          className={cn(
            "font-mono text-sm",
            getStatusColor()
          )}
          style={style}
        >
          {name}
        </span>

        {/* Running indicator */}
        {status === 'running' && (
          <motion.span
            className="ml-2 w-1.5 h-1.5 rounded-full bg-accent"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
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
              className="ml-1.5 pl-3.5"
            >
              <motion.div
                initial={{ y: 20 }}
                animate={{ y: isOpen ? 0 : 20 }}
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
      >
        {steps.map(renderStep)}
      </TreeNode>
    </div>
  )
}

export { TreeNode }
