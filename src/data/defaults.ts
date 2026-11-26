import type { AdConfig, PublicSettings, VideoCategory } from '../types/video';

export const STORAGE_KEY = 'filmdrama_box_original_v1';

export const AD_ROTATION_SEC = 30;
export const AD_COOLDOWN_SEC = 60;

export const DEFAULT_PUBLIC_SETTINGS: PublicSettings = {
  autoplayNext: true,
  dataSaverMode: false,
  inboxAlerts: true,
};

export const EMPTY_AD_CONFIG: AdConfig = {
  topCode: '',
  feedCode: '',
  bottomCode: '',
};

export function normalizeCategoryName(cat?: string): VideoCategory {
  if (!cat) return 'Story';
  const lower = String(cat).trim().toLowerCase();
  if (lower === 'film') return 'Film';
  if (lower === 'drama') return 'Drama';
  return 'Story';
}

export function extractYouTubeId(input: string): string | null {
  const clean = String(input || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    /[?&]v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

/**
 * Splits a configured ad_config snippet into rotating creatives if the admin
 * includes "<!-- NEXT_AD -->" or "---" between snippets, otherwise wraps the
 * single snippet so the 30-second rotation refreshes cleanly.
 */
export function parseAdSnippets(rawCode: string): string[] {
  const trimmed = String(rawCode || '').trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/<!--\s*NEXT_AD\s*-->|\n-{3,}\n/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

/**
 * Builds an isolated HTML document for sandboxed ad iframe rendering
 * (sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox", without allow-same-origin).
 */
export function buildSandboxedAdSrcDoc(snippet: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<base target="_blank" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent;
    color: #f1f1f1;
    font-family: system-ui, -apple-system, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  img, iframe, ins { max-width: 100%; max-height: 100%; border: 0; }
  a { color: #fbbf24; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>${snippet}</body>
</html>`;
}
