import React, { useEffect, useRef, useState } from 'react';
import {
  Ban,
  CheckCheck,
  ImagePlus,
  MessageSquarePlus,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest, uploadMediaFile } from '../lib/api';
import type { ConversationItem, MessageItem, UserProfile } from '../types';
import { Avatar } from './Avatar';

export function MessagesView() {
  const { user, lang, openAuth, wsEvents, sendWsEvent, refreshBadges, t, toast } = useApp();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [msgText, setMsgText] = useState('');
  const [attachment, setAttachment] = useState<{ url: string; mediaType: 'image' | 'video'; storagePath: string } | null>(
    null
  );
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [showRequests, setShowRequests] = useState(false);
  const [newChatModal, setNewChatModal] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [userResults, setUserResults] = useState<UserProfile[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = async () => {
    if (!user) return;
    try {
      const res = await apiRequest<{ conversations: ConversationItem[] }>('/messages/conversations');
      setConversations(res.conversations || []);
      if (!activeId && res.conversations?.length > 0) {
        setActiveId(res.conversations[0].id);
      }
    } catch {
      setConversations([]);
    }
  };

  const loadMessages = async (cid: string) => {
    try {
      const res = await apiRequest<{ messages: MessageItem[] }>(`/messages/conversations/${cid}`);
      setMessages(res.messages || []);
      refreshBadges();
    } catch {
      setMessages([]);
    }
  };

  useEffect(() => {
    loadConversations();
  }, [user?.id]);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Listen to WebSocket events
  useEffect(() => {
    if (!wsEvents) return;
    if (wsEvents.event === 'message:new') {
      const msg = wsEvents.payload as MessageItem;
      if (msg.conversation_id === activeId) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      }
      loadConversations();
    }
    if (wsEvents.event === 'typing') {
      const { conversationId, userId, isTyping } = wsEvents.payload;
      if (conversationId === activeId && userId !== user?.id) {
        setTypingUsers((prev) => ({ ...prev, [userId]: isTyping }));
      }
    }
    if (wsEvents.event === 'presence') {
      loadConversations();
    }
  }, [wsEvents?.seq]);

  useEffect(() => {
    if (!newChatModal) return;
    apiRequest<{ users: UserProfile[] }>(`/explore?q=${encodeURIComponent(searchUsers)}`)
      .then((res) => setUserResults((res.users || []).filter((u) => u.id !== user?.id)))
      .catch(() => setUserResults([]));
  }, [newChatModal, searchUsers]);

  if (!user) {
    return (
      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-10 text-center space-y-4">
        <h2 className="font-display text-xl font-bold">{t('navMessages')}</h2>
        <p className="text-sm text-[#5A5B6E] dark:text-[#A2A3B8]">{t('emptyMessages')}</p>
        <button onClick={() => openAuth('register')} className="px-5 py-2.5 rounded-xl zx-gradient-bg text-white text-sm font-semibold">
          {t('signUp')}
        </button>
      </div>
    );
  }

  const activeConv = conversations.find((c) => c.id === activeId);
  const otherMembers = activeConv ? activeConv.members.filter((m) => m.id !== user.id) : [];
  const visibleConvs = conversations.filter((c) => (showRequests ? c.is_request === 1 : c.is_request === 0));

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await uploadMediaFile('chat-attachments', file);
      setAttachment(res);
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || (!msgText.trim() && !attachment)) return;
    try {
      await apiRequest(`/messages/conversations/${activeId}`, {
        method: 'POST',
        body: JSON.stringify({
          content: msgText.trim(),
          attachmentUrl: attachment?.url || '',
          attachmentType: attachment?.mediaType || '',
          storagePath: attachment?.storagePath || '',
        }),
      });
      setMsgText('');
      setAttachment(null);
      sendWsEvent('typing', { conversationId: activeId, isTyping: false });
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleStartChat = async () => {
    if (selectedRecipients.length === 0) return;
    try {
      const res = await apiRequest<{ conversationId: string }>('/messages/conversations', {
        method: 'POST',
        body: JSON.stringify({
          participantIds: selectedRecipients,
          isGroup: selectedRecipients.length > 1,
          title: groupTitle,
        }),
      });
      setNewChatModal(false);
      setSelectedRecipients([]);
      setGroupTitle('');
      await loadConversations();
      setActiveId(res.conversationId);
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleDeleteConversation = async () => {
    if (!activeId) return;
    await apiRequest(`/messages/conversations/${activeId}`, { method: 'DELETE' });
    setActiveId(null);
    setMessages([]);
    loadConversations();
  };

  const handleBlockOther = async () => {
    if (otherMembers.length !== 1) return;
    await apiRequest(`/block/${otherMembers[0].id}`, { method: 'POST' });
    toast(lang === 'hi' ? 'यूज़र ब्लॉक किया गया' : 'User blocked', 'info');
    handleDeleteConversation();
  };

  return (
    <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[70vh]">
      {/* Conversations List */}
      <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-black/10 dark:border-white/10 flex flex-col">
        <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
          <h2 className="font-display font-bold text-base">{t('navMessages')}</h2>
          <button
            onClick={() => setNewChatModal(true)}
            className="p-2 rounded-xl zx-gradient-bg text-white"
            title={lang === 'hi' ? 'नई बातचीत' : 'New Chat'}
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex p-1.5 gap-1 border-b border-black/5 dark:border-white/5">
          <button
            onClick={() => setShowRequests(false)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
              !showRequests ? 'bg-black/10 dark:bg-white/10' : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
            }`}
          >
            {lang === 'hi' ? 'इनबॉक्स' : 'Inbox'}
          </button>
          <button
            onClick={() => setShowRequests(true)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
              showRequests ? 'bg-black/10 dark:bg-white/10' : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
            }`}
          >
            {lang === 'hi' ? 'अनुरोध' : 'Requests'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-black/5 dark:divide-white/5">
          {visibleConvs.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">{t('emptyMessages')}</div>
          ) : (
            visibleConvs.map((c) => {
              const peers = c.members.filter((m) => m.id !== user.id);
              const title = c.is_group ? c.title || peers.map((p) => p.username).join(', ') : peers[0]?.full_name || 'Chat';
              const online = peers.some((p) => p.online);
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full p-3.5 flex items-center gap-3 text-left transition-colors ${
                    activeId === c.id ? 'bg-[#792BFF]/10' : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'
                  }`}
                >
                  <Avatar src={peers[0]?.avatar_url} name={title} size={40} online={online} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold truncate">{title}</span>
                      {c.unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full zx-gradient-bg text-white text-[10px] font-mono-tabular">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] truncate">
                      {c.lastMessage?.content || (c.lastMessage?.attachment_type ? '📎 Media' : '...')}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Thread */}
      <div className="md:col-span-8 flex flex-col">
        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <Users className="w-10 h-10 text-[#792BFF] mb-3" />
            <h3 className="font-display font-bold text-lg">{t('emptyMessages')}</h3>
            <button
              onClick={() => setNewChatModal(true)}
              className="mt-4 px-4 py-2 rounded-xl zx-gradient-bg text-white text-xs font-semibold"
            >
              {lang === 'hi' ? 'बातचीत शुरू करें' : 'Start a Conversation'}
            </button>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar
                  src={otherMembers[0]?.avatar_url}
                  name={activeConv.title || otherMembers[0]?.full_name || 'Chat'}
                  size={38}
                  online={otherMembers.some((m) => m.online)}
                />
                <div>
                  <div className="text-sm font-semibold">
                    {activeConv.is_group
                      ? activeConv.title || otherMembers.map((m) => m.username).join(', ')
                      : otherMembers[0]?.full_name}
                  </div>
                  <div className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8]">
                    {Object.values(typingUsers).some(Boolean)
                      ? lang === 'hi'
                        ? 'लिख रहे हैं...'
                        : 'Typing...'
                      : otherMembers.some((m) => m.online)
                        ? lang === 'hi'
                          ? 'ऑनलाइन'
                          : 'Online'
                        : lang === 'hi'
                          ? 'निजी चैट'
                          : 'Private Chat'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {otherMembers.length === 1 && (
                  <button
                    onClick={handleBlockOther}
                    title={t('block')}
                    className="p-2 rounded-xl hover:bg-red-500/10 text-red-400"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={handleDeleteConversation}
                  title={t('delete')}
                  className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-[#5A5B6E] dark:text-[#A2A3B8]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[52vh]">
              {messages.map((m) => {
                const mine = m.sender_id === user.id;
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm space-y-1.5 ${
                        mine
                          ? 'zx-gradient-bg text-white'
                          : 'bg-black/5 dark:bg-white/10 text-[#080810] dark:text-white'
                      }`}
                    >
                      {m.attachment_url &&
                        (m.attachment_type === 'video' ? (
                          <video src={m.attachment_url} controls className="rounded-xl max-h-56" />
                        ) : (
                          <img src={m.attachment_url} alt="" className="rounded-xl max-h-56 object-cover" />
                        ))}
                      {m.content && <p className="break-words">{m.content}</p>}
                      <div className="flex items-center justify-end gap-1 text-[10px] opacity-75 font-mono-tabular">
                        <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {mine && <CheckCheck className="w-3 h-3" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} className="p-3 border-t border-black/10 dark:border-white/10 space-y-2">
              {attachment && (
                <div className="flex items-center gap-2 text-xs text-[#792BFF]">
                  <span>📎 {attachment.mediaType}</span>
                  <button type="button" onClick={() => setAttachment(null)} className="text-red-400">
                    ×
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 cursor-pointer">
                  <ImagePlus className="w-4 h-4 text-[#792BFF]" />
                  <input type="file" accept="image/*,video/*" onChange={handleUpload} className="hidden" />
                </label>
                <input
                  type="text"
                  value={msgText}
                  onChange={(e) => {
                    setMsgText(e.target.value);
                    sendWsEvent('typing', { conversationId: activeId, isTyping: e.target.value.length > 0 });
                  }}
                  placeholder={lang === 'hi' ? 'संदेश लिखें...' : 'Write a message...'}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm focus:outline-none"
                />
                <button type="submit" className="px-4 py-2.5 rounded-xl zx-gradient-bg text-white">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* New Chat Modal */}
      {newChatModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base">
                {lang === 'hi' ? 'नई बातचीत या ग्रुप' : 'New Chat or Group'}
              </h3>
              <button onClick={() => setNewChatModal(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={searchUsers}
              onChange={(e) => setSearchUsers(e.target.value)}
              placeholder={lang === 'hi' ? 'यूज़र खोजें...' : 'Search users...'}
              className="w-full px-3.5 py-2 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm"
            />
            {selectedRecipients.length > 1 && (
              <input
                type="text"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder={lang === 'hi' ? 'ग्रुप का नाम (वैकल्पिक)' : 'Group name (optional)'}
                className="w-full px-3.5 py-2 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm"
              />
            )}
            <div className="max-h-56 overflow-y-auto space-y-2">
              {userResults.length === 0 ? (
                <p className="text-xs text-center text-[#5A5B6E] dark:text-[#A2A3B8] py-4">
                  {lang === 'hi' ? 'कोई अन्य यूज़र नहीं मिला।' : 'No other users found yet.'}
                </p>
              ) : (
                userResults.map((u) => {
                  const selected = selectedRecipients.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() =>
                        setSelectedRecipients((prev) =>
                          prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id]
                        )
                      }
                      className={`w-full p-2.5 rounded-xl flex items-center justify-between border ${
                        selected ? 'border-[#792BFF] bg-[#792BFF]/10' : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar src={u.avatar_url} name={u.full_name} size={34} />
                        <div className="text-left">
                          <div className="text-xs font-semibold">{u.full_name}</div>
                          <div className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8]">@{u.username}</div>
                        </div>
                      </div>
                      {selected && <span className="text-xs text-[#792BFF] font-bold">✓</span>}
                    </button>
                  );
                })
              )}
            </div>
            <button
              disabled={selectedRecipients.length === 0}
              onClick={handleStartChat}
              className="w-full py-2.5 rounded-xl zx-gradient-bg text-white text-sm font-semibold disabled:opacity-40"
            >
              {lang === 'hi' ? 'चैट शुरू करें' : 'Start Chat'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
