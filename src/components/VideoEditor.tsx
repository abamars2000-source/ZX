import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Film,
  Gauge,
  Pause,
  Play,
  Plus,
  Scissors,
  Sparkles,
  Sticker,
  Trash2,
  Type,
  Upload,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest, uploadMediaFile } from '../lib/api';
import { getFilterCss, MEDIA_FILTERS, STORY_STICKERS } from '../lib/mediaFilters';
import type { StoryTextOverlay, VideoEditMeta } from '../types';

function formatSecs(s: number) {
  if (!Number.isFinite(s) || s < 0) return '0:00.0';
  const mins = Math.floor(s / 60);
  const rem = (s % 60).toFixed(1).padStart(4, '0');
  return `${mins}:${rem}`;
}

export function VideoEditor({
  mode,
  onCancel,
  onPublished,
}: {
  mode: 'short' | 'home' | 'zx';
  onCancel: () => void;
  onPublished: () => void;
}) {
  const { lang, toast, triggerFeedRefresh } = useApp();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(true);

  // Edit controls
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [activeFilter, setActiveFilter] = useState('none');
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [aspect, setAspect] = useState<'9:16' | '16:9' | '1:1'>(mode === 'short' ? '9:16' : '16:9');
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');

  // Text & Sticker Overlays
  const [overlays, setOverlays] = useState<StoryTextOverlay[]>([]);
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [toolTab, setToolTab] = useState<'trim' | 'filter' | 'text' | 'audio'>('trim');

  // Caption & Upload state
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const filterCss = getFilterCss(activeFilter);
  const activeOverlay = overlays.find((o) => o.id === activeOverlayId) || null;

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.playbackRate = speed;
    vid.muted = muted;
    vid.volume = volume;
  }, [speed, muted, volume, videoUrl]);

  const handleVideoPick = (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast(lang === 'hi' ? 'कृपया एक वैध वीडियो फ़ाइल चुनें।' : 'Please choose a valid video file.', 'error');
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(url);
    setTrimStart(0);
    setTrimEnd(0);
    setCoverPreviewUrl('');
    setPlaying(true);
  };

  const handleLoadedMetadata = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const d = Number.isFinite(vid.duration) ? vid.duration : 15;
    setDuration(d);
    setTrimStart(0);
    setTrimEnd(d);
    vid.playbackRate = speed;
  };

  const handleTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const t = vid.currentTime;
    setCurrentTime(t);
    if (trimEnd > 0.2 && t >= trimEnd) {
      vid.currentTime = trimStart;
    } else if (t < trimStart - 0.1) {
      vid.currentTime = trimStart;
    }
  };

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      if (vid.currentTime >= trimEnd || vid.currentTime < trimStart) {
        vid.currentTime = trimStart;
      }
      vid.play();
      setPlaying(true);
    } else {
      vid.pause();
      setPlaying(false);
    }
  };

  const captureCoverFrame = () => {
    const vid = videoRef.current;
    if (!vid || !vid.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = vid.videoWidth;
    canvas.height = vid.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.filter = filterCss;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    setCoverPreviewUrl(canvas.toDataURL('image/webp', 0.85));
    toast(lang === 'hi' ? 'कवर फ़्रेम कैप्चर हो गया!' : 'Cover frame captured!', 'success');
  };

  const addOverlay = (textOverride?: string, kind: 'text' | 'sticker' = 'text') => {
    const next: StoryTextOverlay = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: textOverride ?? (lang === 'hi' ? 'वीडियो कैप्शन...' : 'Video caption...'),
      x: 50,
      y: Math.min(82, 24 + (overlays.length % 5) * 14),
      fontSize: kind === 'sticker' ? 20 : 24,
      color: '#FFFFFF',
      fontFamily: 'display',
      backdrop: kind === 'sticker' ? 'gradient' : 'frosted',
      align: 'center',
      rotation: 0,
      scale: 1,
      kind,
    };
    setOverlays((prev) => [...prev, next]);
    setActiveOverlayId(next.id);
  };

  const updateActiveOverlay = (patch: Partial<StoryTextOverlay>) => {
    if (!activeOverlayId) return;
    setOverlays((prev) => prev.map((o) => (o.id === activeOverlayId ? { ...o, ...patch } : o)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    e.stopPropagation();
    setActiveOverlayId(id);
    setDraggingId(id);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (draggingId !== id || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const xPct = Math.max(8, Math.min(92, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(8, Math.min(92, ((e.clientY - rect.top) / rect.height) * 100));
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, x: xPct, y: yPct } : o)));
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) {
      toast(lang === 'hi' ? 'पहले एक वीडियो चुनें।' : 'Please select a video first.', 'error');
      return;
    }
    setSubmitting(true);
    setProgress(0);
    try {
      const bucket = mode === 'short' ? 'shorts' : 'videos';
      const uploaded = await uploadMediaFile(bucket, videoFile, setProgress);
      const videoMeta: VideoEditMeta = {
        trimStart: Number(trimStart.toFixed(2)),
        trimEnd: Number((trimEnd || duration).toFixed(2)),
        speed,
        filter: activeFilter,
        muted,
        volume,
        aspect,
        overlays: overlays.filter((o) => o.text.trim().length > 0),
      };

      await apiRequest('/posts', {
        method: 'POST',
        body: JSON.stringify({
          postType: mode,
          content: caption,
          media: [uploaded],
          videoMeta,
        }),
      });
      toast(lang === 'hi' ? 'संपादित वीडियो प्रकाशित हो गया!' : 'Edited video published!', 'success');
      triggerFeedRefresh();
      onPublished();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
      setProgress(0);
    }
  };

  const aspectClass =
    aspect === '9:16'
      ? 'max-w-[270px] aspect-[9/16]'
      : aspect === '1:1'
        ? 'max-w-[320px] aspect-square'
        : 'max-w-[380px] aspect-video';

  return (
    <form onSubmit={handlePublish} className="space-y-4">
      {!videoUrl ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleVideoPick(f);
          }}
          className="rounded-3xl border-2 border-dashed border-[#792BFF]/40 bg-black/[0.02] dark:bg-white/[0.02] p-10 text-center flex flex-col items-center gap-3"
        >
          <div className="w-14 h-14 rounded-2xl zx-gradient-bg text-white flex items-center justify-center shadow-lg">
            <Film className="w-7 h-7" />
          </div>
          <h3 className="font-display text-lg font-bold">
            {lang === 'hi' ? 'ZX वीडियो एडिटिंग स्टूडियो' : 'ZX Video Editing Studio'}
          </h3>
          <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8] max-w-sm">
            {lang === 'hi'
              ? 'अपना वीडियो ट्रिम करें, स्पीड बदलें, कलर फ़िल्टर लगाएं, टेक्स्ट/स्टिकर जोड़ें और सीधे प्रकाशित करें।'
              : 'Trim clips, adjust playback speed, apply color filters, add captions & stickers, and publish directly.'}
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 px-5 py-2.5 rounded-xl zx-gradient-bg text-white text-xs font-semibold flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            <span>{lang === 'hi' ? 'वीडियो चुनें (MP4 / WebM)' : 'Choose Video (MP4 / WebM)'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleVideoPick(f);
            }}
            className="hidden"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          {/* Left: Interactive Video Stage */}
          <div className="md:col-span-5 flex flex-col items-center gap-3">
            <div
              ref={stageRef}
              onClick={() => setActiveOverlayId(null)}
              className={`relative w-full ${aspectClass} rounded-3xl overflow-hidden bg-black shadow-xl ring-1 ring-white/15 select-none`}
            >
              <video
                ref={videoRef}
                src={videoUrl}
                autoPlay
                playsInline
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                style={{ filter: filterCss }}
                className="w-full h-full object-cover cursor-pointer"
              />

              {!playing && (
                <button
                  type="button"
                  onClick={togglePlay}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-black/30"
                >
                  <div className="w-12 h-12 rounded-full bg-black/60 text-white flex items-center justify-center">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                </button>
              )}

              {/* Overlays */}
              {overlays.map((overlay) => {
                const isSelected = overlay.id === activeOverlayId;
                const backdropClass =
                  overlay.backdrop === 'frosted'
                    ? 'bg-[#080810]/65 backdrop-blur-md px-3 py-1.5 rounded-xl'
                    : overlay.backdrop === 'solid'
                      ? 'bg-[#080810] px-3 py-1.5 rounded-xl'
                      : overlay.backdrop === 'gradient'
                        ? 'zx-gradient-bg px-3 py-1.5 rounded-xl'
                        : 'px-1.5 py-0.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]';

                return (
                  <div
                    key={overlay.id}
                    onPointerDown={(e) => handlePointerDown(e, overlay.id)}
                    onPointerMove={(e) => handlePointerMove(e, overlay.id)}
                    onPointerUp={() => setDraggingId(null)}
                    style={{
                      left: `${overlay.x}%`,
                      top: `${overlay.y}%`,
                      transform: `translate(-50%, -50%) rotate(${overlay.rotation ?? 0}deg)`,
                      color: overlay.color,
                      fontSize: `${Math.round(overlay.fontSize * 0.8)}px`,
                      touchAction: 'none',
                    }}
                    className={`absolute z-20 max-w-[85%] cursor-grab active:cursor-grabbing font-bold leading-snug whitespace-pre-wrap break-words ${backdropClass} ${
                      isSelected ? 'ring-2 ring-white' : ''
                    }`}
                  >
                    {overlay.text}
                  </div>
                );
              })}

              {/* Timecode badge */}
              <div className="pointer-events-none absolute top-2.5 left-2.5 z-20 px-2.5 py-1 rounded-lg bg-black/60 text-[10px] font-mono-tabular text-white">
                {formatSecs(currentTime)} / {formatSecs(trimEnd || duration)} · {speed}x
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 text-xs font-semibold flex items-center gap-1"
              >
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {playing ? (lang === 'hi' ? 'रोकें' : 'Pause') : lang === 'hi' ? 'चलाएं' : 'Play'}
              </button>
              <button
                type="button"
                onClick={captureCoverFrame}
                className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 text-xs font-semibold flex items-center gap-1"
              >
                <Camera className="w-3.5 h-3.5 text-[#FF28B9]" />
                {lang === 'hi' ? 'कवर फ़्रेम' : 'Cover'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 text-xs font-semibold"
              >
                {lang === 'hi' ? 'बदलें' : 'Replace'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleVideoPick(f);
                }}
                className="hidden"
              />
            </div>

            {coverPreviewUrl && (
              <div className="flex items-center gap-2 text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8]">
                <img src={coverPreviewUrl} alt="Cover snapshot" className="w-10 h-10 rounded-lg object-cover border border-white/20" />
                <span>{lang === 'hi' ? 'कवर थंबनेल तैयार' : 'Cover snapshot ready'}</span>
              </div>
            )}
          </div>

          {/* Right: Video Editing Controls */}
          <div className="md:col-span-7 space-y-3.5">
            {/* Tool Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl">
              {[
                { id: 'trim' as const, icon: Scissors, label: lang === 'hi' ? 'ट्रिम & स्पीड' : 'Trim & Speed' },
                { id: 'filter' as const, icon: Wand2, label: lang === 'hi' ? 'फ़िल्टर' : 'Filters' },
                { id: 'text' as const, icon: Type, label: lang === 'hi' ? 'कैप्शन' : 'Overlays' },
                { id: 'audio' as const, icon: Volume2, label: lang === 'hi' ? 'ऑडियो' : 'Audio & Ratio' },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = toolTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setToolTab(tab.id)}
                    className={`py-2 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors ${
                      active ? 'zx-gradient-bg text-white' : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {toolTab === 'trim' && (
              <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 space-y-3.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Scissors className="w-4 h-4 text-[#792BFF]" />
                    {lang === 'hi' ? 'क्लिप ट्रिम रेंज' : 'Clip Trim Range'}
                  </span>
                  <span className="font-mono-tabular text-[11px] text-[#FF28B9]">
                    {formatSecs(trimStart)} – {formatSecs(trimEnd || duration)}
                  </span>
                </div>

                <div className="space-y-2 text-[11px]">
                  <label className="flex items-center gap-3">
                    <span className="w-12 text-[#5A5B6E] dark:text-[#A2A3B8]">{lang === 'hi' ? 'शुरू' : 'Start'}</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0.5, (trimEnd || duration) - 0.5)}
                      step={0.1}
                      value={trimStart}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTrimStart(v);
                        if (videoRef.current) videoRef.current.currentTime = v;
                      }}
                      className="flex-1 accent-[#792BFF]"
                    />
                    <span className="font-mono-tabular w-12 text-right">{formatSecs(trimStart)}</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <span className="w-12 text-[#5A5B6E] dark:text-[#A2A3B8]">{lang === 'hi' ? 'अंत' : 'End'}</span>
                    <input
                      type="range"
                      min={Math.min(duration, trimStart + 0.5)}
                      max={Math.max(1, duration)}
                      step={0.1}
                      value={trimEnd || duration}
                      onChange={(e) => setTrimEnd(Number(e.target.value))}
                      className="flex-1 accent-[#FF28B9]"
                    />
                    <span className="font-mono-tabular w-12 text-right">{formatSecs(trimEnd || duration)}</span>
                  </label>
                </div>

                <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-2">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-[#FF28B9]" />
                    {lang === 'hi' ? 'प्लेबैक स्पीड' : 'Playback Speed'}
                  </span>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[0.5, 1, 1.25, 1.5, 2].map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => setSpeed(sp)}
                        className={`py-2 rounded-xl text-xs font-mono-tabular font-semibold border ${
                          speed === sp
                            ? 'zx-gradient-bg text-white border-transparent'
                            : 'border-black/10 dark:border-white/10 text-[#5A5B6E] dark:text-[#A2A3B8]'
                        }`}
                      >
                        {sp}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {toolTab === 'filter' && (
              <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 space-y-3">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Wand2 className="w-4 h-4 text-[#792BFF]" />
                  {lang === 'hi' ? 'कलर ग्रेडिंग फ़िल्टर' : 'Color Grading Filters'}
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {MEDIA_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setActiveFilter(f.id)}
                      className={`py-2.5 px-2 rounded-xl text-xs font-medium border ${
                        activeFilter === f.id
                          ? 'border-[#FF28B9] bg-[#FF28B9]/15 text-[#FF28B9] dark:text-white font-semibold'
                          : 'border-black/10 dark:border-white/10 text-[#5A5B6E] dark:text-[#A2A3B8]'
                      }`}
                    >
                      {lang === 'hi' ? f.labelHi : f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {toolTab === 'text' && (
              <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[11px] font-semibold flex items-center gap-1 mr-1 text-[#5A5B6E] dark:text-[#A2A3B8]">
                    <Sticker className="w-3.5 h-3.5 text-[#FF28B9]" />
                  </span>
                  {STORY_STICKERS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => addOverlay(st, 'sticker')}
                      className="px-2 py-1 rounded-lg bg-white dark:bg-[#080810] border border-black/10 dark:border-white/10 text-[11px]"
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
                  <span className="text-xs font-semibold">
                    {lang === 'hi' ? 'वीडियो ओवरले' : 'Video Overlays'} ({overlays.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => addOverlay()}
                    className="px-2.5 py-1 rounded-lg zx-gradient-bg text-white text-[11px] font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {lang === 'hi' ? 'टेक्स्ट जोड़ें' : 'Add Text'}
                  </button>
                </div>

                {activeOverlay && (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={activeOverlay.text}
                      onChange={(e) => updateActiveOverlay({ text: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1">
                        {(['none', 'frosted', 'solid', 'gradient'] as const).map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => updateActiveOverlay({ backdrop: b })}
                            className={`px-2 py-1 rounded-lg text-[10px] capitalize border ${
                              activeOverlay.backdrop === b ? 'border-[#792BFF] bg-[#792BFF]/15' : 'border-black/10 dark:border-white/10'
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setOverlays((prev) => prev.filter((o) => o.id !== activeOverlay.id));
                          setActiveOverlayId(null);
                        }}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {toolTab === 'audio' && (
              <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    {muted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-[#792BFF]" />}
                    {lang === 'hi' ? 'वीडियो ऑडियो' : 'Original Video Audio'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMuted(!muted)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                      muted ? 'bg-red-500/15 text-red-500' : 'bg-[#792BFF]/15 text-[#792BFF] dark:text-white'
                    }`}
                  >
                    {muted ? (lang === 'hi' ? 'म्यूट है' : 'Muted') : lang === 'hi' ? 'ऑन है' : 'Active'}
                  </button>
                </div>

                {!muted && (
                  <div className="flex items-center gap-3 text-[11px]">
                    <span>{lang === 'hi' ? 'वॉल्यूम' : 'Volume'}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                      className="flex-1 accent-[#792BFF]"
                    />
                    <span className="font-mono-tabular w-10 text-right">{Math.round(volume * 100)}%</span>
                  </div>
                )}

                <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-2">
                  <span className="text-xs font-semibold">{lang === 'hi' ? 'फ़्रेम अनुपात' : 'Aspect Ratio'}</span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['9:16', '16:9', '1:1'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setAspect(r)}
                        className={`py-2 rounded-xl text-xs font-mono-tabular font-semibold border ${
                          aspect === r
                            ? 'zx-gradient-bg text-white border-transparent'
                            : 'border-black/10 dark:border-white/10 text-[#5A5B6E] dark:text-[#A2A3B8]'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Caption */}
            <textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={
                lang === 'hi'
                  ? 'वीडियो का कैप्शन और #हैशटैग लिखें...'
                  : 'Write video caption & #hashtags...'
              }
              className="w-full p-3 rounded-2xl bg-black/5 dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs focus:outline-none focus:ring-2 focus:ring-[#792BFF]"
            />

            {submitting && progress > 0 && (
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div style={{ width: `${progress}%` }} className="h-full zx-gradient-bg transition-all" />
                </div>
                <p className="text-[11px] font-mono-tabular text-[#5A5B6E] dark:text-[#A2A3B8]">{progress}%</p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 rounded-xl bg-black/5 dark:bg-white/10 text-xs font-semibold"
              >
                {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl zx-gradient-bg text-white text-xs font-semibold flex items-center gap-1.5 hover:opacity-95 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{submitting ? '...' : lang === 'hi' ? 'वीडियो प्रकाशित करें' : 'Publish Video'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
