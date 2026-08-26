/**
 * Security middleware — centralized auth, rate limiting, and hardening.
 */
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

/**
 * Helmet configuration — strict CSP for API routes, permissive for SPA.
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Vite dev needs inline; prod build hashes
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://discord.com", "https://api.hellominds.ai"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
});

/**
 * CORS configuration — strict for API, permissive for SPA.
 */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow same-origin (no origin header), known Vercel domains,
    // and Discord's interaction pings (server-to-server, no browser).
    // Discord doesn't send an Origin, but allow it explicitly anyway.
    if (!origin) return callback(null, true);
    const allowed = [
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/kithxbt\.vercel\.app$/,
      /^https:\/\/discord\.com$/,
      /^https:\/\/.*\.discord\.com$/,
      /^http:\/\/localhost:\d+$/,
    ];
    if (allowed.some((re) => re.test(origin))) return callback(null, true);
    callback(new Error("CORS: Origin not allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Signature-Ed25519", "X-Signature-Timestamp"],
  maxAge: 86400,
});

/**
 * General API rate limiter — 100 req/min per IP.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
  skip: (req) => req.path === "/api/cron/poll" || req.path === "/api/invite-url" || req.path === "/api/interactions",
});

/**
 * Strict rate limiter for cognition-spending endpoints — 10 req/min per IP.
 */
export const strictRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many cognition requests. Slow down." },
});

/**
 * Auth middleware for protected routes.
 * - Cron endpoint: Bearer CRON_SECRET
 * - Setup endpoints: optional token (hosted fallback)
 * - Other API: require API key via Authorization header
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;

  // Discord interactions — verified by Ed25519 signature, not our API key
  if (path === "/api/interactions") return next();
  // Cron endpoint has its own auth
  if (path.startsWith("/api/cron")) return next();

  // Public endpoints
  if (
    path === "/api/invite-url" ||
    path === "/api/setup/verify-discord" ||
    path === "/api/setup/list-channels" ||
    path === "/api/setup/check-channel" ||
    path === "/api/setup/build"
  ) {
    return next();
  }

  // Setup connect/push require API key
  if (path.startsWith("/api/setup/connect") || path.startsWith("/api/setup/push")) {
    const apiKey = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? req.body?.apiKey;
    if (!apiKey) {
      res.status(401).json({ error: "Missing API key. Provide via Authorization: Bearer <key> or apiKey body param." });
      return;
    }
    req.apiKey = apiKey;
    return next();
  }

  // Other API routes require API key
  if (path.startsWith("/api/")) {
    const apiKey = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!apiKey) {
      res.status(401).json({ error: "Authentication required. Provide Authorization: Bearer <key>." });
      return;
    }
    req.apiKey = apiKey;
    return next();
  }

  next();
}

/**
 * Request validation middleware factory using Zod.
 */
import { z } from "zod";

export const validateBody = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Invalid request body", details: result.error.flatten() });
      return;
    }
    req.body = result.data;
    next();
  };
};

/**
 * Input sanitization — strip dangerous characters from string fields.
 */
export const sanitizeBody = (req: Request, _res: Response, next: NextFunction): void => {
  const sanitize = (obj: any): any => {
    if (typeof obj === "string") return obj.replace(/[<>]/g, "").trim();
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (obj && typeof obj === "object") {
      const out: any = {};
      for (const [k, v] of Object.entries(obj)) out[k] = sanitize(v);
      return out;
    }
    return obj;
  };
  req.body = sanitize(req.body);
  next();
};