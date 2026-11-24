import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { TRANSLATIONS } from '../i18n/translations';
import { apiRequest, getAuthToken, setAuthToken } from '../lib/api';
import { syncUserProfileToFirestore } from '../lib/firebase';
import { signOutGoogle } from '../lib/firebaseAuth';
import { signOutSupabase } from '../lib/supabase';
import type { LangCode, NavTab, ThemeMode, UserProfile, UserSettings } from '../types';

interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

interface AppContextValue {
  user: UserProfile | null;
  role: string | null;
  settings: UserSettings | null;
  token: string | null;
  theme: ThemeMode;
  lang: LangCode;
  activeTab: NavTab;
  viewingUsername: string | null;
  unreadNotifications: number;
  unreadMessages: number;
  authModalOpen: boolean;
  authInitialMode: 'login' | 'register';
  createModalMode: 'home' | 'zx' | 'story' | 'short' | null;
  createPrefill: string | null;
  feedRefreshKey: number;
  wsEvents: { event: string; payload: any; seq: number } | null;
  t: (key: string) => string;
  setTheme: (next: ThemeMode) => void;
  setLang: (next: LangCode) => void;
  navigate: (tab: NavTab, username?: string | null) => void;
  openAuth: (mode?: 'login' | 'register') => void;
  closeAuth: () => void;
  openCreate: (mode: 'home' | 'zx' | 'story' | 'short', prefillText?: string) => void;
  closeCreate: () => void;
  refreshUser: () => Promise<void>;
  refreshBadges: () => Promise<void>;
  triggerFeedRefresh: () => void;
  loginSuccess: (token: string, user: UserProfile, role: string | null) => void;
  logout: () => Promise<void>;
  toast: (message: string, type?: 'info' | 'success' | 'error') => void;
  sendWsEvent: (event: string, data: Record<string, unknown>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [lang, setLangState] = useState<LangCode>('hi');
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/admin') {
      return 'admin';
    }
    return 'home';
  });
  const [viewingUsername, setViewingUsername] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('register');
  const [createModalMode, setCreateModalMode] = useState<'home' | 'zx' | 'story' | 'short' | null>(null);
  const [createPrefill, setCreatePrefill] = useState<string | null>(null);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [wsEvents, setWsEvents] = useState<{ event: string; payload: any; seq: number } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const seqRef = useRef(0);

  // Sync Tailwind dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const toast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  const t = useCallback(
    (key: string) => {
      return TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key;
    },
    [lang]
  );

  const refreshBadges = useCallback(async () => {
    if (!getAuthToken()) return;
    try {
      const [notifRes, convRes] = await Promise.all([
        apiRequest<{ unreadCount: number }>('/notifications'),
        apiRequest<{ conversations: Array<{ unreadCount: number }> }>('/messages/conversations'),
      ]);
      setUnreadNotifications(notifRes.unreadCount || 0);
      const msgTotal = (convRes.conversations || []).reduce((acc, c) => acc + (c.unreadCount || 0), 0);
      setUnreadMessages(msgTotal);
    } catch {
      // ignore background refresh error
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getAuthToken()) return;
    try {
      const data = await apiRequest<{ user: UserProfile; settings: UserSettings; role: string | null }>('/auth/me');
      setUser(data.user);
      setSettings(data.settings);
      setRole(data.role);
      if (data.settings?.theme === 'light' || data.settings?.theme === 'dark') {
        setThemeState(data.settings.theme);
      }
      if (data.settings?.language === 'hi' || data.settings?.language === 'en') {
        setLangState(data.settings.language);
      }
      if (data.user) {
        syncUserProfileToFirestore({
          username: data.user.username,
          fullName: data.user.full_name,
          bio: data.user.bio || '',
          avatarUrl: data.user.avatar_url || '',
          language: data.user.language === 'en' ? 'en' : 'hi',
          isPrivate: Boolean(data.user.is_private),
          email: data.user.email || '',
        }).catch(() => {});
      }
    } catch {
      setAuthToken(null);
      setToken(null);
      setUser(null);
      setRole(null);
    }
  }, []);

  // Connect real-time WebSocket when logged in
  useEffect(() => {
    if (!token) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let closedByCleanup = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closedByCleanup) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data);
          seqRef.current += 1;
          setWsEvents({ event: parsed.event, payload: parsed.payload, seq: seqRef.current });
          if (parsed.event === 'notification:new') {
            setUnreadNotifications((n) => n + 1);
          }
          if (parsed.event === 'message:new') {
            refreshBadges();
          }
        } catch {
          // ignore malformed event
        }
      };

      ws.onclose = () => {
        if (!closedByCleanup) {
          reconnectTimer = setTimeout(connect, 2500);
        }
      };
    };

    connect();
    refreshBadges();

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
    };
  }, [token, refreshBadges]);

  const sendWsEvent = useCallback((event: string, data: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, ...data }));
    }
  }, []);

  const setTheme = useCallback(
    (next: ThemeMode) => {
      setThemeState(next);
      if (getAuthToken()) {
        apiRequest('/settings/me', { method: 'PUT', body: JSON.stringify({ theme: next }) }).catch(() => {});
      }
    },
    []
  );

  const setLang = useCallback(
    (next: LangCode) => {
      setLangState(next);
      if (getAuthToken()) {
        apiRequest('/settings/me', { method: 'PUT', body: JSON.stringify({ language: next }) }).catch(() => {});
      }
    },
    []
  );

  const navigate = useCallback((tab: NavTab, username: string | null = null) => {
    setActiveTab(tab);
    setViewingUsername(username);
    if (tab === 'admin') {
      window.history.replaceState(null, '', '/admin');
    } else if (window.location.pathname === '/admin') {
      window.history.replaceState(null, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openAuth = useCallback((mode: 'login' | 'register' = 'register') => {
    setAuthInitialMode(mode);
    setAuthModalOpen(true);
  }, []);

  const closeAuth = useCallback(() => setAuthModalOpen(false), []);

  const openCreate = useCallback(
    (mode: 'home' | 'zx' | 'story' | 'short', prefillText?: string) => {
      if (!user) {
        setAuthInitialMode('register');
        setAuthModalOpen(true);
        return;
      }
      setCreatePrefill(prefillText || null);
      setCreateModalMode(mode);
    },
    [user]
  );

  const closeCreate = useCallback(() => {
    setCreateModalMode(null);
    setCreatePrefill(null);
  }, []);
  const triggerFeedRefresh = useCallback(() => setFeedRefreshKey((k) => k + 1), []);

  const loginSuccess = useCallback(
    (nextToken: string, nextUser: UserProfile, nextRole: string | null) => {
      setAuthToken(nextToken);
      setToken(nextToken);
      setUser(nextUser);
      setRole(nextRole);
      if (nextUser.language === 'en' || nextUser.language === 'hi') {
        setLangState(nextUser.language);
      }
      setAuthModalOpen(false);
      refreshUser();
    },
    [refreshUser]
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    await Promise.all([signOutGoogle(), signOutSupabase()]);
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setRole(null);
    setSettings(null);
    setUnreadNotifications(0);
    setUnreadMessages(0);
    navigate('home');
  }, [navigate]);

  return (
    <AppContext.Provider
      value={{
        user,
        role,
        settings,
        token,
        theme,
        lang,
        activeTab,
        viewingUsername,
        unreadNotifications,
        unreadMessages,
        authModalOpen,
        authInitialMode,
        createModalMode,
        createPrefill,
        feedRefreshKey,
        wsEvents,
        t,
        setTheme,
        setLang,
        navigate,
        openAuth,
        closeAuth,
        openCreate,
        closeCreate,
        refreshUser,
        refreshBadges,
        triggerFeedRefresh,
        loginSuccess,
        logout,
        toast,
        sendWsEvent,
      }}
    >
      {children}
      {/* Toast Notifications */}
      <div className="fixed bottom-20 md:bottom-6 right-4 z-[90] flex flex-col gap-2 pointer-events-none max-w-sm">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto px-4 py-3 rounded-xl text-sm font-medium border shadow-lg backdrop-blur-md transition-all ${
              item.type === 'error'
                ? 'bg-red-950/90 text-red-100 border-red-500/40'
                : item.type === 'success'
                  ? 'bg-[#101020]/95 text-white border-[#792BFF]/50'
                  : 'bg-white/95 dark:bg-[#101020]/95 text-[#080810] dark:text-white border-black/10 dark:border-white/10'
            }`}
          >
            {item.message}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
