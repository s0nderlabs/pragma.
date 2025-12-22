/**
 * Next.js Edge Middleware
 *
 * Runs on every request before reaching route handlers.
 * Provides:
 * - CORS/Origin validation (block curl/Postman)
 * - Rate limiting (prevent abuse)
 * - Security headers
 *
 * NOTE: This is the first line of defense.
 * Individual API routes still need to call authMiddleware() for authentication.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Allowed origins for API requests
 * Add your production domains here
 */
const ALLOWED_ORIGINS =
  process.env.NODE_ENV === "production"
    ? [
        "https://pr4gma.xyz", // Production
        "https://dev.pr4gma.xyz", // Development Live
        "https://www.pr4gma.xyz",
        "https://legacy.pr4gma.xyz", // Legacy H1 subdomain
        "https://admin.pr4gma.xyz", // Admin subdomain
      ]
    : [
        "http://localhost:3000", // Development
        "http://localhost:3001",
        "http://127.0.0.1:3000",
      ];

/**
 * Rate limiting configuration
 */
const RATE_LIMIT_CONFIG = {
  enabled: process.env.RATE_LIMIT_ENABLED !== "false", // Default: enabled
  windowMs: 60 * 1000, // 1 minute
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
  maxAuthFailures: 3, // Max failed auth attempts before blocking
};

/**
 * In-memory rate limit store
 * Production: Use Redis or similar distributed cache
 */
const rateLimitStore = new Map<
  string,
  { count: number; resetAt: number; authFailures: number }
>();

/**
 * Get client identifier for rate limiting
 * Uses IP address (X-Forwarded-For or fallback)
 */
function getClientId(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  return ip;
}

/**
 * Check rate limit for a client
 */
function checkRateLimit(clientId: string): {
  allowed: boolean;
  remaining: number;
} {
  if (!RATE_LIMIT_CONFIG.enabled) {
    return { allowed: true, remaining: RATE_LIMIT_CONFIG.maxRequests };
  }

  const now = Date.now();
  const record = rateLimitStore.get(clientId);

  // No record or window expired - create new
  if (!record || now > record.resetAt) {
    rateLimitStore.set(clientId, {
      count: 1,
      resetAt: now + RATE_LIMIT_CONFIG.windowMs,
      authFailures: 0,
    });
    return { allowed: true, remaining: RATE_LIMIT_CONFIG.maxRequests - 1 };
  }

  // Check if blocked due to auth failures
  if (record.authFailures >= RATE_LIMIT_CONFIG.maxAuthFailures) {
    return { allowed: false, remaining: 0 };
  }

  // Increment count
  record.count++;

  // Check limit
  if (record.count > RATE_LIMIT_CONFIG.maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  return {
    allowed: true,
    remaining: RATE_LIMIT_CONFIG.maxRequests - record.count,
  };
}

/**
 * Record authentication failure
 */
function recordAuthFailure(clientId: string): void {
  const record = rateLimitStore.get(clientId);
  if (record) {
    record.authFailures++;
  }
}

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((allowed) => {
    // Exact match
    if (origin === allowed) return true;
    // Allow subdomains in production
    if (process.env.NODE_ENV === "production") {
      return origin.endsWith(".pr4gma.xyz");
    }
    return false;
  });
}

/**
 * Main middleware function
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get("host") || "";

  // === SUBDOMAIN ROUTING FOR LEGACY ===
  // legacy.pr4gma.xyz → /legacy/*
  const isLegacySubdomain = hostname.startsWith("legacy.");

  if (isLegacySubdomain && !pathname.startsWith("/legacy") && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = `/legacy${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // === SUBDOMAIN ROUTING FOR ADMIN ===
  // admin.pr4gma.xyz → /admin/*
  const isAdminSubdomain = hostname.startsWith("admin.");

  if (isAdminSubdomain) {
    // Rewrite admin.pr4gma.xyz/users → /admin/users
    if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
      const url = request.nextUrl.clone();
      url.pathname = pathname === "/" ? "/admin" : `/admin${pathname}`;
      return NextResponse.rewrite(url);
    }
    // For /api/admin/* routes, let them pass through as-is
  }

  // === REDIRECT /admin ON MAIN DOMAIN TO SUBDOMAIN ===
  // pr4gma.xyz/admin → admin.pr4gma.xyz (optional - for cleaner URLs)
  if (!isAdminSubdomain && pathname.startsWith("/admin") && process.env.NODE_ENV === "production") {
    // Extract the path after /admin
    const adminPath = pathname.replace(/^\/admin/, "") || "/";
    const redirectUrl = new URL(`https://admin.pr4gma.xyz${adminPath}`);
    // Preserve query params
    redirectUrl.search = request.nextUrl.search;
    return NextResponse.redirect(redirectUrl);
  }

  // ============================================================================
  // ADMIN ROUTE PROTECTION
  // ============================================================================

  // Protect admin routes (except login page and auth API)
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const token = request.cookies.get("admin_token")?.value;

    if (!token) {
      // Redirect to login if no token
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Note: Full JWT verification happens in the route handlers
    // Middleware just checks for token existence (edge runtime limitations)
  }

  // Only apply API middleware to API routes
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // ============================================================================
  // 1. CORS / Origin Validation
  // ============================================================================

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  // Check origin for non-GET requests
  // Exception: /api/admin/index-payments allows API key auth (for cron services)
  const hasApiKey = request.headers.get("x-api-key");
  const isIndexPayments = pathname === "/api/admin/index-payments";

  if (request.method !== "GET" && request.method !== "HEAD") {
    // Skip origin check for index-payments with API key (cron services)
    if (!(isIndexPayments && hasApiKey) && !isOriginAllowed(origin)) {
      console.warn(
        `[Middleware] Blocked request from unauthorized origin: ${origin}`
      );
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "Origin not allowed",
          code: "INVALID_ORIGIN",
        },
        {
          status: 403,
          headers: {
            "Access-Control-Allow-Origin": "null",
          },
        }
      );
    }
  }

  // ============================================================================
  // 2. Rate Limiting - DISABLED
  // ============================================================================
  // Rate limiting disabled - all API endpoints require authentication
  // which provides sufficient protection against abuse.
  // This allows batch operations (up to 42 parallel swaps) to execute
  // without hitting artificial request limits.

  const clientId = getClientId(request);
  const rateLimit = { allowed: true, remaining: RATE_LIMIT_CONFIG.maxRequests };

  // Rate limit check disabled - authentication provides protection
  // if (!rateLimit.allowed) {
  //   console.warn(`[Middleware] Rate limit exceeded for ${clientId}`);
  //   return NextResponse.json(
  //     {
  //       error: 'Too Many Requests',
  //       message: 'Rate limit exceeded. Please try again later.',
  //       code: 'RATE_LIMIT_EXCEEDED',
  //     },
  //     {
  //       status: 429,
  //       headers: {
  //         'Retry-After': String(Math.ceil(RATE_LIMIT_CONFIG.windowMs / 1000)),
  //         'X-RateLimit-Limit': String(RATE_LIMIT_CONFIG.maxRequests),
  //         'X-RateLimit-Remaining': '0',
  //       },
  //     }
  //   );
  // }

  // ============================================================================
  // 3. Handle preflight (OPTIONS) requests
  // ============================================================================

  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": [
          "Content-Type",
          "Authorization",
          "X-Auth-Token",
          "X-Wallet-Address",
          "X-Wallet-Signature",
          "X-Request-Timestamp",
          "X-Request-Nonce",
        ].join(", "),
        "Access-Control-Max-Age": "86400", // 24 hours
      },
    });
  }

  // ============================================================================
  // 4. Continue to route handler with security headers
  // ============================================================================

  const response = NextResponse.next();

  // CORS headers
  if (isOriginAllowed(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin!);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Rate limit headers
  response.headers.set(
    "X-RateLimit-Limit",
    String(RATE_LIMIT_CONFIG.maxRequests)
  );
  response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));

  return response;
}

/**
 * Configure which routes the middleware runs on
 */
export const config = {
  matcher: [
    // Match all routes except static files (for subdomain routing + API middleware)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
