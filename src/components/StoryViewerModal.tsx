import React, { useEffect, useState } from 'react';
import { Bookmark, ChevronLeft, ChevronRight, Eye, Send, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { getFilterCss } from '../lib/mediaFilters';
import type { StoryItem } from '../types';
import { Avatar, VerifiedBadge } from './Avatar';

export function StoryViewerModal({
  stories,
  onClose,
}: {
  stories: StoryItem[];
  onClose: () => void;
}) {
  const { user, lang, toast, triggerFeedRefresh } = useApp();
  const [index, setIndex] = useState(0);
  const [reply, setReply] = useState('');
  const [showViewers, setShowViewers] = useState(false);

  const current = stories[index];

  useEffect(() => {
    if (!current || !user) return;
    apiRequest(`/stories/${current.id}/view`, { method: 'POST' }).catch(() => {});
  }, [current?.id, user?.id]);

  if (!current) return null;

  const isOwner = user?.id === current.author_id;

  const handleReact = async (reaction: string, replyText = '') => {
    if (!user) return;
    try {
      await apiRequest(`/stories/${current.id}/react`, {
        method: 'POST',
        body: JSON.stringify({ reaction, replyText }),
      });
      setReply('');
      toast(lang === 'hi' ? 'प्रतिक्रिया भेजी गई' : 'Reaction sent', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handlePinHighlight = async () => {
    try {
      const res = await apiRequest<{ isHighlight: boolean }>(`/stories/${current.id}/highlight`, {
        method: 'POST',
        body: JSON.stringify({ title: 'Highlights' }),
      });
      toast(
        res.isHighlight
          ? lang === 'hi'
            ? 'हाइलाइट्स में जोड़ा गया'
            : 'Pinned to Highlights'
          : lang === 'hi'
            ? 'हाइलाइट्स से हटाया गया'
            : 'Removed from Highlights',
        'success'
      );
      triggerFeedRefresh();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await apiRequest(`/stories/${current.id}`, { method: 'DELETE' });
      toast(lang === 'hi' ? 'स्टोरी हटाई गई' : 'Story deleted', 'success');
      triggerFeedRefresh();
      onClose();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/95 flex items-center justify-center p-2 sm:p-6">
      <div className="relative w-full max-w-md h-[88vh] max-h-[780px] rounded-3xl overflow-hidden bg-[#101020] border border-white/15 flex flex-col">
        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 z-20 flex gap-1.5">
          {stories.map((s, i) => (
            <div key={s.id} className="h-1 flex-1 rounded-full bg-white/25 overflow-hidden">
              <div className={`h-full transition-all ${i <= index ? 'w-full bg-white' : 'w-0'}`} />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-6 left-3 right-3 z-20 flex items-center justify-between pt-2">
          <div className="flex items-center gap-2.5">
            <Avatar src={current.author_avatar} name={current.author_name} size={36} />
            <div>
              <div className="flex items-center gap-1 text-sm font-semibold text-white">
                <span>{current.author_username}</span>
                <VerifiedBadge verified={current.author_verified} />
              </div>
              <span className="text-[11px] text-white/70">
                {new Date(current.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isOwner && (
              <>
                <button
                  onClick={handlePinHighlight}
                  title="Highlight"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
                >
                  <Bookmark className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDelete}
                  title="Delete"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full bg-black/40 text-red-300 hover:bg-black/60"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          style={{ background: current.background_style || undefined }}
          className="flex-1 relative flex items-center justify-center overflow-hidden"
        >
          {current.story_type === 'image' && (
            <img src={current.media_url} alt={current.text_content || 'Story'} className="w-full h-full object-cover" />
          )}
          {current.story_type === 'video' && (() => {
            let parsedOverlays: any[] = [];
            let filterCss = 'none';
            try {
              const raw = current.overlay_data ? JSON.parse(current.overlay_data) : [];
              if (Array.isArray(raw)) {
                parsedOverlays = raw;
              } else if (raw && typeof raw === 'object') {
                parsedOverlays = Array.isArray(raw.overlays) ? raw.overlays : [];
                filterCss = getFilterCss(raw.filter);
              }
            } catch {
              parsedOverlays = [];
            }
            return (
              <>
                <video
                  src={current.media_url}
                  autoPlay
                  playsInline
                  loop
                  controls
                  style={{ filter: filterCss }}
                  className="w-full h-full object-cover"
                />
                {parsedOverlays.map((overlay: any) => (
                  <div
                    key={overlay.id}
                    style={{
                      left: `${overlay.x}%`,
                      top: `${overlay.y}%`,
                      transform: `translate(-50%, -50%) rotate(${overlay.rotation ?? 0}deg) scale(${overlay.scale ?? 1})`,
                      color: overlay.color || '#FFFFFF',
                      fontSize: `${Math.round((overlay.fontSize || 24) * 0.9)}px`,
                      textAlign: overlay.align || 'center',
                    }}
                    className={`pointer-events-none absolute z-10 max-w-[84%] font-bold leading-snug whitespace-pre-wrap break-words ${
                      overlay.backdrop === 'frosted'
                        ? 'bg-[#080810]/60 backdrop-blur-md px-3.5 py-2 rounded-2xl'
                        : overlay.backdrop === 'solid'
                          ? 'bg-[#080810] px-3.5 py-2 rounded-2xl'
                          : overlay.backdrop === 'gradient'
                            ? 'zx-gradient-bg px-3.5 py-2 rounded-2xl'
                            : 'px-2 py-1 drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]'
                    }`}
                  >
                    {overlay.text}
                  </div>
                ))}
              </>
            );
          })()}
          {current.story_type === 'text' && (
            <div
              style={{ background: current.background_style }}
              className="w-full h-full flex items-center justify-center p-8 text-center"
            >
              <p className="font-display text-2xl font-bold text-white leading-snug break-words">
                {current.text_content}
              </p>
            </div>
          )}

          {/* Scrim for legibility */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 to-transparent" />

          {index > 0 && (
            <button
              onClick={() => setIndex((i) => i - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {index < stories.length - 1 && (
            <button
              onClick={() => setIndex((i) => i + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="relative z-20 p-3.5 bg-[#080810]/90 border-t border-white/10">
          {isOwner ? (
            <div>
              <button
                onClick={() => setShowViewers(!showViewers)}
                className="flex items-center gap-2 text-xs text-white/85 font-medium"
              >
                <Eye className="w-4 h-4 text-[#FF28B9]" />
                <span className="font-mono-tabular">
                  {current.viewsCount} {lang === 'hi' ? 'दर्शक' : 'viewers'}
                </span>
              </button>
              {showViewers && (
                <div className="mt-2 max-h-32 overflow-y-auto space-y-1.5 border-t border-white/10 pt-2">
                  {current.viewers.length === 0 ? (
                    <p className="text-xs text-white/50">{lang === 'hi' ? 'अभी कोई दर्शक नहीं' : 'No viewers yet'}</p>
                  ) : (
                    current.viewers.map((v) => (
                      <div key={v.id} className="flex items-center gap-2 text-xs text-white">
                        <Avatar src={v.avatar_url} name={v.full_name} size={24} />
                        <span>@{v.username}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-around">
                {['❤️', '🔥', '👏', '🙌', '✨'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReact(emoji)}
                    className="text-xl hover:scale-125 transition-transform p-1"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {user && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (reply.trim()) handleReact('💬', reply.trim());
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={lang === 'hi' ? 'स्टोरी पर जवाब भेजें...' : 'Reply to story...'}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-white/10 text-white placeholder-white/50 text-xs focus:outline-none focus:ring-1 focus:ring-[#792BFF]"
                  />
                  <button type="submit" className="px-3 py-2 rounded-xl zx-gradient-bg text-white">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
