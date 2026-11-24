import React, { useEffect, useState } from 'react';
import { Check, Lock, Megaphone, ShieldAlert, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest } from '../lib/api';
import { ZxLogo } from './ZxLogo';

export function AdminDashboardView() {
  const { user, role, lang, openAuth, refreshUser, t, toast } = useApp();
  const [bootstrap, setBootstrap] = useState<{ claimed: boolean; hasEnvSecret: boolean; isAdmin: boolean } | null>(null);
  const [secretInput, setSecretInput] = useState('');
  const [overview, setOverview] = useState<any>(null);
  const [tab, setTab] = useState<'users' | 'posts' | 'reports' | 'verifications' | 'hashtags' | 'announcements' | 'logs'>(
    'users'
  );
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');

  const loadBootstrap = async () => {
    try {
      const res = await apiRequest<any>('/admin/bootstrap-status');
      setBootstrap(res);
      if (res.isAdmin) {
        const ov = await apiRequest<any>('/admin/overview');
        setOverview(ov);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadBootstrap();
  }, [user?.id, role]);

  const handleClaimOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/admin/claim-owner', {
        method: 'POST',
        body: JSON.stringify({ secret: secretInput }),
      });
      await refreshUser();
      await loadBootstrap();
      toast(lang === 'hi' ? 'एडमिन स्वामित्व सक्रिय हो गया!' : 'Owner admin access claimed!', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  if (!user) {
    return (
      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-10 text-center space-y-4">
        <ZxLogo size={48} className="mx-auto" />
        <h2 className="font-display text-xl font-bold">{t('adminControl')}</h2>
        <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
          {lang === 'hi' ? 'एडमिन पैनल के लिए पहले साइन इन करें।' : 'Sign in to access or claim the admin console.'}
        </p>
        <div className="flex justify-center gap-3">
          <button onClick={() => openAuth('login')} className="px-5 py-2.5 rounded-xl zx-gradient-bg text-white text-sm font-semibold">
            {t('signIn')}
          </button>
          <button onClick={() => openAuth('register')} className="px-5 py-2.5 rounded-xl bg-black/5 dark:bg-white/10 text-sm font-semibold">
            {t('signUp')}
          </button>
        </div>
      </div>
    );
  }

  if (bootstrap && !bootstrap.isAdmin) {
    return (
      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-8 max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <ZxLogo size={42} />
          <div>
            <h2 className="font-display text-lg font-bold">{t('adminControl')}</h2>
            <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
              {bootstrap.claimed && !bootstrap.hasEnvSecret
                ? lang === 'hi'
                  ? 'एडमिन एक्सेस पहले से अधिकृत है।'
                  : 'Admin ownership has already been claimed.'
                : lang === 'hi'
                  ? 'प्रथम प्लेटफ़ॉर्म मालिक सेटअप'
                  : 'First-Owner Admin Bootstrap'}
            </p>
          </div>
        </div>

        {(!bootstrap.claimed || bootstrap.hasEnvSecret) ? (
          <form onSubmit={handleClaimOwner} className="space-y-3">
            <label className="block text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
              {bootstrap.hasEnvSecret
                ? lang === 'hi'
                  ? 'सर्वर ADMIN_BOOTSTRAP_SECRET दर्ज करें'
                  : 'Enter server ADMIN_BOOTSTRAP_SECRET'
                : lang === 'hi'
                  ? 'प्रथम-स्वामी एडमिन पासकोड सेट करें (8+ अक्षर)'
                  : 'Choose first-owner admin passcode (8+ chars)'}
            </label>
            <input
              type="password"
              required
              minLength={bootstrap.hasEnvSecret ? 1 : 8}
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm"
            />
            <button type="submit" className="w-full py-2.5 rounded-xl zx-gradient-bg text-white text-sm font-semibold">
              {lang === 'hi' ? 'एडमिन स्वामित्व प्राप्त करें' : 'Claim Owner Admin'}
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <Lock className="w-4 h-4" />
            <span>{lang === 'hi' ? 'आपके पास एडमिन अनुमति नहीं है।' : 'Unauthorized: Administrator role required.'}</span>
          </div>
        )}
      </div>
    );
  }

  const stats = overview?.stats || {
    totalUsers: 0,
    activeUsers: 0,
    totalPosts: 0,
    totalVideos: 0,
    totalStories: 0,
    totalMessages: 0,
    totalReports: 0,
  };

  const userAction = async (userId: string, action: string, targetRole?: string) => {
    try {
      await apiRequest(`/admin/users/${userId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, role: targetRole }),
      });
      loadBootstrap();
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiRequest('/admin/announcements', {
      method: 'POST',
      body: JSON.stringify({ title: annTitle, body: annBody }),
    });
    setAnnTitle('');
    setAnnBody('');
    loadBootstrap();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ZxLogo size={40} />
          <div>
            <h2 className="font-display text-2xl font-bold">{t('adminControl')}</h2>
            <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
              Role: <span className="font-mono-tabular font-semibold uppercase">{role}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Real Zero-Start Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: lang === 'hi' ? 'कुल यूज़र्स' : 'Total Users', val: stats.totalUsers },
          { label: lang === 'hi' ? 'सक्रिय यूज़र्स' : 'Active Users', val: stats.activeUsers },
          { label: lang === 'hi' ? 'कुल पोस्ट' : 'Total Posts', val: stats.totalPosts },
          { label: lang === 'hi' ? 'कुल वीडियो' : 'Total Videos', val: stats.totalVideos },
          { label: lang === 'hi' ? 'कुल स्टोरीज़' : 'Total Stories', val: stats.totalStories },
          { label: lang === 'hi' ? 'कुल संदेश' : 'Total Messages', val: stats.totalMessages },
          { label: lang === 'hi' ? 'खुली रिपोर्ट' : 'Open Reports', val: stats.totalReports },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-3.5"
          >
            <div className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8] truncate">{item.label}</div>
            <div className="font-mono-tabular text-2xl font-bold mt-1">{item.val}</div>
          </div>
        ))}
      </div>

      {/* Management Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'users', label: lang === 'hi' ? 'यूज़र्स' : 'Users' },
            { id: 'posts', label: lang === 'hi' ? 'सामग्री मॉडरेशन' : 'Content' },
            { id: 'reports', label: lang === 'hi' ? 'रिपोर्ट्स' : 'Reports' },
            { id: 'verifications', label: lang === 'hi' ? 'सत्यापन' : 'Verifications' },
            { id: 'hashtags', label: lang === 'hi' ? 'हैशटैग' : 'Hashtags' },
            { id: 'announcements', label: lang === 'hi' ? 'घोषणाएं' : 'Announcements' },
            { id: 'logs', label: lang === 'hi' ? 'ऑडिट लॉग' : 'Audit Logs' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${
              tab === item.id
                ? 'zx-gradient-bg text-white'
                : 'bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 text-[#5A5B6E] dark:text-[#A2A3B8]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-4 overflow-x-auto">
        {tab === 'users' && (
          <table className="w-full text-xs text-left">
            <thead className="border-b border-black/10 dark:border-white/10 text-[#5A5B6E] dark:text-[#A2A3B8]">
              <tr>
                <th className="py-2.5 pr-4">User</th>
                <th className="py-2.5 pr-4">Status</th>
                <th className="py-2.5 pr-4">Role</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {(overview?.users || []).map((u: any) => (
                <tr key={u.id}>
                  <td className="py-2.5 pr-4">
                    <div className="font-semibold">
                      {u.full_name} {u.is_verified ? '✓' : ''}
                    </div>
                    <div className="text-[#5A5B6E] dark:text-[#A2A3B8]">@{u.username}</div>
                  </td>
                  <td className="py-2.5 pr-4 font-mono-tabular">{u.account_status}</td>
                  <td className="py-2.5 pr-4 font-mono-tabular">{u.role || 'member'}</td>
                  <td className="py-2.5 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      onClick={() => userAction(u.id, u.is_verified ? 'unverify' : 'verify')}
                      className="px-2 py-1 rounded bg-[#792BFF]/15 text-[#792BFF] dark:text-white"
                    >
                      {u.is_verified ? 'Unverify' : 'Verify'}
                    </button>
                    {u.account_status === 'active' ? (
                      <>
                        <button
                          onClick={() => userAction(u.id, 'suspend')}
                          className="px-2 py-1 rounded bg-amber-500/15 text-amber-500"
                        >
                          Suspend
                        </button>
                        <button
                          onClick={() => userAction(u.id, 'ban')}
                          className="px-2 py-1 rounded bg-red-500/15 text-red-500"
                        >
                          Ban
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => userAction(u.id, 'activate')}
                        className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-500"
                      >
                        Activate
                      </button>
                    )}
                    {role === 'owner' && u.id !== user.id && (
                      <button
                        onClick={() => userAction(u.id, 'set_role', u.role ? '' : 'moderator')}
                        className="px-2 py-1 rounded bg-black/5 dark:bg-white/10"
                      >
                        {u.role ? 'Revoke Mod' : 'Make Mod'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'posts' && (
          <div className="space-y-2.5">
            {(overview?.recentPosts || []).length === 0 ? (
              <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] py-4 text-center">No posts yet.</p>
            ) : (
              overview.recentPosts.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2 border-b border-black/5 dark:border-white/5 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold">@{p.author_username}</span> ({p.post_type}):{' '}
                    <span className={p.is_removed ? 'line-through opacity-50' : ''}>{p.content || '[Media]'}</span>
                  </div>
                  <button
                    onClick={async () => {
                      await apiRequest(`/admin/posts/${p.id}/moderate`, {
                        method: 'POST',
                        body: JSON.stringify({ remove: !p.is_removed }),
                      });
                      loadBootstrap();
                    }}
                    className="px-2.5 py-1 rounded bg-red-500/15 text-red-500 shrink-0"
                  >
                    {p.is_removed ? 'Restore' : 'Remove'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'reports' && (
          <div className="space-y-2.5">
            {(overview?.reports || []).length === 0 ? (
              <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] py-4 text-center">No reports.</p>
            ) : (
              overview.reports.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-2 border-b border-black/5 dark:border-white/5 text-xs">
                  <div>
                    <div className="font-semibold">
                      {r.target_type} · by @{r.reporter_username} ({r.status})
                    </div>
                    <div className="text-[#5A5B6E] dark:text-[#A2A3B8]">{r.reason}</div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={async () => {
                        await apiRequest(`/admin/reports/${r.id}/resolve`, {
                          method: 'POST',
                          body: JSON.stringify({ status: 'resolved' }),
                        });
                        loadBootstrap();
                      }}
                      className="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-500"
                    >
                      Resolve
                    </button>
                    <button
                      onClick={async () => {
                        await apiRequest(`/admin/reports/${r.id}/resolve`, {
                          method: 'POST',
                          body: JSON.stringify({ status: 'dismissed' }),
                        });
                        loadBootstrap();
                      }}
                      className="px-2.5 py-1 rounded bg-black/5 dark:bg-white/10"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'verifications' && (
          <div className="space-y-2.5">
            {(overview?.verifications || []).length === 0 ? (
              <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] py-4 text-center">No verification requests.</p>
            ) : (
              overview.verifications.map((v: any) => (
                <div key={v.id} className="flex items-center justify-between gap-3 py-2 border-b border-black/5 dark:border-white/5 text-xs">
                  <div>
                    <div className="font-semibold">
                      @{v.username} · {v.category} ({v.status})
                    </div>
                    <div className="text-[#5A5B6E] dark:text-[#A2A3B8]">{v.notes}</div>
                  </div>
                  {v.status === 'pending' && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={async () => {
                          await apiRequest(`/admin/verifications/${v.id}/review`, {
                            method: 'POST',
                            body: JSON.stringify({ approve: true }),
                          });
                          loadBootstrap();
                        }}
                        className="px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-500 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={async () => {
                          await apiRequest(`/admin/verifications/${v.id}/review`, {
                            method: 'POST',
                            body: JSON.stringify({ approve: false }),
                          });
                          loadBootstrap();
                        }}
                        className="px-2.5 py-1 rounded bg-red-500/15 text-red-500"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'hashtags' && (
          <div className="space-y-2">
            {(overview?.hashtags || []).length === 0 ? (
              <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] py-4 text-center">No hashtags yet.</p>
            ) : (
              overview.hashtags.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between py-2 border-b border-black/5 dark:border-white/5 text-xs">
                  <span className={h.is_blocked ? 'line-through text-red-400' : 'font-semibold'}>#{h.tag}</span>
                  <button
                    onClick={async () => {
                      await apiRequest(`/admin/hashtags/${h.id}/toggle`, { method: 'POST' });
                      loadBootstrap();
                    }}
                    className="px-2.5 py-1 rounded bg-black/5 dark:bg-white/10"
                  >
                    {h.is_blocked ? 'Unblock' : 'Block'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'announcements' && (
          <div className="space-y-4">
            <form onSubmit={handlePublishAnnouncement} className="space-y-2.5">
              <input
                type="text"
                required
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder={lang === 'hi' ? 'घोषणा शीर्षक' : 'Announcement title'}
                className="w-full px-3 py-2 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
              />
              <textarea
                rows={2}
                required
                value={annBody}
                onChange={(e) => setAnnBody(e.target.value)}
                placeholder={lang === 'hi' ? 'विवरण...' : 'Message...'}
                className="w-full px-3 py-2 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
              />
              <button type="submit" className="px-4 py-2 rounded-xl zx-gradient-bg text-white text-xs font-semibold flex items-center gap-1.5">
                <Megaphone className="w-3.5 h-3.5" />
                {lang === 'hi' ? 'घोषणा प्रकाशित करें' : 'Publish Announcement'}
              </button>
            </form>
            <div className="space-y-2">
              {(overview?.announcements || []).map((a: any) => (
                <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-black/5 dark:bg-white/5 text-xs">
                  <div>
                    <div className="font-semibold">{a.title}</div>
                    <div className="text-[#5A5B6E] dark:text-[#A2A3B8]">{a.body}</div>
                  </div>
                  <button
                    onClick={async () => {
                      await apiRequest(`/admin/announcements/${a.id}`, { method: 'DELETE' });
                      loadBootstrap();
                    }}
                    className="text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-2">
            {(overview?.logs || []).length === 0 ? (
              <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] py-4 text-center">No audit logs yet.</p>
            ) : (
              overview.logs.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between py-2 border-b border-black/5 dark:border-white/5 text-xs">
                  <span>
                    <ShieldAlert className="w-3.5 h-3.5 inline mr-1.5 text-[#792BFF]" />
                    <strong>@{l.admin_username}</strong> · {l.action} ({l.target_type})
                  </span>
                  <span className="font-mono-tabular text-[#5A5B6E] dark:text-[#A2A3B8]">
                    {new Date(l.created_at).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
