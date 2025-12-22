"use client";

/**
 * Admin Users Page
 *
 * Bento-box layout for user list with search, filter, and pagination.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Users, AlertTriangle, TrendingUp, Download, Search } from "lucide-react";
import {
  AdminShell,
  DataTable,
  Pagination,
  BentoGrid,
  BentoCard,
} from "@/components/admin";

interface User {
  address: string;
  eoa_address: string | null;
  tx_count: number;
  total_volume_usd: number;
  total_fees_usd: number;
  first_tx_at: string | null;
  last_tx_at: string | null;
  active_days: number;
  is_flagged: boolean;
  flag_status: string | null;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  limit: number;
  _mock?: boolean;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [data, setData] = useState<UsersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [activeOnly, setActiveOnly] = useState(true); // Toggle: show only users with transactions

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
        filter,
        activeOnly: activeOnly.toString(),
        ...(search && { search }),
      });
      const response = await fetch(`/api/admin/users?${params}`);
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setIsLoading(false);
    }
  }, [page, filter, search, activeOnly]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Only reset page - the useEffect will handle fetching when state changes
    setPage(1);
    // Note: Don't call fetchUsers() directly here to avoid duplicate requests
    // The useEffect dependency on fetchUsers (which depends on page) will trigger the fetch
  };

  const formatAddress = (address: string) => {
    return address; // Show full address
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-GB");
  };

  // Calculate stats from current page data
  const flaggedCount = data?.users?.filter((u) => u.is_flagged).length ?? 0;
  const highVolumeCount =
    data?.users?.filter((u) => u.total_volume_usd >= 1000).length ?? 0;

  const columns = [
    {
      key: "address",
      label: "Address",
      render: (value: unknown) => (
        <span className="font-mono text-xs">{formatAddress(String(value))}</span>
      ),
    },
    {
      key: "tx_count",
      label: "TXs",
      sortable: true,
      align: "right" as const,
    },
    {
      key: "total_volume_usd",
      label: "Volume",
      sortable: true,
      align: "right" as const,
      render: (value: unknown) => formatCurrency(Number(value) || 0),
    },
    {
      key: "total_fees_usd",
      label: "Fees",
      sortable: true,
      align: "right" as const,
      render: (value: unknown) => formatCurrency(Number(value) || 0),
    },
    {
      key: "first_tx_at",
      label: "First",
      render: (value: unknown) => formatDate(value as string | null),
    },
    {
      key: "last_tx_at",
      label: "Last",
      render: (value: unknown) => formatDate(value as string | null),
    },
    {
      key: "active_days",
      label: "Days",
      sortable: true,
      align: "center" as const,
    },
    {
      key: "is_flagged",
      label: "Flag",
      align: "center" as const,
      render: (value: unknown, row: User) =>
        value ? (
          <span
            className={`text-xs px-2 py-1 rounded font-medium ${
              row.flag_status === "excluded"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {row.flag_status === "excluded" ? "Excluded" : "Review"}
          </span>
        ) : null,
    },
  ];

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <AdminShell title="Users" description="View and manage all Pragma users" onSyncComplete={fetchUsers}>
      {/* Search Bar - Outside BentoGrid for cleaner look */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by address..."
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-[#2a2a2a] rounded-3xl focus:outline-none font-mono text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-white"
          />
        </form>
        {/* Active Only Toggle */}
        <div className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-[#2a2a2a] rounded-3xl">
          <span className={`text-sm font-raleway transition-colors ${!activeOnly ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}>
            All
          </span>
          <button
            onClick={() => {
              setActiveOnly(!activeOnly);
              setPage(1);
            }}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
              activeOnly
                ? "bg-[#E07A5F]"
                : "bg-gray-200 dark:bg-[#3a3a3a]"
            }`}
            role="switch"
            aria-checked={activeOnly}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out ${
                activeOnly ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <span className={`text-sm font-raleway transition-colors ${activeOnly ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}`}>
            Active
          </span>
        </div>
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
          className="px-4 py-3 bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-[#2a2a2a] rounded-3xl focus:outline-none font-raleway text-sm text-gray-700 dark:text-gray-300 cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10"
        >
          <option value="all">Filter</option>
          <option value="flagged">Flagged</option>
          <option value="high_volume">High Volume ($1k+)</option>
          <option value="new">New This Week</option>
        </select>
        <button className="flex items-center justify-center gap-2 px-5 py-3 bg-[#E07A5F] text-white rounded-3xl hover:bg-[#d06a4f] transition-colors font-raleway text-sm font-medium">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      <BentoGrid>

        {/* Row 2: Quick stats */}
        <BentoCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400 font-raleway">
                {activeOnly ? "Active Users" : "All Users"}
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-gray-900 dark:text-white font-cal">
                {data?.total ?? 0}
              </p>
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400 font-raleway">
                {activeOnly ? "With transactions" : "Including onboarded"}
              </p>
            </div>
            <Users className="w-5 h-5 text-[#3D405B] dark:text-gray-400" />
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400 font-raleway">
                Flagged
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-amber-600 dark:text-amber-400 font-cal">
                {flaggedCount}
              </p>
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400 font-raleway">Need review</p>
            </div>
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
        </BentoCard>

        <BentoCard>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400 font-raleway">
                High Volume
              </p>
              <p className="text-2xl font-semibold mt-1 tabular-nums text-green-600 dark:text-green-400 font-cal">
                {highVolumeCount}
              </p>
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400 font-raleway">$1,000+ volume</p>
            </div>
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
        </BentoCard>

        {/* Row 3: Users Table (span-3) */}
        <BentoCard span={3}>
          <DataTable
            data={data?.users || []}
            columns={columns}
            keyExtractor={(user) => user.address}
            onRowClick={(user) => router.push(`/admin/users/${user.address}`)}
            isLoading={isLoading}
            bare
            maxHeight="calc(100vh - 420px)"
            emptyMessage={
              data?._mock
                ? "Supabase not configured. Add env vars to see users."
                : "No users found"
            }
          />

          {/* Pagination */}
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </BentoCard>
      </BentoGrid>
    </AdminShell>
  );
}
