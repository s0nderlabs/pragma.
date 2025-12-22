"use client";

/**
 * Admin Dashboard Sidebar
 *
 * Dark sidebar with navigation links and clean animations.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    label: "Overview",
    href: "/admin",
    icon: <OverviewIcon />,
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: <UsersIcon />,
  },
  {
    label: "Leaderboard",
    href: "/admin/leaderboard",
    icon: <LeaderboardIcon />,
  },
  {
    label: "Revenue",
    href: "/admin/revenue",
    icon: <RevenueIcon />,
  },
  {
    label: "Campaign",
    href: "/admin/campaign",
    icon: <CampaignIcon />,
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    // Force full page reload to ensure cookie is properly cleared
    // router.push() can cause stale cookie state with client-side navigation
    window.location.href = "/admin/login";
  };

  return (
    <motion.aside
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="w-56 min-h-screen bg-[#1a1a1a] dark:bg-[#0d0d0d] flex flex-col"
    >
      {/* Navigation */}
      <nav className="flex-1 p-4 pt-6">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-150 font-raleway ${
                    isActive
                      ? "text-[#E07A5F]"
                      : "text-gray-400 hover:text-white hover:bg-[#1a1a1a] dark:hover:bg-[#1a1a1a]"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute inset-0 bg-[#E07A5F]/10 rounded-md"
                      transition={{ type: "spring", stiffness: 400, damping: 35 }}
                    />
                  )}
                  <span className="relative w-5 h-5 z-10">{item.icon}</span>
                  <span className="relative z-10">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors duration-150 rounded-md hover:bg-[#1a1a1a] dark:hover:bg-[#1a1a1a] font-raleway"
        >
          <LogoutIcon />
          Sign Out
        </button>
      </div>
    </motion.aside>
  );
}

// Icons
function OverviewIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function LeaderboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21v-8" />
      <path d="M12 21V11" />
      <path d="M16 21v-5" />
      <path d="M12 3l4 4-4 4" />
    </svg>
  );
}

function RevenueIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function CampaignIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
