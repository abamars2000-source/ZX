import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Repeat2,
  Send,
  Share2,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { getFilterCss } from '../lib/mediaFilters';
import type { CommentItem, PostItem, VideoEditMeta } from '../types';
import { Avatar, VerifiedBadge } from './Avatar';

export function PostCard({
  post,
  onMutate,
  onQuote,
}: {
  post: PostItem;
  onMutate?: () => void;
  onQuote?: (post: PostItem) => void;
}) {
  const { user, lang, navigate, openAuth, toast } = useApp();
  const [liked, setLiked] = useState(post.viewer.liked);
  const [likesCount, setLikesCount] = useState(post.counts.likes);
  const [reposted, setReposted] = useState(post.viewer.reposted);
  const [repostsCount, setRepostsCount] = useState(post.counts.reposts);
  const [bookmarked, setBookmarked] = useState(post.viewer.bookmarked);
  const [following, setFollowing] = useState(post.viewer.following);
  const [commentsCount, setCommentsCount] = useState(post.counts.comments);
  const [poll, setPoll] = useState(post.poll);

  const [carouselIdx, setCarouselIdx] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [currentContent, setCurrentContent] = useState(post.content);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');

  useEffect(() => {
    apiRequest(`/posts/${post.id}/view`, { method: 'POST' }).catch(() => {});
  }, [post.id]);

  const requireLogin = () => {
    if (!user) {
      openAuth('register');
      return false;
    }
    return true;
  };

  const handleLike = async () => {
    if (!requireLogin()) return;
    const prev = liked;
    setLiked(!prev);
    setLikesCount((c) => (prev ? Math.max(0, c - 1) : c + 1));
    try {
      await apiRequest(`/posts/${post.id}/like`, { method: 'POST' });
    } catch {
      setLiked(prev);
      setLikesCount((c) => (prev ? c + 1 : Math.max(0, c - 1)));
    }
  };

  const handleRepost = async () => {
    if (!requireLogin()) return;
    const prev = reposted;
    setReposted(!prev);
    setRepostsCount((c) => (prev ? Math.max(0, c - 1) : c + 1));
    try {
      await apiRequest(`/posts/${post.id}/repost`, { method: 'POST' });
    } catch {
      setReposted(prev);
      setRepostsCount((c) => (prev ? c + 1 : Math.max(0, c - 1)));
    }
  };

  const handleBookmark = async () => {
    if (!requireLogin()) return;
    const prev = bookmarked;
    setBookmarked(!prev);
    try {
      await apiRequest(`/posts/${post.id}/bookmark`, { method: 'POST' });
      toast(!prev ? (lang === 'hi' ? 'सहेजा गया' : 'Saved') : lang === 'hi' ? 'बुकमार्क हटाया गया' : 'Removed', 'info');
    } catch {
      setBookmarked(prev);
    }
  };

  const handleFollow = async () => {
    if (!requireLogin()) return;
    try {
      if (following) {
        await apiRequest(`/follow/${post.author_id}`, { method: 'DELETE' });
        setFollowing(false);
      } else {
        const res = await apiRequest<{ status: string }>(`/follow/${post.author_id}`, { method: 'POST' });
        setFollowing(res.status === 'following');
        if (res.status === 'requested') {
          toast(lang === 'hi' ? 'फॉलो अनुरोध भेजा गया' : 'Follow request sent', 'info');
        }
      }
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const loadComments = async () => {
    try {
      const res = await apiRequest<{ comments: CommentItem[] }>(`/posts/${post.id}/comments`);
      setComments(res.comments || []);
    } catch {
      // ignore
    }
  };

  const toggleComments = () => {
    const next = !showComments;
    setShowComments(next);
    if (next) loadComments();
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireLogin() || !commentText.trim()) return;
    try {
      const res = await apiRequest<{ comment: CommentItem }>(`/posts/${post.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: commentText.trim() }),
      });
      setComments((prev) => [...prev, res.comment]);
      setCommentsCount((c) => c + 1);
      setCommentText('');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleVote = async (optionIndex: number) => {
    if (!requireLogin() || !poll) return;
    try {
      const updated = await apiRequest<any>(`/polls/${poll.id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ optionIndex }),
      });
      setPoll({ ...poll, ...updated });
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleSaveEdit = async () => {
    try {
      await apiRequest(`/posts/${post.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content: editContent }),
      });
      setCurrentContent(editContent);
      setEditing(false);
      toast(lang === 'hi' ? 'पोस्ट अपडेट हुआ' : 'Post updated', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await apiRequest(`/posts/${post.id}`, { method: 'DELETE' });
      toast(lang === 'hi' ? 'पोस्ट हटाया गया' : 'Post deleted', 'success');
      onMutate?.();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireLogin() || !reportReason.trim()) return;
    try {
      await apiRequest('/reports', {
        method: 'POST',
        body: JSON.stringify({ targetType: 'post', targetId: post.id, reason: reportReason.trim() }),
      });
      setReporting(false);
      setReportReason('');
      toast(lang === 'hi' ? 'रिपोर्ट दर्ज की गई' : 'Report submitted', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/?post=${post.id}`;
    navigator.clipboard?.writeText(shareUrl);
    toast(lang === 'hi' ? 'लिंक कॉपी किया गया' : 'Link copied to clipboard', 'info');
  };

  const renderRichContent = (text: string) => {
    return text.split(/(\s+)/).map((part, idx) => {
      if (part.startsWith('#') && part.length > 1) {
        return (
          <button
            key={idx}
            type="button"
            onClick={() => navigate('search')}
            className="text-[#792BFF] dark:text-[#FF28B9] hover:underline font-medium"
          >
            {part}
          </button>
        );
      }
      if (part.startsWith('@') && part.length > 2) {
        return (
          <button
            key={idx}
            type="button"
            onClick={() => navigate('profile', part.slice(1).replace(/[^a-z0-9_]/gi, '').toLowerCase())}
            className="text-[#792BFF] dark:text-[#E8E8F2] hover:underline font-medium"
          >
            {part}
          </button>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  const isOwner = user?.id === post.author_id;
  const activeMedia = post.media[carouselIdx];
  const videoMeta: VideoEditMeta | null = React.useMemo(() => {
    if (!post.video_meta) return null;
    try {
      return JSON.parse(post.video_meta) as VideoEditMeta;
    } catch {
      return null;
    }
  }, [post.video_meta]);

  return (
    <article className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('profile', post.author_username)} className="shrink-0">
            <Avatar src={post.author_avatar} name={post.author_name} size={40} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => navigate('profile', post.author_username)}
                className="font-semibold text-sm text-[#080810] dark:text-white truncate hover:underline"
              >
                {post.author_name}
              </button>
              <VerifiedBadge verified={post.author_verified} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
              <span>@{post.author_username}</span>
              <span aria-hidden="true">·</span>
              <span>{new Date(post.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 relative">
          {!isOwner && (
            <button
              onClick={handleFollow}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                following
                  ? 'bg-black/5 dark:bg-white/10 text-[#080810] dark:text-white'
                  : 'zx-gradient-bg text-white'
              }`}
            >
              {following ? (lang === 'hi' ? 'फॉलोइंग' : 'Following') : lang === 'hi' ? 'फॉलो करें' : 'Follow'}
            </button>
          )}
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#5A5B6E] dark:text-[#A2A3B8] hover:bg-black/5 dark:hover:bg-white/5"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-11 z-30 w-44 rounded-2xl bg-white dark:bg-[#16162A] border border-black/10 dark:border-white/15 shadow-xl py-1.5 text-xs">
              {isOwner ? (
                <>
                  <button
                    onClick={() => {
                      setEditing(true);
                      setShowMenu(false);
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2 text-left hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {lang === 'hi' ? 'संपादित करें' : 'Edit Post'}
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      handleDelete();
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center gap-2 text-left text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {lang === 'hi' ? 'हटाएं' : 'Delete Post'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setReporting(true);
                    setShowMenu(false);
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center gap-2 text-left text-amber-500 hover:bg-amber-500/10"
                >
                  <Flag className="w-3.5 h-3.5" />
                  {lang === 'hi' ? 'रिपोर्ट करें' : 'Report Post'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Text / Caption */}
      {editing ? (
        <div className="px-4 pb-3 space-y-2">
          <textarea
            rows={3}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full p-3 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 rounded-lg text-xs bg-black/5 dark:bg-white/10"
            >
              {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
            </button>
            <button onClick={handleSaveEdit} className="px-3 py-1.5 rounded-lg text-xs zx-gradient-bg text-white">
              {lang === 'hi' ? 'सहेजें' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        currentContent && (
          <div className="px-4 pb-3 text-[15px] leading-relaxed text-[#080810] dark:text-[#E8E8F2] whitespace-pre-wrap break-words">
            {renderRichContent(currentContent)}
          </div>
        )
      )}

      {/* Media Carousel */}
      {post.media.length > 0 && activeMedia && (
        <div className="relative bg-black flex items-center justify-center max-h-[540px] overflow-hidden">
          {activeMedia.media_type === 'video' ? (
            <div className="relative w-full flex items-center justify-center">
              <video
                src={activeMedia.url}
                controls
                playsInline
                muted={videoMeta?.muted}
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
                className="w-full max-h-[540px] object-contain"
              />
              {videoMeta?.overlays?.map((overlay) => (
                <div
                  key={overlay.id}
                  style={{
                    left: `${overlay.x}%`,
                    top: `${overlay.y}%`,
                    transform: `translate(-50%, -50%) rotate(${overlay.rotation ?? 0}deg)`,
                    color: overlay.color || '#FFFFFF',
                    fontSize: `${Math.round((overlay.fontSize || 22) * 0.8)}px`,
                  }}
                  className={`pointer-events-none absolute z-10 max-w-[85%] font-bold leading-snug whitespace-pre-wrap break-words ${
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
            </div>
          ) : (
            <img
              src={activeMedia.url}
              alt="Post media"
              referrerPolicy="no-referrer"
              className="w-full max-h-[540px] object-cover"
            />
          )}

          {post.media.length > 1 && (
            <>
              {carouselIdx > 0 && (
                <button
                  onClick={() => setCarouselIdx((i) => i - 1)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {carouselIdx < post.media.length - 1 && (
                <button
                  onClick={() => setCarouselIdx((i) => i + 1)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/50 px-2.5 py-1 rounded-full">
                {post.media.map((m, idx) => (
                  <button
                    key={m.id}
                    onClick={() => setCarouselIdx(idx)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      idx === carouselIdx ? 'bg-white w-3' : 'bg-white/40'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Poll */}
      {poll && (
        <div className="mx-4 my-2 p-3.5 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] space-y-2">
          <div className="text-xs font-semibold text-[#080810] dark:text-white">{poll.question}</div>
          {poll.options.map((opt, idx) => {
            const pct = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
            const voted = poll.myVote === idx;
            return (
              <button
                key={idx}
                onClick={() => handleVote(idx)}
                className={`relative w-full text-left px-3.5 py-2.5 rounded-xl border overflow-hidden transition-colors ${
                  voted
                    ? 'border-[#792BFF] dark:border-[#FF28B9]'
                    : 'border-black/10 dark:border-white/10 hover:border-[#792BFF]/50'
                }`}
              >
                <div
                  style={{ width: `${pct}%` }}
                  className="absolute inset-y-0 left-0 bg-[#792BFF]/15 dark:bg-[#792BFF]/25 transition-all"
                />
                <div className="relative flex items-center justify-between text-xs font-medium">
                  <span>{opt.label}</span>
                  <span className="font-mono-tabular text-[#5A5B6E] dark:text-[#A2A3B8]">{pct}%</span>
                </div>
              </button>
            );
          })}
          <div className="text-[11px] font-mono-tabular text-[#5A5B6E] dark:text-[#A2A3B8]">
            {poll.totalVotes} {lang === 'hi' ? 'वोट' : 'votes'}
          </div>
        </div>
      )}

      {/* Quote Post */}
      {post.quotePost && (
        <div className="mx-4 my-2 p-3.5 rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]">
          <div className="flex items-center gap-2 mb-1">
            <Avatar src={post.quotePost.author_avatar} name={post.quotePost.author_name} size={22} />
            <span className="text-xs font-semibold">{post.quotePost.author_name}</span>
            <VerifiedBadge verified={post.quotePost.author_verified} />
            <span className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">@{post.quotePost.author_username}</span>
          </div>
          <p className="text-xs text-[#080810]/85 dark:text-[#E8E8F2]/85 line-clamp-3">{post.quotePost.content}</p>
        </div>
      )}

      {/* Report inline box */}
      {reporting && (
        <form onSubmit={handleReport} className="mx-4 my-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex gap-2">
          <input
            type="text"
            required
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder={lang === 'hi' ? 'रिपोर्ट करने का कारण लिखें...' : 'Reason for reporting...'}
            className="flex-1 bg-transparent text-xs focus:outline-none"
          />
          <button type="submit" className="px-3 py-1 rounded-lg bg-amber-500 text-black text-xs font-semibold">
            {lang === 'hi' ? 'भेजें' : 'Submit'}
          </button>
          <button type="button" onClick={() => setReporting(false)} className="px-2 py-1 text-xs">
            ×
          </button>
        </form>
      )}

      {/* Action Bar */}
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-black/5 dark:border-white/5">
        <div className="flex items-center gap-1 sm:gap-3">
          <button
            onClick={handleLike}
            className={`min-h-[40px] px-2.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors ${
              liked
                ? 'text-[#FF28B9] bg-[#FF28B9]/10'
                : 'text-[#5A5B6E] dark:text-[#A2A3B8] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
            <span className="font-mono-tabular">{likesCount}</span>
          </button>

          <button
            onClick={toggleComments}
            className="min-h-[40px] px-2.5 rounded-xl flex items-center gap-1.5 text-xs font-medium text-[#5A5B6E] dark:text-[#A2A3B8] hover:bg-black/5 dark:hover:bg-white/5"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="font-mono-tabular">{commentsCount}</span>
          </button>

          <button
            onClick={handleRepost}
            className={`min-h-[40px] px-2.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-colors ${
              reposted
                ? 'text-[#792BFF] bg-[#792BFF]/10'
                : 'text-[#5A5B6E] dark:text-[#A2A3B8] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Repeat2 className="w-4 h-4" />
            <span className="font-mono-tabular">{repostsCount}</span>
          </button>

          {onQuote && (
            <button
              onClick={() => onQuote(post)}
              className="min-h-[40px] px-2.5 rounded-xl text-xs font-medium text-[#5A5B6E] dark:text-[#A2A3B8] hover:bg-black/5 dark:hover:bg-white/5 hidden sm:flex items-center"
            >
              {lang === 'hi' ? 'कोट' : 'Quote'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleShare}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#5A5B6E] dark:text-[#A2A3B8] hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleBookmark}
            className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors ${
              bookmarked
                ? 'text-[#792BFF] dark:text-[#FF28B9]'
                : 'text-[#5A5B6E] dark:text-[#A2A3B8] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {/* Comments Drawer */}
      {showComments && (
        <div className="px-4 pb-4 pt-2 border-t border-black/5 dark:border-white/5 space-y-3 bg-black/[0.015] dark:bg-white/[0.015]">
          {comments.length === 0 ? (
            <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
              {lang === 'hi' ? 'अभी कोई टिप्पणी नहीं है।' : 'No comments yet.'}
            </p>
          ) : (
            <div className="space-y-2.5 max-h-56 overflow-y-auto">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <Avatar src={c.author_avatar} name={c.author_name} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        onClick={() => navigate('profile', c.author_username)}
                        className="font-semibold hover:underline"
                      >
                        {c.author_username}
                      </button>
                      <VerifiedBadge verified={c.author_verified} />
                    </div>
                    <p className="text-xs text-[#080810]/90 dark:text-[#E8E8F2]/90 break-words">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddComment} className="flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={lang === 'hi' ? 'अपनी टिप्पणी लिखें...' : 'Write a comment...'}
              className="flex-1 px-3.5 py-2 rounded-xl bg-white dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs focus:outline-none focus:ring-1 focus:ring-[#792BFF]"
            />
            <button type="submit" className="px-3.5 py-2 rounded-xl zx-gradient-bg text-white text-xs font-medium">
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}
    </article>
  );
}
