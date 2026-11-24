import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Brush,
  Eraser,
  ImagePlus,
  Maximize2,
  Minimize2,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  Sticker,
  Trash2,
  Type,
  Wand2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiRequest, uploadMediaFile } from '../lib/api';
import { getFilterCss, MEDIA_FILTERS, STORY_STICKERS } from '../lib/mediaFilters';
import type { StoryTextOverlay } from '../types';

interface GradientPreset {
  id: string;
  label: string;
  from: string;
  to: string;
  angle: number;
  css: string;
}

interface DrawStroke {
  color: string;
  width: number;
  points: Array<{ x: number; y: number }>; // normalized 0..1
}

const GRADIENT_PRESETS: GradientPreset[] = [
  { id: 'zx-pulse', label: 'ZX Pulse', from: '#792BFF', to: '#FF28B9', angle: 135, css: 'linear-gradient(135deg, #792BFF 0%, #FF28B9 100%)' },
  { id: 'midnight-violet', label: 'Midnight', from: '#080810', to: '#792BFF', angle: 155, css: 'linear-gradient(155deg, #080810 0%, #792BFF 100%)' },
  { id: 'neon-obsidian', label: 'Obsidian', from: '#101020', to: '#FF28B9', angle: 135, css: 'linear-gradient(135deg, #101020 0%, #FF28B9 100%)' },
  { id: 'bharat-sunset', label: 'Sunset', from: '#F97316', to: '#DB2777', angle: 135, css: 'linear-gradient(135deg, #F97316 0%, #DB2777 100%)' },
  { id: 'monsoon-emerald', label: 'Monsoon', from: '#0F766E', to: '#3B82F6', angle: 135, css: 'linear-gradient(135deg, #0F766E 0%, #3B82F6 100%)' },
  { id: 'royal-indigo', label: 'Indigo', from: '#1E1B4B', to: '#4F46E5', angle: 180, css: 'linear-gradient(180deg, #1E1B4B 0%, #4F46E5 100%)' },
  { id: 'silver-slate', label: 'Silver', from: '#334155', to: '#0F172A', angle: 135, css: 'linear-gradient(135deg, #334155 0%, #0F172A 100%)' },
  { id: 'cyber-cyan', label: 'Cyber', from: '#06B6D4', to: '#792BFF', angle: 135, css: 'linear-gradient(135deg, #06B6D4 0%, #792BFF 100%)' },
];

const TEXT_COLORS = ['#FFFFFF', '#080810', '#E8E8F2', '#792BFF', '#FF28B9', '#FACC15', '#22D3EE'];

function createDefaultOverlay(lang: 'hi' | 'en', yOffset = 50, textOverride?: string, kind: 'text' | 'sticker' = 'text'): StoryTextOverlay {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: textOverride ?? (lang === 'hi' ? 'अपनी स्टोरी लिखें...' : 'Tap to edit text...'),
    x: 50,
    y: yOffset,
    fontSize: kind === 'sticker' ? 24 : 28,
    color: '#FFFFFF',
    fontFamily: 'display',
    backdrop: kind === 'sticker' ? 'gradient' : 'frosted',
    align: 'center',
    rotation: 0,
    scale: 1,
    kind,
  };
}

export function StoryEditor({
  onCancel,
  onPublished,
}: {
  onCancel: () => void;
  onPublished: () => void;
}) {
  const { lang, toast, triggerFeedRefresh } = useApp();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [toolTab, setToolTab] = useState<'media' | 'text' | 'draw' | 'bg'>('media');

  // Gradient state
  const [gradFrom, setGradFrom] = useState('#792BFF');
  const [gradTo, setGradTo] = useState('#FF28B9');
  const [gradAngle, setGradAngle] = useState(135);

  // Media + Filter state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [mediaKind, setMediaKind] = useState<'none' | 'image' | 'video'>('none');
  const [imageFit, setImageFit] = useState<'cover' | 'contain'>('cover');
  const [imageScale, setImageScale] = useState(1);
  const [activeFilter, setActiveFilter] = useState('none');

  // Overlays (text + stickers)
  const [overlays, setOverlays] = useState<StoryTextOverlay[]>([createDefaultOverlay(lang, 50)]);
  const [activeOverlayId, setActiveOverlayId] = useState<string | null>(overlays[0].id);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [snapGuide, setSnapGuide] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [isDragOverFile, setIsDragOverFile] = useState(false);

  // Freehand Neon Brush Drawing
  const [brushMode, setBrushMode] = useState(false);
  const [brushColor, setBrushColor] = useState('#FF28B9');
  const [brushWidth, setBrushWidth] = useState(8);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [drawingStroke, setDrawingStroke] = useState<DrawStroke | null>(null);

  // Upload & publish state
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const backgroundStyle = `linear-gradient(${gradAngle}deg, ${gradFrom} 0%, ${gradTo} 100%)`;
  const activeOverlay = overlays.find((o) => o.id === activeOverlayId) || null;
  const filterCss = getFilterCss(activeFilter);

  // Redraw preview brush canvas whenever strokes change
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const all = drawingStroke ? [...strokes, drawingStroke] : strokes;
    for (const st of all) {
      if (st.points.length < 2) continue;
      ctx.save();
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = st.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(st.points[0].x * W, st.points[0].y * H);
      for (let i = 1; i < st.points.length; i++) {
        ctx.lineTo(st.points[i].x * W, st.points[i].y * H);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [strokes, drawingStroke]);

  const applyPreset = (preset: GradientPreset) => {
    setGradFrom(preset.from);
    setGradTo(preset.to);
    setGradAngle(preset.angle);
  };

  const handleMediaFile = (file: File) => {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast(lang === 'hi' ? 'केवल फ़ोटो या वीडियो चुनें।' : 'Please choose an image or video file.', 'error');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(url);
    setMediaKind(file.type.startsWith('video/') ? 'video' : 'image');
    setImageScale(1);
    setImageFit('cover');
  };

  const clearMedia = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl('');
    setMediaKind('none');
    setImageScale(1);
    setActiveFilter('none');
  };

  const addOverlay = (textOverride?: string, kind: 'text' | 'sticker' = 'text') => {
    const next = createDefaultOverlay(lang, Math.min(82, 26 + (overlays.length % 5) * 13), textOverride, kind);
    setOverlays((prev) => [...prev, next]);
    setActiveOverlayId(next.id);
    setBrushMode(false);
  };

  const updateActiveOverlay = (patch: Partial<StoryTextOverlay>) => {
    if (!activeOverlayId) return;
    setOverlays((prev) => prev.map((o) => (o.id === activeOverlayId ? { ...o, ...patch } : o)));
  };

  const removeOverlay = (id: string) => {
    setOverlays((prev) => {
      const next = prev.filter((o) => o.id !== id);
      if (activeOverlayId === id) {
        setActiveOverlayId(next[0]?.id || null);
      }
      return next;
    });
  };

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!brushMode || !stageRef.current) {
      setActiveOverlayId(null);
      return;
    }
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawingStroke({ color: brushColor, width: brushWidth, points: [{ x, y }] });
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!brushMode || !drawingStroke || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDrawingStroke((prev) => (prev ? { ...prev, points: [...prev.points, { x, y }] } : null));
  };

  const handleStagePointerUp = () => {
    if (drawingStroke && drawingStroke.points.length > 1) {
      setStrokes((prev) => [...prev, drawingStroke]);
    }
    setDrawingStroke(null);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (brushMode) return;
    e.stopPropagation();
    setActiveOverlayId(id);
    setDraggingId(id);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (draggingId !== id || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    let xPct = ((e.clientX - rect.left) / rect.width) * 100;
    let yPct = ((e.clientY - rect.top) / rect.height) * 100;

    xPct = Math.max(8, Math.min(92, xPct));
    yPct = Math.max(8, Math.min(92, yPct));

    const snapX = Math.abs(xPct - 50) < 2.8;
    const snapY = Math.abs(yPct - 50) < 2.8;
    if (snapX) xPct = 50;
    if (snapY) yPct = 50;

    setSnapGuide({ x: snapX, y: snapY });
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, x: xPct, y: yPct } : o)));
  };

  const handlePointerUp = () => {
    setDraggingId(null);
    setSnapGuide({ x: false, y: false });
  };

  // Render gradient + filtered image + neon brush strokes + rotated/scaled overlays to 1080x1920 WebP
  const compositeStoryImageToFile = async (): Promise<File> => {
    const W = 1080;
    const H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    // 1. Background gradient
    const rad = ((gradAngle - 90) * Math.PI) / 180;
    const cx = W / 2;
    const cy = H / 2;
    const len = Math.sqrt(W * W + H * H) / 2;
    const grad = ctx.createLinearGradient(
      cx - Math.cos(rad) * len,
      cy - Math.sin(rad) * len,
      cx + Math.cos(rad) * len,
      cy + Math.sin(rad) * len
    );
    grad.addColorStop(0, gradFrom);
    grad.addColorStop(1, gradTo);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // 2. Selected image with active filter
    if (previewUrl && mediaKind === 'image') {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = previewUrl;
      });
      const baseScale =
        imageFit === 'cover'
          ? Math.max(W / img.width, H / img.height)
          : Math.min(W / img.width, H / img.height);
      const finalScale = baseScale * imageScale;
      const drawW = img.width * finalScale;
      const drawH = img.height * finalScale;
      const dx = (W - drawW) / 2;
      const dy = (H - drawH) / 2;
      ctx.save();
      ctx.filter = filterCss;
      ctx.drawImage(img, dx, dy, drawW, drawH);
      ctx.restore();
    }

    // 3. Freehand Neon Brush Strokes
    const brushScale = W / 300;
    for (const st of strokes) {
      if (st.points.length < 2) continue;
      ctx.save();
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width * brushScale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = st.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(st.points[0].x * W, st.points[0].y * H);
      for (let i = 1; i < st.points.length; i++) {
        ctx.lineTo(st.points[i].x * W, st.points[i].y * H);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 4. Text & Sticker Overlays with scale & rotation
    const scaleFactor = W / 360;
    for (const overlay of overlays) {
      const cleanText = overlay.text.trim();
      if (!cleanText) continue;

      const userScale = overlay.scale ?? 1;
      const userRot = ((overlay.rotation ?? 0) * Math.PI) / 180;
      const fontSizePx = Math.round(overlay.fontSize * scaleFactor);
      const fontStack =
        overlay.fontFamily === 'mono'
          ? '"JetBrains Mono", monospace'
          : overlay.fontFamily === 'sans'
            ? '"Plus Jakarta Sans", "Noto Sans Devanagari", sans-serif'
            : '"Outfit", "Noto Sans Devanagari", sans-serif';
      ctx.font = `700 ${fontSizePx}px ${fontStack}`;
      ctx.textBaseline = 'middle';

      const lines = cleanText.split('\n');
      const lineHeight = fontSizePx * 1.25;
      const maxWidth = W * 0.84;

      const wrapped: string[] = [];
      for (const rawLine of lines) {
        const words = rawLine.split(' ');
        let curr = '';
        for (const w of words) {
          const test = curr ? `${curr} ${w}` : w;
          if (ctx.measureText(test).width > maxWidth && curr) {
            wrapped.push(curr);
            curr = w;
          } else {
            curr = test;
          }
        }
        if (curr) wrapped.push(curr);
      }

      const textBlockW = Math.min(maxWidth, Math.max(...wrapped.map((l) => ctx.measureText(l).width), 40));
      const textBlockH = wrapped.length * lineHeight;
      const centerX = (overlay.x / 100) * W;
      const centerY = (overlay.y / 100) * H;
      const padX = 28 * (scaleFactor / 3);
      const padY = 18 * (scaleFactor / 3);

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(userRot);
      ctx.scale(userScale, userScale);

      if (overlay.backdrop !== 'none') {
        const bx = -textBlockW / 2 - padX;
        const by = -textBlockH / 2 - padY;
        const bw = textBlockW + padX * 2;
        const bh = textBlockH + padY * 2;

        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 24);
        if (overlay.backdrop === 'frosted') {
          ctx.fillStyle = 'rgba(8, 8, 16, 0.58)';
        } else if (overlay.backdrop === 'solid') {
          ctx.fillStyle = overlay.color === '#080810' ? '#FFFFFF' : '#080810';
        } else {
          const pillGrad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
          pillGrad.addColorStop(0, '#792BFF');
          pillGrad.addColorStop(1, '#FF28B9');
          ctx.fillStyle = pillGrad;
        }
        ctx.fill();
      }

      ctx.fillStyle = overlay.color;
      ctx.textAlign = overlay.align;
      if (overlay.backdrop === 'none') {
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 16;
      } else {
        ctx.shadowBlur = 0;
      }

      const startY = -((wrapped.length - 1) * lineHeight) / 2;
      const textX =
        overlay.align === 'left' ? -textBlockW / 2 : overlay.align === 'right' ? textBlockW / 2 : 0;

      wrapped.forEach((line, idx) => {
        ctx.fillText(line, textX, startY + idx * lineHeight);
      });
      ctx.restore();
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to render story canvas'))), 'image/webp', 0.9);
    });
    return new File([blob], `zx-story-${Date.now()}.webp`, { type: 'image/webp' });
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    const nonEmptyOverlays = overlays.filter((o) => o.text.trim().length > 0);
    if (mediaKind === 'none' && nonEmptyOverlays.length === 0 && strokes.length === 0) {
      toast(
        lang === 'hi' ? 'कृपया टेक्स्ट जोड़ें, ब्रश से बनाएं या फ़ोटो/वीडियो चुनें।' : 'Please add text, drawing, or media.',
        'error'
      );
      return;
    }

    setSubmitting(true);
    setProgress(0);
    try {
      const joinedText = nonEmptyOverlays.map((o) => o.text.trim()).join(' · ').slice(0, 500);

      if (mediaKind === 'video' && selectedFile) {
        const uploaded = await uploadMediaFile('stories', selectedFile, setProgress);
        await apiRequest('/stories', {
          method: 'POST',
          body: JSON.stringify({
            storyType: 'video',
            mediaUrl: uploaded.url,
            storagePath: uploaded.storagePath,
            textContent: joinedText,
            backgroundStyle,
            overlayData: { overlays: nonEmptyOverlays, filter: activeFilter },
          }),
        });
      } else {
        const compositedFile = await compositeStoryImageToFile();
        const uploaded = await uploadMediaFile('stories', compositedFile, setProgress);
        await apiRequest('/stories', {
          method: 'POST',
          body: JSON.stringify({
            storyType: 'image',
            mediaUrl: uploaded.url,
            storagePath: uploaded.storagePath,
            textContent: joinedText,
            backgroundStyle,
            overlayData: { overlays: nonEmptyOverlays, filter: activeFilter },
          }),
        });
      }

      toast(lang === 'hi' ? 'स्टोरी प्रकाशित हो गई!' : 'Story published!', 'success');
      triggerFeedRefresh();
      onPublished();
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
      setProgress(0);
    }
  };

  return (
    <form onSubmit={handlePublish} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* Left: Interactive 9:16 Stage Preview */}
        <div className="md:col-span-5 flex flex-col items-center">
          <div
            ref={stageRef}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOverFile(true);
            }}
            onDragLeave={() => setIsDragOverFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOverFile(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleMediaFile(f);
            }}
            style={{ background: backgroundStyle, touchAction: brushMode ? 'none' : 'auto' }}
            className={`relative w-full max-w-[300px] aspect-[9/16] rounded-3xl overflow-hidden shadow-xl ring-1 transition-all select-none ${
              brushMode ? 'cursor-crosshair ring-2 ring-[#FF28B9]' : isDragOverFile ? 'ring-2 ring-[#792BFF] scale-[1.01]' : 'ring-white/15'
            }`}
          >
            {/* Background Selected Media */}
            {mediaKind === 'image' && previewUrl && (
              <img
                src={previewUrl}
                alt="Story background"
                style={{ transform: `scale(${imageScale})`, filter: filterCss }}
                className={`absolute inset-0 w-full h-full pointer-events-none transition-transform duration-150 ${
                  imageFit === 'cover' ? 'object-cover' : 'object-contain'
                }`}
              />
            )}

            {mediaKind === 'video' && previewUrl && (
              <video
                src={previewUrl}
                autoPlay
                loop
                muted
                playsInline
                style={{ filter: filterCss }}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />
            )}

            {/* Live Neon Brush Canvas Layer */}
            <canvas
              ref={drawCanvasRef}
              width={300}
              height={533}
              className="pointer-events-none absolute inset-0 w-full h-full z-10"
            />

            {/* Center alignment snap guides */}
            {snapGuide.x && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-white/70 z-10" />}
            {snapGuide.y && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/70 z-10" />}

            {/* Draggable Text & Sticker Overlays */}
            {overlays.map((overlay) => {
              const isSelected = !brushMode && overlay.id === activeOverlayId;
              const fontClass =
                overlay.fontFamily === 'mono'
                  ? 'font-mono-tabular'
                  : overlay.fontFamily === 'sans'
                    ? 'font-sans'
                    : 'font-display';

              const backdropClass =
                overlay.backdrop === 'frosted'
                  ? 'bg-[#080810]/60 backdrop-blur-md px-3.5 py-2 rounded-2xl'
                  : overlay.backdrop === 'solid'
                    ? `${overlay.color === '#080810' ? 'bg-white' : 'bg-[#080810]'} px-3.5 py-2 rounded-2xl`
                    : overlay.backdrop === 'gradient'
                      ? 'zx-gradient-bg px-3.5 py-2 rounded-2xl'
                      : 'px-2 py-1 drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]';

              return (
                <div
                  key={overlay.id}
                  onPointerDown={(e) => handlePointerDown(e, overlay.id)}
                  onPointerMove={(e) => handlePointerMove(e, overlay.id)}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  style={{
                    left: `${overlay.x}%`,
                    top: `${overlay.y}%`,
                    transform: `translate(-50%, -50%) rotate(${overlay.rotation ?? 0}deg) scale(${overlay.scale ?? 1})`,
                    color: overlay.color,
                    fontSize: `${Math.round(overlay.fontSize * 0.85)}px`,
                    textAlign: overlay.align,
                    touchAction: 'none',
                  }}
                  className={`absolute z-20 max-w-[84%] ${brushMode ? 'pointer-events-none opacity-90' : 'cursor-grab active:cursor-grabbing'} font-bold leading-snug whitespace-pre-wrap break-words ${fontClass} ${backdropClass} ${
                    isSelected ? 'ring-2 ring-white/90' : 'hover:ring-1 hover:ring-white/40'
                  }`}
                >
                  {overlay.text || (lang === 'hi' ? 'टेक्स्ट लिखें' : 'Type text')}
                </div>
              );
            })}

            <div className="pointer-events-none absolute bottom-3 inset-x-3 text-center text-[10px] text-white/80 bg-black/40 backdrop-blur-sm rounded-lg py-1 px-2">
              {brushMode
                ? lang === 'hi'
                  ? 'नियॉन ब्रश सक्रिय — कैनवास पर ड्रॉ करें'
                  : 'Neon Brush active — draw anywhere on stage'
                : lang === 'hi'
                  ? 'टेक्स्ट/स्टिकर खींचें · फ़ोटो ड्रॉप करें'
                  : 'Drag text/stickers · Drop photo or video'}
            </div>
          </div>
        </div>

        {/* Right: Tabbed Instagram-Grade Studio Controls */}
        <div className="md:col-span-7 space-y-3.5">
          {/* Studio Tool Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl">
            {[
              { id: 'media' as const, icon: Wand2, label: lang === 'hi' ? 'फ़िल्टर' : 'Media & FX' },
              { id: 'text' as const, icon: Type, label: lang === 'hi' ? 'टेक्स्ट' : 'Text & Tags' },
              { id: 'draw' as const, icon: Brush, label: lang === 'hi' ? 'ब्रश' : 'Draw' },
              { id: 'bg' as const, icon: Palette, label: lang === 'hi' ? 'ग्रेडिएंट' : 'Backdrop' },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = toolTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setToolTab(tab.id);
                    setBrushMode(tab.id === 'draw');
                  }}
                  className={`py-2 px-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    active ? 'zx-gradient-bg text-white' : 'text-[#5A5B6E] dark:text-[#A2A3B8]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {toolTab === 'media' && (
            <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <ImagePlus className="w-4 h-4 text-[#792BFF]" />
                  {lang === 'hi' ? 'फ़ोटो / वीडियो चुनें' : 'Photo / Video'}
                </span>
                {mediaKind !== 'none' && (
                  <button type="button" onClick={clearMedia} className="text-xs text-red-500 hover:underline font-medium">
                    {lang === 'hi' ? 'हटाएं' : 'Remove'}
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs font-semibold hover:border-[#792BFF] transition-colors"
                >
                  {mediaKind === 'none'
                    ? lang === 'hi'
                      ? 'फ़ोटो या वीडियो चुनें'
                      : 'Choose Image / Video'
                    : lang === 'hi'
                      ? 'मीडिया बदलें'
                      : 'Replace Media'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleMediaFile(f);
                  }}
                  className="hidden"
                />

                {mediaKind === 'image' && (
                  <button
                    type="button"
                    onClick={() => setImageFit((f) => (f === 'cover' ? 'contain' : 'cover'))}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs font-medium flex items-center gap-1.5"
                  >
                    {imageFit === 'cover' ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    <span>{imageFit === 'cover' ? 'Fit' : 'Fill'}</span>
                  </button>
                )}
              </div>

              {mediaKind === 'image' && (
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8] shrink-0">
                    {lang === 'hi' ? 'ज़ूम' : 'Zoom'}
                  </span>
                  <input
                    type="range"
                    min={0.75}
                    max={1.6}
                    step={0.05}
                    value={imageScale}
                    onChange={(e) => setImageScale(Number(e.target.value))}
                    className="flex-1 accent-[#792BFF]"
                  />
                  <span className="text-[11px] font-mono-tabular w-10 text-right">{imageScale.toFixed(2)}x</span>
                </div>
              )}

              {/* Filters Grid */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[#5A5B6E] dark:text-[#A2A3B8]">
                  {lang === 'hi' ? 'कलर फ़िल्टर (LUTs)' : 'Color Filters'}
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {MEDIA_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setActiveFilter(f.id)}
                      className={`py-2 px-2 rounded-xl text-[11px] font-medium border transition-colors ${
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
            </div>
          )}

          {toolTab === 'text' && (
            <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 space-y-3">
              {/* Quick Stickers Tray */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold flex items-center gap-1.5 text-[#5A5B6E] dark:text-[#A2A3B8]">
                  <Sticker className="w-3.5 h-3.5 text-[#FF28B9]" />
                  {lang === 'hi' ? 'स्टिकर और टैग जोड़ें' : 'Add Stickers & Badges'}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {STORY_STICKERS.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => addOverlay(st, 'sticker')}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#080810] border border-black/10 dark:border-white/10 text-[11px] font-medium hover:border-[#792BFF]"
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-black/5 dark:border-white/5">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Type className="w-4 h-4 text-[#792BFF]" />
                  {lang === 'hi' ? 'लेयर्स' : 'Layers'} ({overlays.length})
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

              {activeOverlay ? (
                <div className="space-y-2.5">
                  <textarea
                    rows={2}
                    maxLength={240}
                    value={activeOverlay.text}
                    onChange={(e) => updateActiveOverlay({ text: e.target.value })}
                    placeholder={lang === 'hi' ? 'ओवरले टेक्स्ट लिखें...' : 'Enter overlay text...'}
                    className="w-full p-2.5 rounded-xl bg-white dark:bg-[#080810] border border-black/10 dark:border-white/10 text-xs focus:outline-none focus:ring-2 focus:ring-[#792BFF] resize-none"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-lg">
                      {(['display', 'sans', 'mono'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => updateActiveOverlay({ fontFamily: f })}
                          className={`px-2 py-1 rounded text-[11px] font-medium capitalize ${
                            activeOverlay.fontFamily === f ? 'bg-white dark:bg-[#1A1A32] shadow-sm' : ''
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-1 bg-black/5 dark:bg-white/5 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => updateActiveOverlay({ align: 'left' })}
                        className={`p-1 rounded ${activeOverlay.align === 'left' ? 'bg-white dark:bg-[#1A1A32]' : ''}`}
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveOverlay({ align: 'center' })}
                        className={`p-1 rounded ${activeOverlay.align === 'center' ? 'bg-white dark:bg-[#1A1A32]' : ''}`}
                      >
                        <AlignCenter className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveOverlay({ align: 'right' })}
                        className={`p-1 rounded ${activeOverlay.align === 'right' ? 'bg-white dark:bg-[#1A1A32]' : ''}`}
                      >
                        <AlignRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(['none', 'frosted', 'solid', 'gradient'] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => updateActiveOverlay({ backdrop: b })}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium capitalize border ${
                          activeOverlay.backdrop === b
                            ? 'border-[#792BFF] bg-[#792BFF]/15 text-[#792BFF] dark:text-white'
                            : 'border-black/10 dark:border-white/10 text-[#5A5B6E] dark:text-[#A2A3B8]'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8]">
                    <label className="flex items-center gap-2">
                      <span>{lang === 'hi' ? 'आकार' : 'Size'}</span>
                      <input
                        type="range"
                        min={16}
                        max={46}
                        value={activeOverlay.fontSize}
                        onChange={(e) => updateActiveOverlay({ fontSize: Number(e.target.value) })}
                        className="flex-1 accent-[#FF28B9]"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span>{lang === 'hi' ? 'रोटेट' : 'Tilt'}</span>
                      <input
                        type="range"
                        min={-35}
                        max={35}
                        value={activeOverlay.rotation ?? 0}
                        onChange={(e) => updateActiveOverlay({ rotation: Number(e.target.value) })}
                        className="flex-1 accent-[#792BFF]"
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {TEXT_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => updateActiveOverlay({ color: c })}
                          style={{ backgroundColor: c }}
                          className={`w-6 h-6 rounded-full border border-black/20 dark:border-white/25 ${
                            activeOverlay.color === c ? 'ring-2 ring-[#792BFF] scale-110' : ''
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeOverlay(activeOverlay.id)}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10"
                      title={lang === 'hi' ? 'लेयर हटाएं' : 'Delete text layer'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#5A5B6E] dark:text-[#A2A3B8]">
                  {lang === 'hi' ? 'संपादन के लिए किसी लेयर पर टैप करें या नया जोड़ें।' : 'Tap a layer on stage or add a new one.'}
                </p>
              )}
            </div>
          )}

          {toolTab === 'draw' && (
            <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Brush className="w-4 h-4 text-[#FF28B9]" />
                  {lang === 'hi' ? 'नियॉन फ्रीहैंड ब्रश' : 'Neon Freehand Brush'}
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={strokes.length === 0}
                    onClick={() => setStrokes((s) => s.slice(0, -1))}
                    className="px-2.5 py-1 rounded-lg bg-black/5 dark:bg-white/10 text-[11px] font-medium flex items-center gap-1 disabled:opacity-40"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Undo
                  </button>
                  <button
                    type="button"
                    disabled={strokes.length === 0}
                    onClick={() => setStrokes([])}
                    className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-500 text-[11px] font-medium flex items-center gap-1 disabled:opacity-40"
                  >
                    <Eraser className="w-3 h-3" />
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBrushColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-7 h-7 rounded-full border border-black/20 dark:border-white/25 ${
                      brushColor === c ? 'ring-2 ring-[#792BFF] scale-110' : ''
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[11px] text-[#5A5B6E] dark:text-[#A2A3B8]">
                  {lang === 'hi' ? 'ब्रश साइज़' : 'Stroke Width'}
                </span>
                <input
                  type="range"
                  min={3}
                  max={22}
                  value={brushWidth}
                  onChange={(e) => setBrushWidth(Number(e.target.value))}
                  className="flex-1 accent-[#FF28B9]"
                />
                <span className="text-[11px] font-mono-tabular w-9 text-right">{brushWidth}px</span>
              </div>
            </div>
          )}

          {toolTab === 'bg' && (
            <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-[#FF28B9]" />
                  {lang === 'hi' ? 'बैकग्राउंड ग्रेडिएंट' : 'Background Gradient'}
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    aria-label="Gradient start color"
                    value={gradFrom}
                    onChange={(e) => setGradFrom(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                  />
                  <input
                    type="color"
                    aria-label="Gradient end color"
                    value={gradTo}
                    onChange={(e) => setGradTo(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {GRADIENT_PRESETS.map((preset) => {
                  const selected = gradFrom === preset.from && gradTo === preset.to;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      style={{ background: preset.css }}
                      className={`h-9 rounded-xl text-[10px] font-semibold text-white transition-transform ${
                        selected ? 'ring-2 ring-[#792BFF] dark:ring-white scale-105' : 'opacity-90 hover:opacity-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upload Progress */}
          {submitting && progress > 0 && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div style={{ width: `${progress}%` }} className="h-full zx-gradient-bg transition-all" />
              </div>
              <p className="text-[11px] font-mono-tabular text-[#5A5B6E] dark:text-[#A2A3B8]">{progress}%</p>
            </div>
          )}

          {/* Footer Submit */}
          <div className="flex items-center justify-end gap-2 pt-1">
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
              <span>{submitting ? '...' : lang === 'hi' ? 'स्टोरी प्रकाशित करें' : 'Publish Story'}</span>
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
