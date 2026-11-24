import crypto from 'crypto';
import express from 'express';
import multer from 'multer';
import { GenerateContentResponse, ThinkingLevel } from '@google/genai';
import { type AuthedRequest, rateLimit, requireAuth } from './auth.ts';
import { db } from './db.ts';
import { getGeminiClient } from './gemini.ts';

const ALLOWED_CHAT_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function resolveThinkingLevel(model: string, rawLevel?: string): ThinkingLevel | undefined {
  if (model === 'gemini-3.1-flash-lite') {
    return ThinkingLevel.MINIMAL;
  }
  switch (String(rawLevel || '').toUpperCase()) {
    case 'LOW':
      return ThinkingLevel.LOW;
    case 'MEDIUM':
      return ThinkingLevel.MEDIUM;
    case 'XHIGH':
      return ThinkingLevel.XHIGH;
    case 'HIGH':
    default:
      return ThinkingLevel.HIGH;
  }
}

function formatGeminiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || 'Gemini API error');
  if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID') || msg.includes('403')) {
    return 'Please check your Gemini API key in Settings > Secrets.';
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return 'Gemini API rate limit reached. Please wait a moment and try again.';
  }
  return msg;
}

export function registerAiRoutes(router: express.Router) {
  // List AI Chatbot Threads
  router.get('/ai/threads', requireAuth, (req: AuthedRequest, res) => {
    const threads = db
      .prepare(
        `SELECT id, title, model, system_instruction, created_at, updated_at
         FROM ai_threads WHERE user_id = ? ORDER BY updated_at DESC LIMIT 60`
      )
      .all(req.user!.id);
    res.json({ threads });
  });

  // Create AI Chatbot Thread
  router.post('/ai/threads', requireAuth, (req: AuthedRequest, res) => {
    const { title, model, systemInstruction } = req.body || {};
    const safeModel = ALLOWED_CHAT_MODELS.has(String(model)) ? String(model) : 'gemini-4-hydrogen';
    const safeTitle = String(title || 'New Chat').trim().slice(0, 120) || 'New Chat';
    const safeSys = String(systemInstruction || '').trim().slice(0, 2000);
    const id = crypto.randomUUID();
    const ts = new Date().toISOString();

    db.prepare(
      `INSERT INTO ai_threads (id, user_id, title, model, system_instruction, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.user!.id, safeTitle, safeModel, safeSys, ts, ts);

    const thread = db
      .prepare(
        `SELECT id, title, model, system_instruction, created_at, updated_at FROM ai_threads WHERE id = ?`
      )
      .get(id);
    res.status(201).json({ thread });
  });

  // Update AI Chatbot Thread metadata / system instruction / model
  router.patch('/ai/threads/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const existing = db
      .prepare(`SELECT * FROM ai_threads WHERE id = ? AND user_id = ?`)
      .get(id, req.user!.id) as Record<string, unknown> | undefined;
    if (!existing) return res.status(404).json({ error: 'Conversation not found' });

    const { title, model, systemInstruction } = req.body || {};
    const nextTitle = title !== undefined ? String(title).trim().slice(0, 120) : String(existing.title);
    const nextModel =
      model !== undefined && ALLOWED_CHAT_MODELS.has(String(model)) ? String(model) : String(existing.model);
    const nextSys =
      systemInstruction !== undefined
        ? String(systemInstruction).trim().slice(0, 2000)
        : String(existing.system_instruction);
    const ts = new Date().toISOString();

    db.prepare(
      `UPDATE ai_threads SET title = ?, model = ?, system_instruction = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    ).run(nextTitle || 'New Chat', nextModel, nextSys, ts, id, req.user!.id);

    const updated = db
      .prepare(
        `SELECT id, title, model, system_instruction, created_at, updated_at FROM ai_threads WHERE id = ?`
      )
      .get(id);
    res.json({ thread: updated });
  });

  // Delete AI Chatbot Thread
  router.delete('/ai/threads/:id', requireAuth, (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    db.prepare(`DELETE FROM ai_threads WHERE id = ? AND user_id = ?`).run(id, req.user!.id);
    res.json({ ok: true });
  });

  // Get Messages in AI Thread
  router.get('/ai/threads/:id/messages', requireAuth, (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const thread = db
      .prepare(`SELECT id FROM ai_threads WHERE id = ? AND user_id = ?`)
      .get(id, req.user!.id);
    if (!thread) return res.status(404).json({ error: 'Conversation not found' });

    const messages = db
      .prepare(
        `SELECT id, thread_id, role, content, model, created_at
         FROM ai_messages WHERE thread_id = ? AND user_id = ? ORDER BY created_at ASC`
      )
      .all(id, req.user!.id);
    res.json({ messages });
  });

  // Multi-turn Streaming Chat (SSE) via Gemini
  router.post('/ai/chat/stream', requireAuth, rateLimit(40, 60_000), async (req: AuthedRequest, res) => {
    const { threadId, message, model, thinkingLevel, systemInstruction } = req.body || {};
    const cleanMsg = String(message || '').trim().slice(0, 16000);
    if (!cleanMsg) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const activeModel = ALLOWED_CHAT_MODELS.has(String(model)) ? String(model) : 'gemini-4-hydrogen';
    const ts = new Date().toISOString();
    let tid = String(threadId || '').trim();

    if (tid) {
      const owned = db
        .prepare(`SELECT * FROM ai_threads WHERE id = ? AND user_id = ?`)
        .get(tid, req.user!.id) as Record<string, unknown> | undefined;
      if (!owned) return res.status(404).json({ error: 'Conversation not found' });
    } else {
      tid = crypto.randomUUID();
      const autoTitle = cleanMsg.slice(0, 60) + (cleanMsg.length > 60 ? '...' : '');
      const sysInit = String(systemInstruction || '').trim().slice(0, 2000);
      db.prepare(
        `INSERT INTO ai_threads (id, user_id, title, model, system_instruction, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(tid, req.user!.id, autoTitle, activeModel, sysInit, ts, ts);
    }

    const threadRow = db
      .prepare(`SELECT * FROM ai_threads WHERE id = ?`)
      .get(tid) as { title: string; system_instruction: string };

    const effectiveSys =
      systemInstruction !== undefined
        ? String(systemInstruction).trim().slice(0, 2000)
        : String(threadRow.system_instruction || '');

    // Load prior multi-turn history before inserting the new user message
    const priorRows = db
      .prepare(`SELECT role, content FROM ai_messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 60`)
      .all(tid) as Array<{ role: string; content: string }>;

    const userMsgId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO ai_messages (id, thread_id, user_id, role, content, model, created_at)
       VALUES (?, ?, ?, 'user', ?, ?, ?)`
    ).run(userMsgId, tid, req.user!.id, cleanMsg, activeModel, ts);

    const nextTitle =
      threadRow.title === 'New Chat' && priorRows.length === 0
        ? cleanMsg.slice(0, 60) + (cleanMsg.length > 60 ? '...' : '')
        : threadRow.title;

    db.prepare(
      `UPDATE ai_threads SET title = ?, model = ?, system_instruction = ?, updated_at = ? WHERE id = ?`
    ).run(nextTitle, activeModel, effectiveSys, ts, tid);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const ai = getGeminiClient();
      const history = priorRows.map((row) => ({
        role: row.role === 'model' ? 'model' : 'user',
        parts: [{ text: row.content }],
      }));

      const level = resolveThinkingLevel(activeModel, thinkingLevel);
      const chat = ai.chats.create({
        model: activeModel,
        history,
        config: {
          ...(effectiveSys ? { systemInstruction: effectiveSys } : {}),
          ...(level ? { thinkingConfig: { thinkingLevel: level } } : {}),
        },
      });

      sendEvent({ meta: { threadId: tid, userMessageId: userMsgId, title: nextTitle } });

      const stream = await chat.sendMessageStream({ message: cleanMsg });
      let fullText = '';

      for await (const chunk of stream) {
        const c = chunk as GenerateContentResponse;
        const delta = c.text ?? '';
        if (delta) {
          fullText += delta;
          sendEvent({ delta });
        }
      }

      const finalText = fullText.trim() || 'No response generated.';
      const modelMsgId = crypto.randomUUID();
      const doneTs = new Date().toISOString();

      db.prepare(
        `INSERT INTO ai_messages (id, thread_id, user_id, role, content, model, created_at)
         VALUES (?, ?, ?, 'model', ?, ?, ?)`
      ).run(modelMsgId, tid, req.user!.id, finalText, activeModel, doneTs);

      db.prepare(`UPDATE ai_threads SET updated_at = ? WHERE id = ?`).run(doneTs, tid);

      sendEvent({
        done: true,
        threadId: tid,
        userMessageId: userMsgId,
        modelMessageId: modelMsgId,
        fullText: finalText,
        model: activeModel,
      });
      res.end();
    } catch (err) {
      const errMsg = formatGeminiError(err);
      console.error('Gemini Chat Stream Error:', err);
      sendEvent({ error: errMsg });
      res.end();
    }
  });

  // Audio Transcription via gemini-3.5-transcribe
  router.post(
    '/ai/transcribe',
    requireAuth,
    rateLimit(30, 60_000),
    audioUpload.single('audio'),
    async (req: AuthedRequest, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'Audio recording or file is required.' });
      }
      const mimeType = req.file.mimetype || 'audio/webm';
      const durationSec = Number(req.body?.durationSec || 0) || 0;
      const languageHint = String(req.body?.languageHint || '').trim();

      try {
        const ai = getGeminiClient();
        const base64Audio = req.file.buffer.toString('base64');
        const prompt = languageHint
          ? `Transcribe this audio accurately in its original spoken language (${languageHint}). Output only the clean transcription text.`
          : 'Transcribe this audio accurately in its original spoken language (Hindi, English, or Hinglish). Output only the clean transcription text.';

        const response = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Audio,
                },
              },
              { text: prompt },
            ],
          },
        });

        const transcript = (response.text || '').trim();
        if (!transcript) {
          return res.status(422).json({ error: 'No speech was detected in the audio.' });
        }

        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        db.prepare(
          `INSERT INTO ai_transcripts (id, user_id, transcript, mime_type, duration_sec, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(id, req.user!.id, transcript.slice(0, 16000), mimeType.slice(0, 64), durationSec, createdAt);

        res.status(201).json({
          item: {
            id,
            transcript,
            mime_type: mimeType,
            duration_sec: durationSec,
            created_at: createdAt,
          },
        });
      } catch (err) {
        console.error('Gemini Transcription Error:', err);
        res.status(502).json({ error: formatGeminiError(err) });
      }
    }
  );

  // List saved audio transcriptions
  router.get('/ai/transcripts', requireAuth, (req: AuthedRequest, res) => {
    const items = db
      .prepare(
        `SELECT id, transcript, mime_type, duration_sec, created_at
         FROM ai_transcripts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
      )
      .all(req.user!.id);
    res.json({ items });
  });

  // Delete saved transcription
  router.delete('/ai/transcripts/:id', requireAuth, (req: AuthedRequest, res) => {
    db.prepare(`DELETE FROM ai_transcripts WHERE id = ? AND user_id = ?`).run(
      String(req.params.id),
      req.user!.id
    );
    res.json({ ok: true });
  });
}
