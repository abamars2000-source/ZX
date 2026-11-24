import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { getUserByToken } from './auth.ts';
import { db } from './db.ts';
import { createLiveVoiceServer } from './liveBridge.ts';

interface ClientSocket {
  ws: WebSocket;
  userId: string;
}

const userSockets = new Map<string, Set<WebSocket>>();

export function isUserOnline(userId: string): boolean {
  const set = userSockets.get(userId);
  return Boolean(set && set.size > 0);
}

export function getOnlineUserIds(): string[] {
  return Array.from(userSockets.keys());
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  const set = userSockets.get(userId);
  if (!set) return;
  const serialized = JSON.stringify({ event, payload });
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(serialized);
    }
  }
}

export function emitToConversation(conversationId: string, event: string, payload: unknown, excludeUserId?: string) {
  const members = db
    .prepare(`SELECT user_id FROM conversation_members WHERE conversation_id = ?`)
    .all(conversationId) as Array<{ user_id: string }>;
  for (const member of members) {
    if (excludeUserId && member.user_id === excludeUserId) continue;
    emitToUser(member.user_id, event, payload);
  }
}

export function setupRealtimeServer(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });
  const liveWss = createLiveVoiceServer();

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else if (pathname === '/ws/live') {
      liveWss.handleUpgrade(req, socket, head, (ws) => {
        liveWss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    let client: ClientSocket | null = null;

    const url = new URL(req.url || '/ws', 'http://localhost');
    const tokenFromQuery = url.searchParams.get('token') || '';
    if (tokenFromQuery) {
      const user = getUserByToken(tokenFromQuery);
      if (user) {
        client = { ws, userId: user.id };
        registerSocket(user.id, ws);
      }
    }

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.event === 'auth' && typeof msg.token === 'string') {
          const user = getUserByToken(msg.token);
          if (user) {
            client = { ws, userId: user.id };
            registerSocket(user.id, ws);
            ws.send(JSON.stringify({ event: 'auth:ok', payload: { userId: user.id } }));
          }
          return;
        }
        if (!client) return;

        if (msg.event === 'typing' && msg.conversationId) {
          const isMember = db
            .prepare(`SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?`)
            .get(String(msg.conversationId), client.userId);
          if (isMember) {
            emitToConversation(
              String(msg.conversationId),
              'typing',
              {
                conversationId: String(msg.conversationId),
                userId: client.userId,
                isTyping: Boolean(msg.isTyping),
              },
              client.userId
            );
          }
        }
      } catch {
        // ignore malformed JSON
      }
    });

    ws.on('close', () => {
      if (client) {
        const set = userSockets.get(client.userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            userSockets.delete(client.userId);
            broadcastPresence(client.userId, false);
          }
        }
      }
    });
  });
}

function registerSocket(userId: string, ws: WebSocket) {
  let set = userSockets.get(userId);
  const wasOffline = !set || set.size === 0;
  if (!set) {
    set = new Set();
    userSockets.set(userId, set);
  }
  set.add(ws);
  if (wasOffline) {
    broadcastPresence(userId, true);
  }
}

function broadcastPresence(userId: string, online: boolean) {
  const serialized = JSON.stringify({ event: 'presence', payload: { userId, online } });
  for (const [, set] of userSockets) {
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    }
  }
}
