import React, { useEffect, useState } from 'react';
import { Camera, Compass, PlusSquare } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import type { PostItem } from '../types';
import { PostCard } from './PostCard';
import { StoriesBar } from './StoriesBar';
import { ZxLogo } from './ZxLogo';

export function HomeFeed() {
  const { user, lang, openCreate, openAuth, navigate, feedRefreshKey, t } = useApp();
  const [filter, setFilter] = useState<'for_you' | 'following'>('for_you');
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFeed = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ posts: PostItem[] }>(`/feeds/home?filter=${filter}`);
      setPosts(res.posts || []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
  }, [filter, feedRefreshKey, user?.id]);

  return (
    <div className="space-y-4">
      <StoriesBar />

      {/* Feed Filters */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-xl">
          <button
            onClick={() => setFilter('for_you')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              filter === 'for_you'
                ? 'zx-gradient-bg text-white'
                : 'text-[#5A5B6E] dark:text-[#A2A3B8] hover:text-[#080810] dark:hover:text-white'
            }`}
          >
            {t('forYou')}
          </button>
          <button
            onClick={() => setFilter('following')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              filter === 'following'
                ? 'zx-gradient-bg text-white'
                : 'text-[#5A5B6E] dark:text-[#A2A3B8] hover:text-[#080810] dark:hover:text-white'
            }`}
          >
            {t('following')}
          </button>
        </div>

        <button
          onClick={() => openCreate('home')}
          className="px-4 py-2 rounded-xl zx-gradient-bg text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 hover:opacity-95"
        >
          <PlusSquare className="w-4 h-4" />
          <span>{lang === 'hi' ? 'नया पोस्ट' : 'New Post'}</span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-64 rounded-2xl bg-black/5 dark:bg-[#101020] border border-black/10 dark:border-white/10 animate-pulse"
            />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-8 sm:p-12 text-center flex flex-col items-center">
          <ZxLogo size={56} className="mb-5" />
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#080810] dark:text-white max-w-md text-balance">
            {filter === 'following' ? t('emptyHomeFollowing') : t('emptyHomeNoPosts')}
          </h2>
          <p className="mt-2 text-sm text-[#5A5B6E] dark:text-[#A2A3B8] max-w-md">
            {t('zeroUsersLabel')}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {user ? (
              <button
                onClick={() => openCreate('home')}
                className="px-5 py-2.5 rounded-xl zx-gradient-bg text-white text-sm font-semibold flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                {t('createFirstPost')}
              </button>
            ) : (
              <button
                onClick={() => openAuth('register')}
                className="px-5 py-2.5 rounded-xl zx-gradient-bg text-white text-sm font-semibold"
              >
                {t('signUp')}
              </button>
            )}
            <button
              onClick={() => navigate('search')}
              className="px-5 py-2.5 rounded-xl bg-black/5 dark:bg-white/10 text-[#080810] dark:text-white text-sm font-semibold flex items-center gap-2"
            >
              <Compass className="w-4 h-4" />
              {t('explorePeople')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onMutate={loadFeed} />
          ))}
        </div>
      )}
    </div>
  );
}
