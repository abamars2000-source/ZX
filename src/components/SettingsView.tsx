import React, { useEffect, useState } from 'react';
import { BadgeCheck, Globe, KeyRound, LogOut, Moon, Shield, Sun } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AVAILABLE_LANGUAGES } from '../i18n/translations';
import { apiRequest } from '../lib/api';

export function SettingsView() {
  const { user, settings, theme, setTheme, lang, setLang, logout, refreshUser, openAuth, t, toast } = useApp();
  const [safety, setSafety] = useState<{ blocked: any[]; muted: any[] }>({ blocked: [], muted: [] });
  const [sessions, setSessions] = useState<any[]>([]);
  const [verifyCat, setVerifyCat] = useState('Creator');
  const [verifyNotes, setVerifyNotes] = useState('');

  // Cross-device Profile Name & Password settings
  const [credFullName, setCredFullName] = useState(user?.full_name || '');
  const [credUsername, setCredUsername] = useState(user?.username || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);

  useEffect(() => {
    if (user) {
      setCredFullName(user.full_name || '');
      setCredUsername(user.username || '');
    }
  }, [user?.id, user?.full_name, user?.username]);

  const loadSafety = async () => {
    if (!user) return;
    try {
      const [sRes, sessRes] = await Promise.all([
        apiRequest<{ blocked: any[]; muted: any[] }>('/safety/lists'),
        apiRequest<{ sessions: any[] }>('/auth/sessions'),
      ]);
      setSafety(sRes);
      setSessions(sessRes.sessions || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadSafety();
  }, [user?.id]);

  const toggleNotif = async (field: string, val: boolean) => {
    await apiRequest('/settings/me', {
      method: 'PUT',
      body: JSON.stringify({ [field]: val }),
    });
    refreshUser();
  };

  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/verification-requests', {
        method: 'POST',
        body: JSON.stringify({ category: verifyCat, notes: verifyNotes }),
      });
      setVerifyNotes('');
      toast(lang === 'hi' ? 'सत्यापन अनुरोध भेजा गया' : 'Verification request submitted', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCreds(true);
    try {
      await apiRequest('/auth/credentials', {
        method: 'POST',
        body: JSON.stringify({
          fullName: credFullName,
          username: credUsername,
          ...(newPassword
            ? {
                currentPassword,
                password: newPassword,
                confirmPassword: confirmNewPassword,
              }
            : {}),
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      await refreshUser();
      toast(
        lang === 'hi' ? 'लाइफटाइम लॉगिन विवरण सहेजा गया!' : 'Lifetime login credentials saved!',
        'success'
      );
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSavingCreds(false);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="font-display text-2xl font-bold">{t('navSettings')}</h2>

      {/* Theme & Language */}
      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            {theme === 'dark' ? <Moon className="w-4 h-4 text-[#792BFF]" /> : <Sun className="w-4 h-4 text-[#FF28B9]" />}
            <span>{theme === 'dark' ? t('darkMode') : t('lightMode')}</span>
          </div>
          <div className="flex p-1 rounded-xl bg-black/5 dark:bg-white/5 gap-1">
            <button
              onClick={() => setTheme('dark')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                theme === 'dark' ? 'zx-gradient-bg text-white' : ''
              }`}
            >
              {t('darkMode')}
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                theme === 'light' ? 'zx-gradient-bg text-white' : ''
              }`}
            >
              {t('lightMode')}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-black/5 dark:border-white/5">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <Globe className="w-4 h-4 text-[#792BFF]" />
            <span>{t('languageLabel')}</span>
          </div>
          <div className="flex p-1 rounded-xl bg-black/5 dark:bg-white/5 gap-1">
            {AVAILABLE_LANGUAGES.map((item) => (
              <button
                key={item.code}
                onClick={() => setLang(item.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  lang === item.code ? 'zx-gradient-bg text-white' : ''
                }`}
              >
                {item.native}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!user ? (
        <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-6 text-center">
          <button onClick={() => openAuth('login')} className="px-5 py-2.5 rounded-xl zx-gradient-bg text-white text-sm font-semibold">
            {t('signIn')}
          </button>
        </div>
      ) : (
        <>
          {/* Lifetime Cross-Device Login (Profile Name & Password) */}
          <form
            onSubmit={handleSaveCredentials}
            className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#792BFF]" />
                {t('lifetimeSecurityTitle')}
              </h3>
              <span className="text-[11px] font-medium text-[#5A5B6E] dark:text-[#A2A3B8]">
                {user.google_linked ? 'Google ✓' : ''} {user.has_password ? '· Password ✓' : '· Set Password'}
              </span>
            </div>
            <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">{t('lifetimeSecurityDesc')}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">
                  {t('fullName')}
                </label>
                <input
                  type="text"
                  required
                  value={credFullName}
                  onChange={(e) => setCredFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">
                  {t('username')}
                </label>
                <input
                  type="text"
                  required
                  value={credUsername}
                  onChange={(e) => setCredUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="w-full px-3 py-2 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {user.has_password === 1 && (
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={lang === 'hi' ? 'वर्तमान पासवर्ड' : 'Current password'}
                  className="px-3 py-2 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
                />
              )}
              <input
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={lang === 'hi' ? 'नया पासवर्ड (8+ अक्षर)' : 'New password (8+ chars)'}
                className="px-3 py-2 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
              />
              <input
                type="password"
                minLength={8}
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder={t('confirmPassword')}
                className="px-3 py-2 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={savingCreds}
              className="px-4 py-2 rounded-xl zx-gradient-bg text-white text-xs font-semibold disabled:opacity-60"
            >
              {savingCreds ? '...' : t('save')}
            </button>
          </form>

          {/* Privacy & Notifications */}
          <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#FF28B9]" />
              {lang === 'hi' ? 'गोपनीयता और नोटिफिकेशन' : 'Privacy & Notifications'}
            </h3>

            <label className="flex items-center justify-between text-xs cursor-pointer">
              <span>{t('privateAccount')}</span>
              <input
                type="checkbox"
                checked={user.is_private === 1}
                onChange={async (e) => {
                  await apiRequest('/profile/me', {
                    method: 'PUT',
                    body: JSON.stringify({ isPrivate: e.target.checked }),
                  });
                  refreshUser();
                }}
              />
            </label>

            {[
              { key: 'notifyFollows', val: settings?.notify_follows ?? 1, label: lang === 'hi' ? 'नए फॉलोअर्स' : 'New Followers' },
              { key: 'notifyLikes', val: settings?.notify_likes ?? 1, label: lang === 'hi' ? 'लाइक्स' : 'Likes' },
              { key: 'notifyComments', val: settings?.notify_comments ?? 1, label: lang === 'hi' ? 'टिप्पणियां' : 'Comments & Replies' },
              { key: 'notifyMentions', val: settings?.notify_mentions ?? 1, label: lang === 'hi' ? 'मेंशन' : 'Mentions' },
              { key: 'notifyMessages', val: settings?.notify_messages ?? 1, label: lang === 'hi' ? 'संदेश' : 'Messages' },
            ].map((item) => (
              <label key={item.key} className="flex items-center justify-between text-xs cursor-pointer">
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(item.val)}
                  onChange={(e) => toggleNotif(item.key, e.target.checked)}
                />
              </label>
            ))}
          </div>

          {/* Verification Request */}
          {!user.is_verified && (
            <form
              onSubmit={handleSubmitVerification}
              className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-3"
            >
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BadgeCheck className="w-4 h-4 text-[#792BFF]" />
                {lang === 'hi' ? 'ब्लू टिक सत्यापन के लिए आवेदन' : 'Request Account Verification'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={verifyCat}
                  onChange={(e) => setVerifyCat(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
                >
                  <option value="Creator">Creator</option>
                  <option value="Journalist">Journalist</option>
                  <option value="Organization">Organization</option>
                  <option value="Public Figure">Public Figure</option>
                </select>
                <input
                  type="text"
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  placeholder={lang === 'hi' ? 'संक्षिप्त विवरण...' : 'Brief details...'}
                  className="px-3 py-2 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
                />
              </div>
              <button type="submit" className="px-4 py-2 rounded-xl zx-gradient-bg text-white text-xs font-semibold">
                {lang === 'hi' ? 'आवेदन भेजें' : 'Submit Request'}
              </button>
            </form>
          )}

          {/* Blocked & Muted */}
          <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold">{lang === 'hi' ? 'ब्लॉक और म्यूट सूची' : 'Blocked & Muted Accounts'}</h3>
            {safety.blocked.length === 0 && safety.muted.length === 0 ? (
              <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
                {lang === 'hi' ? 'कोई ब्लॉक या म्यूट अकाउंट नहीं है।' : 'No blocked or muted accounts.'}
              </p>
            ) : (
              <div className="space-y-2">
                {safety.blocked.map((u) => (
                  <div key={u.id} className="flex items-center justify-between text-xs">
                    <span>@{u.username} (Blocked)</span>
                    <button
                      onClick={async () => {
                        await apiRequest(`/block/${u.id}`, { method: 'DELETE' });
                        loadSafety();
                      }}
                      className="text-[#792BFF]"
                    >
                      {t('unblock')}
                    </button>
                  </div>
                ))}
                {safety.muted.map((u) => (
                  <div key={u.id} className="flex items-center justify-between text-xs">
                    <span>@{u.username} (Muted)</span>
                    <button
                      onClick={async () => {
                        await apiRequest(`/mute/${u.id}`, { method: 'DELETE' });
                        loadSafety();
                      }}
                      className="text-[#792BFF]"
                    >
                      {t('unmute')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Sessions */}
          <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold">{lang === 'hi' ? 'सक्रिय सेशन' : 'Active Sessions'}</h3>
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id_prefix} className="flex items-center justify-between text-xs">
                  <span className="truncate max-w-xs">{s.user_agent || 'Web Session'}</span>
                  {s.is_current ? (
                    <span className="text-[#792BFF] font-semibold">Current</span>
                  ) : (
                    <button
                      onClick={async () => {
                        await apiRequest(`/auth/sessions/${s.id_prefix}`, { method: 'DELETE' });
                        loadSafety();
                      }}
                      className="text-red-400"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full py-3 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-500 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            {t('logout')}
          </button>
        </>
      )}
    </div>
  );
}
