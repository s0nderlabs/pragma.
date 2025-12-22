"use client";

/**
 * User Detail Page
 *
 * Shows detailed user info, stats, and transaction history.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AdminShell, StatCard, DataTable } from "@/components/admin";

interface User {
  address: string;
  eoa_address: string | null;
  created_at: string | null;
  first_tx_at: string | null;
  last_tx_at: string | null;
  tx_count: number;
  total_volume_usd: number;
  total_fees_usd: number;
  active_days: number;
  is_flagged: boolean;
  flag_reason: string | null;
  flag_status: string | null;
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const address = params.address as string;

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await fetch(`/api/admin/users?address=${address}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("User not found");
          } else {
            throw new Error("Failed to fetch user");
          }
          return;
        }
        const data = await response.json();
        setUser(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }

    fetchUser();
  }, [address]);

  const handleFlagAction = async (action: "legitimate" | "excluded") => {
    setIsUpdating(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, flagStatus: action }),
      });

      if (!response.ok) {
        throw new Error("Failed to update");
      }

      // Refresh user data
      const userResponse = await fetch(`/api/admin/users?address=${address}`);
      const data = await userResponse.json();
      setUser(data);
    } catch (err) {
      alert("Failed to update user status");
    } finally {
      setIsUpdating(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  if (isLoading) {
    return (
      <AdminShell title="User Details" description="Loading...">
        <div className="flex items-center justify-center h-64">
          <p className="text-[#6B7280]">Loading...</p>
        </div>
      </AdminShell>
    );
  }

  if (error || !user) {
    return (
      <AdminShell title="User Details" description="Error">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error || "User not found"}</p>
          <Link
            href="/admin/users"
            className="text-[#E07A5F] hover:underline mt-2 inline-block"
          >
            ← Back to Users
          </Link>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="User Details"
      description={`Viewing ${address}`}
    >
      {/* Back Link */}
      <Link
        href="/admin/users"
        className="text-[#6B7280] hover:text-[#1A1A1A] mb-4 inline-block font-raleway"
      >
        ← Back to Users
      </Link>

      {/* Address Header */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[#6B7280] mb-1 font-raleway">
              Smart Account
            </p>
            <div className="flex items-center gap-2">
              <code
                className="text-lg font-mono text-[#1A1A1A]"
              >
                {user.address}
              </code>
              <button
                onClick={() => copyToClipboard(user.address)}
                className="text-[#6B7280] hover:text-[#1A1A1A]"
              >
                <CopyIcon />
              </button>
            </div>
            {user.eoa_address && (
              <p className="text-sm text-[#6B7280] mt-2 font-raleway">
                Owner: <code className="font-mono">{user.eoa_address}</code>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Flag Banner */}
      {user.is_flagged && (
        <div
          className={`rounded-lg p-4 mb-6 ${
            user.flag_status === "excluded"
              ? "bg-red-50 border border-red-200"
              : "bg-amber-50 border border-amber-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className={`font-medium font-raleway ${
                  user.flag_status === "excluded"
                    ? "text-red-800"
                    : "text-amber-800"
                }`}
              >
                {user.flag_status === "excluded"
                  ? "Excluded from Rewards"
                  : "Flagged for Review"}
              </p>
              {user.flag_reason && (
                <p className="text-sm text-[#6B7280] mt-1 font-raleway">
                  Reason: {user.flag_reason}
                </p>
              )}
            </div>
            {user.flag_status !== "excluded" && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleFlagAction("legitimate")}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 font-raleway"
                >
                  Mark Legitimate
                </button>
                <button
                  onClick={() => handleFlagAction("excluded")}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 font-raleway"
                >
                  Exclude
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Volume"
          value={formatCurrency(user.total_volume_usd)}
        />
        <StatCard
          label="Fees Paid"
          value={formatCurrency(user.total_fees_usd)}
        />
        <StatCard label="Transactions" value={user.tx_count} />
        <StatCard label="Active Days" value={user.active_days} />
      </div>

      {/* Activity Timeline Placeholder */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 mb-8 h-48 flex items-center justify-center">
        <p className="text-[#6B7280] text-sm font-raleway">
          Activity Timeline (Coming Soon)
        </p>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-4 font-cal">
          Transaction History
        </h2>
        <DataTable
          data={[]}
          columns={[
            { key: "timestamp", label: "Time" },
            { key: "tx_hash", label: "TX Hash" },
            { key: "type", label: "Type" },
            { key: "token", label: "Token" },
            { key: "amount", label: "Amount", align: "right" },
            { key: "fee", label: "Fee", align: "right" },
          ]}
          keyExtractor={(row: Record<string, unknown>) => String(row.id)}
          emptyMessage="No transactions found. Connect Supabase to see data."
        />
      </div>
    </AdminShell>
  );
}

function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
