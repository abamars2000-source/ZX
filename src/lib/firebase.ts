import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleAuthProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{
      providerId?: string | null;
      email?: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

function toSafeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

function toIsoDate(ts: unknown): string {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as Timestamp).toDate === 'function') {
    return (ts as Timestamp).toDate().toISOString();
  }
  return String(ts);
}

export async function syncUserProfileToFirestore(profile: {
  username: string;
  fullName: string;
  bio: string;
  avatarUrl: string;
  language: 'hi' | 'en';
  isPrivate: boolean;
  email: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !auth.currentUser?.emailVerified) return;

  const publicPath = `users/${uid}/public/profile`;
  const privatePath = `users/${uid}/private/info`;
  const safeUsername = profile.username.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30) || 'zx_user';
  const safeFullName = (profile.fullName || 'ZX User').slice(0, 80);
  const safeBio = (profile.bio || '').slice(0, 300);
  const safeAvatar = (profile.avatarUrl || '').slice(0, 1000);
  const safeEmail = (profile.email || auth.currentUser.email || '').slice(0, 254);

  try {
    const existingPublic = await getDocFromServer(doc(db, 'users', uid, 'public', 'profile')).catch(() => null);
    if (existingPublic?.exists()) {
      await updateDoc(doc(db, 'users', uid, 'public', 'profile'), {
        username: safeUsername,
        fullName: safeFullName,
        bio: safeBio,
        avatarUrl: safeAvatar,
        language: profile.language,
        isPrivate: profile.isPrivate,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'users', uid, 'public', 'profile'), {
        uid,
        username: safeUsername,
        fullName: safeFullName,
        bio: safeBio,
        avatarUrl: safeAvatar,
        language: profile.language,
        isPrivate: profile.isPrivate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
  }

  if (safeEmail) {
    try {
      const existingPrivate = await getDocFromServer(doc(db, 'users', uid, 'private', 'info')).catch(() => null);
      if (existingPrivate?.exists()) {
        await updateDoc(doc(db, 'users', uid, 'private', 'info'), {
          email: safeEmail,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'users', uid, 'private', 'info'), {
          uid,
          email: safeEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }
}

export async function upsertFirestoreAiThread(thread: {
  id: string;
  title: string;
  model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  systemInstruction: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !auth.currentUser?.emailVerified) return;
  const threadId = toSafeId(thread.id);
  const path = `users/${uid}/aiThreads/${threadId}`;
  try {
    const ref = doc(db, 'users', uid, 'aiThreads', threadId);
    const snap = await getDocFromServer(ref).catch(() => null);
    if (snap?.exists()) {
      await updateDoc(ref, {
        title: (thread.title || 'New Chat').slice(0, 120),
        model: thread.model,
        systemInstruction: (thread.systemInstruction || '').slice(0, 2000),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: threadId,
        ownerId: uid,
        title: (thread.title || 'New Chat').slice(0, 120),
        model: thread.model,
        systemInstruction: (thread.systemInstruction || '').slice(0, 2000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function removeFirestoreAiThread(threadId: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !auth.currentUser?.emailVerified) return;
  const safeId = toSafeId(threadId);
  const path = `users/${uid}/aiThreads/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'aiThreads', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function addFirestoreAiMessage(msg: {
  id: string;
  threadId: string;
  role: 'user' | 'model';
  content: string;
  model: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !auth.currentUser?.emailVerified) return;
  const threadId = toSafeId(msg.threadId);
  const messageId = toSafeId(msg.id);
  const path = `users/${uid}/aiThreads/${threadId}/messages/${messageId}`;
  try {
    const batch = writeBatch(db);
    const threadRef = doc(db, 'users', uid, 'aiThreads', threadId);
    const msgRef = doc(db, 'users', uid, 'aiThreads', threadId, 'messages', messageId);
    batch.update(threadRef, { updatedAt: serverTimestamp() });
    batch.set(msgRef, {
      id: messageId,
      threadId,
      ownerId: uid,
      role: msg.role,
      content: msg.content.slice(0, 16000),
      model: msg.model.slice(0, 64),
      createdAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveFirestoreTranscript(item: {
  id: string;
  transcript: string;
  mimeType: string;
  durationSec: number;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !auth.currentUser?.emailVerified) return;
  const transcriptId = toSafeId(item.id);
  const path = `users/${uid}/aiTranscripts/${transcriptId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'aiTranscripts', transcriptId), {
      id: transcriptId,
      ownerId: uid,
      transcript: item.transcript.slice(0, 16000),
      mimeType: (item.mimeType || 'audio/webm').slice(0, 64),
      durationSec: Math.max(0, Math.min(7200, Number(item.durationSec) || 0)),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeFirestoreAiThreads(
  onUpdate: (
    threads: Array<{
      id: string;
      title: string;
      model: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
      systemInstruction: string;
      updatedAt: string;
    }>
  ) => void
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid || !auth.currentUser?.emailVerified) return () => {};
  const path = `users/${uid}/aiThreads`;
  const q = query(collection(db, 'users', uid, 'aiThreads'), orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          title: String(data.title || 'New Chat'),
          model: (data.model === 'gemini-3.1-flash-lite'
            ? 'gemini-3.1-flash-lite'
            : 'gemini-4-hydrogen') as 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite',
          systemInstruction: String(data.systemInstruction || ''),
          updatedAt: toIsoDate(data.updatedAt),
        };
      });
      onUpdate(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
