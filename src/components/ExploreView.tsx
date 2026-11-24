import React, { useEffect, useState } from 'react';
import { Compass, Film, Hash, MessageSquare, Search, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import type { PostItem, UserProfile } from '../types';
import { Avatar, VerifiedBadge } from './Avatar';
import { PostCard } from './PostCard';

export function ExploreView() {
  const { lang, navigate, t } = useApp();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'users' | 'posts' | 'hashtags' | 'videos'>('all');
  const [data, setData] = useState<{
    users: UserProfile[];
    posts: PostItem[];
    videos: PostItem[];
    hashtags: Array<{ tag: string; post_count: number }>;
  }>({ users: [], posts: [], videos: [], hashtags: [] });
  const [loading, setLoading] = useState(true);

  const fetchExplore = async (q: string) => {
    setLoading(true);
    try {
      const res = await apiRequest<any>(`/explore?q=${encodeURIComponent(q)}`);
      setData({
        users: res.users || [],
        posts: res.posts || [],
        videos: res.videos || [],
        hashtags: res.hashtags || [],
      });
    } catch {
      setData({ users: [], posts: [], videos: [], hashtags: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => fetchExplore(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const isEmpty =
    data.users.length === 0 &&
    data.posts.length === 0 &&
    data.videos.length === 0 &&
    data.hashtags.length === 0;

  return (
    <div className="space-y-5">
      {/* Search Bar */}
      <div className="relative">
        <Search className="w-5 h-5 absolute left-4 top-3.5 text-[#5A5B6E] dark:text-[#A2A3B8]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
        />
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'all', label: lang === 'hi' ? 'सभी' : 'All' },
            { id: 'users', label: lang === 'hi' ? 'यूज़र्स' : 'Users' },
            { id: 'posts', label: lang === 'hi' ? 'पोस्ट' : 'Posts' },
            { id: 'hashtags', label: lang === 'hi' ? 'हैशटैग' : 'Hashtags' },
            { id: 'videos', label: lang === 'hi' ? 'वीडियो' : 'Videos' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              tab === item.id
                ? 'zx-gradient-bg text-white'
                : 'bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 text-[#5A5B6E] dark:text-[#A2A3B8]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-48 rounded-2xl bg-black/5 dark:bg-[#101020] animate-pulse" />
      ) : isEmpty ? (
        <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-10 text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl zx-gradient-bg text-white flex items-center justify-center mb-4">
            <Compass className="w-6 h-6" />
          </div>
          <h3 className="font-display text-xl font-bold text-[#080810] dark:text-white">{t('emptyExplore')}</h3>
          <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] mt-1.5">{t('zeroUsersLabel')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(tab === 'all' || tab === 'hashtags') && data.hashtags.length > 0 && (
            <section className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Hash className="w-4 h-4 text-[#FF28B9]" />
                {lang === 'hi' ? 'लोकप्रिय हैशटैग' : 'Popular Hashtags'}
              </h3>
              <div className="divide-y divide-black/5 dark:divide-white/5">
                {data.hashtags.map((h) => (
                  <button
                    key={h.tag}
                    onClick={() => setQuery(`#${h.tag}`)}
                    className="w-full py-2.5 flex items-center justify-between text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] px-2 rounded-lg"
                  >
                    <span className="text-sm font-semibold text-[#792BFF] dark:text-[#FF28B9]">#{h.tag}</span>
                    <span className="text-xs font-mono-tabular text-[#5A5B6E] dark:text-[#A2A3B8]">
                      {h.post_count} {lang === 'hi' ? 'पोस्ट' : 'posts'}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {(tab === 'all' || tab === 'users') && data.users.length > 0 && (
            <section className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#792BFF]" />
                {lang === 'hi' ? 'नए क्रिएटर्स और अकाउंट्स' : 'Creators & Accounts'}
              </h3>
              <div className="divide-y divide-black/5 dark:divide-white/5">
                {data.users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => navigate('profile', u.username)}
                    className="w-full py-3 flex items-center gap-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] px-2 rounded-xl"
                  >
                    <Avatar src={u.avatar_url} name={u.full_name} size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <span className="truncate">{u.full_name}</span>
                        <VerifiedBadge verified={u.is_verified} />
                      </div>
                      <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] truncate">
                        @{u.username} {u.bio ? `· ${u.bio}` : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {(tab === 'all' || tab === 'videos') && data.videos.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2 px-1">
                <Film className="w-4 h-4 text-[#FF28B9]" />
                {lang === 'hi' ? 'वीडियो और शॉर्ट्स' : 'Videos & Shorts'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.videos.map((v) => (
                  <PostCard key={v.id} post={v} onMutate={() => fetchExplore(query)} />
                ))}
              </div>
            </section>
          )}

          {(tab === 'all' || tab === 'posts') && data.posts.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2 px-1">
                <MessageSquare className="w-4 h-4 text-[#792BFF]" />
                {lang === 'hi' ? 'चर्चाएं और पोस्ट' : 'Posts & Discussions'}
              </h3>
              <div className="space-y-4">
                {data.posts.map((p) => (
                  <PostCard key={p.id} post={p} onMutate={() => fetchExplore(query)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
