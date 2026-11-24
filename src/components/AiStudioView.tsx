import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  FileAudio,
  Loader2,
  MessageSquarePlus,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Radio,
  Send,
  Settings2,
  Share2,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest, getAuthToken } from '../lib/api';
import {
  addFirestoreAiMessage,
  removeFirestoreAiThread,
  saveFirestoreTranscript,
  subscribeFirestoreAiThreads,
  upsertFirestoreAiThread,
} from '../lib/firebase';
import type { AiMessageItem, AiThreadItem, AiTranscriptItem } from '../types';

type StudioTab = 'chat' | 'voice' | 'transcribe';
type ChatModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
type ThinkingLevelId = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

const ROLE_PRESETS: Array<{
  id: string;
  labelHi: string;
  labelEn: string;
  instruction: string;
}> = [
  {
    id: 'creator',
    labelHi: 'ZX क्रिएटर कोच',
    labelEn: 'ZX Creator Coach',
    instruction:
      "You are ZX Creator Coach for India's Social Universe. Craft engaging captions, viral Shorts hooks, #hashtags, and thoughtful ZX discussion posts in Hindi, Hinglish, or English.",
  },
  {
    id: 'architect',
    labelHi: 'टेक व कोड विशेषज्ञ',
    labelEn: 'Tech & Code Architect',
    instruction:
      'You are a senior software engineer and systems architect. Give crisp, production-grade technical explanations, clean code, and debugging help.',
  },
  {
    id: 'bilingual',
    labelHi: 'हिन्दी ↔ English ट्यूटर',
    labelEn: 'Hindi ↔ English Tutor',
    instruction:
      'You are a warm bilingual Hindi and English tutor. Translate accurately, explain nuances, and help users communicate clearly across languages.',
  },
  {
    id: 'general',
    labelHi: 'सामान्य सहायक',
    labelEn: 'General Assistant',
    instruction:
      'You are ZX AI, a helpful, honest, and concise AI assistant built for Indian creators and thinkers.',
  },
];

const LIVE_VOICES = ['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'] as const;

function float32ToBase64Pcm16(float32: Float32Array): string {
  const bytes = new Uint8Array(float32.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const len = Math.floor(bytes.length / 2);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

export function AiStudioView() {
  const { lang, openCreate, toast } = useApp();
  const [studioTab, setStudioTab] = useState<StudioTab>('chat');

  // ========================
  // 1. CHATBOT STATE
  // ========================
  const [threads, setThreads] = useState<AiThreadItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageItem[]>([]);
  const [chatModel, setChatModel] = useState<ChatModelId>('gemini-4-hydrogen');
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelId>('HIGH');
  const [rolePresetId, setRolePresetId] = useState<string>('creator');
  const [systemInstruction, setSystemInstruction] = useState<string>(ROLE_PRESETS[0].instruction);
  const [showSystemEditor, setShowSystemEditor] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingReply, setStreamingReply] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dictatingChat, setDictatingChat] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatDictationRecorderRef = useRef<MediaRecorder | null>(null);

  const loadThreads = useCallback(async () => {
    try {
      const res = await apiRequest<{ threads: AiThreadItem[] }>('/ai/threads');
      setThreads(res.threads || []);
    } catch {
      // ignore initial error
    }
  }, []);

  const loadMessages = useCallback(async (threadId: string) => {
    try {
      const res = await apiRequest<{ messages: AiMessageItem[] }>(`/ai/threads/${threadId}/messages`);
      setMessages(res.messages || []);
    } catch (err: any) {
      toast(err.message, 'error');
    }
  }, [toast]);

  useEffect(() => {
    loadThreads();
    // Subscribe to Firestore real-time threads when Firebase Auth is active
    const unsub = subscribeFirestoreAiThreads(() => {
      // keep local thread cache fresh without clobbering server IDs
    });
    return () => unsub();
  }, [loadThreads]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingReply]);

  const handleSelectThread = (thread: AiThreadItem) => {
    setActiveThreadId(thread.id);
    setChatModel(thread.model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen');
    setSystemInstruction(thread.system_instruction || ROLE_PRESETS[0].instruction);
    loadMessages(thread.id);
  };

  const handleNewChat = () => {
    setActiveThreadId(null);
    setMessages([]);
    setStreamingReply('');
  };

  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest(`/ai/threads/${threadId}`, { method: 'DELETE' });
      removeFirestoreAiThread(threadId).catch(() => {});
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      if (activeThreadId === threadId) {
        handleNewChat();
      }
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handlePresetChange = (presetId: string) => {
    setRolePresetId(presetId);
    const found = ROLE_PRESETS.find((r) => r.id === presetId);
    if (found) {
      setSystemInstruction(found.instruction);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = promptInput.trim();
    if (!text || streaming) return;

    setPromptInput('');
    setStreaming(true);
    setStreamingReply('');

    const tempUserId = `temp-user-${Date.now()}`;
    const optimisticUser: AiMessageItem = {
      id: tempUserId,
      thread_id: activeThreadId || 'pending',
      role: 'user',
      content: text,
      model: chatModel,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const token = getAuthToken();
      const response = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          threadId: activeThreadId,
          message: text,
          model: chatModel,
          thinkingLevel,
          systemInstruction,
        }),
      });

      if (!response.ok || !response.body) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Chat request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let resolvedThreadId = activeThreadId;
      let resolvedTitle = text.slice(0, 60);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const chunkLine of lines) {
          const dataLine = chunkLine.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine.slice(6));

          if (payload.meta) {
            resolvedThreadId = payload.meta.threadId;
            resolvedTitle = payload.meta.title || resolvedTitle;
            setActiveThreadId(resolvedThreadId);
            upsertFirestoreAiThread({
              id: resolvedThreadId!,
              title: resolvedTitle,
              model: chatModel,
              systemInstruction,
            }).catch(() => {});
            addFirestoreAiMessage({
              id: payload.meta.userMessageId,
              threadId: resolvedThreadId!,
              role: 'user',
              content: text,
              model: chatModel,
            }).catch(() => {});
          } else if (payload.delta) {
            setStreamingReply((prev) => prev + payload.delta);
          } else if (payload.error) {
            throw new Error(payload.error);
          } else if (payload.done) {
            const finalText = String(payload.fullText || '');
            const finalTid = String(payload.threadId);
            setStreamingReply('');
            setMessages((prev) => [
              ...prev.map((m) =>
                m.id === tempUserId ? { ...m, id: payload.userMessageId, thread_id: finalTid } : m
              ),
              {
                id: payload.modelMessageId,
                thread_id: finalTid,
                role: 'model',
                content: finalText,
                model: payload.model || chatModel,
                created_at: new Date().toISOString(),
              },
            ]);
            addFirestoreAiMessage({
              id: payload.modelMessageId,
              threadId: finalTid,
              role: 'model',
              content: finalText,
              model: payload.model || chatModel,
            }).catch(() => {});
            loadThreads();
          }
        }
      }
    } catch (err: any) {
      setStreamingReply('');
      toast(err.message || 'Chat failed', 'error');
    } finally {
      setStreaming(false);
    }
  };

  // Quick voice dictation into Chatbot composer using gemini-3.5-transcribe
  const toggleChatDictation = async () => {
    if (dictatingChat && chatDictationRecorderRef.current) {
      chatDictationRecorderRef.current.stop();
      setDictatingChat(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      chatDictationRecorderRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 400) return;
        const fd = new FormData();
        fd.append('audio', blob, `dictation.${mimeType.includes('mp4') ? 'm4a' : 'webm'}`);
        fd.append('languageHint', lang === 'hi' ? 'Hindi or English' : 'English or Hindi');
        try {
          const token = getAuthToken();
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: fd,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Transcription failed');
          if (data.item?.transcript) {
            setPromptInput((prev) => (prev ? `${prev} ${data.item.transcript}` : data.item.transcript));
          }
        } catch (err: any) {
          toast(err.message, 'error');
        }
      };
      recorder.start();
      setDictatingChat(true);
    } catch {
      toast(lang === 'hi' ? 'माइक्रोफ़ोन अनुमति आवश्यक है।' : 'Microphone permission is required.', 'error');
    }
  };

  // ========================
  // 2. LIVE VOICE STATE (gemini-3.8-live)
  // ========================
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'live'>('idle');
  const [liveVoice, setLiveVoice] = useState<(typeof LIVE_VOICES)[number]>('Zephyr');
  const [livePersona, setLivePersona] = useState('');
  const [liveCaptions, setLiveCaptions] = useState<Array<{ id: string; speaker: 'user' | 'ai'; text: string }>>([]);

  const liveWsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const stopLiveVoice = useCallback(() => {
    try {
      processorRef.current?.disconnect();
    } catch {}
    processorRef.current = null;

    try {
      micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    } catch {}
    micStreamRef.current = null;

    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    }
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    try {
      inputAudioCtxRef.current?.close();
    } catch {}
    inputAudioCtxRef.current = null;

    try {
      outputAudioCtxRef.current?.close();
    } catch {}
    outputAudioCtxRef.current = null;

    try {
      liveWsRef.current?.close();
    } catch {}
    liveWsRef.current = null;

    setLiveStatus('idle');
  }, []);

  useEffect(() => {
    return () => {
      stopLiveVoice();
    };
  }, [stopLiveVoice]);

  const schedulePlaybackChunk = (base64Pcm: string) => {
    const ctx = outputAudioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const samples = base64Pcm16ToFloat32(base64Pcm);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.copyToChannel(new Float32Array(samples), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
    source.start(startTime);
    nextStartTimeRef.current = startTime + buffer.duration;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
  };

  const appendLiveCaption = (speaker: 'user' | 'ai', text: string) => {
    if (!text.trim()) return;
    setLiveCaptions((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [...prev.slice(0, -1), { ...last, text: `${last.text}${text}` }];
      }
      return [...prev, { id: `${Date.now()}-${Math.random()}`, speaker, text }];
    });
  };

  const startLiveVoice = async () => {
    const token = getAuthToken();
    if (!token) {
      toast(lang === 'hi' ? 'कृपया लॉगिन करें।' : 'Please sign in first.', 'error');
      return;
    }

    setLiveStatus('connecting');
    setLiveCaptions([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputCtx;
      outputAudioCtxRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const qs = new URLSearchParams({
        token,
        voice: liveVoice,
        lang,
        ...(livePersona.trim() ? { system: livePersona.trim() } : {}),
      });
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/live?${qs.toString()}`);
      liveWsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (ev) => {
          if (liveWsRef.current?.readyState !== WebSocket.OPEN) return;
          const pcmBase64 = float32ToBase64Pcm16(ev.inputBuffer.getChannelData(0));
          liveWsRef.current.send(JSON.stringify({ type: 'audio', data: pcmBase64 }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'ready') {
            setLiveStatus('live');
          } else if (msg.type === 'audio' && msg.data) {
            schedulePlaybackChunk(msg.data);
          } else if (msg.type === 'interrupted') {
            for (const src of activeSourcesRef.current) {
              try {
                src.stop();
                src.disconnect();
              } catch {}
            }
            activeSourcesRef.current.clear();
            nextStartTimeRef.current = 0;
          } else if (msg.type === 'inputTranscript' && msg.text) {
            appendLiveCaption('user', msg.text);
          } else if (msg.type === 'outputTranscript' && msg.text) {
            appendLiveCaption('ai', msg.text);
          } else if (msg.type === 'error') {
            toast(msg.message || 'Live voice error', 'error');
            stopLiveVoice();
          }
        } catch {
          // ignore malformed payload
        }
      };

      ws.onerror = () => {
        toast(lang === 'hi' ? 'वॉइस कनेक्शन त्रुटि।' : 'Live voice connection error.', 'error');
        stopLiveVoice();
      };

      ws.onclose = () => {
        stopLiveVoice();
      };
    } catch {
      toast(lang === 'hi' ? 'माइक्रोफ़ोन शुरू नहीं हो सका।' : 'Could not access microphone.', 'error');
      stopLiveVoice();
    }
  };

  // ========================
  // 3. AUDIO TRANSCRIPTION STATE (gemini-3.5-transcribe)
  // ========================
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [transcripts, setTranscripts] = useState<AiTranscriptItem[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTranscripts = useCallback(async () => {
    try {
      const res = await apiRequest<{ items: AiTranscriptItem[] }>('/ai/transcripts');
      setTranscripts(res.items || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (studioTab === 'transcribe') {
      loadTranscripts();
    }
  }, [studioTab, loadTranscripts]);

  const submitAudioForTranscription = async (blob: Blob, filename: string, durationSec: number) => {
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append('audio', blob, filename);
      fd.append('durationSec', String(durationSec));
      fd.append('languageHint', lang === 'hi' ? 'Hindi, Hinglish, or English' : 'English or Hindi');

      const token = getAuthToken();
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transcription failed');

      const created: AiTranscriptItem = data.item;
      setTranscripts((prev) => [created, ...prev]);
      saveFirestoreTranscript({
        id: created.id,
        transcript: created.transcript,
        mimeType: created.mime_type,
        durationSec: created.duration_sec,
      }).catch(() => {});
      toast(lang === 'hi' ? 'ऑडियो ट्रांसक्रिप्शन तैयार!' : 'Audio transcribed!', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setTranscribing(false);
    }
  };

  const toggleMicRecord = async () => {
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      let sec = 0;
      setRecordSeconds(0);
      recorderRef.current = recorder;

      timerRef.current = setInterval(() => {
        sec += 1;
        setRecordSeconds(sec);
      }, 1000);

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size > 300) {
          void submitAudioForTranscription(blob, `recording.${mimeType.includes('mp4') ? 'm4a' : 'webm'}`, sec);
        }
      };

      recorder.start();
      setRecording(true);
    } catch {
      toast(lang === 'hi' ? 'माइक्रोफ़ोन अनुमति आवश्यक है।' : 'Microphone permission required.', 'error');
    }
  };

  const handleAudioFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await submitAudioForTranscription(file, file.name, 0);
    e.target.value = '';
  };

  const handleDeleteTranscript = async (id: string) => {
    try {
      await apiRequest(`/ai/transcripts/${id}`, { method: 'DELETE' });
      setTranscripts((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1600);
    });
  };

  return (
    <div className="space-y-5">
      {/* Studio Header & Mode Tabs */}
      <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl zx-gradient-bg text-white flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-lg font-bold">ZX AI Studio</h1>
            <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
              {lang === 'hi'
                ? 'Gemini चैट, लाइव वॉइस बातचीत और ऑडियो ट्रांसक्रिप्शन'
                : 'Gemini Chat, Live Voice Conversations & Audio Transcription'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl">
          <button
            type="button"
            onClick={() => setStudioTab('chat')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              studioTab === 'chat'
                ? 'zx-gradient-bg text-white shadow-sm'
                : 'text-[#5A5B6E] dark:text-[#A2A3B8] hover:text-[#080810] dark:hover:text-white'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>{lang === 'hi' ? 'चैटबॉट' : 'Chatbot'}</span>
          </button>

          <button
            type="button"
            onClick={() => setStudioTab('voice')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              studioTab === 'voice'
                ? 'zx-gradient-bg text-white shadow-sm'
                : 'text-[#5A5B6E] dark:text-[#A2A3B8] hover:text-[#080810] dark:hover:text-white'
            }`}
          >
            <PhoneCall className="w-4 h-4" />
            <span>{lang === 'hi' ? 'लाइव वॉइस' : 'Voice Live'}</span>
          </button>

          <button
            type="button"
            onClick={() => setStudioTab('transcribe')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              studioTab === 'transcribe'
                ? 'zx-gradient-bg text-white shadow-sm'
                : 'text-[#5A5B6E] dark:text-[#A2A3B8] hover:text-[#080810] dark:hover:text-white'
            }`}
          >
            <FileAudio className="w-4 h-4" />
            <span>{lang === 'hi' ? 'ट्रांसक्राइब' : 'Transcribe'}</span>
          </button>
        </div>
      </div>

      {/* ================================
          TAB 1: MULTI-TURN GEMINI CHATBOT
         ================================ */}
      {studioTab === 'chat' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Conversation History Sidebar */}
          <aside className="lg:col-span-4 bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-4 flex flex-col gap-3 max-h-[680px]">
            <button
              type="button"
              onClick={handleNewChat}
              className="w-full py-2.5 px-3 rounded-xl zx-gradient-bg text-white text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-95"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>{lang === 'hi' ? 'नई बातचीत शुरू करें' : 'New Conversation'}</span>
            </button>

            <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5A5B6E] dark:text-[#A2A3B8] px-1">
              {lang === 'hi' ? 'इतिहास' : 'History'} ({threads.length})
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {threads.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
                  {lang === 'hi' ? 'अभी कोई चैट नहीं है। पहला प्रश्न पूछें।' : 'No saved chats yet. Start your first thread.'}
                </div>
              ) : (
                threads.map((th) => {
                  const active = activeThreadId === th.id;
                  return (
                    <div
                      key={th.id}
                      onClick={() => handleSelectThread(th)}
                      className={`group p-2.5 rounded-xl cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                        active
                          ? 'bg-[#792BFF]/15 border border-[#792BFF]/40'
                          : 'hover:bg-black/5 dark:hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{th.title}</div>
                        <div className="text-[10px] text-[#5A5B6E] dark:text-[#A2A3B8] mt-0.5 truncate">
                          {th.model}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteThread(th.id, e)}
                        aria-label="Delete thread"
                        className="opacity-60 hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/10 text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Main Chat Workspace */}
          <section className="lg:col-span-8 bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl flex flex-col h-[680px] overflow-hidden">
            {/* Controls Header: Model, Thinking Level, Role Persona */}
            <div className="p-4 border-b border-black/10 dark:border-white/10 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 p-1 bg-black/5 dark:bg-white/5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setChatModel('gemini-4-hydrogen')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      chatModel === 'gemini-4-hydrogen'
                        ? 'bg-white dark:bg-[#1A1A32] text-[#080810] dark:text-white shadow-sm'
                        : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
                    }`}
                  >
                    Gemini 4 Hydrogen
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatModel('gemini-3.1-flash-lite')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      chatModel === 'gemini-3.1-flash-lite'
                        ? 'bg-white dark:bg-[#1A1A32] text-[#080810] dark:text-white shadow-sm'
                        : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
                    }`}
                  >
                    Flash-Lite (Fast)
                  </button>
                </div>

                {chatModel === 'gemini-4-hydrogen' && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold text-[#5A5B6E] dark:text-[#A2A3B8] mr-1">
                      Thinking:
                    </span>
                    {(['LOW', 'MEDIUM', 'HIGH', 'XHIGH'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setThinkingLevel(lvl)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono-tabular font-semibold transition-colors ${
                          thinkingLevel === lvl
                            ? 'bg-[#792BFF] text-white'
                            : 'bg-black/5 dark:bg-white/5 text-[#5A5B6E] dark:text-[#A2A3B8]'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* System Instruction Role Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {ROLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetChange(preset.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                        rolePresetId === preset.id
                          ? 'border-[#FF28B9]/60 bg-[#FF28B9]/10 text-[#FF28B9]'
                          : 'border-black/10 dark:border-white/10 text-[#5A5B6E] dark:text-[#A2A3B8]'
                      }`}
                    >
                      {lang === 'hi' ? preset.labelHi : preset.labelEn}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowSystemEditor((v) => !v)}
                  className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/5 text-[11px] font-medium flex items-center gap-1"
                >
                  <Settings2 className="w-3.5 h-3.5 text-[#792BFF]" />
                  <span>{lang === 'hi' ? 'सिस्टम भूमिका' : 'System Role'}</span>
                </button>
              </div>

              {showSystemEditor && (
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={systemInstruction}
                  onChange={(e) => {
                    setRolePresetId('custom');
                    setSystemInstruction(e.target.value);
                  }}
                  placeholder={lang === 'hi' ? 'AI के लिए सिस्टम निर्देश लिखें...' : 'Write custom system instructions...'}
                  className="w-full p-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
                />
              )}
            </div>

            {/* Scrollable Message History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && !streamingReply ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 space-y-3">
                  <div className="w-14 h-14 rounded-3xl zx-gradient-bg/15 border border-[#792BFF]/30 flex items-center justify-center">
                    <Sparkles className="w-7 h-7 text-[#FF28B9]" />
                  </div>
                  <h3 className="font-display text-base font-bold">
                    {lang === 'hi' ? 'ZX Gemini सहायक तैयार है' : 'ZX Gemini Assistant Ready'}
                  </h3>
                  <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] max-w-md">
                    {lang === 'hi'
                      ? 'पोस्ट कैप्शन, कोड सहायता, अनुवाद या गहन विश्लेषण के लिए पूछें।'
                      : 'Ask for creative ZX posts, Shorts scripts, coding help, or bilingual translations.'}
                  </p>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'zx-gradient-bg text-white rounded-br-sm'
                            : 'bg-black/[0.04] dark:bg-white/[0.06] text-[#080810] dark:text-[#E8E8F2] rounded-bl-sm border border-black/5 dark:border-white/10'
                        }`}
                      >
                        {msg.content}
                      </div>

                      {msg.role === 'model' && (
                        <div className="flex items-center gap-2 mt-1.5 px-1">
                          <span className="text-[10px] text-[#5A5B6E] dark:text-[#A2A3B8]">{msg.model}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8] hover:text-[#080810] dark:hover:text-white flex items-center gap-1"
                          >
                            {copiedId === msg.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            <span>{lang === 'hi' ? 'कॉपी' : 'Copy'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openCreate('zx', msg.content)}
                            className="text-[11px] text-[#792BFF] dark:text-[#FF28B9] font-medium flex items-center gap-1 hover:underline"
                          >
                            <Share2 className="w-3 h-3" />
                            <span>{lang === 'hi' ? 'ZX पोस्ट बनाएं' : 'Post to ZX'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {streamingReply && (
                    <div className="flex flex-col items-start">
                      <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-black/[0.04] dark:bg-white/[0.06] border border-[#792BFF]/30">
                        {streamingReply}
                      </div>
                    </div>
                  )}

                  {streaming && !streamingReply && (
                    <div className="flex items-center gap-2 text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
                      <Loader2 className="w-4 h-4 animate-spin text-[#792BFF]" />
                      <span>{lang === 'hi' ? 'सोच रहा है...' : 'Thinking...'}</span>
                    </div>
                  )}
                </>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input Composer */}
            <form onSubmit={handleSendMessage} className="p-3.5 border-t border-black/10 dark:border-white/10 flex items-end gap-2">
              <button
                type="button"
                onClick={toggleChatDictation}
                aria-label="Dictate message"
                className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                  dictatingChat
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-black/5 dark:bg-white/5 text-[#5A5B6E] dark:text-[#A2A3B8] hover:text-[#792BFF]'
                }`}
              >
                {dictatingChat ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <textarea
                rows={1}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendMessage();
                  }
                }}
                placeholder={lang === 'hi' ? 'Gemini से कुछ भी पूछें...' : 'Ask Gemini anything...'}
                className="flex-1 max-h-32 px-3.5 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
              />

              <button
                type="submit"
                disabled={streaming || !promptInput.trim()}
                className="min-h-[44px] px-4 rounded-xl zx-gradient-bg text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* ================================
          TAB 2: LIVE VOICE CONVERSATION (gemini-3.8-live)
         ================================ */}
      {studioTab === 'voice' && (
        <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold">
                {lang === 'hi' ? 'रीयल-टाइम वॉइस बातचीत' : 'Real-Time Voice Conversation'}
              </h2>
              <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
                {lang === 'hi'
                  ? 'Gemini 3.8 Live के साथ सीधे बोलें और तुरंत जवाब सुनें (16kHz / 24kHz ऑडियो स्ट्रीमिंग)'
                  : 'Speak naturally with Gemini 3.8 Live with instant low-latency voice responses'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {LIVE_VOICES.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={liveStatus !== 'idle'}
                  onClick={() => setLiveVoice(v)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors disabled:opacity-60 ${
                    liveVoice === v
                      ? 'zx-gradient-bg text-white'
                      : 'bg-black/5 dark:bg-white/5 text-[#5A5B6E] dark:text-[#A2A3B8]'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <input
            type="text"
            disabled={liveStatus !== 'idle'}
            value={livePersona}
            onChange={(e) => setLivePersona(e.target.value)}
            placeholder={
              lang === 'hi'
                ? 'वैकल्पिक: वॉइस AI की भूमिका (जैसे: हिंदी व अंग्रेजी क्रिएटर साथी)...'
                : 'Optional: Voice AI role or instructions...'
            }
            className="w-full px-4 py-2.5 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
          />

          {/* Interactive Call Orb */}
          <div className="py-8 flex flex-col items-center justify-center gap-5">
            <div className="relative flex items-center justify-center">
              {liveStatus === 'live' && (
                <span className="absolute w-36 h-36 rounded-full bg-[#792BFF]/25 animate-ping" />
              )}
              <button
                type="button"
                onClick={liveStatus === 'idle' ? startLiveVoice : stopLiveVoice}
                disabled={liveStatus === 'connecting'}
                className={`relative z-10 w-28 h-28 rounded-full flex flex-col items-center justify-center gap-1.5 text-white font-semibold shadow-2xl transition-transform active:scale-95 ${
                  liveStatus === 'live' ? 'bg-red-500 hover:bg-red-600' : 'zx-gradient-bg hover:opacity-95'
                }`}
              >
                {liveStatus === 'connecting' ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : liveStatus === 'live' ? (
                  <PhoneOff className="w-8 h-8" />
                ) : (
                  <PhoneCall className="w-8 h-8" />
                )}
                <span className="text-[11px]">
                  {liveStatus === 'connecting'
                    ? lang === 'hi'
                      ? 'जुड़ रहा है...'
                      : 'Connecting...'
                    : liveStatus === 'live'
                      ? lang === 'hi'
                        ? 'कॉल समाप्त'
                        : 'End Call'
                      : lang === 'hi'
                        ? 'बात शुरू करें'
                        : 'Start Voice'}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
              <Radio className={`w-4 h-4 ${liveStatus === 'live' ? 'text-[#FF28B9]' : ''}`} />
              <span>
                {liveStatus === 'live'
                  ? `${lang === 'hi' ? 'लाइव सुन रहा है' : 'Listening live'} · ${liveVoice}`
                  : lang === 'hi'
                    ? 'माइक्रोफ़ोन शुरू करने के लिए टैप करें'
                    : 'Tap to begin live voice conversation'}
              </span>
            </div>
          </div>

          {/* Live Captions */}
          {liveCaptions.length > 0 && (
            <div className="rounded-2xl bg-black/[0.03] dark:bg-[#080810] border border-black/10 dark:border-white/10 p-4 space-y-2.5 max-h-64 overflow-y-auto">
              {liveCaptions.map((cap) => (
                <div key={cap.id} className="text-xs leading-relaxed">
                  <span
                    className={`font-bold mr-2 ${
                      cap.speaker === 'user' ? 'text-[#00D4FF]' : 'text-[#FF28B9]'
                    }`}
                  >
                    {cap.speaker === 'user' ? (lang === 'hi' ? 'आप:' : 'You:') : 'ZX AI:'}
                  </span>
                  <span>{cap.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================================
          TAB 3: AUDIO TRANSCRIPTION (gemini-3.5-transcribe)
         ================================ */}
      {studioTab === 'transcribe' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-6 space-y-5">
            <div>
              <h2 className="font-display text-lg font-bold">
                {lang === 'hi' ? 'ऑडियो से टेक्स्ट (ट्रांसक्रिप्शन)' : 'Speech-to-Text Transcription'}
              </h2>
              <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
                {lang === 'hi'
                  ? 'माइक्रोफ़ोन से रिकॉर्ड करें या ऑडियो फ़ाइल अपलोड करें — Gemini 3.5 Transcribe सटीक पाठ तैयार करेगा।'
                  : 'Record from your microphone or upload audio — Gemini 3.5 Transcribe converts Hindi, Hinglish, and English accurately.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={toggleMicRecord}
                disabled={transcribing}
                className={`px-5 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2 transition-all ${
                  recording
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'zx-gradient-bg text-white hover:opacity-95'
                }`}
              >
                {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                <span>
                  {recording
                    ? `${lang === 'hi' ? 'रोकें व ट्रांसक्राइब करें' : 'Stop & Transcribe'} (${recordSeconds}s)`
                    : lang === 'hi'
                      ? 'माइक्रोफ़ोन से रिकॉर्ड करें'
                      : 'Record with Microphone'}
                </span>
              </button>

              <label className="px-5 py-3 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-semibold flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4 text-[#792BFF]" />
                <span>{lang === 'hi' ? 'ऑडियो फ़ाइल अपलोड करें' : 'Upload Audio File'}</span>
                <input
                  type="file"
                  accept="audio/*"
                  disabled={recording || transcribing}
                  onChange={handleAudioFileUpload}
                  className="hidden"
                />
              </label>

              {transcribing && (
                <div className="flex items-center gap-2 text-xs text-[#792BFF] dark:text-[#FF28B9] font-medium">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{lang === 'hi' ? 'ऑडियो ट्रांसक्राइब हो रहा है...' : 'Transcribing audio...'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Saved Transcripts */}
          <div className="space-y-3">
            {transcripts.length === 0 ? (
              <div className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-3xl p-10 text-center text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
                {lang === 'hi'
                  ? 'अभी कोई ट्रांसक्रिप्शन सहेजा नहीं गया है।'
                  : 'No transcriptions saved yet. Record or upload an audio clip above.'}
              </div>
            ) : (
              transcripts.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 rounded-2xl p-4 space-y-3"
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.transcript}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-black/5 dark:border-white/10 text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8]">
                    <span>
                      {new Date(item.created_at).toLocaleString()}
                      {item.duration_sec > 0 ? ` · ${Math.round(item.duration_sec)}s` : ''}
                    </span>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleCopy(item.id, item.transcript)}
                        className="flex items-center gap-1 hover:text-[#080810] dark:hover:text-white"
                      >
                        {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{lang === 'hi' ? 'कॉपी' : 'Copy'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openCreate('zx', item.transcript)}
                        className="flex items-center gap-1 text-[#792BFF] dark:text-[#FF28B9] font-semibold hover:underline"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>{lang === 'hi' ? 'पोस्ट बनाएं' : 'Create Post'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPromptInput(item.transcript);
                          setStudioTab('chat');
                        }}
                        className="flex items-center gap-1 hover:text-[#080810] dark:hover:text-white"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>{lang === 'hi' ? 'AI से पूछें' : 'Ask AI'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteTranscript(item.id)}
                        className="text-red-500 hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
