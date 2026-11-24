import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'zx_platform.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initDatabase() {
  // All 28 core domain tables + auth/session/bootstrap support tables.
  // ZERO seed rows: platform launches with 0 users, 0 posts, 0 stories, 0 followers, 0 videos, 0 comments, 0 messages.
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL DEFAULT '',
      google_sub TEXT NOT NULL DEFAULT '',
      has_password INTEGER NOT NULL DEFAULT 1,
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      language TEXT NOT NULL DEFAULT 'hi',
      interests TEXT NOT NULL DEFAULT '[]',
      is_private INTEGER NOT NULL DEFAULT 0,
      is_verified INTEGER NOT NULL DEFAULT 0,
      account_status TEXT NOT NULL DEFAULT 'active',
      email_verified INTEGER NOT NULL DEFAULT 0,
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      last_active_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      user_agent TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_verifications (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      follower_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      following_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE (follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS follow_requests (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (requester_id, target_id)
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      post_type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      parent_post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
      thread_root_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
      quote_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
      video_meta TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'public',
      is_removed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_media (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      media_type TEXT NOT NULL,
      url TEXT NOT NULL,
      storage_path TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      parent_comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_removed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS reposts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      story_type TEXT NOT NULL,
      media_url TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL DEFAULT '',
      text_content TEXT NOT NULL DEFAULT '',
      background_style TEXT NOT NULL DEFAULT 'linear-gradient(135deg, #792BFF 0%, #FF28B9 100%)',
      overlay_data TEXT NOT NULL DEFAULT '',
      highlight_title TEXT,
      is_highlight INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS story_views (
      id TEXT PRIMARY KEY,
      story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      viewer_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      viewed_at TEXT NOT NULL,
      UNIQUE (story_id, viewer_id)
    );

    CREATE TABLE IF NOT EXISTS story_reactions (
      id TEXT PRIMARY KEY,
      story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      reaction TEXT NOT NULL,
      reply_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hashtags (
      id TEXT PRIMARY KEY,
      tag TEXT NOT NULL UNIQUE,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_hashtags (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      hashtag_id TEXT NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
      UNIQUE (post_id, hashtag_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      entity_id TEXT,
      message_preview TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      is_group INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      is_request INTEGER NOT NULL DEFAULT 0,
      last_read_at TEXT,
      joined_at TEXT NOT NULL,
      UNIQUE (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      attachment_url TEXT NOT NULL DEFAULT '',
      attachment_type TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL UNIQUE REFERENCES posts(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS poll_votes (
      id TEXT PRIMARY KEY,
      poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      option_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (poll_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      reviewed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      blocker_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE (blocker_id, blocked_id)
    );

    CREATE TABLE IF NOT EXISTS mutes (
      id TEXT PRIMARY KEY,
      muter_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      muted_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE (muter_id, muted_id)
    );

    CREATE TABLE IF NOT EXISTS verification_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
      theme TEXT NOT NULL DEFAULT 'dark',
      language TEXT NOT NULL DEFAULT 'hi',
      notify_follows INTEGER NOT NULL DEFAULT 1,
      notify_likes INTEGER NOT NULL DEFAULT 1,
      notify_comments INTEGER NOT NULL DEFAULT 1,
      notify_mentions INTEGER NOT NULL DEFAULT 1,
      notify_messages INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_roles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      granted_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_bootstrap (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      owner_user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      passcode_hash TEXT,
      claimed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS moderation_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_views (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      viewer_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      system_instruction TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_transcripts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      transcript TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'audio/webm',
      duration_sec REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
    CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
    CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
    CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(post_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);
    CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_ai_threads_user ON ai_threads(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_thread ON ai_messages(thread_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_ai_transcripts_user ON ai_transcripts(user_id, created_at DESC);
  `);

  const storyCols = db.prepare(`PRAGMA table_info(stories)`).all() as Array<{ name: string }>;
  if (!storyCols.some((c) => c.name === 'overlay_data')) {
    db.exec(`ALTER TABLE stories ADD COLUMN overlay_data TEXT NOT NULL DEFAULT '';`);
  }

  const profileCols = db.prepare(`PRAGMA table_info(profiles)`).all() as Array<{ name: string }>;
  if (!profileCols.some((c) => c.name === 'google_sub')) {
    db.exec(`ALTER TABLE profiles ADD COLUMN google_sub TEXT NOT NULL DEFAULT '';`);
  }
  if (!profileCols.some((c) => c.name === 'has_password')) {
    db.exec(`ALTER TABLE profiles ADD COLUMN has_password INTEGER NOT NULL DEFAULT 1;`);
  }

  const postCols = db.prepare(`PRAGMA table_info(posts)`).all() as Array<{ name: string }>;
  if (!postCols.some((c) => c.name === 'video_meta')) {
    db.exec(`ALTER TABLE posts ADD COLUMN video_meta TEXT NOT NULL DEFAULT '';`);
  }
}
