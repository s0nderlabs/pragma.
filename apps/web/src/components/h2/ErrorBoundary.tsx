/**
 * H2 Error Boundary
 *
 * Catches and displays errors gracefully in H2 components.
 * Prevents full app crashes and provides recovery options.
 */

'use client'

import React, { Component, ReactNode } from 'react'
import { LiquidGlassPanel } from '@/components/ui/liquid-glass'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class H2ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('H2 Error Boundary caught error:', error, errorInfo)
    this.setState({
      error,
      errorInfo,
    })
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="flex items-center justify-center min-h-[400px] p-4">
          <LiquidGlassPanel
            theme="pragma-dark"
            className="w-full max-w-md rounded-2xl p-6"
            blurAmount={6}
            displacementScale={0.3}
            stdDeviation={0.03}
          >
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <div className="p-3 rounded-full bg-red-500/20">
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>
              </div>

              <h2 className="text-xl font-semibold mb-2">
                Something went wrong
              </h2>

              <p className="text-sm opacity-70 mb-4">
                An error occurred while loading this component.
              </p>

              {this.state.error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-left">
                  <p className="text-xs font-mono text-red-400 break-all">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              <button
                onClick={this.handleReset}
                className="w-full py-3 px-4 rounded-xl bg-purple-500 hover:bg-purple-600 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>

              {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                <details className="mt-4 text-left">
                  <summary className="text-xs opacity-60 cursor-pointer hover:opacity-100">
                    Error Details (dev only)
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-black/30 text-xs overflow-auto max-h-40">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
          </LiquidGlassPanel>
        </div>
      )
    }

    return this.props.children
  }
}
