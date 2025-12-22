"use client";

/**
 * Admin Shell Component
 *
 * Wraps admin pages with sidebar, header, and clean page transitions.
 * Includes sync status indicator and manual sync button.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Check, AlertCircle, Sun, Moon } from "lucide-react";
import { useThemeStore } from "@/stores/useThemeStore";
import { AdminSidebar } from "./AdminSidebar";

interface AdminShellProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  onSyncComplete?: () => void;
}

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return "Never";

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function AdminShell({ children, title, description, onSyncComplete }: AdminShellProps) {
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; indexed: number } | null>(null);
  const { theme, toggleTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);
  const isDark = mounted && theme === "pragma-dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch last sync time
  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/index-payments");
      if (res.ok) {
        const data = await res.json();
        setLastSync(data.lastSync);
      }
    } catch (error) {
      console.error("Failed to fetch sync status:", error);
    }
  }, []);

  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  // Poll for sync updates every 5 minutes (matches cron interval)
  const lastSyncRef = useRef<string | null>(null);

  useEffect(() => {
    lastSyncRef.current = lastSync;
  }, [lastSync]);

  useEffect(() => {
    const POLL_INTERVAL = 60 * 1000; // 1 minute

    const pollForUpdates = async () => {
      try {
        const res = await fetch("/api/admin/index-payments");
        if (res.ok) {
          const data = await res.json();
          // If lastSync changed, new data was indexed by cron
          if (data.lastSync && data.lastSync !== lastSyncRef.current) {
            setLastSync(data.lastSync);
            onSyncComplete?.();
          }
        }
      } catch (error) {
        console.error("Poll failed:", error);
      }
    };

    const interval = setInterval(pollForUpdates, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [onSyncComplete]);

  // Trigger manual sync
  const handleSync = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    setSyncResult(null);

    try {
      const res = await fetch("/api/admin/index-payments", { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        setSyncResult({ success: true, indexed: data.indexed });
        setLastSync(data.syncedAt);
        onSyncComplete?.();
      } else {
        setSyncResult({ success: false, indexed: 0 });
      }
    } catch (error) {
      console.error("Sync failed:", error);
      setSyncResult({ success: false, indexed: 0 });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncResult(null), 3000);
    }
  };

  return (
    <div className={`flex h-screen ${isDark ? "dark bg-[#121212]" : "bg-[#FAFAFA]"}`}>
      <AdminSidebar />

      <main className="flex-1 flex flex-col overflow-auto p-8">
        {/* Header with sync status */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 mb-6"
        >
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-[#1A1A1A] dark:text-gray-100 font-cal">
                {title}
              </h1>
              {description && (
                <p className="text-sm text-[#6B7280] dark:text-gray-400 mt-1 font-raleway">
                  {description}
                </p>
              )}
            </div>

            {/* Sync Status */}
            <div className="flex items-center gap-3">
              {/* Last sync time */}
              <span className="text-xs text-[#6B7280] dark:text-gray-400 font-raleway">
                Last sync: {formatRelativeTime(lastSync)}
              </span>

              {/* Sync result indicator */}
              {syncResult && (
                <span
                  className={`text-xs font-medium font-raleway ${
                    syncResult.success ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {syncResult.success ? (
                    <span className="flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      {syncResult.indexed > 0 ? `+${syncResult.indexed}` : "Up to date"}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Failed
                    </span>
                  )}
                </span>
              )}

              {/* Sync button */}
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium font-raleway
                  transition-all duration-200
                  ${isSyncing
                    ? "bg-gray-100 dark:bg-[#2a2a2a] text-gray-400 cursor-not-allowed"
                    : "bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2a2a] hover:border-gray-300 dark:hover:border-[#3a3a3a]"
                  }
                `}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing..." : "Sync"}
              </button>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-all duration-200"
                title={mounted ? (isDark ? "Switch to light mode" : "Switch to dark mode") : "Loading..."}
              >
                {mounted ? (
                  isDark ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )
                ) : (
                  <div className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Content fills remaining space */}
        <motion.div
          key={title}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="flex-1"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
