export type LangCode = 'hi' | 'en';
export type ThemeMode = 'dark' | 'light';

export type NavTab =
  | 'home'
  | 'zx'
  | 'search'
  | 'shorts'
  | 'profile'
  | 'messages'
  | 'notifications'
  | 'creator'
  | 'ai'
  | 'settings'
  | 'admin';

export interface AiThreadItem {
  id: string;
  title: string;
  model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  system_instruction: string;
  created_at: string;
  updated_at: string;
}

export interface AiMessageItem {
  id: string;
  thread_id: string;
  role: 'user' | 'model';
  content: string;
  model: string;
  created_at: string;
}

export interface AiTranscriptItem {
  id: string;
  transcript: string;
  mime_type: string;
  duration_sec: number;
  created_at: string;
}

export interface UserProfile {
  id: string;
  full_name: string;
  username: string;
  email?: string;
  bio: string;
  avatar_url: string;
  cover_url: string;
  language: LangCode;
  interests: string | string[];
  is_private: number;
  is_verified: number;
  email_verified?: number;
  onboarding_completed?: number;
  has_password?: number;
  google_linked?: number;
  account_status: string;
  created_at: string;
  online?: boolean;
}

export interface UserSettings {
  user_id: string;
  theme: ThemeMode;
  language: LangCode;
  notify_follows: number;
  notify_likes: number;
  notify_comments: number;
  notify_mentions: number;
  notify_messages: number;
}

export interface PostMediaItem {
  id: string;
  media_type: 'image' | 'video';
  url: string;
  sort_order: number;
}

export interface PollOption {
  label: string;
  votes: number;
}

export interface PollData {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  myVote: number | null;
  expires_at: string;
}

export interface PostItem {
  id: string;
  author_id: string;
  author_username: string;
  author_name: string;
  author_avatar: string;
  author_verified: number;
  post_type: 'home' | 'zx' | 'short';
  content: string;
  parent_post_id: string | null;
  thread_root_id: string | null;
  quote_post_id: string | null;
  video_meta?: string;
  created_at: string;
  updated_at: string;
  media: PostMediaItem[];
  hashtags: string[];
  poll: PollData | null;
  quotePost: {
    id: string;
    content: string;
    post_type: string;
    created_at: string;
    author_username: string;
    author_name: string;
    author_avatar: string;
    author_verified: number;
  } | null;
  counts: {
    likes: number;
    comments: number;
    reposts: number;
    views: number;
  };
  viewer: {
    liked: boolean;
    reposted: boolean;
    bookmarked: boolean;
    following: boolean;
  };
}

export interface CommentItem {
  id: string;
  post_id: string;
  author_id: string;
  author_username: string;
  author_name: string;
  author_avatar: string;
  author_verified: number;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
}

export interface StoryTextOverlay {
  id: string;
  text: string;
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  fontSize: number;
  color: string;
  fontFamily: 'display' | 'sans' | 'mono';
  backdrop: 'none' | 'frosted' | 'solid' | 'gradient';
  align: 'left' | 'center' | 'right';
  rotation?: number;
  scale?: number;
  kind?: 'text' | 'sticker';
}

export interface VideoEditMeta {
  trimStart: number;
  trimEnd: number;
  speed: number;
  filter: string;
  muted: boolean;
  volume: number;
  aspect: '9:16' | '16:9' | '1:1';
  coverUrl?: string;
  overlays: StoryTextOverlay[];
}

export interface StoryItem {
  id: string;
  author_id: string;
  author_username: string;
  author_name: string;
  author_avatar: string;
  author_verified: number;
  story_type: 'image' | 'video' | 'text';
  media_url: string;
  text_content: string;
  background_style: string;
  overlay_data?: string;
  highlight_title: string | null;
  is_highlight: number;
  expires_at: string;
  created_at: string;
  viewsCount: number;
  viewedByMe: boolean;
  viewers: Array<{
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
    viewed_at: string;
  }>;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  actor_id: string;
  actor_username: string;
  actor_name: string;
  actor_avatar: string;
  actor_verified: number;
  type: string;
  entity_id: string | null;
  message_preview: string;
  is_read: number;
  created_at: string;
}

export interface ConversationItem {
  id: string;
  is_group: number;
  title: string;
  is_request: number;
  last_read_at: string | null;
  updated_at: string;
  members: Array<{
    id: string;
    username: string;
    full_name: string;
    avatar_url: string;
    is_verified: number;
    online: boolean;
  }>;
  lastMessage?: {
    id: string;
    sender_id: string;
    content: string;
    attachment_type: string;
    created_at: string;
  };
  unreadCount: number;
}

export interface MessageItem {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_username: string;
  sender_name: string;
  sender_avatar: string;
  content: string;
  attachment_url: string;
  attachment_type: '' | 'image' | 'video';
  created_at: string;
}
