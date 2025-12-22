"use client";

/**
 * Data Table Component
 *
 * Reusable table with sorting, pagination, and clean animations.
 */

import { useState } from "react";
import { motion } from "framer-motion";

interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (value: unknown, row: T) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  width?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string;
  emptyMessage?: string;
  isLoading?: boolean;
  bare?: boolean;
  maxHeight?: string; // e.g., "300px" for internal scrolling
}

export function DataTable<T>({
  data,
  columns,
  onRowClick,
  keyExtractor,
  emptyMessage = "No data available",
  isLoading = false,
  bare = false,
  maxHeight,
}: DataTableProps<T>) {
  const containerClass = bare
    ? ""
    : "bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 overflow-hidden";
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortKey) return 0;
    const aVal = (a as Record<string, unknown>)[sortKey];
    const bVal = (b as Record<string, unknown>)[sortKey];
    if (aVal === bVal) return 0;
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    const comparison = aVal < bVal ? -1 : 1;
    return sortOrder === "asc" ? comparison : -comparison;
  });

  const getValue = (row: T, key: string): unknown => {
    return (row as Record<string, unknown>)[key];
  };

  if (isLoading) {
    return (
      <div className={containerClass}>
        <div
          className="overflow-x-auto overflow-y-auto"
          style={maxHeight ? { maxHeight } : undefined}
        >
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {columns.map((column) => (
                  <th
                    key={String(column.key)}
                    className="px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-gray-400 tracking-wide text-left font-raleway"
                    style={{ width: column.width }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-gray-800">
                  {columns.map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-3/4 animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={containerClass}
    >
      <div
        className="overflow-x-auto overflow-y-auto"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={`px-4 py-3 text-xs font-medium text-[#6B7280] dark:text-gray-400 tracking-wide font-raleway ${
                    column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"
                  } ${column.sortable ? "cursor-pointer hover:text-[#1A1A1A] dark:hover:text-white transition-colors duration-150" : ""}`}
                  style={{ width: column.width }}
                  onClick={() => column.sortable && handleSort(String(column.key))}
                >
                  <div className={`flex items-center gap-1 ${
                    column.align === "right" ? "justify-end" : column.align === "center" ? "justify-center" : ""
                  }`}>
                    {column.label}
                    {column.sortable && sortKey === column.key && (
                      <span className="transition-transform duration-150">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-[#6B7280] dark:text-gray-400 font-raleway"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  className={`border-b border-gray-50 dark:border-gray-800 transition-colors duration-150 ${
                    onRowClick ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" : ""
                  }`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((column) => {
                    const value = getValue(row, String(column.key));
                    return (
                      <td
                        key={String(column.key)}
                        className={`px-4 py-3 text-sm tabular-nums font-raleway text-gray-900 dark:text-gray-100 ${
                          column.align === "right"
                            ? "text-right"
                            : column.align === "center"
                            ? "text-center"
                            : "text-left"
                        }`}
                      >
                        {column.render ? column.render(value, row) : String(value ?? "-")}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

/**
 * Pagination Component
 */
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-sm text-[#6B7280] dark:text-gray-400 font-raleway">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors duration-150 font-raleway"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors duration-150 font-raleway"
        >
          Next
        </button>
      </div>
    </div>
  );
}
