import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  Compass,
  Feather,
  Film,
  Home,
  MessageCircle,
  Moon,
  PlusSquare,
  Search,
  Settings,
  Shield,
  Sparkles,
  Sun,
  User,
} from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { apiRequest } from './lib/api';
import { AdminDashboardView } from './components/AdminDashboardView';
import { AiStudioView } from './components/AiStudioView';
import { AuthGatePage, AuthModal, OnboardingModal } from './components/AuthViews';
import { Avatar } from './components/Avatar';
import { CreateModal } from './components/CreateModal';
import { CreatorStudioView } from './components/CreatorStudioView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExploreView } from './components/ExploreView';
import { HomeFeed } from './components/HomeFeed';
import { MessagesView } from './components/MessagesView';
import { NotificationsView } from './components/NotificationsView';
import { ProfileView } from './components/ProfileView';
import { SettingsView } from './components/SettingsView';
import { ShortsView } from './components/ShortsView';
import { SplashScreen } from './components/SplashScreen';
import { ZxLogo } from './components/ZxLogo';
import { ZxFeed } from './components/ZxFeed';

function MainShell() {
  const {
    user,
    role,
    theme,
    setTheme,
    lang,
    setLang,
    activeTab,
    viewingUsername,
    unreadNotifications,
    unreadMessages,
    navigate,
    openAuth,
    openCreate,
    feedRefreshKey,
    t,
  } = useApp();

  const [showSplash, setShowSplash] = useState(true);
  const [platformCounts, setPlatformCounts] = useState({ users: 0, posts: 0 });
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; body: string }>>([]);

  useEffect(() => {
    apiRequest<{ users: number; posts: number }>('/health')
      .then((res) => setPlatformCounts({ users: res.users || 0, posts: res.posts || 0 }))
      .catch(() => {});
    apiRequest<{ announcements: any[] }>('/announcements')
      .then((res) => setAnnouncements(res.announcements || []))
      .catch(() => {});
  }, [feedRefreshKey, user?.id]);

  const primaryTabs = [
    { id: 'home' as const, label: t('navHome'), icon: Home },
    { id: 'zx' as const, label: t('navZx'), icon: Feather },
    { id: 'search' as const, label: t('navSearch'), icon: Search },
    { id: 'shorts' as const, label: t('navShorts'), icon: Film },
    { id: 'profile' as const, label: t('navProfile'), icon: User },
  ];

  const secondaryLinks = [
    { id: 'ai' as const, label: t('navAi'), icon: Sparkles, badge: 0 },
    { id: 'messages' as const, label: t('navMessages'), icon: MessageCircle, badge: unreadMessages },
    { id: 'notifications' as const, label: t('navNotifications'), icon: Bell, badge: unreadNotifications },
    { id: 'creator' as const, label: t('navCreator'), icon: BarChart3, badge: 0 },
    { id: 'settings' as const, label: t('navSettings'), icon: Settings, badge: 0 },
    { id: 'admin' as const, label: t('navAdmin'), icon: Shield, badge: 0 },
  ];

  const isWideView = activeTab === 'messages' || activeTab === 'admin' || activeTab === 'ai';

  if (showSplash) {
    return <SplashScreen visible={true} onComplete={() => setShowSplash(false)} />;
  }

  if (!user) {
    return <AuthGatePage />;
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] dark:bg-[#080810] text-[#080810] dark:text-white transition-colors">

      {/* Mobile Top Bar (< lg) — compact 52px */}
      <header className="lg:hidden sticky top-0 z-40 h-[52px] px-4 bg-white/90 dark:bg-[#080810]/90 backdrop-blur-md border-b border-black/10 dark:border-white/10 flex items-center justify-between">
        <button onClick={() => navigate('home')} className="flex items-center gap-2 shrink-0">
          <ZxLogo size={32} showWordmark />
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate('ai')}
            aria-label={t('navAi')}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
              activeTab === 'ai' ? 'text-[#FF28B9] bg-[#792BFF]/15' : 'hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-5 h-5" />
          </button>
          <button
            onClick={() => openCreate(activeTab === 'zx' ? 'zx' : activeTab === 'shorts' ? 'short' : 'home')}
            aria-label={t('navCreate')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <PlusSquare className="w-5 h-5" />
          </button>
          <button
            onClick={() => navigate('messages')}
            aria-label={t('navMessages')}
            className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <MessageCircle className="w-5 h-5" />
            {unreadMessages > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#FF28B9]" />
            )}
          </button>
          <button
            onClick={() => navigate('notifications')}
            aria-label={t('navNotifications')}
            className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Bell className="w-5 h-5" />
            {unreadNotifications > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#792BFF]" />
            )}
          </button>
          <button
            onClick={() => navigate('settings')}
            aria-label={t('navSettings')}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main 3-Column Desktop Layout */}
      <div className="max-w-[1380px] mx-auto flex">
        {/* Desktop Left Sidebar */}
        <aside className="hidden lg:flex flex-col justify-between w-64 shrink-0 sticky top-0 h-screen px-4 py-6 border-r border-black/10 dark:border-white/10">
          <div className="space-y-6">
            <button onClick={() => navigate('home')} className="px-2 flex items-center gap-3 text-left">
              <ZxLogo size={40} showWordmark />
            </button>

            <nav className="space-y-1">
              {primaryTabs.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id, item.id === 'profile' ? user?.username || null : null)}
                    className={`w-full px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'zx-gradient-bg text-white font-semibold'
                        : 'text-[#5A5B6E] dark:text-[#E8E8F2]/80 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              <div className="my-3 border-t border-black/10 dark:border-white/10" />

              {secondaryLinks.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    className={`w-full px-3.5 py-2.5 rounded-xl flex items-center justify-between text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#792BFF]/15 text-[#792BFF] dark:text-white font-semibold'
                        : 'text-[#5A5B6E] dark:text-[#E8E8F2]/80 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="w-5 h-5 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {item.badge > 0 && (
                      <span className="px-2 py-0.5 rounded-full zx-gradient-bg text-white text-[10px] font-mono-tabular">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <button
              onClick={() => openCreate(activeTab === 'zx' ? 'zx' : activeTab === 'shorts' ? 'short' : 'home')}
              className="w-full py-3 rounded-xl zx-gradient-bg text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-95 transition-opacity"
            >
              <PlusSquare className="w-4 h-4" />
              <span>{t('navCreate')}</span>
            </button>
          </div>

          {/* Account Card */}
          <div className="pt-4 border-t border-black/10 dark:border-white/10">
            {user ? (
              <button
                onClick={() => navigate('profile', user.username)}
                className="w-full p-2.5 rounded-2xl hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-3 text-left"
              >
                <Avatar src={user.avatar_url} name={user.full_name} size={38} online />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">{user.full_name}</div>
                  <div className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8] truncate">
                    @{user.username} {role ? `· ${role}` : ''}
                  </div>
                </div>
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => openAuth('login')}
                  className="flex-1 py-2 rounded-xl bg-black/5 dark:bg-white/10 text-xs font-semibold"
                >
                  {t('signIn')}
                </button>
                <button
                  onClick={() => openAuth('register')}
                  className="flex-1 py-2 rounded-xl zx-gradient-bg text-white text-xs font-semibold"
                >
                  {t('signUp')}
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Central Viewport */}
        <main className="flex-1 min-w-0 px-4 py-5 pb-24 lg:pb-8">
          <div className={`mx-auto ${isWideView ? 'max-w-5xl' : 'max-w-2xl'}`}>
            {activeTab === 'home' && <HomeFeed />}
            {activeTab === 'zx' && <ZxFeed />}
            {activeTab === 'search' && <ExploreView />}
            {activeTab === 'shorts' && <ShortsView />}
            {activeTab === 'profile' && <ProfileView username={viewingUsername} />}
            {activeTab === 'messages' && <MessagesView />}
            {activeTab === 'notifications' && <NotificationsView />}
            {activeTab === 'creator' && <CreatorStudioView />}
            {activeTab === 'ai' && <AiStudioView />}
            {activeTab === 'settings' && <SettingsView />}
            {activeTab === 'admin' && <AdminDashboardView />}
          </div>
        </main>

        {/* Desktop Right Discovery Panel */}
        {!isWideView && (
          <aside className="hidden xl:block w-80 shrink-0 px-4 py-6 space-y-5">
            {/* Theme & Language Quick Bar */}
            <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-4 flex items-center justify-between gap-2">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="flex-1 py-2 px-3 rounded-xl bg-black/5 dark:bg-white/5 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-[#FF28B9]" /> : <Moon className="w-4 h-4 text-[#792BFF]" />}
                <span>{theme === 'dark' ? t('lightMode') : t('darkMode')}</span>
              </button>
              <button
                onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}
                className="py-2 px-3 rounded-xl bg-black/5 dark:bg-white/5 text-xs font-semibold"
              >
                {lang === 'hi' ? 'EN' : 'हिन्दी'}
              </button>
            </div>

            {/* Real Zero-State Platform Counters */}
            <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm">ZX — {t('brandTagline')}</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.03]">
                  <div className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8]">
                    {lang === 'hi' ? 'कुल यूज़र्स' : 'Total Users'}
                  </div>
                  <div className="font-mono-tabular text-xl font-bold mt-0.5">{platformCounts.users}</div>
                </div>
                <div className="p-3 rounded-xl bg-black/[0.03] dark:bg-white/[0.03]">
                  <div className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8]">
                    {lang === 'hi' ? 'कुल पोस्ट' : 'Total Posts'}
                  </div>
                  <div className="font-mono-tabular text-xl font-bold mt-0.5">{platformCounts.posts}</div>
                </div>
              </div>
            </div>

            {/* Official Platform Announcements (only if published by Admin) */}
            {announcements.length > 0 && (
              <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-4 space-y-2.5">
                <h3 className="font-display font-bold text-sm">
                  {lang === 'hi' ? 'आधिकारिक घोषणाएं' : 'Announcements'}
                </h3>
                {announcements.map((a) => (
                  <div key={a.id} className="text-xs space-y-0.5 pt-2 border-t border-black/5 dark:border-white/5">
                    <div className="font-semibold">{a.title}</div>
                    <p className="text-[#5A5B6E] dark:text-[#A2A3B8]">{a.body}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Quick Links */}
            <div className="px-2 text-xs text-[#5A5B6E] dark:text-[#A2A3B8] space-y-2">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <button onClick={() => navigate('search')} className="hover:underline flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5" /> {t('navSearch')}
                </button>
                <button onClick={() => navigate('creator')} className="hover:underline">
                  {t('navCreator')}
                </button>
                <button onClick={() => navigate('admin')} className="hover:underline">
                  {t('navAdmin')}
                </button>
              </div>
              <p className="text-[11px] opacity-75">© {new Date().getFullYear()} ZX · India&apos;s Social Universe</p>
            </div>
          </aside>
        )}
      </div>

      {/* Mobile Fixed Bottom Navigation (< lg) — 58px */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-[58px] bg-white/95 dark:bg-[#080810]/95 backdrop-blur-md border-t border-black/10 dark:border-white/10 grid grid-cols-5 items-center px-1">
        {primaryTabs.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id, item.id === 'profile' ? user?.username || null : null)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-[#792BFF] dark:text-[#FF28B9]' : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <AuthModal />
      <OnboardingModal />
      <CreateModal />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <MainShell />
      </AppProvider>
    </ErrorBoundary>
  );
}
