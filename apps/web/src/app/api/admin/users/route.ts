/**
 * Admin Users API
 *
 * GET: List users with filtering and pagination
 * PATCH: Update user flag status
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/admin/auth";
import { getUsers, getUserByAddress, updateUserFlag, type UsersListParams } from "@/lib/admin/queries";

export async function GET(request: Request) {
  // Verify admin token
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const activeOnlyParam = url.searchParams.get("activeOnly");
    const params: UsersListParams = {
      page: parseInt(url.searchParams.get("page") || "1"),
      limit: parseInt(url.searchParams.get("limit") || "50"),
      search: url.searchParams.get("search") || undefined,
      filter: (url.searchParams.get("filter") as UsersListParams["filter"]) || "all",
      sortBy: url.searchParams.get("sortBy") || "total_volume_usd",
      sortOrder: (url.searchParams.get("sortOrder") as "asc" | "desc") || "desc",
      activeOnly: activeOnlyParam === null ? true : activeOnlyParam === "true",
    };

    // Check for single user lookup
    const address = url.searchParams.get("address");
    if (address) {
      const user = await getUserByAddress(address);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      return NextResponse.json(user);
    }

    const result = await getUsers(params);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Admin Users] Error:", error);

    // If Supabase is not configured, return empty data
    if (String(error).includes("Missing SUPABASE")) {
      return NextResponse.json({
        users: [],
        total: 0,
        page: 1,
        limit: 50,
        _mock: true,
        _message: "Supabase not configured",
      });
    }

    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  // Verify admin token
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { address, flagStatus } = body;

    if (!address || !flagStatus) {
      return NextResponse.json(
        { error: "Missing address or flagStatus" },
        { status: 400 }
      );
    }

    if (!["legitimate", "excluded"].includes(flagStatus)) {
      return NextResponse.json(
        { error: "Invalid flagStatus. Use 'legitimate' or 'excluded'" },
        { status: 400 }
      );
    }

    await updateUserFlag(address, flagStatus);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin Users] Update error:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}
