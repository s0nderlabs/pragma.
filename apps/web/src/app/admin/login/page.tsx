"use client";

/**
 * Admin Login Page
 *
 * Dual auth options with clean animations:
 * - Connect Wallet (signature verification)
 * - Password login
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminLoginPage() {
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect") || "/admin";

  const [activeTab, setActiveTab] = useState<"wallet" | "password">("password");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Password login handler
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "password", password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Login failed");
        return;
      }

      // Force full page reload to ensure cookie is properly registered
      // router.push() can cause stale cookie state with client-side navigation
      window.location.href = redirectPath;
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Wallet login handler
  const handleWalletLogin = async () => {
    setError(null);
    setIsLoading(true);

    try {
      // Get nonce from server
      const nonceResponse = await fetch("/api/admin/auth");

      // Check for errors (e.g., wallet auth not configured)
      if (!nonceResponse.ok) {
        const errorData = await nonceResponse.json();
        setError(errorData.error || "Failed to get authentication challenge");
        setIsLoading(false);
        return;
      }

      const { message } = await nonceResponse.json();

      // Check if Web3Auth/wallet is available
      if (typeof window === "undefined" || !window.ethereum) {
        setError("No wallet detected. Please install MetaMask or use password login.");
        return;
      }

      // Request accounts
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts[0];

      // Sign message
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });

      // Verify with server
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "wallet",
          address,
          signature,
          message,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Wallet verification failed");
        return;
      }

      // Force full page reload to ensure cookie is properly registered
      // router.push() can cause stale cookie state with client-side navigation
      window.location.href = redirectPath;
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("User rejected")) {
          setError("Signature request was rejected");
        } else {
          setError(err.message);
        }
      } else {
        setError("An error occurred. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#1A1A1A] tracking-tight font-cal">
            PRAGMA ADMIN
          </h1>
          <p className="text-[#6B7280] mt-2 font-raleway">
            Internal dashboard access
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-6 relative">
            <button
              onClick={() => setActiveTab("password")}
              className={`flex-1 py-3 text-sm font-medium transition-colors duration-150 font-raleway ${
                activeTab === "password"
                  ? "text-[#E07A5F]"
                  : "text-[#6B7280] hover:text-[#1A1A1A]"
              }`}
            >
              Password
            </button>
            <button
              onClick={() => setActiveTab("wallet")}
              className={`flex-1 py-3 text-sm font-medium transition-colors duration-150 font-raleway ${
                activeTab === "wallet"
                  ? "text-[#E07A5F]"
                  : "text-[#6B7280] hover:text-[#1A1A1A]"
              }`}
            >
              Connect Wallet
            </button>
            <motion.div
              layoutId="activeTabIndicator"
              className="absolute bottom-0 h-0.5 bg-[#E07A5F]"
              style={{
                left: activeTab === "password" ? "0%" : "50%",
                width: "50%",
              }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            />
          </div>

          {/* Error Message */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mb-4 p-3 bg-red-50 border border-red-100 rounded-md overflow-hidden"
              >
                <p className="text-sm text-red-600 font-raleway">
                  {error}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {activeTab === "password" ? (
              <motion.form
                key="password"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onSubmit={handlePasswordLogin}
              >
                <div className="mb-4">
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-[#1A1A1A] mb-2 font-raleway"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#E07A5F] focus:border-transparent transition-all duration-150 font-mono"
                    placeholder="Enter admin password"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 bg-[#E07A5F] text-white rounded-md font-medium hover:bg-[#d06a4f] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed font-raleway"
                >
                  {isLoading ? "Signing in..." : "Sign In"}
                </button>
              </motion.form>
            ) : (
              <motion.div
                key="wallet"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <p className="text-sm text-[#6B7280] mb-4 font-raleway">
                  Connect your wallet and sign a message to verify your identity.
                </p>
                <button
                  onClick={handleWalletLogin}
                  disabled={isLoading}
                  className="w-full py-3 bg-[#E07A5F] text-white rounded-md font-medium hover:bg-[#d06a4f] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-raleway"
                >
                  {isLoading ? (
                    "Connecting..."
                  ) : (
                    <>
                      <WalletIcon />
                      Connect Wallet
                    </>
                  )}
                </button>
                <p className="text-xs text-[#6B7280] mt-4 text-center font-raleway">
                  Only authorized addresses can access the dashboard.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#6B7280] mt-6 font-raleway">
          s0nderlabs
        </p>
      </motion.div>
    </div>
  );
}

// Simple wallet icon
function WalletIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}

// Type declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}
