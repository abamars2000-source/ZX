import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import type { NotificationItem } from '../types';
import { Avatar, VerifiedBadge } from './Avatar';

export function NotificationsView() {
  const { user, lang, navigate, openAuth, wsEvents, refreshBadges, t } = useApp();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ notifications: NotificationItem[] }>('/notifications');
      setItems(res.notifications || []);
      refreshBadges();
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, [user?.id, wsEvents?.seq]);

  const markAllRead = async () => {
    await apiRequest('/notifications/read', { method: 'POST', body: JSON.stringify({}) });
    loadNotifications();
  };

  const markOneRead = async (n: NotificationItem) => {
    if (!n.is_read) {
      await apiRequest('/notifications/read', { method: 'POST', body: JSON.stringify({ id: n.id }) });
    }
    if (n.type === 'message') {
      navigate('messages');
    } else {
      navigate('profile', n.actor_username);
    }
    loadNotifications();
  };

  if (!user) {
    return (
      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-10 text-center space-y-4">
        <h2 className="font-display text-xl font-bold">{t('navNotifications')}</h2>
        <p className="text-sm text-[#5A5B6E] dark:text-[#A2A3B8]">{t('emptyNotifications')}</p>
        <button onClick={() => openAuth('register')} className="px-5 py-2.5 rounded-xl zx-gradient-bg text-white text-sm font-semibold">
          {t('signUp')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">{t('navNotifications')}</h2>
        {items.some((i) => !i.is_read) && (
          <button
            onClick={markAllRead}
            className="px-3.5 py-2 rounded-xl bg-black/5 dark:bg-white/10 text-xs font-semibold flex items-center gap-1.5"
          >
            <CheckCheck className="w-4 h-4 text-[#792BFF]" />
            {t('markAllRead')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="h-44 rounded-2xl bg-black/5 dark:bg-[#101020] animate-pulse" />
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-10 text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-2xl zx-gradient-bg text-white flex items-center justify-center mb-4">
            <Bell className="w-6 h-6" />
          </div>
          <h3 className="font-display text-lg font-bold">{t('emptyNotifications')}</h3>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => markOneRead(n)}
              className={`w-full p-4 flex items-start gap-3 text-left transition-colors ${
                n.is_read ? 'opacity-75' : 'bg-[#792BFF]/5'
              } hover:bg-black/[0.02] dark:hover:bg-white/[0.02]`}
            >
              <Avatar src={n.actor_avatar} name={n.actor_name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="font-semibold">{n.actor_name}</span>
                  <VerifiedBadge verified={n.actor_verified} />
                  <span className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">@{n.actor_username}</span>
                </div>
                <p className="text-xs text-[#080810]/85 dark:text-[#E8E8F2]/85 mt-0.5">{n.message_preview}</p>
                <span className="text-[11px] font-mono-tabular text-[#5A5B6E] dark:text-[#A2A3B8]">
                  {new Date(n.created_at).toLocaleString()}
                </span>
              </div>
              {!n.is_read && <span className="w-2.5 h-2.5 rounded-full bg-[#FF28B9] mt-2 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
