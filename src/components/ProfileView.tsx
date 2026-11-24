import React, { useEffect, useState } from 'react';
import {
  Ban,
  Check,
  Edit3,
  Flag,
  Lock,
  MessageCircle,
  Share2,
  Sparkles,
  Upload,
  UserCheck,
  UserPlus,
  VolumeX,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest, uploadMediaFile } from '../lib/api';
import type { PostItem, StoryItem, UserProfile } from '../types';
import { Avatar, VerifiedBadge } from './Avatar';
import { PostCard } from './PostCard';

export function ProfileView({ username }: { username?: string | null }) {
  const { user, lang, navigate, openAuth, refreshUser, feedRefreshKey, t, toast } = useApp();
  const targetUsername = username || user?.username;

  const [data, setData] = useState<{
    profile: UserProfile;
    counts: { followers: number; following: number; posts: number };
    relation: {
      isOwn: boolean;
      isFollowing: boolean;
      followRequested: boolean;
      isBlocked: boolean;
      isMuted: boolean;
      canView: boolean;
    };
    posts: PostItem[];
    reposts: PostItem[];
    highlights: StoryItem[];
  } | null>(null);
  const [tab, setTab] = useState<'posts' | 'photos' | 'videos' | 'reposts' | 'bookmarks'>('posts');
  const [bookmarks, setBookmarks] = useState<PostItem[]>([]);
  const [followRequests, setFollowRequests] = useState<any[]>([]);
  const [connectionsModal, setConnectionsModal] = useState<'followers' | 'following' | null>(null);
  const [connectionsList, setConnectionsList] = useState<any[]>([]);
  const [editModal, setEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = async () => {
    if (!targetUsername) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<any>(`/profiles/${encodeURIComponent(targetUsername)}`);
      setData(res);
      setEditName(res.profile.full_name);
      setEditBio(res.profile.bio || '');
      setEditPrivate(Boolean(res.profile.is_private));
      if (res.relation.isOwn) {
        const [reqRes, bmRes] = await Promise.all([
          apiRequest<{ requests: any[] }>('/follow-requests'),
          apiRequest<{ posts: PostItem[] }>('/bookmarks'),
        ]);
        setFollowRequests(reqRes.requests || []);
        setBookmarks(bmRes.posts || []);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [targetUsername, feedRefreshKey, user?.id]);

  if (!targetUsername) {
    return (
      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-10 text-center space-y-4">
        <h2 className="font-display text-2xl font-bold">{lang === 'hi' ? 'अपनी ZX पहचान बनाएं' : 'Create Your ZX Identity'}</h2>
        <p className="text-sm text-[#5A5B6E] dark:text-[#A2A3B8]">{t('zeroUsersLabel')}</p>
        <div className="flex justify-center gap-3">
          <button onClick={() => openAuth('register')} className="px-5 py-2.5 rounded-xl zx-gradient-bg text-white text-sm font-semibold">
            {t('signUp')}
          </button>
          <button onClick={() => openAuth('login')} className="px-5 py-2.5 rounded-xl bg-black/5 dark:bg-white/10 text-sm font-semibold">
            {t('signIn')}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="h-72 rounded-3xl bg-black/5 dark:bg-[#101020] animate-pulse" />;
  }

  if (!data) {
    return (
      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-10 text-center">
        <p className="text-sm text-[#5A5B6E] dark:text-[#A2A3B8]">
          {lang === 'hi' ? 'यह प्रोफ़ाइल उपलब्ध नहीं है।' : 'Profile not found.'}
        </p>
      </div>
    );
  }

  const { profile, counts, relation, posts, reposts, highlights } = data;

  const handleFollowToggle = async () => {
    if (!user) return openAuth('register');
    try {
      if (relation.isFollowing || relation.followRequested) {
        await apiRequest(`/follow/${profile.id}`, { method: 'DELETE' });
      } else {
        await apiRequest(`/follow/${profile.id}`, { method: 'POST' });
      }
      loadProfile();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleMessage = async () => {
    if (!user) return openAuth('register');
    try {
      await apiRequest('/messages/conversations', {
        method: 'POST',
        body: JSON.stringify({ participantIds: [profile.id] }),
      });
      navigate('messages');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleBlock = async () => {
    if (!user) return openAuth('register');
    if (relation.isBlocked) {
      await apiRequest(`/block/${profile.id}`, { method: 'DELETE' });
    } else {
      await apiRequest(`/block/${profile.id}`, { method: 'POST' });
    }
    loadProfile();
  };

  const handleMute = async () => {
    if (!user) return openAuth('register');
    if (relation.isMuted) {
      await apiRequest(`/mute/${profile.id}`, { method: 'DELETE' });
    } else {
      await apiRequest(`/mute/${profile.id}`, { method: 'POST' });
    }
    loadProfile();
  };

  const handleRespondRequest = async (id: string, action: 'approve' | 'reject') => {
    await apiRequest(`/follow-requests/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    loadProfile();
  };

  const openConnections = async (type: 'followers' | 'following') => {
    try {
      const res = await apiRequest<{ users: any[] }>(`/profiles/${profile.username}/connections?type=${type}`);
      setConnectionsList(res.users || []);
      setConnectionsModal(type);
    } catch {
      toast(lang === 'hi' ? 'प्राइवेट अकाउंट' : 'Private account', 'info');
    }
  };

  const handleUploadProfileMedia = async (kind: 'avatars' | 'covers', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadMediaFile(kind, file);
      await apiRequest('/profile/me', {
        method: 'PUT',
        body: JSON.stringify(kind === 'avatars' ? { avatarUrl: uploaded.url } : { coverUrl: uploaded.url }),
      });
      await refreshUser();
      loadProfile();
      toast(lang === 'hi' ? 'फ़ोटो अपडेट हो गई' : 'Photo updated', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/profile/me', {
      method: 'PUT',
      body: JSON.stringify({ fullName: editName, bio: editBio, isPrivate: editPrivate }),
    });
    await refreshUser();
    setEditModal(false);
    loadProfile();
  };

  const photoPosts = posts.filter((p) => p.media.some((m) => m.media_type === 'image'));
  const videoPosts = posts.filter((p) => p.post_type === 'short' || p.media.some((m) => m.media_type === 'video'));
  const activeList =
    tab === 'posts'
      ? posts
      : tab === 'photos'
        ? photoPosts
        : tab === 'videos'
          ? videoPosts
          : tab === 'reposts'
            ? reposts
            : bookmarks;

  return (
    <div className="space-y-5">
      {/* Profile Card */}
      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl overflow-hidden">
        {/* Cover */}
        <div className="relative h-40 sm:h-52 bg-gradient-to-r from-[#080810] via-[#792BFF]/40 to-[#FF28B9]/40">
          {profile.cover_url && (
            <img src={profile.cover_url} alt="Cover" className="w-full h-full object-cover" />
          )}
          {relation.isOwn && (
            <label className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-black/60 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer backdrop-blur-md">
              <Upload className="w-3.5 h-3.5" />
              <span>{lang === 'hi' ? 'कवर बदलें' : 'Edit Cover'}</span>
              <input type="file" accept="image/*" onChange={(e) => handleUploadProfileMedia('covers', e)} className="hidden" />
            </label>
          )}
        </div>

        <div className="px-5 pb-6">
          <div className="flex flex-wrap items-end justify-between gap-4 -mt-10 sm:-mt-12 mb-4">
            <div className="relative">
              <div className="p-1 rounded-full bg-white dark:bg-[#101020]">
                <Avatar src={profile.avatar_url} name={profile.full_name} size={88} online={profile.online} />
              </div>
              {relation.isOwn && (
                <label className="absolute bottom-1 right-1 w-7 h-7 rounded-full zx-gradient-bg text-white flex items-center justify-center cursor-pointer ring-2 ring-white dark:ring-[#101020]">
                  <Upload className="w-3.5 h-3.5" />
                  <input type="file" accept="image/*" onChange={(e) => handleUploadProfileMedia('avatars', e)} className="hidden" />
                </label>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              {relation.isOwn ? (
                <button
                  onClick={() => setEditModal(true)}
                  className="px-4 py-2 rounded-xl bg-black/5 dark:bg-white/10 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {t('editProfile')}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleFollowToggle}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                      relation.isFollowing || relation.followRequested
                        ? 'bg-black/5 dark:bg-white/10 text-[#080810] dark:text-white'
                        : 'zx-gradient-bg text-white'
                    }`}
                  >
                    {relation.isFollowing ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                    {relation.isFollowing
                      ? t('followingBtn')
                      : relation.followRequested
                        ? t('requested')
                        : t('follow')}
                  </button>
                  <button
                    onClick={handleMessage}
                    className="px-4 py-2 rounded-xl bg-black/5 dark:bg-white/10 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    {t('messageBtn')}
                  </button>
                  <button
                    onClick={handleMute}
                    title={relation.isMuted ? t('unmute') : t('mute')}
                    className="p-2 rounded-xl bg-black/5 dark:bg-white/10"
                  >
                    <VolumeX className={`w-4 h-4 ${relation.isMuted ? 'text-amber-500' : ''}`} />
                  </button>
                  <button
                    onClick={handleBlock}
                    title={relation.isBlocked ? t('unblock') : t('block')}
                    className="p-2 rounded-xl bg-black/5 dark:bg-white/10"
                  >
                    <Ban className={`w-4 h-4 ${relation.isBlocked ? 'text-red-500' : ''}`} />
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}/?u=${profile.username}`);
                  toast(lang === 'hi' ? 'प्रोफ़ाइल लिंक कॉपी किया गया' : 'Profile link copied', 'info');
                }}
                className="p-2 rounded-xl bg-black/5 dark:bg-white/10"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-bold text-[#080810] dark:text-white">{profile.full_name}</h1>
              <VerifiedBadge verified={profile.is_verified} />
              {profile.is_private === 1 && <Lock className="w-4 h-4 text-[#5A5B6E] dark:text-[#A2A3B8]" />}
            </div>
            <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">@{profile.username}</p>
            {profile.bio && <p className="text-sm text-[#080810]/90 dark:text-[#E8E8F2]/90 pt-1">{profile.bio}</p>}
          </div>

          {/* Real Database Counts */}
          <div className="flex items-center gap-6 mt-4 pt-4 border-t border-black/5 dark:border-white/5 text-sm">
            <div>
              <span className="font-mono-tabular font-bold">{counts.posts}</span>{' '}
              <span className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">{t('postsCount')}</span>
            </div>
            <button onClick={() => openConnections('followers')} className="hover:underline">
              <span className="font-mono-tabular font-bold">{counts.followers}</span>{' '}
              <span className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">{t('followers')}</span>
            </button>
            <button onClick={() => openConnections('following')} className="hover:underline">
              <span className="font-mono-tabular font-bold">{counts.following}</span>{' '}
              <span className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">{t('followingCount')}</span>
            </button>
          </div>

          {/* Story Highlights */}
          {highlights.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pt-4 mt-4 border-t border-black/5 dark:border-white/5">
              {highlights.map((h) => (
                <div key={h.id} className="flex flex-col items-center gap-1 shrink-0">
                  <div className="w-14 h-14 rounded-full p-0.5 zx-story-ring overflow-hidden">
                    <div className="w-full h-full rounded-full overflow-hidden bg-[#080810] flex items-center justify-center">
                      {h.media_url ? (
                        <img src={h.media_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Sparkles className="w-5 h-5 text-white" />
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8]">{h.highlight_title || 'Highlight'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pending Follow Requests (Owner Only) */}
      {relation.isOwn && followRequests.length > 0 && (
        <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-[#5A5B6E] dark:text-[#A2A3B8]">
            {lang === 'hi' ? 'फॉलो अनुरोध' : 'Follow Requests'} ({followRequests.length})
          </h3>
          {followRequests.map((req) => (
            <div key={req.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Avatar src={req.avatar_url} name={req.full_name} size={36} />
                <div>
                  <div className="text-sm font-semibold">{req.full_name}</div>
                  <div className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">@{req.username}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRespondRequest(req.id, 'approve')}
                  className="px-3 py-1.5 rounded-lg zx-gradient-bg text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  {lang === 'hi' ? 'स्वीकारें' : 'Approve'}
                </button>
                <button
                  onClick={() => handleRespondRequest(req.id, 'reject')}
                  className="px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/10 text-xs"
                >
                  {lang === 'hi' ? 'अस्वीकारें' : 'Reject'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Profile Content */}
      {!relation.canView ? (
        <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-10 text-center space-y-2">
          <Lock className="w-8 h-8 mx-auto text-[#792BFF]" />
          <h3 className="font-display text-lg font-bold">
            {lang === 'hi' ? 'यह अकाउंट प्राइवेट है' : 'This Account is Private'}
          </h3>
          <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
            {lang === 'hi' ? 'उनकी पोस्ट देखने के लिए फॉलो करें।' : 'Follow this account to see their posts.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 overflow-x-auto p-1 bg-black/5 dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-xl w-fit">
            {(
              [
                { id: 'posts', label: t('postsCount') },
                { id: 'photos', label: lang === 'hi' ? 'फ़ोटो' : 'Photos' },
                { id: 'videos', label: lang === 'hi' ? 'वीडियो' : 'Videos' },
                { id: 'reposts', label: t('reposts') },
                ...(relation.isOwn ? [{ id: 'bookmarks', label: lang === 'hi' ? 'बुकमार्क' : 'Saved' }] : []),
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                  tab === item.id ? 'zx-gradient-bg text-white' : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {activeList.length === 0 ? (
            <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-8 text-center text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
              {lang === 'hi' ? 'अभी यहाँ कोई सामग्री नहीं है।' : 'No items here yet.'}
            </div>
          ) : (
            <div className="space-y-4">
              {activeList.map((post) => (
                <PostCard key={post.id} post={post} onMutate={loadProfile} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Connections Modal */}
      {connectionsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base">
                {connectionsModal === 'followers' ? t('followers') : t('followingCount')}
              </h3>
              <button onClick={() => setConnectionsModal(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2.5">
              {connectionsList.length === 0 ? (
                <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] py-4 text-center">
                  {lang === 'hi' ? 'अभी कोई यूज़र नहीं है।' : 'No users yet.'}
                </p>
              ) : (
                connectionsList.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setConnectionsModal(null);
                        navigate('profile', u.username);
                      }}
                      className="flex items-center gap-2.5 text-left"
                    >
                      <Avatar src={u.avatar_url} name={u.full_name} size={36} />
                      <div>
                        <div className="text-sm font-semibold">{u.full_name}</div>
                        <div className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">@{u.username}</div>
                      </div>
                    </button>
                    {relation.isOwn && connectionsModal === 'followers' && (
                      <button
                        onClick={async () => {
                          await apiRequest(`/followers/${u.id}`, { method: 'DELETE' });
                          openConnections('followers');
                          loadProfile();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/10 text-xs"
                      >
                        {lang === 'hi' ? 'हटाएं' : 'Remove'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">{t('editProfile')}</h3>
              <button type="button" onClick={() => setEditModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-xs text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">{t('fullName')}</label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">{t('bio')}</label>
              <textarea
                rows={3}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm"
              />
            </div>
            <label className="flex items-center gap-2.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={editPrivate}
                onChange={(e) => setEditPrivate(e.target.checked)}
                className="rounded text-[#792BFF]"
              />
              <span>{t('privateAccount')}</span>
            </label>
            <button type="submit" className="w-full py-2.5 rounded-xl zx-gradient-bg text-white text-sm font-semibold">
              {t('save')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
