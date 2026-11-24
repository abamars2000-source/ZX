import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import {
  type AuthedRequest,
  generateToken,
  hashPassword,
  optionalAuth,
  rateLimit,
  removeStoredFile,
  requireAdmin,
  requireAuth,
  uploadMiddleware,
  verifyPassword,
} from './auth.ts';
import { db } from './db.ts';
import { registerAiRoutes } from './aiRoutes.ts';
import { emitToConversation, emitToUser, isUserOnline } from './realtime.ts';
import { syncUserToSupabaseAuth } from './supabaseAdmin.ts';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const SAFE_PROFILE_SELECT = `id, full_name, username, email, bio, avatar_url, cover_url, language, interests, is_private, is_verified, email_verified, onboarding_completed, account_status, has_password, CASE WHEN google_sub <> '' THEN 1 ELSE 0 END as google_linked, created_at`;

function getFirebaseApiKey(): string {
  return String(firebaseConfig.apiKey || '');
}

function getGoogleOAuthClientId(): string {
  return String(firebaseConfig.oAuthClientId || '');
}

function generateUniqueUsername(seedText: string): string {
  const base =
    seedText
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 22) || 'zx_user';
  const padded = base.length < 3 ? `${base}_zx` : base;
  const exists = db.prepare(`SELECT 1 FROM profiles WHERE username = ?`).get(padded);
  if (!exists) return padded;
  for (let i = 0; i < 20; i++) {
    const candidate = `${padded.slice(0, 22)}_${Math.floor(100 + Math.random() * 8999)}`;
    if (!db.prepare(`SELECT 1 FROM profiles WHERE username = ?`).get(candidate)) {
      return candidate;
    }
  }
  return `zx_${Date.now().toString(36)}`;
}

function uuid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function createNotification(
  recipientId: string,
  actorId: string,
  type: string,
  entityId: string | null,
  messagePreview: string
) {
  if (recipientId === actorId) return;
  const isBlocked = db
    .prepare(
      `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`
    )
    .get(recipientId, actorId, actorId, recipientId);
  if (isBlocked) return;

  const settings = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(recipientId) as
    | Record<string, unknown>
    | undefined;
  if (settings) {
    if (type === 'follow' && !settings.notify_follows) return;
    if (type === 'like' && !settings.notify_likes) return;
    if ((type === 'comment' || type === 'reply') && !settings.notify_comments) return;
    if (type === 'mention' && !settings.notify_mentions) return;
    if (type === 'message' && !settings.notify_messages) return;
  }

  const id = uuid();
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO notifications (id, recipient_id, actor_id, type, entity_id, message_preview, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, recipientId, actorId, type, entityId, messagePreview.slice(0, 140), createdAt);

  const actor = db
    .prepare(`SELECT id, username, full_name, avatar_url, is_verified FROM profiles WHERE id = ?`)
    .get(actorId);
  emitToUser(recipientId, 'notification:new', {
    id,
    type,
    entity_id: entityId,
    message_preview: messagePreview.slice(0, 140),
    is_read: 0,
    created_at: createdAt,
    actor,
  });
}

function canViewAuthor(viewerId: string | null, authorId: string, authorPrivate: number): boolean {
  if (viewerId && viewerId === authorId) return true;
  if (viewerId) {
    const blocked = db
      .prepare(
        `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`
      )
      .get(viewerId, authorId, authorId, viewerId);
    if (blocked) return false;
  }
  if (!authorPrivate) return true;
  if (!viewerId) return false;
  const follows = db
    .prepare(`SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?`)
    .get(viewerId, authorId);
  return Boolean(follows);
}

function hydratePosts(rows: Array<Record<string, any>>, viewerId: string | null): Array<Record<string, any>> {
  return rows.map((row): Record<string, any> => {
    const postId = String(row.id);
    const media = db
      .prepare(`SELECT id, media_type, url, sort_order FROM post_media WHERE post_id = ? ORDER BY sort_order ASC`)
      .all(postId);
    const likesCount = (
      db.prepare(`SELECT COUNT(*) as c FROM likes WHERE post_id = ?`).get(postId) as { c: number }
    ).c;
    const commentsCount = (
      db.prepare(`SELECT COUNT(*) as c FROM comments WHERE post_id = ? AND is_removed = 0`).get(postId) as {
        c: number;
      }
    ).c;
    const repostsCount = (
      db.prepare(`SELECT COUNT(*) as c FROM reposts WHERE post_id = ?`).get(postId) as { c: number }
    ).c;
    const viewsCount = (
      db.prepare(`SELECT COUNT(*) as c FROM post_views WHERE post_id = ?`).get(postId) as { c: number }
    ).c;

    const likedByMe = viewerId
      ? Boolean(db.prepare(`SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?`).get(viewerId, postId))
      : false;
    const repostedByMe = viewerId
      ? Boolean(db.prepare(`SELECT 1 FROM reposts WHERE user_id = ? AND post_id = ?`).get(viewerId, postId))
      : false;
    const bookmarkedByMe = viewerId
      ? Boolean(db.prepare(`SELECT 1 FROM bookmarks WHERE user_id = ? AND post_id = ?`).get(viewerId, postId))
      : false;
    const followingAuthor = viewerId
      ? Boolean(
          db
            .prepare(`SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?`)
            .get(viewerId, String(row.author_id))
        )
      : false;

    const pollRow = db.prepare(`SELECT * FROM polls WHERE post_id = ?`).get(postId) as
      | { id: string; question: string; options: string; expires_at: string }
      | undefined;

    let poll = null;
    if (pollRow) {
      const optionsArr = JSON.parse(pollRow.options) as string[];
      const voteCounts = optionsArr.map((_, idx) => {
        const res = db
          .prepare(`SELECT COUNT(*) as c FROM poll_votes WHERE poll_id = ? AND option_index = ?`)
          .get(pollRow.id, idx) as { c: number };
        return res.c;
      });
      const myVoteRow = viewerId
        ? (db
            .prepare(`SELECT option_index FROM poll_votes WHERE poll_id = ? AND user_id = ?`)
            .get(pollRow.id, viewerId) as { option_index: number } | undefined)
        : undefined;
      poll = {
        id: pollRow.id,
        question: pollRow.question,
        options: optionsArr.map((label, idx) => ({ label, votes: voteCounts[idx] })),
        totalVotes: voteCounts.reduce((a, b) => a + b, 0),
        myVote: myVoteRow ? myVoteRow.option_index : null,
        expires_at: pollRow.expires_at,
      };
    }

    let quotePost = null;
    if (row.quote_post_id) {
      const qRow = db
        .prepare(
          `SELECT p.id, p.content, p.post_type, p.created_at, u.username as author_username, u.full_name as author_name, u.avatar_url as author_avatar, u.is_verified as author_verified
           FROM posts p JOIN profiles u ON u.id = p.author_id WHERE p.id = ? AND p.is_removed = 0`
        )
        .get(String(row.quote_post_id));
      if (qRow) quotePost = qRow;
    }

    const hashtags = (
      db
        .prepare(
          `SELECT h.tag FROM post_hashtags ph JOIN hashtags h ON h.id = ph.hashtag_id WHERE ph.post_id = ?`
        )
        .all(postId) as Array<{ tag: string }>
    ).map((r) => r.tag);

    return {
      ...row,
      media,
      hashtags,
      poll,
      quotePost,
      counts: {
        likes: likesCount,
        comments: commentsCount,
        reposts: repostsCount,
        views: viewsCount,
      },
      viewer: {
        liked: likedByMe,
        reposted: repostedByMe,
        bookmarked: bookmarkedByMe,
        following: followingAuthor,
      },
    };
  });
}

function processHashtagsAndMentions(postId: string, content: string, authorId: string) {
  const tags = Array.from(new Set((content.match(/#([a-zA-Z0-9_\u0900-\u097F]+)/g) || []).map((t) => t.slice(1).toLowerCase())));
  for (const tag of tags) {
    let existing = db.prepare(`SELECT id, is_blocked FROM hashtags WHERE tag = ?`).get(tag) as
      | { id: string; is_blocked: number }
      | undefined;
    if (!existing) {
      const hid = uuid();
      db.prepare(`INSERT INTO hashtags (id, tag, is_blocked, created_at) VALUES (?, ?, 0, ?)`).run(
        hid,
        tag,
        nowIso()
      );
      existing = { id: hid, is_blocked: 0 };
    }
    if (!existing.is_blocked) {
      db.prepare(`INSERT OR IGNORE INTO post_hashtags (id, post_id, hashtag_id) VALUES (?, ?, ?)`).run(
        uuid(),
        postId,
        existing.id
      );
    }
  }

  const mentions = Array.from(new Set((content.match(/@([a-zA-Z0-9_]{3,30})/g) || []).map((m) => m.slice(1).toLowerCase())));
  for (const uname of mentions) {
    const target = db.prepare(`SELECT id FROM profiles WHERE username = ?`).get(uname) as
      | { id: string }
      | undefined;
    if (target) {
      createNotification(target.id, authorId, 'mention', postId, content);
    }
  }
}

export function registerApiRoutes(app: express.Express) {
  const router = express.Router();

  // ========================
  // PLATFORM STATS / HEALTH
  // ========================
  router.get('/health', (_req, res) => {
    const users = (db.prepare(`SELECT COUNT(*) as c FROM profiles`).get() as { c: number }).c;
    const posts = (db.prepare(`SELECT COUNT(*) as c FROM posts WHERE is_removed = 0`).get() as { c: number }).c;
    res.json({ ok: true, users, posts });
  });

  router.get('/announcements', (_req, res) => {
    const rows = db
      .prepare(`SELECT id, title, body, created_at FROM announcements WHERE is_active = 1 ORDER BY created_at DESC LIMIT 3`)
      .all();
    res.json({ announcements: rows });
  });

  // ========================
  // AUTHENTICATION & SESSIONS
  // ========================
  router.post('/auth/register', rateLimit(20, 60_000), (req, res) => {
    const { fullName, username, email, password, confirmPassword, termsAccepted, language } = req.body || {};
    const cleanName = String(fullName || '').trim();
    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const pw = String(password || '');
    const cpw = String(confirmPassword || '');

    if (!cleanName || cleanName.length < 2 || cleanName.length > 80) {
      return res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
    }
    if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username must be 3–30 lowercase letters, numbers, or underscores.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }
    if (pw.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
    if (pw !== cpw) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }
    if (!termsAccepted) {
      return res.status(400).json({ error: 'You must accept the ZX Terms of Service and Privacy Policy.' });
    }

    const dupUser = db
      .prepare(`SELECT id FROM profiles WHERE username = ? OR email = ?`)
      .get(cleanUsername, cleanEmail);
    if (dupUser) {
      return res.status(409).json({ error: 'Username or email is already registered.' });
    }

    const userId = uuid();
    const ts = nowIso();
    const pwHash = hashPassword(pw);
    const lang = language === 'en' ? 'en' : 'hi';

    db.prepare(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, language, last_active_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, cleanName, cleanUsername, cleanEmail, pwHash, lang, ts, ts, ts);

    db.prepare(
      `INSERT INTO user_settings (user_id, theme, language, updated_at) VALUES (?, 'dark', ?, ?)`
    ).run(userId, lang, ts);

    const verifyToken = generateToken(16);
    db.prepare(
      `INSERT INTO email_verifications (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`
    ).run(verifyToken, userId, new Date(Date.now() + 24 * 3600_000).toISOString(), ts);

    const sessionToken = generateToken(32);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();
    db.prepare(
      `INSERT INTO sessions (token, user_id, user_agent, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(sessionToken, userId, String(req.headers['user-agent'] || '').slice(0, 180), expiresAt, ts);

    const profile = db
      .prepare(`SELECT ${SAFE_PROFILE_SELECT} FROM profiles WHERE id = ?`)
      .get(userId);

    void syncUserToSupabaseAuth({
      email: cleanEmail,
      fullName: cleanName,
      username: cleanUsername,
      password: pw,
      hasPassword: true,
      language: lang,
    });

    res.status(201).json({
      token: sessionToken,
      user: profile,
      role: null,
      verificationToken: verifyToken,
    });
  });

  router.post('/auth/google', rateLimit(30, 60_000), async (req, res) => {
    const { accessToken, googleIdToken, idToken, language } = req.body || {};
    if (!accessToken && !googleIdToken && !idToken) {
      return res.status(400).json({ error: 'Google authentication token is required.' });
    }

    let googleSub = '';
    let verifiedEmail = '';
    let displayName = '';
    let avatarPic = '';

    try {
      if (accessToken && typeof accessToken === 'string') {
        const gRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (gRes.ok) {
          const info = (await gRes.json()) as {
            sub?: string;
            email?: string;
            email_verified?: boolean;
            name?: string;
            picture?: string;
          };
          if (info.email && info.email_verified !== false) {
            googleSub = String(info.sub || '');
            verifiedEmail = String(info.email).trim().toLowerCase();
            displayName = String(info.name || '').trim();
            avatarPic = String(info.picture || '').trim();
          }
        }
      }

      if (!verifiedEmail && googleIdToken && typeof googleIdToken === 'string') {
        const expectedAud = getGoogleOAuthClientId();
        const tiRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(googleIdToken)}`
        );
        if (tiRes.ok) {
          const ti = (await tiRes.json()) as {
            aud?: string;
            sub?: string;
            email?: string;
            email_verified?: string | boolean;
            name?: string;
            picture?: string;
          };
          const audValid = !expectedAud || ti.aud === expectedAud;
          if (audValid && ti.email && ti.email_verified !== false && ti.email_verified !== 'false') {
            googleSub = String(ti.sub || '');
            verifiedEmail = String(ti.email).trim().toLowerCase();
            displayName = String(ti.name || '').trim();
            avatarPic = String(ti.picture || '').trim();
          }
        }
      }

      if (!verifiedEmail && idToken && typeof idToken === 'string') {
        const apiKey = getFirebaseApiKey();
        if (apiKey) {
          const fbRes = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken }),
            }
          );
          if (fbRes.ok) {
            const fbData = (await fbRes.json()) as {
              users?: Array<{
                localId?: string;
                email?: string;
                emailVerified?: boolean;
                displayName?: string;
                photoUrl?: string;
                providerUserInfo?: Array<{ providerId?: string; rawId?: string }>;
              }>;
            };
            const u = fbData.users?.[0];
            if (u?.email) {
              const gProv = u.providerUserInfo?.find((p) => p.providerId === 'google.com');
              googleSub = String(gProv?.rawId || u.localId || '');
              verifiedEmail = String(u.email).trim().toLowerCase();
              displayName = String(u.displayName || '').trim();
              avatarPic = String(u.photoUrl || '').trim();
            }
          }
        }
      }
    } catch {
      return res.status(502).json({ error: 'Unable to verify Google account right now.' });
    }

    if (!verifiedEmail) {
      return res.status(401).json({ error: 'Google token verification failed.' });
    }

    let existing = (
      googleSub
        ? db.prepare(`SELECT * FROM profiles WHERE google_sub = ? OR LOWER(email) = ?`).get(googleSub, verifiedEmail)
        : db.prepare(`SELECT * FROM profiles WHERE LOWER(email) = ?`).get(verifiedEmail)
    ) as Record<string, unknown> | undefined;

    const ts = nowIso();
    let userId: string;
    let isNewUser = false;

    if (existing) {
      if (existing.account_status === 'banned') {
        return res.status(403).json({ error: 'This account has been permanently banned.' });
      }
      if (existing.account_status === 'suspended') {
        return res.status(403).json({ error: 'This account is temporarily suspended.' });
      }
      userId = String(existing.id);
      db.prepare(
        `UPDATE profiles SET
          google_sub = CASE WHEN google_sub = '' THEN ? ELSE google_sub END,
          email_verified = 1,
          avatar_url = CASE WHEN avatar_url = '' AND ? <> '' THEN ? ELSE avatar_url END,
          last_active_at = ?,
          updated_at = ?
         WHERE id = ?`
      ).run(googleSub, avatarPic, avatarPic, ts, ts, userId);
    } else {
      isNewUser = true;
      userId = uuid();
      const emailPrefix = verifiedEmail.split('@')[0] || 'zx_user';
      const generatedUsername = generateUniqueUsername(displayName || emailPrefix);
      const cleanFullName = (displayName || emailPrefix).slice(0, 80);
      const prefLang = language === 'en' ? 'en' : 'hi';

      db.prepare(
        `INSERT INTO profiles (id, full_name, username, email, password_hash, google_sub, has_password, avatar_url, language, email_verified, onboarding_completed, last_active_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, '', ?, 0, ?, ?, 1, 0, ?, ?, ?)`
      ).run(userId, cleanFullName, generatedUsername, verifiedEmail, googleSub, avatarPic, prefLang, ts, ts, ts);

      db.prepare(
        `INSERT INTO user_settings (user_id, theme, language, updated_at) VALUES (?, 'dark', ?, ?)`
      ).run(userId, prefLang, ts);
    }

    const sessionToken = generateToken(32);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();
    db.prepare(
      `INSERT INTO sessions (token, user_id, user_agent, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(sessionToken, userId, String(req.headers['user-agent'] || '').slice(0, 180), expiresAt, ts);

    const roleRow = db.prepare(`SELECT role FROM admin_roles WHERE user_id = ?`).get(userId) as
      | { role: string }
      | undefined;
    const safeUser = db.prepare(`SELECT ${SAFE_PROFILE_SELECT} FROM profiles WHERE id = ?`).get(userId) as Record<
      string,
      unknown
    >;

    const { supabaseUserId } = await syncUserToSupabaseAuth({
      email: verifiedEmail,
      fullName: String(safeUser.full_name || displayName || verifiedEmail),
      username: String(safeUser.username || ''),
      avatarUrl: String(safeUser.avatar_url || avatarPic || ''),
      googleSub,
      hasPassword: Number(safeUser.has_password) === 1,
      language: String(safeUser.language || 'hi'),
    });

    res.json({
      token: sessionToken,
      user: safeUser,
      role: roleRow?.role || null,
      isNewUser,
      needsPasswordSetup: Number(safeUser.has_password) === 0,
      supabaseUserId,
    });
  });

  router.post('/auth/credentials', requireAuth, rateLimit(20, 60_000), (req: AuthedRequest, res) => {
    const { fullName, username, password, confirmPassword, currentPassword } = req.body || {};
    const current = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(req.user!.id) as Record<string, unknown>;
    if (!current) return res.status(404).json({ error: 'Account not found' });

    const nextFullName =
      fullName !== undefined ? String(fullName).trim() : String(current.full_name || '').trim();
    const nextUsername =
      username !== undefined ? String(username).trim().toLowerCase() : String(current.username || '').toLowerCase();

    if (!nextFullName || nextFullName.length < 2 || nextFullName.length > 80) {
      return res.status(400).json({ error: 'Profile name must be between 2 and 80 characters.' });
    }
    if (!/^[a-z0-9_]{3,30}$/.test(nextUsername)) {
      return res.status(400).json({ error: 'Username must be 3–30 lowercase letters, numbers, or underscores.' });
    }

    const dup = db
      .prepare(`SELECT id FROM profiles WHERE username = ? AND id <> ?`)
      .get(nextUsername, req.user!.id);
    if (dup) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }

    let nextPwHash = String(current.password_hash || '');
    let nextHasPw = Number(current.has_password ?? 1);

    if (password !== undefined && String(password).length > 0) {
      const pw = String(password);
      const cpw = String(confirmPassword ?? pw);
      if (pw.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      }
      if (pw !== cpw) {
        return res.status(400).json({ error: 'Passwords do not match.' });
      }
      if (nextHasPw === 1 && nextPwHash) {
        if (!currentPassword || !verifyPassword(String(currentPassword), nextPwHash)) {
          return res.status(403).json({ error: 'Current password is incorrect.' });
        }
      }
      nextPwHash = hashPassword(pw);
      nextHasPw = 1;
    }

    db.prepare(
      `UPDATE profiles SET full_name = ?, username = ?, password_hash = ?, has_password = ?, updated_at = ? WHERE id = ?`
    ).run(nextFullName, nextUsername, nextPwHash, nextHasPw, nowIso(), req.user!.id);

    const updated = db.prepare(`SELECT ${SAFE_PROFILE_SELECT} FROM profiles WHERE id = ?`).get(req.user!.id);
    res.json({ ok: true, user: updated });
  });

  router.post('/auth/verify-email', (req, res) => {
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Verification token required' });
    const row = db
      .prepare(`SELECT user_id, expires_at FROM email_verifications WHERE token = ?`)
      .get(token) as { user_id: string; expires_at: string } | undefined;
    if (!row || row.expires_at < nowIso()) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }
    db.prepare(`UPDATE profiles SET email_verified = 1, updated_at = ? WHERE id = ?`).run(nowIso(), row.user_id);
    db.prepare(`DELETE FROM email_verifications WHERE token = ?`).run(token);
    res.json({ ok: true });
  });

  router.post('/auth/login', rateLimit(30, 60_000), (req, res) => {
    const identifier = String(req.body?.identifier || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Profile name, username or email and password are required.' });
    }
    const candidates = db
      .prepare(`SELECT * FROM profiles WHERE LOWER(email) = ? OR LOWER(username) = ? OR LOWER(full_name) = ?`)
      .all(identifier, identifier, identifier) as Array<Record<string, unknown>>;

    const matched = candidates.find(
      (c) => Number(c.has_password) === 1 && String(c.password_hash || '') && verifyPassword(password, String(c.password_hash))
    );

    if (!matched) {
      if (candidates.some((c) => Number(c.has_password) === 0)) {
        return res.status(401).json({
          error:
            'Password is not set for this Google account yet. Sign in with Google and set your Profile Name & Password to log in from any device.',
        });
      }
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    if (matched.account_status === 'banned') {
      return res.status(403).json({ error: 'This account has been permanently banned.' });
    }
    if (matched.account_status === 'suspended') {
      return res.status(403).json({ error: 'This account is temporarily suspended.' });
    }

    const sessionToken = generateToken(32);
    const ts = nowIso();
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();
    db.prepare(
      `INSERT INTO sessions (token, user_id, user_agent, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(sessionToken, String(matched.id), String(req.headers['user-agent'] || '').slice(0, 180), expiresAt, ts);

    const roleRow = db.prepare(`SELECT role FROM admin_roles WHERE user_id = ?`).get(String(matched.id)) as
      | { role: string }
      | undefined;

    const safeUser = db.prepare(`SELECT ${SAFE_PROFILE_SELECT} FROM profiles WHERE id = ?`).get(String(matched.id));
    res.json({
      token: sessionToken,
      user: safeUser,
      role: roleRow?.role || null,
    });
  });

  router.post('/auth/forgot-password', rateLimit(10, 60_000), (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const user = db.prepare(`SELECT id FROM profiles WHERE email = ?`).get(email) as { id: string } | undefined;
    if (!user) {
      return res.json({ ok: true, message: 'If an account matches that email, a reset token has been generated.' });
    }
    const token = generateToken(16);
    db.prepare(
      `INSERT INTO password_resets (token, user_id, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)`
    ).run(token, user.id, new Date(Date.now() + 3600_000).toISOString(), nowIso());
    res.json({
      ok: true,
      resetToken: token,
      message: 'Password reset token generated. Enter it below to reset your password.',
    });
  });

  router.post('/auth/reset-password', (req, res) => {
    const { token, newPassword } = req.body || {};
    const pw = String(newPassword || '');
    if (!token || pw.length < 8) {
      return res.status(400).json({ error: 'Valid token and password (min 8 chars) required.' });
    }
    const row = db
      .prepare(`SELECT user_id, expires_at, used FROM password_resets WHERE token = ?`)
      .get(String(token)) as { user_id: string; expires_at: string; used: number } | undefined;
    if (!row || row.used || row.expires_at < nowIso()) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }
    db.prepare(`UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
      hashPassword(pw),
      nowIso(),
      row.user_id
    );
    db.prepare(`UPDATE password_resets SET used = 1 WHERE token = ?`).run(String(token));
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(row.user_id);
    res.json({ ok: true });
  });

  router.post('/auth/logout', requireAuth, (req: AuthedRequest, res) => {
    if (req.sessionToken) {
      db.prepare(`DELETE FROM sessions WHERE token = ?`).run(req.sessionToken);
    }
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const profile = db
      .prepare(`SELECT ${SAFE_PROFILE_SELECT} FROM profiles WHERE id = ?`)
      .get(req.user!.id);
    const settings = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(req.user!.id);
    res.json({ user: profile, settings, role: req.user!.role });
  });

  router.get('/auth/sessions', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT substr(token, 1, 12) as id_prefix, user_agent, created_at, expires_at,
                CASE WHEN token = ? THEN 1 ELSE 0 END as is_current
         FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC`
      )
      .all(req.sessionToken || '', req.user!.id, nowIso());
    res.json({ sessions: rows });
  });

  router.delete('/auth/sessions/:prefix', requireAuth, (req: AuthedRequest, res) => {
    const prefix = String(req.params.prefix || '');
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND substr(token, 1, 12) = ?`).run(req.user!.id, prefix);
    res.json({ ok: true });
  });

  // ========================
  // FILE UPLOAD STORAGE
  // ========================
  router.post('/uploads/:bucket', requireAuth, uploadMiddleware.single('file'), (req: AuthedRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const bucket = String(req.params.bucket);
    const storagePath = `${bucket}/${req.file.filename}`;
    const url = `/uploads/${storagePath}`;
    res.status(201).json({
      url,
      storagePath,
      mimeType: req.file.mimetype,
      size: req.file.size,
      mediaType: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
    });
  });

  // ========================
  // PROFILES & SETTINGS
  // ========================
  router.put('/profile/me', requireAuth, (req: AuthedRequest, res) => {
    const {
      fullName,
      bio,
      avatarUrl,
      coverUrl,
      language,
      interests,
      isPrivate,
      onboardingCompleted,
    } = req.body || {};

    const current = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(req.user!.id) as Record<string, unknown>;
    const nextName = fullName !== undefined ? String(fullName).trim().slice(0, 80) : String(current.full_name);
    const nextBio = bio !== undefined ? String(bio).trim().slice(0, 300) : String(current.bio);
    const nextAvatar = avatarUrl !== undefined ? String(avatarUrl) : String(current.avatar_url);
    const nextCover = coverUrl !== undefined ? String(coverUrl) : String(current.cover_url);
    const nextLang = language === 'en' ? 'en' : language === 'hi' ? 'hi' : String(current.language);
    const nextInterests = Array.isArray(interests) ? JSON.stringify(interests.slice(0, 12)) : String(current.interests);
    const nextPrivate = isPrivate !== undefined ? (isPrivate ? 1 : 0) : Number(current.is_private);
    const nextOnboard =
      onboardingCompleted !== undefined ? (onboardingCompleted ? 1 : 0) : Number(current.onboarding_completed);

    db.prepare(
      `UPDATE profiles SET full_name = ?, bio = ?, avatar_url = ?, cover_url = ?, language = ?, interests = ?, is_private = ?, onboarding_completed = ?, updated_at = ?
       WHERE id = ?`
    ).run(nextName, nextBio, nextAvatar, nextCover, nextLang, nextInterests, nextPrivate, nextOnboard, nowIso(), req.user!.id);

    const updated = db
      .prepare(`SELECT ${SAFE_PROFILE_SELECT} FROM profiles WHERE id = ?`)
      .get(req.user!.id);
    res.json({ user: updated });
  });

  router.put('/settings/me', requireAuth, (req: AuthedRequest, res) => {
    const { theme, language, notifyFollows, notifyLikes, notifyComments, notifyMentions, notifyMessages } =
      req.body || {};
    const ts = nowIso();
    db.prepare(
      `UPDATE user_settings SET
        theme = COALESCE(?, theme),
        language = COALESCE(?, language),
        notify_follows = COALESCE(?, notify_follows),
        notify_likes = COALESCE(?, notify_likes),
        notify_comments = COALESCE(?, notify_comments),
        notify_mentions = COALESCE(?, notify_mentions),
        notify_messages = COALESCE(?, notify_messages),
        updated_at = ?
       WHERE user_id = ?`
    ).run(
      theme === 'light' || theme === 'dark' ? theme : null,
      language === 'en' || language === 'hi' ? language : null,
      notifyFollows !== undefined ? (notifyFollows ? 1 : 0) : null,
      notifyLikes !== undefined ? (notifyLikes ? 1 : 0) : null,
      notifyComments !== undefined ? (notifyComments ? 1 : 0) : null,
      notifyMentions !== undefined ? (notifyMentions ? 1 : 0) : null,
      notifyMessages !== undefined ? (notifyMessages ? 1 : 0) : null,
      ts,
      req.user!.id
    );
    if (language === 'en' || language === 'hi') {
      db.prepare(`UPDATE profiles SET language = ?, updated_at = ? WHERE id = ?`).run(language, ts, req.user!.id);
    }
    const settings = db.prepare(`SELECT * FROM user_settings WHERE user_id = ?`).get(req.user!.id);
    res.json({ settings });
  });

  router.get('/profiles/:username', optionalAuth, (req: AuthedRequest, res) => {
    const username = String(req.params.username || '').toLowerCase();
    const profile = db
      .prepare(
        `SELECT id, full_name, username, bio, avatar_url, cover_url, language, interests, is_private, is_verified, account_status, created_at
         FROM profiles WHERE username = ?`
      )
      .get(username) as Record<string, unknown> | undefined;
    if (!profile || profile.account_status === 'banned') {
      return res.status(404).json({ error: 'User not found' });
    }
    const targetId = String(profile.id);
    const viewerId = req.user?.id || null;

    const followersCount = (
      db.prepare(`SELECT COUNT(*) as c FROM follows WHERE following_id = ?`).get(targetId) as { c: number }
    ).c;
    const followingCount = (
      db.prepare(`SELECT COUNT(*) as c FROM follows WHERE follower_id = ?`).get(targetId) as { c: number }
    ).c;
    const postsCount = (
      db.prepare(`SELECT COUNT(*) as c FROM posts WHERE author_id = ? AND is_removed = 0`).get(targetId) as {
        c: number;
      }
    ).c;

    const isFollowing = viewerId
      ? Boolean(db.prepare(`SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?`).get(viewerId, targetId))
      : false;
    const followRequested = viewerId
      ? Boolean(
          db
            .prepare(`SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ? AND status = 'pending'`)
            .get(viewerId, targetId)
        )
      : false;
    const isBlocked = viewerId
      ? Boolean(db.prepare(`SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?`).get(viewerId, targetId))
      : false;
    const isMuted = viewerId
      ? Boolean(db.prepare(`SELECT 1 FROM mutes WHERE muter_id = ? AND muted_id = ?`).get(viewerId, targetId))
      : false;

    const canView = canViewAuthor(viewerId, targetId, Number(profile.is_private));
    let posts: unknown[] = [];
    let reposts: unknown[] = [];
    let highlights: unknown[] = [];

    if (canView) {
      const postRows = db
        .prepare(
          `SELECT p.*, u.username as author_username, u.full_name as author_name, u.avatar_url as author_avatar, u.is_verified as author_verified
           FROM posts p JOIN profiles u ON u.id = p.author_id
           WHERE p.author_id = ? AND p.is_removed = 0
           ORDER BY p.created_at DESC LIMIT 60`
        )
        .all(targetId) as Array<Record<string, unknown>>;
      posts = hydratePosts(postRows, viewerId);

      const repostRows = db
        .prepare(
          `SELECT p.*, u.username as author_username, u.full_name as author_name, u.avatar_url as author_avatar, u.is_verified as author_verified
           FROM reposts r
           JOIN posts p ON p.id = r.post_id
           JOIN profiles u ON u.id = p.author_id
           WHERE r.user_id = ? AND p.is_removed = 0
           ORDER BY r.created_at DESC LIMIT 40`
        )
        .all(targetId) as Array<Record<string, unknown>>;
      reposts = hydratePosts(repostRows, viewerId);

      highlights = db
        .prepare(
          `SELECT * FROM stories WHERE author_id = ? AND is_highlight = 1 ORDER BY created_at DESC`
        )
        .all(targetId);
    }

    res.json({
      profile: {
        ...profile,
        online: isUserOnline(targetId),
      },
      counts: {
        followers: followersCount,
        following: followingCount,
        posts: postsCount,
      },
      relation: {
        isOwn: viewerId === targetId,
        isFollowing,
        followRequested,
        isBlocked,
        isMuted,
        canView,
      },
      posts,
      reposts,
      highlights,
    });
  });

  // ========================
  // FOLLOW SYSTEM + BLOCK / MUTE
  // ========================
  router.post('/follow/:targetId', requireAuth, (req: AuthedRequest, res) => {
    const targetId = String(req.params.targetId);
    const me = req.user!.id;
    if (targetId === me) return res.status(400).json({ error: 'Cannot follow yourself' });

    const target = db.prepare(`SELECT id, is_private, account_status FROM profiles WHERE id = ?`).get(targetId) as
      | { id: string; is_private: number; account_status: string }
      | undefined;
    if (!target || target.account_status === 'banned') return res.status(404).json({ error: 'User not found' });

    const blocked = db
      .prepare(
        `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`
      )
      .get(me, targetId, targetId, me);
    if (blocked) return res.status(403).json({ error: 'Cannot follow blocked user' });

    const already = db
      .prepare(`SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?`)
      .get(me, targetId);
    if (already) return res.json({ status: 'following' });

    const ts = nowIso();
    if (target.is_private) {
      db.prepare(
        `INSERT OR REPLACE INTO follow_requests (id, requester_id, target_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', ?, ?)`
      ).run(uuid(), me, targetId, ts, ts);
      createNotification(targetId, me, 'follow_request', me, 'Requested to follow you');
      return res.json({ status: 'requested' });
    }

    db.prepare(`INSERT OR IGNORE INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)`).run(
      uuid(),
      me,
      targetId,
      ts
    );
    createNotification(targetId, me, 'follow', me, 'Started following you');
    res.json({ status: 'following' });
  });

  router.delete('/follow/:targetId', requireAuth, (req: AuthedRequest, res) => {
    const targetId = String(req.params.targetId);
    const me = req.user!.id;
    db.prepare(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`).run(me, targetId);
    db.prepare(`DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?`).run(me, targetId);
    res.json({ status: 'none' });
  });

  router.delete('/followers/:followerId', requireAuth, (req: AuthedRequest, res) => {
    db.prepare(`DELETE FROM follows WHERE follower_id = ? AND following_id = ?`).run(
      String(req.params.followerId),
      req.user!.id
    );
    res.json({ ok: true });
  });

  router.get('/follow-requests', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT fr.id, fr.requester_id, fr.created_at, p.username, p.full_name, p.avatar_url, p.is_verified
         FROM follow_requests fr JOIN profiles p ON p.id = fr.requester_id
         WHERE fr.target_id = ? AND fr.status = 'pending' ORDER BY fr.created_at DESC`
      )
      .all(req.user!.id);
    res.json({ requests: rows });
  });

  router.post('/follow-requests/:id/respond', requireAuth, (req: AuthedRequest, res) => {
    const action = req.body?.action === 'approve' ? 'approve' : 'reject';
    const row = db
      .prepare(`SELECT * FROM follow_requests WHERE id = ? AND target_id = ?`)
      .get(String(req.params.id), req.user!.id) as { id: string; requester_id: string } | undefined;
    if (!row) return res.status(404).json({ error: 'Request not found' });

    const ts = nowIso();
    if (action === 'approve') {
      db.prepare(`UPDATE follow_requests SET status = 'approved', updated_at = ? WHERE id = ?`).run(ts, row.id);
      db.prepare(`INSERT OR IGNORE INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)`).run(
        uuid(),
        row.requester_id,
        req.user!.id,
        ts
      );
      createNotification(row.requester_id, req.user!.id, 'follow', req.user!.id, 'Approved your follow request');
    } else {
      db.prepare(`UPDATE follow_requests SET status = 'rejected', updated_at = ? WHERE id = ?`).run(ts, row.id);
    }
    res.json({ ok: true });
  });

  router.get('/profiles/:username/connections', optionalAuth, (req: AuthedRequest, res) => {
    const username = String(req.params.username || '').toLowerCase();
    const type = req.query.type === 'following' ? 'following' : 'followers';
    const target = db.prepare(`SELECT id, is_private FROM profiles WHERE username = ?`).get(username) as
      | { id: string; is_private: number }
      | undefined;
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!canViewAuthor(req.user?.id || null, target.id, target.is_private)) {
      return res.status(403).json({ error: 'Private account' });
    }
    const rows =
      type === 'followers'
        ? db
            .prepare(
              `SELECT p.id, p.username, p.full_name, p.avatar_url, p.is_verified, p.bio
               FROM follows f JOIN profiles p ON p.id = f.follower_id WHERE f.following_id = ?`
            )
            .all(target.id)
        : db
            .prepare(
              `SELECT p.id, p.username, p.full_name, p.avatar_url, p.is_verified, p.bio
               FROM follows f JOIN profiles p ON p.id = f.following_id WHERE f.follower_id = ?`
            )
            .all(target.id);
    res.json({ users: rows });
  });

  router.post('/block/:targetId', requireAuth, (req: AuthedRequest, res) => {
    const targetId = String(req.params.targetId);
    if (targetId === req.user!.id) return res.status(400).json({ error: 'Cannot block yourself' });
    db.prepare(`INSERT OR IGNORE INTO blocks (id, blocker_id, blocked_id, created_at) VALUES (?, ?, ?, ?)`).run(
      uuid(),
      req.user!.id,
      targetId,
      nowIso()
    );
    db.prepare(`DELETE FROM follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)`).run(
      req.user!.id,
      targetId,
      targetId,
      req.user!.id
    );
    res.json({ blocked: true });
  });

  router.delete('/block/:targetId', requireAuth, (req: AuthedRequest, res) => {
    db.prepare(`DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?`).run(
      req.user!.id,
      String(req.params.targetId)
    );
    res.json({ blocked: false });
  });

  router.post('/mute/:targetId', requireAuth, (req: AuthedRequest, res) => {
    const targetId = String(req.params.targetId);
    if (targetId === req.user!.id) return res.status(400).json({ error: 'Cannot mute yourself' });
    db.prepare(`INSERT OR IGNORE INTO mutes (id, muter_id, muted_id, created_at) VALUES (?, ?, ?, ?)`).run(
      uuid(),
      req.user!.id,
      targetId,
      nowIso()
    );
    res.json({ muted: true });
  });

  router.delete('/mute/:targetId', requireAuth, (req: AuthedRequest, res) => {
    db.prepare(`DELETE FROM mutes WHERE muter_id = ? AND muted_id = ?`).run(req.user!.id, String(req.params.targetId));
    res.json({ muted: false });
  });

  router.get('/safety/lists', requireAuth, (req: AuthedRequest, res) => {
    const blocked = db
      .prepare(
        `SELECT p.id, p.username, p.full_name, p.avatar_url FROM blocks b JOIN profiles p ON p.id = b.blocked_id WHERE b.blocker_id = ?`
      )
      .all(req.user!.id);
    const muted = db
      .prepare(
        `SELECT p.id, p.username, p.full_name, p.avatar_url FROM mutes m JOIN profiles p ON p.id = m.muted_id WHERE m.muter_id = ?`
      )
      .all(req.user!.id);
    res.json({ blocked, muted });
  });

  // ========================
  // POSTS (HOME, ZX, SHORTS)
  // ========================
  router.get('/feeds/:kind', optionalAuth, (req: AuthedRequest, res) => {
    const kind = String(req.params.kind);
    const filter = String(req.query.filter || 'for_you');
    const viewerId = req.user?.id || null;

    if (!['home', 'zx', 'short'].includes(kind)) {
      return res.status(400).json({ error: 'Invalid feed kind' });
    }

    const baseRows = db
      .prepare(
        `SELECT p.*, u.username as author_username, u.full_name as author_name, u.avatar_url as author_avatar,
                u.is_verified as author_verified, u.is_private as author_private, u.account_status as author_status
         FROM posts p
         JOIN profiles u ON u.id = p.author_id
         WHERE p.post_type = ? AND p.is_removed = 0 AND p.parent_post_id IS NULL AND u.account_status = 'active'
         ORDER BY p.created_at DESC LIMIT 80`
      )
      .all(kind) as Array<Record<string, unknown>>;

    const mutedIds = new Set(
      viewerId
        ? (
            db.prepare(`SELECT muted_id FROM mutes WHERE muter_id = ?`).all(viewerId) as Array<{ muted_id: string }>
          ).map((r) => r.muted_id)
        : []
    );
    const followingIds = new Set(
      viewerId
        ? (
            db.prepare(`SELECT following_id FROM follows WHERE follower_id = ?`).all(viewerId) as Array<{
              following_id: string;
            }>
          ).map((r) => r.following_id)
        : []
    );

    let visible = baseRows.filter((row) => {
      const aid = String(row.author_id);
      if (mutedIds.has(aid)) return false;
      if (!canViewAuthor(viewerId, aid, Number(row.author_private))) return false;
      if (filter === 'following') {
        return viewerId ? followingIds.has(aid) || aid === viewerId : false;
      }
      return true;
    });

    let hydrated = hydratePosts(visible, viewerId);

    if (filter === 'trending') {
      hydrated = [...hydrated].sort((a, b) => {
        const scoreA = a.counts.likes * 2 + a.counts.comments * 3 + a.counts.reposts * 3 + a.counts.views * 0.2;
        const scoreB = b.counts.likes * 2 + b.counts.comments * 3 + b.counts.reposts * 3 + b.counts.views * 0.2;
        return scoreB - scoreA;
      });
    }

    res.json({ posts: hydrated });
  });

  router.get('/bookmarks', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT p.*, u.username as author_username, u.full_name as author_name, u.avatar_url as author_avatar, u.is_verified as author_verified
         FROM bookmarks b
         JOIN posts p ON p.id = b.post_id
         JOIN profiles u ON u.id = p.author_id
         WHERE b.user_id = ? AND p.is_removed = 0
         ORDER BY b.created_at DESC`
      )
      .all(req.user!.id) as Array<Record<string, unknown>>;
    res.json({ posts: hydratePosts(rows, req.user!.id) });
  });

  router.post('/posts', requireAuth, rateLimit(30, 60_000), (req: AuthedRequest, res) => {
    const { postType, content, media, poll, quotePostId, threadParts, videoMeta } = req.body || {};
    if (!['home', 'zx', 'short'].includes(postType)) {
      return res.status(400).json({ error: 'Invalid post type' });
    }

    const parts: Array<{ content: string; media?: Array<{ mediaType: string; url: string; storagePath: string }> }> =
      Array.isArray(threadParts) && threadParts.length > 0
        ? threadParts
        : [{ content: String(content || ''), media: Array.isArray(media) ? media : [] }];

    const firstPart = parts[0];
    if (!firstPart.content.trim() && (!firstPart.media || firstPart.media.length === 0) && !poll) {
      return res.status(400).json({ error: 'Post cannot be empty' });
    }
    if (postType === 'short' && (!firstPart.media || !firstPart.media.some((m) => m.mediaType === 'video'))) {
      return res.status(400).json({ error: 'Shorts require a video attachment' });
    }

    const serializedVideoMeta =
      typeof videoMeta === 'string'
        ? videoMeta.slice(0, 4000)
        : videoMeta
          ? JSON.stringify(videoMeta).slice(0, 4000)
          : '';

    const createdIds: string[] = [];
    let rootId: string | null = null;
    let prevId: string | null = null;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const pid = uuid();
      const ts = nowIso();
      if (i === 0) rootId = pid;

      db.prepare(
        `INSERT INTO posts (id, author_id, post_type, content, parent_post_id, thread_root_id, quote_post_id, video_meta, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        pid,
        req.user!.id,
        postType,
        String(part.content || '').trim().slice(0, 5000),
        prevId,
        i > 0 ? rootId : null,
        i === 0 && quotePostId ? String(quotePostId) : null,
        i === 0 ? serializedVideoMeta : '',
        ts,
        ts
      );

      if (Array.isArray(part.media)) {
        part.media.forEach((m, idx) => {
          db.prepare(
            `INSERT INTO post_media (id, post_id, media_type, url, storage_path, sort_order, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(uuid(), pid, m.mediaType === 'video' ? 'video' : 'image', String(m.url), String(m.storagePath || ''), idx, ts);
        });
      }

      if (i === 0 && poll && Array.isArray(poll.options) && poll.options.length >= 2) {
        const cleanOptions = poll.options.map((o: unknown) => String(o).trim()).filter(Boolean).slice(0, 4);
        if (cleanOptions.length >= 2) {
          db.prepare(
            `INSERT INTO polls (id, post_id, question, options, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(
            uuid(),
            pid,
            String(poll.question || part.content || 'Poll').slice(0, 280),
            JSON.stringify(cleanOptions),
            new Date(Date.now() + 24 * 3600_000).toISOString(),
            ts
          );
        }
      }

      processHashtagsAndMentions(pid, String(part.content || ''), req.user!.id);
      createdIds.push(pid);
      prevId = pid;
    }

    const row = db
      .prepare(
        `SELECT p.*, u.username as author_username, u.full_name as author_name, u.avatar_url as author_avatar, u.is_verified as author_verified
         FROM posts p JOIN profiles u ON u.id = p.author_id WHERE p.id = ?`
      )
      .get(createdIds[0]) as Record<string, unknown>;

    res.status(201).json({ post: hydratePosts([row], req.user!.id)[0], threadIds: createdIds });
  });

  router.patch('/posts/:postId', requireAuth, (req: AuthedRequest, res) => {
    const postId = String(req.params.postId);
    const existing = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(postId) as
      | { id: string; author_id: string }
      | undefined;
    if (!existing) return res.status(404).json({ error: 'Post not found' });
    if (existing.author_id !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });

    const newContent = String(req.body?.content || '').trim().slice(0, 5000);
    db.prepare(`UPDATE posts SET content = ?, updated_at = ? WHERE id = ?`).run(newContent, nowIso(), postId);
    res.json({ ok: true, content: newContent });
  });

  router.delete('/posts/:postId', requireAuth, (req: AuthedRequest, res) => {
    const postId = String(req.params.postId);
    const existing = db.prepare(`SELECT * FROM posts WHERE id = ?`).get(postId) as
      | { id: string; author_id: string }
      | undefined;
    if (!existing) return res.status(404).json({ error: 'Post not found' });
    if (existing.author_id !== req.user!.id && !req.user!.role) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const mediaRows = db.prepare(`SELECT storage_path FROM post_media WHERE post_id = ?`).all(postId) as Array<{
      storage_path: string;
    }>;
    for (const m of mediaRows) {
      removeStoredFile(m.storage_path);
    }
    db.prepare(`DELETE FROM posts WHERE id = ?`).run(postId);
    res.json({ ok: true });
  });

  router.post('/posts/:postId/view', optionalAuth, (req: AuthedRequest, res) => {
    const postId = String(req.params.postId);
    const exists = db.prepare(`SELECT 1 FROM posts WHERE id = ? AND is_removed = 0`).get(postId);
    if (!exists) return res.status(404).json({ error: 'Post not found' });
    db.prepare(`INSERT INTO post_views (id, post_id, viewer_id, created_at) VALUES (?, ?, ?, ?)`).run(
      uuid(),
      postId,
      req.user?.id || null,
      nowIso()
    );
    res.json({ ok: true });
  });

  router.post('/posts/:postId/like', requireAuth, (req: AuthedRequest, res) => {
    const postId = String(req.params.postId);
    const post = db.prepare(`SELECT author_id, content FROM posts WHERE id = ? AND is_removed = 0`).get(postId) as
      | { author_id: string; content: string }
      | undefined;
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const existing = db
      .prepare(`SELECT id FROM likes WHERE user_id = ? AND post_id = ?`)
      .get(req.user!.id, postId) as { id: string } | undefined;
    if (existing) {
      db.prepare(`DELETE FROM likes WHERE id = ?`).run(existing.id);
      return res.json({ liked: false });
    }
    db.prepare(`INSERT INTO likes (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)`).run(
      uuid(),
      req.user!.id,
      postId,
      nowIso()
    );
    createNotification(post.author_id, req.user!.id, 'like', postId, post.content || 'Liked your post');
    res.json({ liked: true });
  });

  router.post('/posts/:postId/repost', requireAuth, (req: AuthedRequest, res) => {
    const postId = String(req.params.postId);
    const post = db.prepare(`SELECT author_id, content FROM posts WHERE id = ? AND is_removed = 0`).get(postId) as
      | { author_id: string; content: string }
      | undefined;
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const existing = db
      .prepare(`SELECT id FROM reposts WHERE user_id = ? AND post_id = ?`)
      .get(req.user!.id, postId) as { id: string } | undefined;
    if (existing) {
      db.prepare(`DELETE FROM reposts WHERE id = ?`).run(existing.id);
      return res.json({ reposted: false });
    }
    db.prepare(`INSERT INTO reposts (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)`).run(
      uuid(),
      req.user!.id,
      postId,
      nowIso()
    );
    createNotification(post.author_id, req.user!.id, 'repost', postId, post.content || 'Reposted your post');
    res.json({ reposted: true });
  });

  router.post('/posts/:postId/bookmark', requireAuth, (req: AuthedRequest, res) => {
    const postId = String(req.params.postId);
    const existing = db
      .prepare(`SELECT id FROM bookmarks WHERE user_id = ? AND post_id = ?`)
      .get(req.user!.id, postId) as { id: string } | undefined;
    if (existing) {
      db.prepare(`DELETE FROM bookmarks WHERE id = ?`).run(existing.id);
      return res.json({ bookmarked: false });
    }
    db.prepare(`INSERT INTO bookmarks (id, user_id, post_id, created_at) VALUES (?, ?, ?, ?)`).run(
      uuid(),
      req.user!.id,
      postId,
      nowIso()
    );
    res.json({ bookmarked: true });
  });

  router.post('/polls/:pollId/vote', requireAuth, (req: AuthedRequest, res) => {
    const pollId = String(req.params.pollId);
    const optionIndex = Number(req.body?.optionIndex);
    const poll = db.prepare(`SELECT options, expires_at FROM polls WHERE id = ?`).get(pollId) as
      | { options: string; expires_at: string }
      | undefined;
    if (!poll) return res.status(404).json({ error: 'Poll not found' });
    const optionsArr = JSON.parse(poll.options) as string[];
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= optionsArr.length) {
      return res.status(400).json({ error: 'Invalid option' });
    }
    db.prepare(
      `INSERT OR REPLACE INTO poll_votes (id, poll_id, user_id, option_index, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(uuid(), pollId, req.user!.id, optionIndex, nowIso());

    const counts = optionsArr.map(
      (_, idx) =>
        (
          db
            .prepare(`SELECT COUNT(*) as c FROM poll_votes WHERE poll_id = ? AND option_index = ?`)
            .get(pollId, idx) as { c: number }
        ).c
    );
    res.json({
      options: optionsArr.map((label, idx) => ({ label, votes: counts[idx] })),
      totalVotes: counts.reduce((a, b) => a + b, 0),
      myVote: optionIndex,
    });
  });

  // Comments & Replies
  router.get('/posts/:postId/comments', optionalAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT c.*, u.username as author_username, u.full_name as author_name, u.avatar_url as author_avatar, u.is_verified as author_verified
         FROM comments c JOIN profiles u ON u.id = c.author_id
         WHERE c.post_id = ? AND c.is_removed = 0
         ORDER BY c.created_at ASC`
      )
      .all(String(req.params.postId));
    res.json({ comments: rows });
  });

  router.post('/posts/:postId/comments', requireAuth, (req: AuthedRequest, res) => {
    const postId = String(req.params.postId);
    const content = String(req.body?.content || '').trim();
    const parentCommentId = req.body?.parentCommentId ? String(req.body.parentCommentId) : null;
    if (!content) return res.status(400).json({ error: 'Comment text is required' });

    const post = db.prepare(`SELECT author_id FROM posts WHERE id = ? AND is_removed = 0`).get(postId) as
      | { author_id: string }
      | undefined;
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const id = uuid();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO comments (id, post_id, author_id, parent_comment_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, postId, req.user!.id, parentCommentId, content.slice(0, 1500), ts);

    createNotification(post.author_id, req.user!.id, parentCommentId ? 'reply' : 'comment', postId, content);

    const row = db
      .prepare(
        `SELECT c.*, u.username as author_username, u.full_name as author_name, u.avatar_url as author_avatar, u.is_verified as author_verified
         FROM comments c JOIN profiles u ON u.id = c.author_id WHERE c.id = ?`
      )
      .get(id);
    res.status(201).json({ comment: row });
  });

  // ========================
  // STORIES (24H EXPIRATION & HIGHLIGHTS)
  // ========================
  router.get('/stories', optionalAuth, (req: AuthedRequest, res) => {
    const viewerId = req.user?.id || null;
    const now = nowIso();
    const rows = db
      .prepare(
        `SELECT s.*, u.username as author_username, u.full_name as author_name, u.avatar_url as author_avatar, u.is_verified as author_verified, u.is_private as author_private
         FROM stories s JOIN profiles u ON u.id = s.author_id
         WHERE s.expires_at > ? AND u.account_status = 'active'
         ORDER BY s.created_at DESC`
      )
      .all(now) as Array<Record<string, unknown>>;

    const followingIds = new Set(
      viewerId
        ? (
            db.prepare(`SELECT following_id FROM follows WHERE follower_id = ?`).all(viewerId) as Array<{
              following_id: string;
            }>
          ).map((r) => r.following_id)
        : []
    );

    const visible = rows.filter((s) => {
      const aid = String(s.author_id);
      if (viewerId && aid === viewerId) return true;
      if (viewerId && followingIds.has(aid)) return true;
      return !Number(s.author_private) && !viewerId ? true : false;
    });

    const enriched = visible.map((s) => {
      const sid = String(s.id);
      const viewsCount = (
        db.prepare(`SELECT COUNT(*) as c FROM story_views WHERE story_id = ?`).get(sid) as { c: number }
      ).c;
      const viewedByMe = viewerId
        ? Boolean(db.prepare(`SELECT 1 FROM story_views WHERE story_id = ? AND viewer_id = ?`).get(sid, viewerId))
        : false;
      const viewers =
        viewerId && String(s.author_id) === viewerId
          ? db
              .prepare(
                `SELECT p.id, p.username, p.full_name, p.avatar_url, sv.viewed_at
                 FROM story_views sv JOIN profiles p ON p.id = sv.viewer_id
                 WHERE sv.story_id = ? ORDER BY sv.viewed_at DESC`
              )
              .all(sid)
          : [];
      return { ...s, viewsCount, viewedByMe, viewers };
    });

    res.json({ stories: enriched });
  });

  router.post('/stories', requireAuth, (req: AuthedRequest, res) => {
    const { storyType, mediaUrl, storagePath, textContent, backgroundStyle, overlayData } = req.body || {};
    if (!['image', 'video', 'text'].includes(storyType)) {
      return res.status(400).json({ error: 'Invalid story type' });
    }
    if (storyType === 'text' && !String(textContent || '').trim()) {
      return res.status(400).json({ error: 'Text story requires content' });
    }
    if ((storyType === 'image' || storyType === 'video') && !mediaUrl) {
      return res.status(400).json({ error: 'Media story requires an uploaded file' });
    }
    const id = uuid();
    const ts = nowIso();
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    const serializedOverlay =
      typeof overlayData === 'string'
        ? overlayData.slice(0, 4000)
        : overlayData
          ? JSON.stringify(overlayData).slice(0, 4000)
          : '';
    db.prepare(
      `INSERT INTO stories (id, author_id, story_type, media_url, storage_path, text_content, background_style, overlay_data, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      req.user!.id,
      storyType,
      String(mediaUrl || ''),
      String(storagePath || ''),
      String(textContent || '').slice(0, 500),
      String(backgroundStyle || 'linear-gradient(135deg, #792BFF 0%, #FF28B9 100%)'),
      serializedOverlay,
      expiresAt,
      ts
    );
    res.status(201).json({ id });
  });

  router.post('/stories/:storyId/view', requireAuth, (req: AuthedRequest, res) => {
    db.prepare(`INSERT OR IGNORE INTO story_views (id, story_id, viewer_id, viewed_at) VALUES (?, ?, ?, ?)`).run(
      uuid(),
      String(req.params.storyId),
      req.user!.id,
      nowIso()
    );
    res.json({ ok: true });
  });

  router.post('/stories/:storyId/react', requireAuth, (req: AuthedRequest, res) => {
    const storyId = String(req.params.storyId);
    const reaction = String(req.body?.reaction || '❤️').slice(0, 16);
    const replyText = String(req.body?.replyText || '').trim().slice(0, 300);

    const story = db.prepare(`SELECT author_id FROM stories WHERE id = ?`).get(storyId) as
      | { author_id: string }
      | undefined;
    if (!story) return res.status(404).json({ error: 'Story not found' });

    db.prepare(
      `INSERT INTO story_reactions (id, story_id, user_id, reaction, reply_text, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuid(), storyId, req.user!.id, reaction, replyText, nowIso());

    createNotification(
      story.author_id,
      req.user!.id,
      'story_reaction',
      storyId,
      replyText ? `${reaction} ${replyText}` : `Reacted ${reaction} to your story`
    );
    res.json({ ok: true });
  });

  router.post('/stories/:storyId/highlight', requireAuth, (req: AuthedRequest, res) => {
    const storyId = String(req.params.storyId);
    const title = String(req.body?.title || 'Highlights').slice(0, 40);
    const story = db.prepare(`SELECT author_id, is_highlight FROM stories WHERE id = ?`).get(storyId) as
      | { author_id: string; is_highlight: number }
      | undefined;
    if (!story || story.author_id !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });
    const next = story.is_highlight ? 0 : 1;
    db.prepare(`UPDATE stories SET is_highlight = ?, highlight_title = ? WHERE id = ?`).run(next, title, storyId);
    res.json({ isHighlight: Boolean(next) });
  });

  router.delete('/stories/:storyId', requireAuth, (req: AuthedRequest, res) => {
    const storyId = String(req.params.storyId);
    const story = db.prepare(`SELECT author_id, storage_path FROM stories WHERE id = ?`).get(storyId) as
      | { author_id: string; storage_path: string }
      | undefined;
    if (!story || (story.author_id !== req.user!.id && !req.user!.role)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    removeStoredFile(story.storage_path);
    db.prepare(`DELETE FROM stories WHERE id = ?`).run(storyId);
    res.json({ ok: true });
  });

  // ========================
  // SEARCH & EXPLORE (ZERO FABRICATED DATA)
  // ========================
  router.get('/explore', optionalAuth, (req: AuthedRequest, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const viewerId = req.user?.id || null;

    const users = q
      ? db
          .prepare(
            `SELECT id, username, full_name, bio, avatar_url, is_verified, is_private
             FROM profiles
             WHERE account_status = 'active' AND (LOWER(username) LIKE ? OR LOWER(full_name) LIKE ?)
             ORDER BY created_at DESC LIMIT 20`
          )
          .all(`%${q}%`, `%${q}%`)
      : db
          .prepare(
            `SELECT id, username, full_name, bio, avatar_url, is_verified, is_private
             FROM profiles
             WHERE account_status = 'active' AND is_private = 0
             ORDER BY created_at DESC LIMIT 12`
          )
          .all();

    const postRows = (
      q
        ? db
            .prepare(
              `SELECT p.*, u.username as author_username, u.full_name as author_name, u.avatar_url as author_avatar, u.is_verified as author_verified, u.is_private as author_private
               FROM posts p JOIN profiles u ON u.id = p.author_id
               WHERE p.is_removed = 0 AND u.account_status = 'active' AND LOWER(p.content) LIKE ?
               ORDER BY p.created_at DESC LIMIT 30`
            )
            .all(`%${q}%`)
        : db
            .prepare(
              `SELECT p.*, u.username as author_username, u.full_name as author_name, u.avatar_url as author_avatar, u.is_verified as author_verified, u.is_private as author_private
               FROM posts p JOIN profiles u ON u.id = p.author_id
               WHERE p.is_removed = 0 AND u.account_status = 'active' AND u.is_private = 0
               ORDER BY p.created_at DESC LIMIT 20`
            )
            .all()
    ) as Array<Record<string, unknown>>;

    const visiblePosts = hydratePosts(
      postRows.filter((p) => canViewAuthor(viewerId, String(p.author_id), Number(p.author_private))),
      viewerId
    );

    const hashtags = db
      .prepare(
        `SELECT h.tag, COUNT(ph.post_id) as post_count
         FROM hashtags h
         JOIN post_hashtags ph ON ph.hashtag_id = h.id
         JOIN posts p ON p.id = ph.post_id
         WHERE h.is_blocked = 0 AND p.is_removed = 0 AND (? = '' OR LOWER(h.tag) LIKE ?)
         GROUP BY h.id
         ORDER BY post_count DESC LIMIT 12`
      )
      .all(q, `%${q}%`);

    res.json({
      users,
      posts: visiblePosts,
      videos: visiblePosts.filter((p) => p.post_type === 'short' || p.media.some((m: any) => m.media_type === 'video')),
      hashtags,
    });
  });

  // ========================
  // MESSAGING (REAL-TIME PARTICIPANT-ISOLATED)
  // ========================
  router.get('/messages/conversations', requireAuth, (req: AuthedRequest, res) => {
    const me = req.user!.id;
    const rows = db
      .prepare(
        `SELECT c.*, cm.is_request, cm.last_read_at
         FROM conversation_members cm
         JOIN conversations c ON c.id = cm.conversation_id
         WHERE cm.user_id = ?
         ORDER BY c.updated_at DESC`
      )
      .all(me) as Array<Record<string, unknown>>;

    const enriched = rows.map((c) => {
      const cid = String(c.id);
      const members = db
        .prepare(
          `SELECT p.id, p.username, p.full_name, p.avatar_url, p.is_verified
           FROM conversation_members cm JOIN profiles p ON p.id = cm.user_id
           WHERE cm.conversation_id = ?`
        )
        .all(cid) as Array<Record<string, unknown>>;
      const lastMessage = db
        .prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(cid);
      const unreadCount = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM messages WHERE conversation_id = ? AND sender_id <> ? AND created_at > COALESCE(?, '')`
          )
          .get(cid, me, c.last_read_at ? String(c.last_read_at) : '') as { c: number }
      ).c;

      return {
        ...c,
        members: members.map((m) => ({ ...m, online: isUserOnline(String(m.id)) })),
        lastMessage,
        unreadCount,
      };
    });

    res.json({ conversations: enriched });
  });

  router.post('/messages/conversations', requireAuth, (req: AuthedRequest, res) => {
    const me = req.user!.id;
    const { participantIds, isGroup, title } = req.body || {};
    const ids = Array.from(new Set((Array.isArray(participantIds) ? participantIds : []).map(String))).filter(
      (id) => id && id !== me
    );
    if (ids.length === 0) return res.status(400).json({ error: 'Select at least one recipient' });

    // Check blocks
    for (const pid of ids) {
      const blocked = db
        .prepare(
          `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`
        )
        .get(me, pid, pid, me);
      if (blocked) return res.status(403).json({ error: 'Cannot message blocked user' });
    }

    // Reuse existing 1:1 conversation if present
    if (!isGroup && ids.length === 1) {
      const existing = db
        .prepare(
          `SELECT c.id FROM conversations c
           JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
           JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
           WHERE c.is_group = 0 LIMIT 1`
        )
        .get(me, ids[0]) as { id: string } | undefined;
      if (existing) {
        return res.json({ conversationId: existing.id });
      }
    }

    const cid = uuid();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO conversations (id, is_group, title, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(cid, isGroup ? 1 : 0, String(title || '').slice(0, 80), me, ts, ts);

    db.prepare(
      `INSERT INTO conversation_members (id, conversation_id, user_id, is_request, last_read_at, joined_at)
       VALUES (?, ?, ?, 0, ?, ?)`
    ).run(uuid(), cid, me, ts, ts);

    for (const pid of ids) {
      const followsSender = db
        .prepare(`SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?`)
        .get(pid, me);
      db.prepare(
        `INSERT INTO conversation_members (id, conversation_id, user_id, is_request, joined_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(uuid(), cid, pid, followsSender ? 0 : 1, ts);
    }

    res.status(201).json({ conversationId: cid });
  });

  router.get('/messages/conversations/:id', requireAuth, (req: AuthedRequest, res) => {
    const cid = String(req.params.id);
    const me = req.user!.id;
    const membership = db
      .prepare(`SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?`)
      .get(cid, me);
    if (!membership) return res.status(403).json({ error: 'Not a participant of this conversation' });

    const messages = db
      .prepare(
        `SELECT m.*, p.username as sender_username, p.full_name as sender_name, p.avatar_url as sender_avatar
         FROM messages m JOIN profiles p ON p.id = m.sender_id
         WHERE m.conversation_id = ? ORDER BY m.created_at ASC`
      )
      .all(cid);

    const readAt = nowIso();
    db.prepare(
      `UPDATE conversation_members SET last_read_at = ?, is_request = 0 WHERE conversation_id = ? AND user_id = ?`
    ).run(readAt, cid, me);

    emitToConversation(cid, 'message:read', { conversationId: cid, userId: me, readAt }, me);

    res.json({ messages });
  });

  router.post('/messages/conversations/:id', requireAuth, (req: AuthedRequest, res) => {
    const cid = String(req.params.id);
    const me = req.user!.id;
    const membership = db
      .prepare(`SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?`)
      .get(cid, me);
    if (!membership) return res.status(403).json({ error: 'Not a participant of this conversation' });

    const content = String(req.body?.content || '').trim().slice(0, 4000);
    const attachmentUrl = String(req.body?.attachmentUrl || '');
    const attachmentType = req.body?.attachmentType === 'video' ? 'video' : req.body?.attachmentType === 'image' ? 'image' : '';
    const storagePath = String(req.body?.storagePath || '');

    if (!content && !attachmentUrl) {
      return res.status(400).json({ error: 'Message content or attachment required' });
    }

    const mid = uuid();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_id, content, attachment_url, attachment_type, storage_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(mid, cid, me, content, attachmentUrl, attachmentType, storagePath, ts);

    db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(ts, cid);
    db.prepare(`UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?`).run(ts, cid, me);

    const msgRow = db
      .prepare(
        `SELECT m.*, p.username as sender_username, p.full_name as sender_name, p.avatar_url as sender_avatar
         FROM messages m JOIN profiles p ON p.id = m.sender_id WHERE m.id = ?`
      )
      .get(mid);

    emitToConversation(cid, 'message:new', msgRow);

    const otherMembers = db
      .prepare(`SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id <> ?`)
      .all(cid, me) as Array<{ user_id: string }>;
    for (const m of otherMembers) {
      createNotification(m.user_id, me, 'message', cid, content || 'Sent an attachment');
    }

    res.status(201).json({ message: msgRow });
  });

  router.delete('/messages/conversations/:id', requireAuth, (req: AuthedRequest, res) => {
    const cid = String(req.params.id);
    const me = req.user!.id;
    db.prepare(`DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?`).run(cid, me);
    const remaining = (
      db.prepare(`SELECT COUNT(*) as c FROM conversation_members WHERE conversation_id = ?`).get(cid) as { c: number }
    ).c;
    if (remaining === 0) {
      const files = db.prepare(`SELECT storage_path FROM messages WHERE conversation_id = ?`).all(cid) as Array<{
        storage_path: string;
      }>;
      for (const f of files) removeStoredFile(f.storage_path);
      db.prepare(`DELETE FROM conversations WHERE id = ?`).run(cid);
    }
    res.json({ ok: true });
  });

  // ========================
  // NOTIFICATIONS
  // ========================
  router.get('/notifications', requireAuth, (req: AuthedRequest, res) => {
    const rows = db
      .prepare(
        `SELECT n.*, p.username as actor_username, p.full_name as actor_name, p.avatar_url as actor_avatar, p.is_verified as actor_verified
         FROM notifications n JOIN profiles p ON p.id = n.actor_id
         WHERE n.recipient_id = ?
         ORDER BY n.created_at DESC LIMIT 80`
      )
      .all(req.user!.id);
    const unread = (
      db
        .prepare(`SELECT COUNT(*) as c FROM notifications WHERE recipient_id = ? AND is_read = 0`)
        .get(req.user!.id) as { c: number }
    ).c;
    res.json({ notifications: rows, unreadCount: unread });
  });

  router.post('/notifications/read', requireAuth, (req: AuthedRequest, res) => {
    const id = req.body?.id ? String(req.body.id) : null;
    if (id) {
      db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?`).run(id, req.user!.id);
    } else {
      db.prepare(`UPDATE notifications SET is_read = 1 WHERE recipient_id = ?`).run(req.user!.id);
    }
    res.json({ ok: true });
  });

  // ========================
  // REPORTS & VERIFICATION REQUESTS
  // ========================
  router.post('/reports', requireAuth, (req: AuthedRequest, res) => {
    const { targetType, targetId, reason } = req.body || {};
    if (!['user', 'post', 'comment', 'message'].includes(targetType) || !targetId || !String(reason || '').trim()) {
      return res.status(400).json({ error: 'Valid target and reason are required' });
    }
    const ts = nowIso();
    db.prepare(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
    ).run(uuid(), req.user!.id, targetType, String(targetId), String(reason).trim().slice(0, 500), ts, ts);
    res.status(201).json({ ok: true });
  });

  router.post('/verification-requests', requireAuth, (req: AuthedRequest, res) => {
    const { category, notes } = req.body || {};
    if (!String(category || '').trim()) {
      return res.status(400).json({ error: 'Category is required' });
    }
    const ts = nowIso();
    db.prepare(
      `INSERT INTO verification_requests (id, user_id, category, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    ).run(uuid(), req.user!.id, String(category).slice(0, 60), String(notes || '').slice(0, 500), ts, ts);
    res.status(201).json({ ok: true });
  });

  // ========================
  // CREATOR STUDIO ANALYTICS (100% REAL DB STATS)
  // ========================
  router.get('/creator/analytics', requireAuth, (req: AuthedRequest, res) => {
    const me = req.user!.id;
    const range = String(req.query.range || '30d');
    const days = range === '7d' ? 7 : range === 'all' ? 3650 : 30;
    const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();

    const followers = (
      db.prepare(`SELECT COUNT(*) as c FROM follows WHERE following_id = ?`).get(me) as { c: number }
    ).c;
    const followerGrowth = (
      db.prepare(`SELECT COUNT(*) as c FROM follows WHERE following_id = ? AND created_at >= ?`).get(me, since) as {
        c: number;
      }
    ).c;
    const totalPosts = (
      db
        .prepare(`SELECT COUNT(*) as c FROM posts WHERE author_id = ? AND is_removed = 0 AND created_at >= ?`)
        .get(me, since) as { c: number }
    ).c;
    const postViews = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM post_views pv JOIN posts p ON p.id = pv.post_id
           WHERE p.author_id = ? AND pv.created_at >= ?`
        )
        .get(me, since) as { c: number }
    ).c;
    const videoViews = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM post_views pv JOIN posts p ON p.id = pv.post_id
           WHERE p.author_id = ? AND p.post_type = 'short' AND pv.created_at >= ?`
        )
        .get(me, since) as { c: number }
    ).c;
    const likes = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM likes l JOIN posts p ON p.id = l.post_id
           WHERE p.author_id = ? AND l.created_at >= ?`
        )
        .get(me, since) as { c: number }
    ).c;
    const comments = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM comments c JOIN posts p ON p.id = c.post_id
           WHERE p.author_id = ? AND c.is_removed = 0 AND c.created_at >= ?`
        )
        .get(me, since) as { c: number }
    ).c;
    const shares = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM reposts r JOIN posts p ON p.id = r.post_id
           WHERE p.author_id = ? AND r.created_at >= ?`
        )
        .get(me, since) as { c: number }
    ).c;

    const topPostsRaw = db
      .prepare(
        `SELECT p.*, u.username as author_username, u.full_name as author_name, u.avatar_url as author_avatar, u.is_verified as author_verified
         FROM posts p JOIN profiles u ON u.id = p.author_id
         WHERE p.author_id = ? AND p.is_removed = 0
         ORDER BY p.created_at DESC LIMIT 20`
      )
      .all(me) as Array<Record<string, unknown>>;

    const topPosts = hydratePosts(topPostsRaw, me)
      .sort((a, b) => b.counts.likes + b.counts.views - (a.counts.likes + a.counts.views))
      .slice(0, 5);

    // Daily breakdown for last 7 days
    const dailySeries: Array<{ date: string; views: number; engagement: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      dayStart.setUTCDate(dayStart.getUTCDate() - i);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const dStr = dayStart.toISOString().slice(0, 10);

      const v = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM post_views pv JOIN posts p ON p.id = pv.post_id
             WHERE p.author_id = ? AND pv.created_at >= ? AND pv.created_at < ?`
          )
          .get(me, dayStart.toISOString(), dayEnd.toISOString()) as { c: number }
      ).c;

      const l = (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM likes l JOIN posts p ON p.id = l.post_id
             WHERE p.author_id = ? AND l.created_at >= ? AND l.created_at < ?`
          )
          .get(me, dayStart.toISOString(), dayEnd.toISOString()) as { c: number }
      ).c;

      dailySeries.push({ date: dStr, views: v, engagement: l });
    }

    res.json({
      stats: {
        followers,
        followerGrowth,
        totalPosts,
        postViews,
        videoViews,
        likes,
        comments,
        shares,
        engagementTotal: likes + comments + shares,
      },
      dailySeries,
      topPosts,
    });
  });

  // ========================
  // ADMIN BOOTSTRAP & CONTROL PANEL
  // ========================
  router.get('/admin/bootstrap-status', optionalAuth, (req: AuthedRequest, res) => {
    const adminCount = (db.prepare(`SELECT COUNT(*) as c FROM admin_roles`).get() as { c: number }).c;
    const hasEnvSecret = Boolean(process.env.ADMIN_BOOTSTRAP_SECRET && process.env.ADMIN_BOOTSTRAP_SECRET.trim());
    res.json({
      claimed: adminCount > 0,
      hasEnvSecret,
      isAdmin: Boolean(req.user?.role),
      role: req.user?.role || null,
    });
  });

  router.post('/admin/claim-owner', requireAuth, (req: AuthedRequest, res) => {
    const adminCount = (db.prepare(`SELECT COUNT(*) as c FROM admin_roles`).get() as { c: number }).c;
    const envSecret = (process.env.ADMIN_BOOTSTRAP_SECRET || '').trim();
    const providedSecret = String(req.body?.secret || '').trim();

    if (envSecret) {
      if (!providedSecret || providedSecret !== envSecret) {
        return res.status(403).json({ error: 'Invalid server bootstrap secret.' });
      }
    } else if (adminCount > 0) {
      return res.status(403).json({ error: 'Owner admin has already been claimed.' });
    } else if (providedSecret.length < 8) {
      return res.status(400).json({ error: 'Choose an admin setup passcode of at least 8 characters.' });
    }

    const ts = nowIso();
    db.prepare(`INSERT OR REPLACE INTO admin_roles (id, user_id, role, granted_by, created_at) VALUES (?, ?, 'owner', ?, ?)`).run(
      uuid(),
      req.user!.id,
      req.user!.id,
      ts
    );

    if (!envSecret && providedSecret) {
      db.prepare(
        `INSERT OR REPLACE INTO admin_bootstrap (id, owner_user_id, passcode_hash, claimed_at) VALUES (1, ?, ?, ?)`
      ).run(req.user!.id, hashPassword(providedSecret), ts);
    }

    db.prepare(
      `INSERT INTO moderation_logs (id, admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, ?, 'claim_owner', 'admin_roles', ?, 'First-owner admin bootstrapped', ?)`
    ).run(uuid(), req.user!.id, req.user!.id, ts);

    res.json({ ok: true, role: 'owner' });
  });

  router.get('/admin/overview', requireAdmin, (_req: AuthedRequest, res) => {
    const activeCutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    const stats = {
      totalUsers: (db.prepare(`SELECT COUNT(*) as c FROM profiles`).get() as { c: number }).c,
      activeUsers: (
        db.prepare(`SELECT COUNT(*) as c FROM profiles WHERE last_active_at >= ?`).get(activeCutoff) as { c: number }
      ).c,
      totalPosts: (db.prepare(`SELECT COUNT(*) as c FROM posts WHERE is_removed = 0`).get() as { c: number }).c,
      totalVideos: (
        db.prepare(`SELECT COUNT(*) as c FROM posts WHERE post_type = 'short' AND is_removed = 0`).get() as {
          c: number;
        }
      ).c,
      totalStories: (db.prepare(`SELECT COUNT(*) as c FROM stories`).get() as { c: number }).c,
      totalMessages: (db.prepare(`SELECT COUNT(*) as c FROM messages`).get() as { c: number }).c,
      totalReports: (db.prepare(`SELECT COUNT(*) as c FROM reports WHERE status = 'open'`).get() as { c: number }).c,
    };

    const users = db
      .prepare(
        `SELECT p.id, p.username, p.full_name, p.email, p.is_verified, p.is_private, p.account_status, p.created_at, ar.role
         FROM profiles p LEFT JOIN admin_roles ar ON ar.user_id = p.id
         ORDER BY p.created_at DESC LIMIT 100`
      )
      .all();

    const reports = db
      .prepare(
        `SELECT r.*, u.username as reporter_username
         FROM reports r JOIN profiles u ON u.id = r.reporter_id
         ORDER BY r.created_at DESC LIMIT 100`
      )
      .all();

    const verifications = db
      .prepare(
        `SELECT v.*, u.username, u.full_name
         FROM verification_requests v JOIN profiles u ON u.id = v.user_id
         ORDER BY v.created_at DESC LIMIT 50`
      )
      .all();

    const hashtags = db.prepare(`SELECT * FROM hashtags ORDER BY created_at DESC LIMIT 50`).all();
    const announcements = db.prepare(`SELECT * FROM announcements ORDER BY created_at DESC LIMIT 20`).all();
    const logs = db
      .prepare(
        `SELECT l.*, u.username as admin_username
         FROM moderation_logs l JOIN profiles u ON u.id = l.admin_id
         ORDER BY l.created_at DESC LIMIT 100`
      )
      .all();

    const recentPosts = db
      .prepare(
        `SELECT p.id, p.post_type, p.content, p.is_removed, p.created_at, u.username as author_username
         FROM posts p JOIN profiles u ON u.id = p.author_id
         ORDER BY p.created_at DESC LIMIT 60`
      )
      .all();

    res.json({ stats, users, reports, verifications, hashtags, announcements, logs, recentPosts });
  });

  router.post('/admin/users/:userId/action', requireAdmin, (req: AuthedRequest, res) => {
    const targetId = String(req.params.userId);
    const { action, role } = req.body || {};
    const ts = nowIso();

    if (action === 'verify') {
      db.prepare(`UPDATE profiles SET is_verified = 1, updated_at = ? WHERE id = ?`).run(ts, targetId);
    } else if (action === 'unverify') {
      db.prepare(`UPDATE profiles SET is_verified = 0, updated_at = ? WHERE id = ?`).run(ts, targetId);
    } else if (action === 'suspend') {
      db.prepare(`UPDATE profiles SET account_status = 'suspended', updated_at = ? WHERE id = ?`).run(ts, targetId);
    } else if (action === 'ban') {
      db.prepare(`UPDATE profiles SET account_status = 'banned', updated_at = ? WHERE id = ?`).run(ts, targetId);
      db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(targetId);
    } else if (action === 'activate') {
      db.prepare(`UPDATE profiles SET account_status = 'active', updated_at = ? WHERE id = ?`).run(ts, targetId);
    } else if (action === 'set_role') {
      if (req.user!.role !== 'owner') {
        return res.status(403).json({ error: 'Only platform owner can manage admin roles' });
      }
      if (!role) {
        db.prepare(`DELETE FROM admin_roles WHERE user_id = ? AND user_id <> ?`).run(targetId, req.user!.id);
      } else if (['admin', 'moderator'].includes(role)) {
        db.prepare(
          `INSERT OR REPLACE INTO admin_roles (id, user_id, role, granted_by, created_at) VALUES (?, ?, ?, ?, ?)`
        ).run(uuid(), targetId, role, req.user!.id, ts);
      }
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    db.prepare(
      `INSERT INTO moderation_logs (id, admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, ?, ?, 'user', ?, ?, ?)`
    ).run(uuid(), req.user!.id, String(action), targetId, role ? `role=${role}` : '', ts);

    res.json({ ok: true });
  });

  router.post('/admin/posts/:postId/moderate', requireAdmin, (req: AuthedRequest, res) => {
    const postId = String(req.params.postId);
    const remove = Boolean(req.body?.remove);
    const ts = nowIso();
    db.prepare(`UPDATE posts SET is_removed = ?, updated_at = ? WHERE id = ?`).run(remove ? 1 : 0, ts, postId);
    db.prepare(
      `INSERT INTO moderation_logs (id, admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, ?, ?, 'post', ?, '', ?)`
    ).run(uuid(), req.user!.id, remove ? 'remove_post' : 'restore_post', postId, ts);
    res.json({ ok: true });
  });

  router.post('/admin/reports/:reportId/resolve', requireAdmin, (req: AuthedRequest, res) => {
    const reportId = String(req.params.reportId);
    const status = ['reviewed', 'resolved', 'dismissed'].includes(req.body?.status) ? req.body.status : 'resolved';
    const ts = nowIso();
    db.prepare(`UPDATE reports SET status = ?, reviewed_by = ?, updated_at = ? WHERE id = ?`).run(
      status,
      req.user!.id,
      ts,
      reportId
    );
    db.prepare(
      `INSERT INTO moderation_logs (id, admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, ?, 'resolve_report', 'report', ?, ?, ?)`
    ).run(uuid(), req.user!.id, reportId, status, ts);
    res.json({ ok: true });
  });

  router.post('/admin/verifications/:id/review', requireAdmin, (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const approve = Boolean(req.body?.approve);
    const ts = nowIso();
    const row = db.prepare(`SELECT user_id FROM verification_requests WHERE id = ?`).get(id) as
      | { user_id: string }
      | undefined;
    if (!row) return res.status(404).json({ error: 'Request not found' });

    db.prepare(`UPDATE verification_requests SET status = ?, reviewed_by = ?, updated_at = ? WHERE id = ?`).run(
      approve ? 'approved' : 'rejected',
      req.user!.id,
      ts,
      id
    );
    if (approve) {
      db.prepare(`UPDATE profiles SET is_verified = 1, updated_at = ? WHERE id = ?`).run(ts, row.user_id);
    }
    db.prepare(
      `INSERT INTO moderation_logs (id, admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, ?, ?, 'verification', ?, '', ?)`
    ).run(uuid(), req.user!.id, approve ? 'approve_verification' : 'reject_verification', row.user_id, ts);
    res.json({ ok: true });
  });

  router.post('/admin/hashtags/:id/toggle', requireAdmin, (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const row = db.prepare(`SELECT is_blocked, tag FROM hashtags WHERE id = ?`).get(id) as
      | { is_blocked: number; tag: string }
      | undefined;
    if (!row) return res.status(404).json({ error: 'Hashtag not found' });
    const next = row.is_blocked ? 0 : 1;
    db.prepare(`UPDATE hashtags SET is_blocked = ? WHERE id = ?`).run(next, id);
    db.prepare(
      `INSERT INTO moderation_logs (id, admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, ?, ?, 'hashtag', ?, ?, ?)`
    ).run(uuid(), req.user!.id, next ? 'block_hashtag' : 'unblock_hashtag', id, row.tag, nowIso());
    res.json({ ok: true });
  });

  router.post('/admin/announcements', requireAdmin, (req: AuthedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title || !body) return res.status(400).json({ error: 'Title and body required' });
    const id = uuid();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO announcements (id, title, body, created_by, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)`
    ).run(id, title.slice(0, 120), body.slice(0, 600), req.user!.id, ts);
    db.prepare(
      `INSERT INTO moderation_logs (id, admin_id, action, target_type, target_id, details, created_at)
       VALUES (?, ?, 'create_announcement', 'announcement', ?, ?, ?)`
    ).run(uuid(), req.user!.id, id, title, ts);
    res.status(201).json({ ok: true });
  });

  router.delete('/admin/announcements/:id', requireAdmin, (req: AuthedRequest, res) => {
    db.prepare(`DELETE FROM announcements WHERE id = ?`).run(String(req.params.id));
    res.json({ ok: true });
  });

  registerAiRoutes(router);

  app.use('/api', router);
}
