import { LiveServerMessage, Modality, type Session } from '@google/genai';
import { WebSocket, WebSocketServer } from 'ws';
import { getUserByToken } from './auth.ts';
import { getGeminiClient } from './gemini.ts';

const ALLOWED_VOICES = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

export function createLiveVoiceServer(): WebSocketServer {
  const liveWss = new WebSocketServer({ noServer: true });

  liveWss.on('connection', async (clientWs, req) => {
    const url = new URL(req.url || '/ws/live', 'http://localhost');
    const token = url.searchParams.get('token') || '';
    const user = getUserByToken(token);

    if (!user || user.account_status === 'banned' || user.account_status === 'suspended') {
      clientWs.send(JSON.stringify({ type: 'error', message: 'Authentication required for Live Voice.' }));
      clientWs.close(4001, 'Unauthorized');
      return;
    }

    const rawVoice = url.searchParams.get('voice') || 'Zephyr';
    const voiceName = ALLOWED_VOICES.has(rawVoice) ? rawVoice : 'Zephyr';
    const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'hi';
    const customSys = (url.searchParams.get('system') || '').trim().slice(0, 1200);
    const defaultSystemInstruction =
      lang === 'hi'
        ? 'You are ZX Voice AI, a warm, articulate conversational partner for India. Respond naturally in Hindi, Hinglish, or English matching the user, keeping answers concise and conversational.'
        : 'You are ZX Voice AI, a warm, articulate conversational partner. Keep spoken responses concise, natural, and helpful.';
    const systemInstruction = customSys || defaultSystemInstruction;

    let session: Session | null = null;
    let isClosed = false;

    try {
      const ai = getGeminiClient();
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction,
        },
        callbacks: {
          onopen: () => {
            if (!isClosed && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'ready', voice: voiceName }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (isClosed || clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent;

            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ type: 'audio', data: part.inlineData.data }));
              }
            }
            if (content?.inputTranscription?.text) {
              clientWs.send(JSON.stringify({ type: 'inputTranscript', text: content.inputTranscription.text }));
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(JSON.stringify({ type: 'outputTranscript', text: content.outputTranscription.text }));
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ type: 'turnComplete' }));
            }
          },
          onerror: (err) => {
            console.error('Gemini Live API error:', err);
            if (!isClosed && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'error',
                  message: 'Live voice session encountered a connection error.',
                })
              );
            }
          },
          onclose: () => {
            if (!isClosed && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'closed' }));
              clientWs.close();
            }
          },
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to start Live Voice session.';
      console.error('Failed to connect Gemini Live:', err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', message: msg }));
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!session || isClosed) return;
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; data?: string; text?: string };
        if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
          session.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
          session.sendRealtimeInput({ text: msg.text.trim() });
        }
      } catch {
        // ignore malformed frame
      }
    });

    clientWs.on('close', () => {
      isClosed = true;
      try {
        session?.close();
      } catch {
        // ignore close error
      }
      session = null;
    });
  });

  return liveWss;
}
