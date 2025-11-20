/**
 * KeyboardHints - Displays keyboard shortcut hints
 *
 * Shows essential shortcuts in the sidebar footer for discoverability
 */

export function KeyboardHints() {
  return (
    <div className="px-6 py-3 border-t border-white/10">
      <div className="flex items-center justify-between text-xs text-white/40">
        <div className="flex items-center gap-3">
          <kbd className="font-mono bg-white/5 px-1.5 py-0.5 rounded">Alt + \</kbd>
          <span>Hide</span>
        </div>
        <div className="flex items-center gap-3">
          <kbd className="font-mono bg-white/5 px-1.5 py-0.5 rounded">Alt + ,</kbd>
          <span>Settings</span>
        </div>
        <div className="flex items-center gap-3">
          <kbd className="font-mono bg-white/5 px-1.5 py-0.5 rounded">Alt + M</kbd>
          <span>Quick Mode</span>
        </div>
      </div>
    </div>
  )
}
