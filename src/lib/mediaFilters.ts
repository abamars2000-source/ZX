export interface MediaFilterPreset {
  id: string;
  label: string;
  labelHi: string;
  css: string;
}

export const MEDIA_FILTERS: MediaFilterPreset[] = [
  { id: 'none', label: 'Original', labelHi: 'मूल', css: 'none' },
  {
    id: 'vivid',
    label: 'Vivid',
    labelHi: 'विविड',
    css: 'contrast(1.12) saturate(1.38) brightness(1.04)',
  },
  {
    id: 'neon',
    label: 'Neon Night',
    labelHi: 'नियॉन',
    css: 'contrast(1.22) saturate(1.45) hue-rotate(-10deg) brightness(0.98)',
  },
  {
    id: 'sunset',
    label: 'Golden',
    labelHi: 'गोल्डन',
    css: 'sepia(0.24) saturate(1.35) contrast(1.06) brightness(1.05)',
  },
  {
    id: 'cinema',
    label: 'Cinema',
    labelHi: 'सिनेमा',
    css: 'contrast(1.18) saturate(0.88) brightness(0.95)',
  },
  {
    id: 'noir',
    label: 'Noir B&W',
    labelHi: 'ब्लैक & व्हाइट',
    css: 'grayscale(1) contrast(1.28) brightness(1.02)',
  },
  {
    id: 'vintage',
    label: 'Vintage',
    labelHi: 'विंटेज',
    css: 'sepia(0.45) contrast(0.95) brightness(1.05) saturate(0.85)',
  },
];

export function getFilterCss(filterId?: string): string {
  if (!filterId || filterId === 'none') return 'none';
  return MEDIA_FILTERS.find((f) => f.id === filterId)?.css || 'none';
}

export const STORY_STICKERS = [
  '🔥 Trending',
  '🇮🇳 Bharat',
  '✨ Vibes',
  '🎵 Music',
  '📍 India',
  '💯 100%',
  '❤️ Love',
  '⚡ ZX',
];
