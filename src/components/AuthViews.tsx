import React, { useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Eye, EyeOff, Globe, KeyRound, Lock, Mail, ShieldCheck, Upload, User, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AVAILABLE_LANGUAGES, INTEREST_TOPICS } from '../i18n/translations';
import { apiRequest, uploadMediaFile } from '../lib/api';
import { GOOGLE_OAUTH_CLIENT_ID, signInWithGooglePopup } from '../lib/firebaseAuth';
import { ZxLogo } from './ZxLogo';

function GoogleSignInButton({
  onClick,
  loading,
  label,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      data-oauth-client-id={GOOGLE_OAUTH_CLIENT_ID}
      onClick={onClick}
      disabled={loading}
      className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white hover:bg-[#F7F8FA] text-[#1F1F1F] border border-[#747775]/40 font-medium text-sm flex items-center justify-center gap-3 shadow-sm transition-all disabled:opacity-60"
    >
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 shrink-0">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
      <span>{loading ? '...' : label}</span>
    </button>
  );
}

function AuthFormCard({
  initialMode = 'login',
  onClose,
  isGate = false,
}: {
  initialMode?: 'login' | 'register';
  onClose?: () => void;
  isGate?: boolean;
}) {
  const { loginSuccess, lang, setLang, theme, setTheme, t, toast } = useApp();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset' | 'verify'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [verifyTokenInput, setVerifyTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    setMode(initialMode);
    setError('');
  }, [initialMode]);

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const g = await signInWithGooglePopup();
      const res = await apiRequest<{
        token: string;
        user: any;
        role: string | null;
        isNewUser?: boolean;
        needsPasswordSetup?: boolean;
      }>('/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          accessToken: g.accessToken,
          googleIdToken: g.googleIdToken,
          idToken: g.idToken,
          oauthClientId: g.oauthClientId,
          language: lang,
        }),
      });
      loginSuccess(res.token, res.user, res.role);
      toast(
        res.needsPasswordSetup
          ? lang === 'hi'
            ? 'Google से लॉगिन सफल! अब अपना प्रोफ़ाइल नेम और पासवर्ड सेट करें।'
            : 'Signed in with Google! Set your Profile Name & Password next.'
          : lang === 'hi'
            ? 'ZX में आपका स्वागत है!'
            : 'Welcome back to ZX!',
        'success'
      );
    } catch (err: any) {
      setError(err?.message || (lang === 'hi' ? 'Google लॉगिन असफल रहा।' : 'Google sign-in failed.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: any; role: string | null; verificationToken: string }>(
        '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            fullName,
            username,
            email,
            password,
            confirmPassword,
            termsAccepted,
            language: lang,
          }),
        }
      );
      if (res.verificationToken) {
        setVerifyTokenInput(res.verificationToken);
        toast(
          lang === 'hi'
            ? `खाता बन गया! ईमेल सत्यापन टोकन: ${res.verificationToken}`
            : `Account created! Email verification token: ${res.verificationToken}`,
          'success'
        );
      }
      loginSuccess(res.token, res.user, res.role);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: any; role: string | null }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      loginSuccess(res.token, res.user, res.role);
      toast(lang === 'hi' ? 'ZX में आपका स्वागत है!' : 'Welcome back to ZX!', 'success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest<{ resetToken?: string; message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      if (res.resetToken) {
        setResetToken(res.resetToken);
      }
      setMode('reset');
      toast(res.message, 'info');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword: password }),
      });
      toast(lang === 'hi' ? 'पासवर्ड सफलतापूर्वक बदल गया!' : 'Password reset successfully!', 'success');
      setMode('login');
      setPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiRequest('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verifyTokenInput }),
      });
      toast(lang === 'hi' ? 'ईमेल सत्यापित हो गया!' : 'Email verified!', 'success');
      setMode('login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 p-6 sm:p-8 shadow-2xl"
    >
      {!isGate && onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#5A5B6E] dark:text-[#A2A3B8] hover:bg-black/5 dark:hover:bg-white/5"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {isGate && (
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="absolute top-4 right-4 px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 text-[11px] font-semibold text-[#5A5B6E] dark:text-[#A2A3B8]"
        >
          {theme === 'dark' ? t('lightMode') : t('darkMode')}
        </button>
      )}

      <div className="flex flex-col items-center text-center mb-5">
        <ZxLogo size={54} />
        <h2 className="font-display text-2xl font-bold mt-4 text-[#080810] dark:text-white">
          {mode === 'login'
            ? t('signIn')
            : mode === 'register'
              ? t('signUp')
              : mode === 'forgot'
                ? t('forgotPassword')
                : mode === 'reset'
                  ? t('resetPassword')
                  : t('verifyEmail')}
        </h2>
        <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] mt-1">
          {t('brandTagline')} · <span className="font-semibold text-[#792BFF] dark:text-[#FF28B9]">Digi Mitra</span>
        </p>
      </div>

      {/* Language Toggle */}
      <div className="flex items-center justify-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl mb-4">
        {AVAILABLE_LANGUAGES.map((item) => (
          <button
            key={item.code}
            type="button"
            onClick={() => setLang(item.code)}
            className={`flex-1 py-1.5 px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              lang === item.code
                ? 'bg-white dark:bg-[#1A1A32] text-[#080810] dark:text-white shadow-sm'
                : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
            }`}
          >
            {item.native}
          </button>
        ))}
      </div>

      {/* Google Sign-In Section (for Login & Register) */}
      {(mode === 'login' || mode === 'register') && (
        <div className="mb-4 space-y-2.5">
          <GoogleSignInButton
            onClick={handleGoogleSignIn}
            loading={googleLoading}
            label={t('continueWithGoogle')}
          />
          <p className="text-[11px] text-center text-[#5A5B6E] dark:text-[#A2A3B8] leading-relaxed">
            {lang === 'hi'
              ? 'Google ईमेल से जुड़ने के बाद अपना प्रोफ़ाइल नेम और पासवर्ड सेट करके कभी भी, किसी भी डिवाइस से लॉगिन करें।'
              : 'After linking Google, set a Profile Name & Password to log in anytime from any device.'}
          </p>
          <div className="flex items-center gap-3 pt-1">
            <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            <span className="text-[11px] font-medium text-[#5A5B6E] dark:text-[#A2A3B8] uppercase">
              {lang === 'hi' ? 'या' : 'OR'}
            </span>
            <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 text-xs font-medium">
          {error}
        </div>
      )}

      {mode === 'register' && (
        <form onSubmit={handleRegister} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">
              {t('fullName')}
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-3 text-[#5A5B6E] dark:text-[#A2A3B8]" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Aarav Sharma"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">
              {t('username')}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-sm text-[#792BFF] font-medium">@</span>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="aarav_in"
                className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">
              {t('email')}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-3 text-[#5A5B6E] dark:text-[#A2A3B8]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">
                {t('password')}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-[#5A5B6E] dark:text-[#A2A3B8]" />
                <input
                  type={showPw ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8+ chars"
                  className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-2.5 top-2.5 text-[#5A5B6E] dark:text-[#A2A3B8]"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">
                {t('confirmPassword')}
              </label>
              <input
                type={showPw ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
              />
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-[#5A5B6E] dark:text-[#A2A3B8] cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 rounded border-white/20 text-[#792BFF] focus:ring-[#792BFF]"
            />
            <span>{t('acceptTerms')}</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl zx-gradient-bg text-white font-semibold text-sm hover:opacity-95 transition-opacity disabled:opacity-60"
          >
            {loading ? '...' : t('signUp')}
          </button>

          <div className="pt-2 text-center text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
            {lang === 'hi' ? 'पहले से खाता है?' : 'Already have an account?'}{' '}
            <button type="button" onClick={() => setMode('login')} className="text-[#792BFF] dark:text-[#FF28B9] font-semibold">
              {t('signIn')}
            </button>
          </div>
        </form>
      )}

      {mode === 'login' && (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">
              {t('loginIdentifierLabel')}
            </label>
            <input
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={t('loginIdentifierPlaceholder')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-[#5A5B6E] dark:text-[#A2A3B8]">{t('password')}</label>
              <button
                type="button"
                onClick={() => setMode('forgot')}
                className="text-xs text-[#792BFF] dark:text-[#FF28B9]"
              >
                {t('forgotPassword')}
              </button>
            </div>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 pr-10 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-2.5 text-[#5A5B6E] dark:text-[#A2A3B8]"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl zx-gradient-bg text-white font-semibold text-sm hover:opacity-95 transition-opacity disabled:opacity-60"
          >
            {loading ? '...' : t('signIn')}
          </button>

          <div className="flex items-center justify-between text-xs text-[#5A5B6E] dark:text-[#A2A3B8] pt-1">
            <button type="button" onClick={() => setMode('verify')} className="hover:underline">
              {t('verifyEmail')}
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className="text-[#792BFF] dark:text-[#FF28B9] font-semibold"
            >
              {t('signUp')}
            </button>
          </div>
        </form>
      )}

      {mode === 'forgot' && (
        <form onSubmit={handleForgot} className="space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('email')}
            className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl zx-gradient-bg text-white font-semibold text-sm"
          >
            {lang === 'hi' ? 'रीसेट टोकन प्राप्त करें' : 'Send Reset Token'}
          </button>
          <button
            type="button"
            onClick={() => setMode('login')}
            className="w-full py-2 text-xs text-[#5A5B6E] dark:text-[#A2A3B8]"
          >
            {t('signIn')}
          </button>
        </form>
      )}

      {mode === 'reset' && (
        <form onSubmit={handleReset} className="space-y-4">
          <input
            type="text"
            required
            value={resetToken}
            onChange={(e) => setResetToken(e.target.value)}
            placeholder="Reset token"
            className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm"
          />
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={lang === 'hi' ? 'नया पासवर्ड (8+ अक्षर)' : 'New password (8+ chars)'}
            className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm"
          />
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl zx-gradient-bg text-white font-semibold text-sm">
            {t('resetPassword')}
          </button>
        </form>
      )}

      {mode === 'verify' && (
        <form onSubmit={handleVerifyEmail} className="space-y-4">
          <input
            type="text"
            required
            value={verifyTokenInput}
            onChange={(e) => setVerifyTokenInput(e.target.value)}
            placeholder="Verification token"
            className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm"
          />
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl zx-gradient-bg text-white font-semibold text-sm">
            {t('verifyEmail')}
          </button>
          <button type="button" onClick={() => setMode('login')} className="w-full py-2 text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
            {t('signIn')}
          </button>
        </form>
      )}
    </motion.div>
  );
}

export function AuthGatePage() {
  return (
    <div className="min-h-screen w-full bg-[#F8F9FC] dark:bg-[#080810] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#792BFF]/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-[#FF28B9]/20 blur-[120px]" />
      <div className="relative z-10 w-full flex justify-center">
        <AuthFormCard initialMode="login" isGate />
      </div>
    </div>
  );
}

export function AuthModal() {
  const { authModalOpen, authInitialMode, closeAuth } = useApp();
  if (!authModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto">
      <div className="my-auto w-full flex justify-center">
        <AuthFormCard initialMode={authInitialMode} onClose={closeAuth} />
      </div>
    </div>
  );
}

export function OnboardingModal() {
  const { user, refreshUser, lang, setLang, t, toast } = useApp();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setUsername(user.username || '');
      setAvatarUrl(user.avatar_url || '');
    }
  }, [user?.id]);

  if (!user || user.onboarding_completed === 1) return null;

  const needsPassword = user.has_password === 0;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadMediaFile('avatars', file);
      setAvatarUrl(uploaded.url);
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const toggleInterest = (topic: string) => {
    setSelectedInterests((prev) => (prev.includes(topic) ? prev.filter((x) => x !== topic) : [...prev, topic]));
  };

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsPassword && newPassword.length < 8) {
      toast(
        lang === 'hi'
          ? 'किसी भी डिवाइस से लॉगिन करने के लिए कम से कम 8 अक्षरों का पासवर्ड सेट करें।'
          : 'Please set at least an 8-character password to log in from any device.',
        'error'
      );
      return;
    }
    if (newPassword && newPassword !== confirmNewPassword) {
      toast(lang === 'hi' ? 'पासवर्ड मेल नहीं खा रहे हैं।' : 'Passwords do not match.', 'error');
      return;
    }

    setSaving(true);
    try {
      await apiRequest('/auth/credentials', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim() || user.full_name,
          username: username.trim().toLowerCase() || user.username,
          ...(newPassword ? { password: newPassword, confirmPassword: confirmNewPassword } : {}),
        }),
      });

      await apiRequest('/profile/me', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: fullName.trim() || user.full_name,
          bio,
          avatarUrl,
          language: lang,
          interests: selectedInterests,
          isPrivate,
          onboardingCompleted: true,
        }),
      });
      await refreshUser();
      toast(lang === 'hi' ? 'प्रोफ़ाइल और लाइफटाइम लॉगिन तैयार है!' : 'Profile & lifetime login setup complete!', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <form
        onSubmit={handleFinish}
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 p-6 sm:p-8 shadow-2xl space-y-5 my-auto"
      >
        <div className="flex items-center gap-3">
          <ZxLogo size={40} />
          <div>
            <h2 className="font-display text-xl font-bold text-[#080810] dark:text-white">{t('setupProfile')}</h2>
            <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">@{username || user.username}</p>
          </div>
        </div>

        {/* Profile Name, Username & Lifetime Password Setup */}
        <div className="p-4 rounded-2xl bg-[#792BFF]/10 border border-[#792BFF]/25 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#792BFF] dark:text-[#FF28B9]">
            <KeyRound className="w-4 h-4" />
            <span>{t('lifetimeSecurityTitle')}</span>
          </div>
          <p className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8]">{t('lifetimeSecurityDesc')}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">
                {t('fullName')}
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">
                {t('username')}
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
              />
            </div>
          </div>

          {needsPassword && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">
                  {t('password')} (8+ chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">
                  {t('confirmPassword')}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* Avatar upload */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-black/10 dark:bg-white/10 overflow-hidden flex items-center justify-center shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar preview" className="w-full h-full object-cover" />
            ) : (
              <User className="w-7 h-7 text-[#5A5B6E] dark:text-[#A2A3B8]" />
            )}
          </div>
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-medium cursor-pointer transition-colors">
            <Upload className="w-4 h-4 text-[#792BFF]" />
            <span>{uploading ? '...' : lang === 'hi' ? 'प्रोफ़ाइल फ़ोटो अपलोड करें' : 'Upload Profile Picture'}</span>
            <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1">{t('bio')}</label>
          <textarea
            rows={2}
            maxLength={300}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={lang === 'hi' ? 'अपने बारे में कुछ लिखें...' : 'Tell India about yourself...'}
            className="w-full px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-1.5 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />
            {t('languageLabel')}
          </label>
          <div className="flex gap-2">
            {AVAILABLE_LANGUAGES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setLang(item.code)}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
                  lang === item.code
                    ? 'border-[#792BFF] bg-[#792BFF]/15 text-[#792BFF] dark:text-white'
                    : 'border-black/10 dark:border-white/10 text-[#5A5B6E] dark:text-[#A2A3B8]'
                }`}
              >
                {item.native}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#5A5B6E] dark:text-[#A2A3B8] mb-2">
            {t('interestsLabel')}
          </label>
          <div className="flex flex-wrap gap-2">
            {INTEREST_TOPICS.map((topic) => {
              const active = selectedInterests.includes(topic);
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => toggleInterest(topic)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    active
                      ? 'bg-[#792BFF] text-white border-[#792BFF]'
                      : 'bg-black/5 dark:bg-white/5 text-[#5A5B6E] dark:text-[#A2A3B8] border-transparent'
                  }`}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setIsPrivate(false)}
            className={`p-3 rounded-xl border text-left transition-colors ${
              !isPrivate
                ? 'border-[#792BFF] bg-[#792BFF]/10'
                : 'border-black/10 dark:border-white/10 opacity-70'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#080810] dark:text-white">
              <CheckCircle2 className="w-4 h-4 text-[#792BFF]" />
              {lang === 'hi' ? 'पब्लिक' : 'Public'}
            </div>
            <p className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8] mt-1">{t('publicAccount')}</p>
          </button>

          <button
            type="button"
            onClick={() => setIsPrivate(true)}
            className={`p-3 rounded-xl border text-left transition-colors ${
              isPrivate
                ? 'border-[#FF28B9] bg-[#FF28B9]/10'
                : 'border-black/10 dark:border-white/10 opacity-70'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#080810] dark:text-white">
              <ShieldCheck className="w-4 h-4 text-[#FF28B9]" />
              {lang === 'hi' ? 'प्राइवेट' : 'Private'}
            </div>
            <p className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8] mt-1">{t('privateAccount')}</p>
          </button>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl zx-gradient-bg text-white font-semibold text-sm hover:opacity-95 transition-opacity"
        >
          {saving ? '...' : t('saveContinue')}
        </button>
      </form>
    </div>
  );
}
