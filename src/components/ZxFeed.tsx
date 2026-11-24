import React, { useEffect, useState } from 'react';
import { BarChart2, Feather, ImagePlus, Send, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest, uploadMediaFile } from '../lib/api';
import type { PostItem } from '../types';
import { Avatar } from './Avatar';
import { PostCard } from './PostCard';

export function ZxFeed() {
  const { user, lang, openAuth, feedRefreshKey, triggerFeedRefresh, t, toast } = useApp();
  const [filter, setFilter] = useState<'for_you' | 'following' | 'trending'>('for_you');
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline composer
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<Array<{ mediaType: 'image' | 'video'; url: string; storagePath: string }>>([]);
  const [showPoll, setShowPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [quotePost, setQuotePost] = useState<PostItem | null>(null);
  const [posting, setPosting] = useState(false);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ posts: PostItem[] }>(`/feeds/zx?filter=${filter}`);
      setPosts(res.posts || []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [filter, feedRefreshKey, user?.id]);

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const isVid = file.type.startsWith('video/');
      const res = await uploadMediaFile(isVid ? 'videos' : 'post-images', file);
      setMedia((prev) => [...prev, res]);
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuth('register');
      return;
    }
    if (!content.trim() && media.length === 0) return;
    setPosting(true);
    try {
      await apiRequest('/posts', {
        method: 'POST',
        body: JSON.stringify({
          postType: 'zx',
          content,
          media,
          quotePostId: quotePost?.id || null,
          poll: showPoll ? { question: content || 'Poll', options: pollOptions.filter((o) => o.trim()) } : undefined,
        }),
      });
      setContent('');
      setMedia([]);
      setShowPoll(false);
      setPollOptions(['', '']);
      setQuotePost(null);
      triggerFeedRefresh();
      toast(lang === 'hi' ? 'पोस्ट प्रकाशित हुई!' : 'Posted to ZX!', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-xl w-fit">
        {(['for_you', 'following', 'trending'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              filter === tab
                ? 'zx-gradient-bg text-white'
                : 'text-[#5A5B6E] dark:text-[#A2A3B8] hover:text-[#080810] dark:hover:text-white'
            }`}
          >
            {tab === 'for_you' ? t('forYou') : tab === 'following' ? t('following') : t('trending')}
          </button>
        ))}
      </div>

      {/* Inline ZX Composer */}
      <form
        onSubmit={handlePublish}
        className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-4 space-y-3"
      >
        <div className="flex gap-3">
          <Avatar src={user?.avatar_url} name={user?.full_name || 'ZX'} size={40} />
          <div className="flex-1 space-y-2">
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('postPlaceholderZx')}
              className="w-full bg-transparent text-sm text-[#080810] dark:text-white placeholder-[#5A5B6E] dark:placeholder-[#A2A3B8] focus:outline-none resize-none"
            />

            {quotePost && (
              <div className="p-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] flex items-start justify-between gap-2">
                <div className="text-xs">
                  <span className="font-semibold">@{quotePost.author_username}: </span>
                  <span className="text-[#5A5B6E] dark:text-[#A2A3B8] line-clamp-2">{quotePost.content}</span>
                </div>
                <button type="button" onClick={() => setQuotePost(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {media.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {media.map((m, idx) => (
                  <div key={idx} className="relative w-24 h-24 rounded-xl overflow-hidden bg-black">
                    {m.mediaType === 'video' ? (
                      <video src={m.url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={m.url} alt="" className="w-full h-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => setMedia((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showPoll && (
              <div className="space-y-1.5 pt-1">
                {pollOptions.map((opt, idx) => (
                  <input
                    key={idx}
                    type="text"
                    value={opt}
                    onChange={(e) =>
                      setPollOptions((prev) => prev.map((o, i) => (i === idx ? e.target.value : o)))
                    }
                    placeholder={`${lang === 'hi' ? 'विकल्प' : 'Option'} ${idx + 1}`}
                    className="w-full px-3 py-1.5 rounded-lg bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
                  />
                ))}
                {pollOptions.length < 4 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions((prev) => [...prev, ''])}
                    className="text-xs text-[#792BFF] dark:text-[#FF28B9]"
                  >
                    + {lang === 'hi' ? 'विकल्प जोड़ें' : 'Add option'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
          <div className="flex items-center gap-1">
            <label className="min-h-[38px] px-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1.5 text-xs font-medium text-[#792BFF] cursor-pointer">
              <ImagePlus className="w-4 h-4" />
              <span>{lang === 'hi' ? 'फ़ोटो/वीडियो' : 'Media'}</span>
              <input type="file" accept="image/*,video/*" onChange={handleAttach} className="hidden" />
            </label>
            <button
              type="button"
              onClick={() => setShowPoll(!showPoll)}
              className="min-h-[38px] px-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-1.5 text-xs font-medium text-[#FF28B9]"
            >
              <BarChart2 className="w-4 h-4" />
              <span>{lang === 'hi' ? 'पोल' : 'Poll'}</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={posting}
            className="px-4 py-2 rounded-xl zx-gradient-bg text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{t('publish')}</span>
          </button>
        </div>
      </form>

      {/* Discussions Feed */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-36 rounded-2xl bg-black/5 dark:bg-[#101020] animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-10 text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl zx-gradient-bg text-white flex items-center justify-center mb-4">
            <Feather className="w-6 h-6" />
          </div>
          <h3 className="font-display text-xl font-bold text-[#080810] dark:text-white">{t('emptyZx')}</h3>
          <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] mt-1.5">{t('zeroUsersLabel')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onMutate={loadPosts} onQuote={(p) => setQuotePost(p)} />
          ))}
        </div>
      )}
    </div>
  );
}
