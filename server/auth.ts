import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET must be set in production");
}
const SECRET = JWT_SECRET ?? "siftchat-dev-secret-do-not-use-in-prod";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? null;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// ── In-memory rate limiting (per IP, resets after window) ─────────────────────
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_LOGIN_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function resetRateLimit(ip: string) {
  loginAttempts.delete(ip);
}

// ── Input validation ──────────────────────────────────────────────────────────
export function validateSignupInput(email: string, password: string, name: string): string | null {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Valid email required";
  if (!name || name.trim().length < 1) return "Name required";
  if (!password || password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 128) return "Password too long";
  return null;
}

// ── Email / password auth ─────────────────────────────────────────────────────
export async function signup(email: string, password: string, name: string) {
  const existing = await db.select({ id: users.id })
    .from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) throw new Error("Email already in use");
  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(users)
    .values({ email: email.toLowerCase(), passwordHash, name: name.trim() })
    .returning();
  return user;
}

export async function login(email: string, password: string) {
  const [user] = await db.select().from(users)
    .where(eq(users.email, email.toLowerCase())).limit(1);
  // Always run bcrypt to prevent timing attacks even when user not found
  const dummyHash = "$2a$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const ok = user
    ? await bcrypt.compare(password, user.passwordHash ?? dummyHash)
    : (await bcrypt.compare(password, dummyHash), false);
  if (!user || !ok) throw new Error("Invalid email or password");
  if (!user.passwordHash) throw new Error("This account uses Google sign-in. Please sign in with Google.");
  return user;
}

// ── Google OAuth ──────────────────────────────────────────────────────────────
export async function loginWithGoogle(idToken: string) {
  if (!googleClient || !GOOGLE_CLIENT_ID) throw new Error("Google sign-in not configured");
  const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw new Error("Invalid Google token");

  const googleId = payload.sub;
  const email = payload.email.toLowerCase();
  const name = payload.name ?? email.split("@")[0];
  const avatarUrl = payload.picture ?? null;

  // Find by googleId first, then by email (handles existing email/password accounts linking)
  let [user] = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
  if (!user) {
    const [byEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (byEmail) {
      // Link Google to existing account
      const [updated] = await db.update(users)
        .set({ googleId, avatarUrl: avatarUrl ?? byEmail.avatarUrl })
        .where(eq(users.id, byEmail.id))
        .returning();
      user = updated;
    } else {
      // Create new Google account
      const [created] = await db.insert(users)
        .values({ email, name, googleId, avatarUrl, passwordHash: null })
        .returning();
      user = created;
    }
  } else if (avatarUrl && user.avatarUrl !== avatarUrl) {
    await db.update(users).set({ avatarUrl }).where(eq(users.id, user.id));
    user = { ...user, avatarUrl };
  }

  return user;
}

// ── JWT ───────────────────────────────────────────────────────────────────────
export function signToken(userId: number) {
  return jwt.sign({ userId }, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): { userId: number } {
  return jwt.verify(token, SECRET) as { userId: number };
}

export async function getUserById(userId: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ?? null;
}

// ── Middleware ────────────────────────────────────────────────────────────────
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "Not authenticated" });
  try {
    const payload = verifyToken(header.slice(7));
    (req as any).userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ message: "Session expired. Please log in again." });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      (req as any).userId = verifyToken(header.slice(7)).userId;
    } catch { /* ignore */ }
  }
  next();
}

export { checkRateLimit, resetRateLimit, GOOGLE_CLIENT_ID };
