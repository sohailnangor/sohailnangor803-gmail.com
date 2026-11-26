export interface YTPlayerInstance {
  getDuration: () => number;
  getVideoData?: () => { title?: string; video_id?: string };
  destroy: () => void;
}

export interface YTNamespace {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId: string;
      width?: number | string;
      height?: number | string;
      host?: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (event: { target: YTPlayerInstance }) => void;
        onError?: () => void;
      };
    }
  ) => YTPlayerInstance;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '';
  const total = Math.floor(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function sanitizeRealDuration(raw?: string | null): string {
  const clean = String(raw || '').trim();
  if (!clean || clean.toUpperCase() === 'HD') return '';
  const hmsMatch = clean.match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);
  if (hmsMatch) {
    const secs =
      Number(hmsMatch[1]) * 3600 + Number(hmsMatch[2]) * 60 + Number(hmsMatch[3]);
    return formatDurationSeconds(secs);
  }
  const msMatch = clean.match(/^(\d{1,3}):([0-5]\d)$/);
  if (msMatch) {
    const secs = Number(msMatch[1]) * 60 + Number(msMatch[2]);
    return formatDurationSeconds(secs);
  }
  return '';
}

let ytApiPromise: Promise<YTNamespace | null> | null = null;

export function loadYouTubeIframeApi(): Promise<YTNamespace | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.YT && typeof window.YT.Player === 'function') {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<YTNamespace | null>((resolve) => {
    let settled = false;
    const finish = (yt: YTNamespace | null) => {
      if (settled) return;
      settled = true;
      resolve(yt);
    };

    const timeout = window.setTimeout(() => {
      finish(window.YT && typeof window.YT.Player === 'function' ? window.YT : null);
    }, 6000);

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      if (typeof prevCallback === 'function') {
        try {
          prevCallback();
        } catch {
          // Ignore prior callback error
        }
      }
      finish(window.YT && typeof window.YT.Player === 'function' ? window.YT : null);
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="youtube.com/iframe_api"]'
    );
    if (!existing) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        finish(null);
      };
      document.head.appendChild(script);
    } else {
      const poll = window.setInterval(() => {
        if (window.YT && typeof window.YT.Player === 'function') {
          window.clearInterval(poll);
          window.clearTimeout(timeout);
          finish(window.YT);
        }
      }, 150);
    }
  });

  return ytApiPromise;
}

export async function probeYouTubeDuration(
  youtubeId: string
): Promise<{ duration: string; title?: string }> {
  if (!youtubeId || typeof document === 'undefined') {
    return { duration: '' };
  }

  const YT = await loadYouTubeIframeApi();
  if (!YT) return { duration: '' };

  return new Promise<{ duration: string; title?: string }>((resolve) => {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-9999px';
    wrapper.style.top = '-9999px';
    wrapper.style.width = '2px';
    wrapper.style.height = '2px';
    wrapper.style.opacity = '0';
    wrapper.style.pointerEvents = 'none';

    const target = document.createElement('div');
    wrapper.appendChild(target);
    document.body.appendChild(wrapper);

    let settled = false;
    let player: YTPlayerInstance | null = null;
    let pollTimer: number | null = null;

    const cleanup = (result: { duration: string; title?: string }) => {
      if (settled) return;
      settled = true;
      if (pollTimer !== null) window.clearInterval(pollTimer);
      window.clearTimeout(hardTimeout);
      try {
        player?.destroy();
      } catch {
        // Ignore player teardown error
      }
      if (wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
      resolve(result);
    };

    const hardTimeout = window.setTimeout(() => {
      cleanup({ duration: '' });
    }, 6500);

    try {
      player = new YT.Player(target, {
        videoId: youtubeId,
        width: 2,
        height: 2,
        host: 'https://www.youtube.com',
        playerVars: {
          autoplay: 0,
          controls: 0,
          mute: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            const readMeta = () => {
              try {
                const sec = event.target.getDuration();
                const formatted = formatDurationSeconds(sec);
                const videoData = event.target.getVideoData?.();
                const title = videoData?.title?.trim() || undefined;
                if (formatted) {
                  cleanup({ duration: formatted, title });
                  return true;
                }
              } catch {
                // Continue polling briefly
              }
              return false;
            };

            if (readMeta()) return;
            let attempts = 0;
            pollTimer = window.setInterval(() => {
              attempts += 1;
              if (readMeta() || attempts >= 15) {
                cleanup({ duration: '' });
              }
            }, 200);
          },
          onError: () => {
            cleanup({ duration: '' });
          },
        },
      });
    } catch {
      cleanup({ duration: '' });
    }
  });
}
