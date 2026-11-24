import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Eye,
  Film,
  Heart,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Send,
  Share2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { getFilterCss } from '../lib/mediaFilters';
import type { CommentItem, PostItem, VideoEditMeta } from '../types';
import { Avatar, VerifiedBadge } from './Avatar';

export function ShortsView() {
  const { user, lang, openCreate, openAuth, navigate, feedRefreshKey, t, toast } = useApp();
  const [filter, setFilter] = useState<'for_you' | 'following'>('for_you');
  const [shorts, setShorts] = useState<PostItem[]>([]);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const loadShorts = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ posts: PostItem[] }>(`/feeds/short?filter=${filter}`);
      setShorts(res.posts || []);
      setIndex(0);
    } catch {
      setShorts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShorts();
  }, [filter, feedRefreshKey, user?.id]);

  const current = shorts[index];
  const videoMeta: VideoEditMeta | null = React.useMemo(() => {
    if (!current?.video_meta) return null;
    try {
      return JSON.parse(current.video_meta) as VideoEditMeta;
    } catch {
      return null;
    }
  }, [current?.video_meta]);

  useEffect(() => {
    if (!current) return;
    setPaused(false);
    if (videoMeta?.muted !== undefined) setMuted(Boolean(videoMeta.muted));
    apiRequest(`/posts/${current.id}/view`, { method: 'POST' }).catch(() => {});
  }, [current?.id]);

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play();
      setPaused(false);
    } else {
      vid.pause();
      setPaused(true);
    }
  };

  const handleLike = async () => {
    if (!user) return openAuth('register');
    if (!current) return;
    try {
      const res = await apiRequest<{ liked: boolean }>(`/posts/${current.id}/like`, { method: 'POST' });
      setShorts((prev) =>
        prev.map((s) =>
          s.id === current.id
            ? {
                ...s,
                viewer: { ...s.viewer, liked: res.liked },
                counts: { ...s.counts, likes: s.counts.likes + (res.liked ? 1 : -1) },
              }
            : s
        )
      );
    } catch {
      // ignore
    }
  };

  const handleBookmark = async () => {
    if (!user) return openAuth('register');
    if (!current) return;
    try {
      const res = await apiRequest<{ bookmarked: boolean }>(`/posts/${current.id}/bookmark`, { method: 'POST' });
      setShorts((prev) =>
        prev.map((s) => (s.id === current.id ? { ...s, viewer: { ...s.viewer, bookmarked: res.bookmarked } } : s))
      );
      toast(res.bookmarked ? (lang === 'hi' ? 'सहेजा गया' : 'Saved') : lang === 'hi' ? 'हटाया गया' : 'Removed', 'info');
    } catch {
      // ignore
    }
  };

  const handleFollow = async () => {
    if (!user) return openAuth('register');
    if (!current) return;
    try {
      if (current.viewer.following) {
        await apiRequest(`/follow/${current.author_id}`, { method: 'DELETE' });
        setShorts((prev) =>
          prev.map((s) => (s.id === current.id ? { ...s, viewer: { ...s.viewer, following: false } } : s))
        );
      } else {
        const res = await apiRequest<{ status: string }>(`/follow/${current.author_id}`, { method: 'POST' });
        if (res.status === 'following') {
          setShorts((prev) =>
            prev.map((s) => (s.id === current.id ? { ...s, viewer: { ...s.viewer, following: true } } : s))
          );
        } else {
          toast(lang === 'hi' ? 'फॉलो अनुरोध भेजा गया' : 'Follow request sent', 'info');
        }
      }
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const openComments = async () => {
    if (!current) return;
    setCommentsOpen(true);
    const res = await apiRequest<{ comments: CommentItem[] }>(`/posts/${current.id}/comments`);
    setComments(res.comments || []);
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return openAuth('register');
    if (!current || !commentText.trim()) return;
    const res = await apiRequest<{ comment: CommentItem }>(`/posts/${current.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: commentText.trim() }),
    });
    setComments((prev) => [...prev, res.comment]);
    setShorts((prev) =>
      prev.map((s) =>
        s.id === current.id ? { ...s, counts: { ...s.counts, comments: s.counts.comments + 1 } } : s
      )
    );
    setCommentText('');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-xl">
          <button
            onClick={() => setFilter('for_you')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              filter === 'for_you' ? 'zx-gradient-bg text-white' : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
            }`}
          >
            {t('forYou')}
          </button>
          <button
            onClick={() => setFilter('following')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
              filter === 'following' ? 'zx-gradient-bg text-white' : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
            }`}
          >
            {t('following')}
          </button>
        </div>

        <button
          onClick={() => openCreate('short')}
          className="px-4 py-2 rounded-xl zx-gradient-bg text-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>{lang === 'hi' ? 'शॉर्ट अपलोड करें' : 'Upload Short'}</span>
        </button>
      </div>

      {loading ? (
        <div className="h-[68vh] max-w-sm mx-auto rounded-3xl bg-black/10 dark:bg-[#101020] animate-pulse" />
      ) : shorts.length === 0 || !current ? (
        <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-10 text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl zx-gradient-bg text-white flex items-center justify-center mb-4">
            <Film className="w-6 h-6" />
          </div>
          <h3 className="font-display text-xl font-bold text-[#080810] dark:text-white">{t('emptyShorts')}</h3>
          <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] mt-1.5">{t('zeroUsersLabel')}</p>
          <button
            onClick={() => openCreate('short')}
            className="mt-5 px-5 py-2.5 rounded-xl zx-gradient-bg text-white text-sm font-semibold"
          >
            {t('uploadShort')}
          </button>
        </div>
      ) : (
        <div className="relative mx-auto max-w-[400px] h-[74vh] min-h-[520px] rounded-3xl overflow-hidden bg-black border border-white/15 shadow-2xl">
          <video
            ref={videoRef}
            key={current.id}
            src={current.media[0]?.url}
            autoPlay
            loop
            muted={muted}
            playsInline
            style={{ filter: getFilterCss(videoMeta?.filter) }}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (videoMeta?.speed) v.playbackRate = videoMeta.speed;
              if (videoMeta?.trimStart) v.currentTime = videoMeta.trimStart;
            }}
            onTimeUpdate={(e) => {
              if (!videoMeta) return;
              const v = e.currentTarget;
              if (videoMeta.trimEnd > 0.2 && v.currentTime >= videoMeta.trimEnd) {
                v.currentTime = videoMeta.trimStart || 0;
              }
            }}
            onClick={togglePlay}
            className="w-full h-full object-cover cursor-pointer"
          />

          {videoMeta?.overlays?.map((overlay) => (
            <div
              key={overlay.id}
              style={{
                left: `${overlay.x}%`,
                top: `${overlay.y}%`,
                transform: `translate(-50%, -50%) rotate(${overlay.rotation ?? 0}deg)`,
                color: overlay.color || '#FFFFFF',
                fontSize: `${Math.round((overlay.fontSize || 22) * 0.85)}px`,
              }}
              className={`pointer-events-none absolute z-15 max-w-[85%] font-bold leading-snug whitespace-pre-wrap break-words ${
                overlay.backdrop === 'frosted'
                  ? 'bg-[#080810]/65 backdrop-blur-md px-3 py-1.5 rounded-xl'
                  : overlay.backdrop === 'solid'
                    ? 'bg-[#080810] px-3 py-1.5 rounded-xl'
                    : overlay.backdrop === 'gradient'
                      ? 'zx-gradient-bg px-3 py-1.5 rounded-xl'
                      : 'px-1.5 py-0.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]'
              }`}
            >
              {overlay.text}
            </div>
          ))}

          {/* Top Controls */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
            <button
              onClick={() => setMuted(!muted)}
              className="w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-md"
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          </div>

          {paused && (
            <button
              onClick={togglePlay}
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/25"
            >
              <div className="w-16 h-16 rounded-full bg-black/60 text-white flex items-center justify-center">
                <Play className="w-7 h-7 fill-current ml-1" />
              </div>
            </button>
          )}

          {/* Scrim */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

          {/* Bottom Info */}
          <div className="absolute bottom-4 left-4 right-16 z-20 space-y-2 text-white">
            <div className="flex items-center gap-2.5">
              <button onClick={() => navigate('profile', current.author_username)}>
                <Avatar src={current.author_avatar} name={current.author_name} size={36} />
              </button>
              <button
                onClick={() => navigate('profile', current.author_username)}
                className="font-semibold text-sm flex items-center gap-1 hover:underline"
              >
                <span>@{current.author_username}</span>
                <VerifiedBadge verified={current.author_verified} />
              </button>
              {user?.id !== current.author_id && (
                <button
                  onClick={handleFollow}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    current.viewer.following ? 'bg-white/20 text-white' : 'zx-gradient-bg text-white'
                  }`}
                >
                  {current.viewer.following ? t('followingBtn') : t('follow')}
                </button>
              )}
            </div>
            <p className="text-xs text-white/90 line-clamp-3">{current.content}</p>
            <div className="flex items-center gap-1.5 text-[11px] font-mono-tabular text-white/75">
              <Eye className="w-3.5 h-3.5" />
              <span>
                {current.counts.views} {t('views')}
              </span>
            </div>
          </div>

          {/* Right Action Rail */}
          <div className="absolute bottom-4 right-3 z-20 flex flex-col items-center gap-3 text-white">
            <button onClick={handleLike} className="flex flex-col items-center gap-1">
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md ${
                  current.viewer.liked ? 'bg-[#FF28B9] text-white' : 'bg-black/50 text-white'
                }`}
              >
                <Heart className={`w-5 h-5 ${current.viewer.liked ? 'fill-current' : ''}`} />
              </div>
              <span className="text-[11px] font-mono-tabular">{current.counts.likes}</span>
            </button>

            <button onClick={openComments} className="flex flex-col items-center gap-1">
              <div className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-md">
                <MessageCircle className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-mono-tabular">{current.counts.comments}</span>
            </button>

            <button onClick={handleBookmark} className="flex flex-col items-center gap-1">
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md ${
                  current.viewer.bookmarked ? 'bg-[#792BFF] text-white' : 'bg-black/50 text-white'
                }`}
              >
                <Bookmark className={`w-5 h-5 ${current.viewer.bookmarked ? 'fill-current' : ''}`} />
              </div>
            </button>

            <button
              onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}/?short=${current.id}`);
                toast(lang === 'hi' ? 'लिंक कॉपी किया गया' : 'Link copied', 'info');
              }}
              className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-md"
            >
              <Share2 className="w-5 h-5" />
            </button>

            {/* Vertical Swipe Controls */}
            <div className="flex flex-col gap-1 pt-2">
              <button
                disabled={index === 0}
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                className="w-9 h-9 rounded-full bg-black/50 disabled:opacity-30 flex items-center justify-center"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                disabled={index >= shorts.length - 1}
                onClick={() => setIndex((i) => Math.min(shorts.length - 1, i + 1))}
                className="w-9 h-9 rounded-full bg-black/50 disabled:opacity-30 flex items-center justify-center"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Comments Bottom Sheet */}
          {commentsOpen && (
            <div className="absolute inset-x-0 bottom-0 h-[62%] z-30 bg-[#101020] rounded-t-3xl border-t border-white/15 p-4 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="text-sm font-semibold text-white">
                  {t('comments')} ({current.counts.comments})
                </span>
                <button onClick={() => setCommentsOpen(false)} className="text-white/70">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-3 space-y-3">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5 text-white">
                    <Avatar src={c.author_avatar} name={c.author_name} size={28} />
                    <div className="text-xs">
                      <span className="font-semibold">@{c.author_username} </span>
                      <span className="text-white/85">{c.content}</span>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={submitComment} className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={t('replyPlaceholder')}
                  className="flex-1 px-3 py-2 rounded-xl bg-white/10 text-white text-xs focus:outline-none"
                />
                <button type="submit" className="px-3.5 py-2 rounded-xl zx-gradient-bg text-white">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
