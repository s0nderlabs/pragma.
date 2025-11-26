/**
 * QuickstartModal Component
 *
 * A 5-step carousel modal for onboarding new users.
 * - Step 1: Welcome with Pragma branding
 * - Step 2: Sidebar navigation tutorial
 * - Step 3: Chat with AI tutorial
 * - Step 4: Quick mode explanation
 * - Step 5: Terms agreement with checkbox
 *
 * Features:
 * - Animated progress bar at top
 * - Simple fade transitions (no race conditions)
 * - Floating navigation controls
 * - Non-dismissible until agreement
 */

'use client'

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuickstartStore, useAutoOpenQuickstart } from './useQuickstartStore'
import { WelcomeStep } from './steps/WelcomeStep'
import { SidebarTutorial } from './steps/SidebarTutorial'
import { ChatTutorial } from './steps/ChatTutorial'
import { QuickModeTutorial } from './steps/QuickModeTutorial'
import { AgreementStep } from './steps/AgreementStep'

const STEPS = [
  { component: WelcomeStep, title: 'Welcome' },
  { component: SidebarTutorial, title: 'Sidebar' },
  { component: ChatTutorial, title: 'Chat' },
  { component: QuickModeTutorial, title: 'Quick Mode' },
  { component: AgreementStep, title: 'Agreement' },
]

export function QuickstartModal() {
  const {
    isOpen,
    currentStep,
    hasAgreed,
    nextStep,
    prevStep,
    complete,
  } = useQuickstartStore()

  const { checkAndOpen } = useAutoOpenQuickstart()

  // Auto-open on mount if not completed
  useEffect(() => {
    const timer = setTimeout(() => {
      checkAndOpen()
    }, 100)
    return () => clearTimeout(timer)
  }, [checkAndOpen])

  const isLastStep = currentStep === STEPS.length - 1
  const isFirstStep = currentStep === 0
  const canProceed = !isLastStep || hasAgreed
  const progress = ((currentStep + 1) / STEPS.length) * 100

  const handleNext = () => {
    if (isLastStep && hasAgreed) {
      complete()
    } else if (!isLastStep) {
      nextStep()
    }
  }

  const handlePrev = () => {
    if (!isFirstStep) {
      prevStep()
    }
  }

  const CurrentStepComponent = STEPS[currentStep].component

  return (
    <Dialog
      open={isOpen}
      onOpenChange={() => {
        // Prevent closing - modal is non-dismissible until agreement
      }}
    >
      <DialogContent
        className="w-screen h-screen sm:w-[600px] sm:h-[600px] lg:w-[800px] lg:h-[700px] bg-black/95 border-0 sm:border sm:border-white/10 rounded-none sm:rounded-[32px] p-0 overflow-hidden backdrop-blur-xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Visually hidden title for accessibility */}
        <DialogTitle className="sr-only">
          Pragma Quickstart Guide - {STEPS[currentStep].title}
        </DialogTitle>

        <div className="h-full flex flex-col">
          {/* Header with Progress Bar and Back Button */}
          <div className="relative flex-shrink-0">
            {/* Animated Progress Bar */}
            <div className="h-1 bg-white/5 rounded-t-[32px] overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#E07A5F] to-[#FF7A42]"
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              />
            </div>

            {/* Back Button Row */}
            <div className="h-14 flex items-center px-4 sm:px-6">
              <AnimatePresence>
                {!isFirstStep && (
                  <motion.button
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.2 }}
                    onClick={handlePrev}
                    className="p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5 text-white/60" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Step Content - Takes remaining space */}
          <div className="flex-1 overflow-y-auto sm:overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="h-full flex flex-col"
              >
                <CurrentStepComponent />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer with Step Indicator and Continue Button */}
          <div className="flex-shrink-0 px-4 sm:px-6 pb-4 sm:pb-6 pt-4 flex items-center justify-between">
            {/* Step indicator - dots on left */}
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, index) => (
                <motion.div
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentStep
                      ? 'bg-white/80 w-4'
                      : index < currentStep
                        ? 'bg-white/40 w-1.5'
                        : 'bg-white/20 w-1.5'
                  }`}
                  layoutId={`dot-${index}`}
                />
              ))}
            </div>

            {/* Continue Button on right */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleNext}
              disabled={!canProceed}
              className={`
                flex items-center gap-2 px-6 py-3 rounded-full font-medium
                shadow-lg shadow-black/20 transition-all duration-200
                ${isLastStep
                  ? hasAgreed
                    ? 'bg-gradient-to-r from-[#E07A5F] to-[#c66a52] text-white'
                    : 'bg-white/10 text-white/40 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-white/90'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {isLastStep ? 'Get Started' : 'Continue'}
              {!isLastStep && <ChevronRight className="w-4 h-4" />}
            </motion.button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
