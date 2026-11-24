import React, { useRef, useState } from 'react';
import { BarChart2, ImagePlus, Mic, MicOff, Plus, Trash2, Wand2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest, getAuthToken, uploadMediaFile } from '../lib/api';
import { StoryEditor } from './StoryEditor';
import { VideoEditor } from './VideoEditor';

export function CreateModal() {
  const { createModalMode, createPrefill, closeCreate, lang, triggerFeedRefresh, toast } = useApp();
  const [mode, setMode] = useState<'home' | 'zx' | 'story' | 'short'>(createModalMode || 'home');
  const [videoStudioOpen, setVideoStudioOpen] = useState(false);
  const [content, setContent] = useState('');
  const [media, setMedia] = useState<Array<{ mediaType: 'image' | 'video'; url: string; storagePath: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [dictating, setDictating] = useState(false);
  const dictateRecRef = useRef<MediaRecorder | null>(null);

  // ZX Poll & Thread
  const [showPoll, setShowPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [threadExtra, setThreadExtra] = useState<string[]>([]);

  React.useEffect(() => {
    if (createModalMode) {
      setMode(createModalMode);
      setVideoStudioOpen(false);
      setContent(createPrefill || '');
      setMedia([]);
      setShowPoll(false);
      setPollOptions(['', '']);
      setThreadExtra([]);
    }
  }, [createModalMode, createPrefill]);

  const toggleDictation = async () => {
    if (dictating && dictateRecRef.current) {
      dictateRecRef.current.stop();
      setDictating(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      dictateRecRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 400) return;
        const fd = new FormData();
        fd.append('audio', blob, `caption.${mimeType.includes('mp4') ? 'm4a' : 'webm'}`);
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
            setContent((prev) => (prev ? `${prev} ${data.item.transcript}` : data.item.transcript));
          }
        } catch (err: any) {
          toast(err.message, 'error');
        }
      };
      rec.start();
      setDictating(true);
    } catch {
      toast(lang === 'hi' ? 'माइक्रोफ़ोन अनुमति आवश्यक है।' : 'Microphone permission required.', 'error');
    }
  };

  if (!createModalMode) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);
    try {
      for (const file of files) {
        const isVideo = file.type.startsWith('video/');
        const bucket =
          mode === 'short'
            ? 'shorts'
            : isVideo
              ? 'videos'
              : 'post-images';
        const res = await uploadMediaFile(bucket, file, setProgress);
        setMedia((prev) => [...prev, res]);
      }
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const threadParts =
        mode === 'zx' && threadExtra.length > 0
          ? [{ content, media }, ...threadExtra.filter((x) => x.trim()).map((c) => ({ content: c, media: [] }))]
          : undefined;
      await apiRequest('/posts', {
        method: 'POST',
        body: JSON.stringify({
          postType: mode,
          content,
          media,
          threadParts,
          poll:
            mode === 'zx' && showPoll
              ? { question: content || 'Poll', options: pollOptions.filter((o) => o.trim()) }
              : undefined,
        }),
      });
      toast(lang === 'hi' ? 'प्रकाशित किया गया!' : 'Published!', 'success');
      triggerFeedRefresh();
      closeCreate();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div
        className={`w-full ${
          mode === 'story' || mode === 'short' || videoStudioOpen ? 'max-w-3xl' : 'max-w-xl'
        } rounded-3xl bg-white dark:bg-[#101020] border border-black/10 dark:border-white/10 p-6 shadow-2xl space-y-4 my-auto transition-all`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl">
            {(['home', 'zx', 'story', 'short'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setMode(tab);
                  setVideoStudioOpen(false);
                  setMedia([]);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  mode === tab ? 'zx-gradient-bg text-white' : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
                }`}
              >
                {tab === 'home'
                  ? lang === 'hi'
                    ? 'होम पोस्ट'
                    : 'Home'
                  : tab === 'zx'
                    ? 'ZX'
                    : tab === 'story'
                      ? lang === 'hi'
                        ? 'स्टोरी'
                        : 'Story'
                      : lang === 'hi'
                        ? 'शॉर्ट्स'
                        : 'Short'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={closeCreate}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-[#5A5B6E] dark:text-[#A2A3B8] hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === 'story' ? (
          <StoryEditor onCancel={closeCreate} onPublished={closeCreate} />
        ) : mode === 'short' || videoStudioOpen ? (
          <VideoEditor
            mode={mode === 'short' ? 'short' : mode}
            onCancel={() => {
              if (videoStudioOpen) setVideoStudioOpen(false);
              else closeCreate();
            }}
            onPublished={closeCreate}
          />
        ) : (
          <form onSubmit={handlePublish} className="space-y-4">
            <textarea
              rows={mode === 'zx' ? 4 : 3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                mode === 'zx'
                  ? lang === 'hi'
                    ? 'अपने विचार, #हैशटैग या @मेंशन लिखें...'
                    : "Share a thought, #hashtag, or @mention..."
                  : lang === 'hi'
                    ? 'कैप्शन लिखें...'
                    : 'Write a caption...'
              }
              className="w-full p-3.5 rounded-2xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
            />

            {/* Media Preview */}
            {media.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {media.map((m, idx) => (
                  <div key={idx} className="relative rounded-xl overflow-hidden bg-black aspect-square">
                    {m.mediaType === 'video' ? (
                      <video src={m.url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={m.url} alt="Upload" className="w-full h-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => setMedia((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Progress */}
            {uploading && (
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div style={{ width: `${progress}%` }} className="h-full zx-gradient-bg transition-all" />
                </div>
                <p className="text-[11px] font-mono-tabular text-[#5A5B6E] dark:text-[#A2A3B8]">{progress}%</p>
              </div>
            )}


        {/* Thread parts for ZX */}
        {mode === 'zx' &&
          threadExtra.map((part, idx) => (
            <div key={idx} className="flex gap-2 items-start">
              <textarea
                rows={2}
                value={part}
                onChange={(e) =>
                  setThreadExtra((prev) => prev.map((item, i) => (i === idx ? e.target.value : item)))
                }
                placeholder={`${lang === 'hi' ? 'थ्रेड भाग' : 'Thread part'} ${idx + 2}...`}
                className="flex-1 p-3 rounded-xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
              />
              <button
                type="button"
                onClick={() => setThreadExtra((prev) => prev.filter((_, i) => i !== idx))}
                className="p-2 text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

        {/* Poll builder for ZX */}
        {mode === 'zx' && showPoll && (
          <div className="p-3.5 rounded-2xl border border-[#792BFF]/40 bg-[#792BFF]/5 space-y-2">
            {pollOptions.map((opt, idx) => (
              <input
                key={idx}
                type="text"
                value={opt}
                onChange={(e) =>
                  setPollOptions((prev) => prev.map((o, i) => (i === idx ? e.target.value : o)))
                }
                placeholder={`${lang === 'hi' ? 'विकल्प' : 'Option'} ${idx + 1}`}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
              />
            ))}
            {pollOptions.length < 4 && (
              <button
                type="button"
                onClick={() => setPollOptions((prev) => [...prev, ''])}
                className="text-xs text-[#792BFF] dark:text-[#FF28B9] font-medium"
              >
                + {lang === 'hi' ? 'विकल्प जोड़ें' : 'Add option'}
              </button>
            )}
          </div>
        )}

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-black/10 dark:border-white/10">
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-medium cursor-pointer">
                  <ImagePlus className="w-4 h-4 text-[#792BFF]" />
                  <span>{lang === 'hi' ? 'मीडिया जोड़ें' : 'Add Media'}</span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setVideoStudioOpen(true)}
                  className="px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-medium flex items-center gap-1.5"
                >
                  <Wand2 className="w-4 h-4 text-[#FF28B9]" />
                  <span>{lang === 'hi' ? 'वीडियो एडिटर' : 'Video Studio'}</span>
                </button>

                <button
                  type="button"
                  onClick={toggleDictation}
                  className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 ${
                    dictating
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
                  }`}
                >
                  {dictating ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4 text-[#792BFF]" />}
                  <span>{dictating ? (lang === 'hi' ? 'रोकें' : 'Stop') : lang === 'hi' ? 'बोलें' : 'Voice'}</span>
                </button>

                {mode === 'zx' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowPoll(!showPoll)}
                      className="px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-xs font-medium flex items-center gap-1"
                    >
                      <BarChart2 className="w-4 h-4 text-[#792BFF]" />
                      {lang === 'hi' ? 'पोल' : 'Poll'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setThreadExtra((prev) => [...prev, ''])}
                      className="px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-xs font-medium flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4 text-[#FF28B9]" />
                      {lang === 'hi' ? 'थ्रेड' : 'Thread'}
                    </button>
                  </>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || uploading}
                className="px-5 py-2.5 rounded-xl zx-gradient-bg text-white text-xs font-semibold hover:opacity-95 disabled:opacity-50"
              >
                {submitting ? '...' : lang === 'hi' ? 'प्रकाशित करें' : 'Publish'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
