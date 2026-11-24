import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import type { StoryItem } from '../types';
import { Avatar } from './Avatar';
import { StoryViewerModal } from './StoryViewerModal';

export function StoriesBar() {
  const { user, openCreate, feedRefreshKey, t } = useApp();
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [activeAuthorStories, setActiveAuthorStories] = useState<StoryItem[] | null>(null);

  const loadStories = async () => {
    try {
      const res = await apiRequest<{ stories: StoryItem[] }>('/stories');
      setStories(res.stories || []);
    } catch {
      setStories([]);
    }
  };

  useEffect(() => {
    loadStories();
  }, [feedRefreshKey, user?.id]);

  // Group stories by author
  const grouped = stories.reduce<Record<string, StoryItem[]>>((acc, story) => {
    if (!acc[story.author_id]) acc[story.author_id] = [];
    acc[story.author_id].push(story);
    return acc;
  }, {});

  const authorGroups = Object.values(grouped);

  return (
    <>
      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-4 mb-5">
        <div className="flex items-center gap-4 overflow-x-auto pb-1">
          {/* Your Story */}
          <button
            onClick={() => openCreate('story')}
            className="flex flex-col items-center gap-1.5 shrink-0 group min-w-[68px]"
          >
            <div className="relative p-0.5 rounded-full border-2 border-dashed border-[#792BFF]/60 group-hover:border-[#FF28B9] transition-colors">
              <Avatar src={user?.avatar_url} name={user?.full_name || 'ZX'} size={56} />
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full zx-gradient-bg text-white flex items-center justify-center ring-2 ring-white dark:ring-[#101020]">
                <Plus className="w-3.5 h-3.5" />
              </span>
            </div>
            <span className="text-[11px] font-medium text-[#5A5B6E] dark:text-[#E8E8F2]/80 truncate max-w-[72px]">
              {t('yourStory')}
            </span>
          </button>

          {authorGroups.length === 0 ? (
            <div className="flex items-center px-3 py-2 text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
              {t('emptyStories')}
            </div>
          ) : (
            authorGroups.map((group) => {
              const first = group[0];
              const allViewed = group.every((s) => s.viewedByMe);
              return (
                <button
                  key={first.author_id}
                  onClick={() => setActiveAuthorStories(group)}
                  className="flex flex-col items-center gap-1.5 shrink-0 min-w-[68px]"
                >
                  <div
                    className={`p-[2.5px] rounded-full ${
                      allViewed ? 'bg-black/15 dark:bg-white/15' : 'zx-story-ring'
                    }`}
                  >
                    <div className="p-0.5 rounded-full bg-white dark:bg-[#101020]">
                      <Avatar src={first.author_avatar} name={first.author_name} size={52} />
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-[#080810] dark:text-[#E8E8F2] truncate max-w-[72px]">
                    {first.author_username}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {activeAuthorStories && (
        <StoryViewerModal
          stories={activeAuthorStories}
          onClose={() => {
            setActiveAuthorStories(null);
            loadStories();
          }}
        />
      )}
    </>
  );
}
