import { signal } from '@preact/signals';
import { persist } from './persist.ts';

export type NewsChannelType = 'youtube' | 'hls' | 'video' | 'iframe' | 'rtmp' | 'unknown';

export interface NewsChannel {
  id: string;
  name: string;        // user-supplied or auto ("chan01" etc.)
  url: string;
  type: NewsChannelType;
}

export function detectType(url: string): NewsChannelType {
  const u = url.trim();
  if (!u) return 'unknown';
  if (/^rtmps?:/i.test(u)) return 'rtmp';
  if (/(?:^|\.)youtube\.com\/(?:watch|embed|live)|youtu\.be\//i.test(u)) return 'youtube';
  if (/\.m3u8(?:\?|$|#)/i.test(u)) return 'hls';
  if (/\.(?:mp4|webm|ogg|m4v|mov)(?:\?|$|#)/i.test(u)) return 'video';
  // Any other http(s) URL — treat as a generic iframe embed. Many sites
  // block iframe embedding via X-Frame-Options or CSP frame-ancestors;
  // when that happens the iframe renders blank and the user just removes
  // the channel.
  if (/^https?:\/\//i.test(u)) return 'iframe';
  return 'unknown';
}

export function extractYoutubeId(url: string): string | null {
  // youtube.com/watch?v=ID
  const watch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watch) return watch[1] ?? null;
  // youtu.be/ID
  const short = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (short) return short[1] ?? null;
  // youtube.com/embed/ID and /live/ID
  const embed = url.match(/youtube\.com\/(?:embed|live)\/([a-zA-Z0-9_-]{11})/);
  if (embed) return embed[1] ?? null;
  return null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function autoName(existing: NewsChannel[]): string {
  // chan01, chan02, … skipping any names already taken.
  for (let i = 1; i < 1000; i++) {
    const candidate = `chan${pad2(i)}`;
    if (!existing.some(c => c.name === candidate)) return candidate;
  }
  return `chan${Date.now()}`;
}

export function makeChannelId(): string {
  return `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export const newsChannels = persist(
  signal<NewsChannel[]>([]),
  'signalmap-news-channels',
);
