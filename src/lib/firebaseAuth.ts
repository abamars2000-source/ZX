import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth, googleAuthProvider } from './firebase';
import { syncSupabaseGoogleSession } from './supabase';

export const GOOGLE_OAUTH_CLIENT_ID = firebaseConfig.oAuthClientId;

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

// Strict in-memory token cache (never stored in localStorage or sessionStorage)
let cachedGoogleAccessToken: string | null = null;

export function initGoogleAuthListener(onSignedOut?: () => void) {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (!user) {
      cachedGoogleAccessToken = null;
      if (onSignedOut) onSignedOut();
    }
  });
}

function requestAccessTokenWithOAuthClient(): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2 || !GOOGLE_OAUTH_CLIENT_ID) {
      return reject(new Error('Google OAuth client is unavailable.'));
    }
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      scope: 'openid email profile',
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || 'Google OAuth consent was cancelled.'));
        } else {
          resolve(resp.access_token);
        }
      },
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });
}

export async function signInWithGooglePopup(): Promise<{
  accessToken: string | null;
  googleIdToken: string | null;
  idToken: string;
  oauthClientId: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}> {
  try {
    const result = await signInWithPopup(auth, googleAuthProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedGoogleAccessToken = credential?.accessToken || null;
    const googleIdToken = credential?.idToken || null;
    const firebaseIdToken = await result.user.getIdToken();

    await syncSupabaseGoogleSession(googleIdToken, cachedGoogleAccessToken);

    return {
      accessToken: cachedGoogleAccessToken,
      googleIdToken,
      idToken: firebaseIdToken,
      oauthClientId: GOOGLE_OAUTH_CLIENT_ID,
      displayName: result.user.displayName,
      email: result.user.email,
      photoURL: result.user.photoURL,
    };
  } catch (popupErr) {
    // Fallback to Google Identity Services OAuth2 token client using firebase-applet-config oAuthClientId
    if (window.google?.accounts?.oauth2 && GOOGLE_OAUTH_CLIENT_ID) {
      const accessToken = await requestAccessTokenWithOAuthClient();
      cachedGoogleAccessToken = accessToken;
      const cred = GoogleAuthProvider.credential(null, accessToken);
      const fbResult = await signInWithCredential(auth, cred);
      const firebaseIdToken = await fbResult.user.getIdToken();

      return {
        accessToken,
        googleIdToken: null,
        idToken: firebaseIdToken,
        oauthClientId: GOOGLE_OAUTH_CLIENT_ID,
        displayName: fbResult.user.displayName,
        email: fbResult.user.email,
        photoURL: fbResult.user.photoURL,
      };
    }
    throw popupErr;
  }
}

export async function signOutGoogle(): Promise<void> {
  cachedGoogleAccessToken = null;
  try {
    await signOut(auth);
  } catch {
    // ignore signout error
  }
}
