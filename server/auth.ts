import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { db } from './db.ts';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  account_status: string;
  is_private: number;
  is_verified: number;
  language: string;
  avatar_url: string;
  role: string | null;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  sessionToken?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const actualBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function getUserByToken(token: string): AuthUser | null {
  if (!token) return null;
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT p.id, p.username, p.email, p.full_name, p.account_status, p.is_private, p.is_verified,
              p.language, p.avatar_url, ar.role
       FROM sessions s
       JOIN profiles p ON p.id = s.user_id
       LEFT JOIN admin_roles ar ON ar.user_id = p.id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, now) as AuthUser | undefined;
  if (!row) return null;
  db.prepare(`UPDATE profiles SET last_active_at = ? WHERE id = ?`).run(now, row.id);
  return row;
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    const user = getUserByToken(token);
    if (user && user.account_status !== 'banned') {
      req.user = user;
      req.sessionToken = token;
    }
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = header.slice(7).trim();
  const user = getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  if (user.account_status === 'banned') {
    return res.status(403).json({ error: 'Account has been banned' });
  }
  if (user.account_status === 'suspended') {
    return res.status(403).json({ error: 'Account is currently suspended' });
  }
  req.user = user;
  req.sessionToken = token;
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user?.role) {
      return res.status(403).json({ error: 'Administrator privileges required' });
    }
    next();
  });
}

// Simple sliding-window in-memory rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip || 'local'}:${req.path}`;
    const now = Date.now();
    const existing = rateBuckets.get(key);
    if (!existing || existing.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (existing.count >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }
    existing.count += 1;
    next();
  };
}

// Upload storage setup
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const ALLOWED_BUCKETS = new Set([
  'avatars',
  'covers',
  'post-images',
  'videos',
  'stories',
  'shorts',
  'chat-attachments',
]);

for (const bucket of ALLOWED_BUCKETS) {
  fs.mkdirSync(path.join(UPLOADS_DIR, bucket), { recursive: true });
}

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const bucket = String(req.params.bucket || 'post-images');
    if (!ALLOWED_BUCKETS.has(bucket)) {
      return cb(new Error('Invalid storage bucket'), UPLOADS_DIR);
    }
    const targetDir = path.resolve(UPLOADS_DIR, bucket);
    if (!targetDir.startsWith(UPLOADS_DIR + path.sep)) {
      return cb(new Error('Invalid upload path'), UPLOADS_DIR);
    }
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max video/media
  },
  fileFilter: (req, file, cb) => {
    const bucket = String(req.params.bucket || 'post-images');
    const isImage = ALLOWED_IMAGE_MIMES.has(file.mimetype);
    const isVideo = ALLOWED_VIDEO_MIMES.has(file.mimetype);
    if ((bucket === 'avatars' || bucket === 'covers' || bucket === 'post-images') && !isImage) {
      return cb(new Error('Only JPG, PNG, WEBP, or GIF images are allowed in this bucket'));
    }
    if ((bucket === 'videos' || bucket === 'shorts') && !isVideo) {
      return cb(new Error('Only MP4, WebM, or MOV videos are allowed in this bucket'));
    }
    if (!isImage && !isVideo) {
      return cb(new Error('Unsupported file format'));
    }
    cb(null, true);
  },
});

export function removeStoredFile(storagePath: string) {
  if (!storagePath) return;
  const resolved = path.resolve(UPLOADS_DIR, storagePath);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) return;
  if (fs.existsSync(resolved)) {
    try {
      fs.unlinkSync(resolved);
    } catch {
      // ignore cleanup error
    }
  }
}
