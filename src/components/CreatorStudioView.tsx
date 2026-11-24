import React, { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import type { PostItem } from '../types';
import { PostCard } from './PostCard';

export function CreatorStudioView() {
  const { user, lang, openAuth, t } = useApp();
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [analytics, setAnalytics] = useState<{
    stats: {
      followers: number;
      followerGrowth: number;
      totalPosts: number;
      postViews: number;
      videoViews: number;
      likes: number;
      comments: number;
      shares: number;
      engagementTotal: number;
    };
    dailySeries: Array<{ date: string; views: number; engagement: number }>;
    topPosts: PostItem[];
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    apiRequest<any>(`/creator/analytics?range=${range}`)
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [user?.id, range]);

  if (!user) {
    return (
      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-10 text-center space-y-4">
        <BarChart3 className="w-10 h-10 mx-auto text-[#792BFF]" />
        <h2 className="font-display text-xl font-bold">{t('creatorOverview')}</h2>
        <button onClick={() => openAuth('register')} className="px-5 py-2.5 rounded-xl zx-gradient-bg text-white text-sm font-semibold">
          {t('signUp')}
        </button>
      </div>
    );
  }

  const stats = analytics?.stats || {
    followers: 0,
    followerGrowth: 0,
    totalPosts: 0,
    postViews: 0,
    videoViews: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    engagementTotal: 0,
  };

  const series = analytics?.dailySeries || [];
  const maxVal = Math.max(1, ...series.map((s) => Math.max(s.views, s.engagement)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold">{t('creatorOverview')}</h2>
          <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
            {lang === 'hi' ? 'आपकी वास्तविक क्रिएटर सांख्यिकी' : 'Real-time database performance metrics'}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-xl">
          {(['7d', '30d', 'all'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold ${
                range === r ? 'zx-gradient-bg text-white' : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
              }`}
            >
              {r === '7d' ? '7D' : r === '30d' ? '30D' : lang === 'hi' ? 'सभी' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('followers'), value: stats.followers, sub: `+${stats.followerGrowth}` },
          { label: t('postsCount'), value: stats.totalPosts },
          { label: lang === 'hi' ? 'पोस्ट व्यूज़' : 'Post Views', value: stats.postViews },
          { label: lang === 'hi' ? 'वीडियो व्यूज़' : 'Video Views', value: stats.videoViews },
          { label: t('likes'), value: stats.likes },
          { label: t('comments'), value: stats.comments },
          { label: t('reposts'), value: stats.shares },
          { label: lang === 'hi' ? 'कुल एंगेजमेंट' : 'Total Engagement', value: stats.engagementTotal },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-4"
          >
            <div className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">{item.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono-tabular text-2xl font-bold">{item.value}</span>
              {item.sub && <span className="text-xs font-mono-tabular text-[#792BFF] dark:text-[#FF28B9]">{item.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* 7-Day Activity Chart */}
      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">
            {lang === 'hi' ? 'पिछले 7 दिनों के व्यूज़ और एंगेजमेंट' : 'Last 7 Days Views & Engagement'}
          </h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-[#792BFF] font-medium">{t('views')}</span>
            <span className="text-[#FF28B9] font-medium">{t('likes')}</span>
          </div>
        </div>
        <div className="h-44 flex items-end gap-3 pt-4">
          {series.map((d) => (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
              <div className="w-full flex items-end justify-center gap-1 h-32">
                <div
                  style={{ height: `${Math.max(4, Math.round((d.views / maxVal) * 100))}%` }}
                  className="w-3 rounded-t-md bg-[#792BFF] transition-all"
                  title={`Views: ${d.views}`}
                />
                <div
                  style={{ height: `${Math.max(4, Math.round((d.engagement / maxVal) * 100))}%` }}
                  className="w-3 rounded-t-md bg-[#FF28B9] transition-all"
                  title={`Likes: ${d.engagement}`}
                />
              </div>
              <span className="text-[10px] font-mono-tabular text-[#5A5B6E] dark:text-[#A2A3B8]">
                {d.date.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Performing Content */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{lang === 'hi' ? 'शीर्ष प्रदर्शन वाली पोस्ट' : 'Top Performing Content'}</h3>
        {!analytics || analytics.topPosts.length === 0 ? (
          <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-8 text-center text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
            {lang === 'hi' ? 'अभी कोई पोस्ट डेटा नहीं है।' : 'No published content metrics yet.'}
          </div>
        ) : (
          <div className="space-y-4">
            {analytics.topPosts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
