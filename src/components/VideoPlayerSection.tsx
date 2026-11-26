import React, { useEffect, useRef } from 'react';
import {
  formatDurationSeconds,
  loadYouTubeIframeApi,
  sanitizeRealDuration,
} from '../utils/youtubePlayerMeta';
import type { VideoItem } from '../types/video';

interface VideoPlayerSectionProps {
  video: VideoItem | null;
  autoplayNext: boolean;
  playerContainerRef: React.RefObject<HTMLDivElement | null>;
  onNextEpisode: () => void;
  onDurationDetected?: (videoId: string, duration: string) => void;
}

export const VideoPlayerSection: React.FC<VideoPlayerSectionProps> = ({
  video,
  autoplayNext,
  playerContainerRef,
  onNextEpisode,
  onDurationDetected,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const autoplayNextRef = useRef(autoplayNext);
  const onNextEpisodeRef = useRef(onNextEpisode);
  const onDurationDetectedRef = useRef(onDurationDetected);

  autoplayNextRef.current = autoplayNext;
  onNextEpisodeRef.current = onNextEpisode;
  onDurationDetectedRef.current = onDurationDetected;

  useEffect(() => {
    if (!video || !iframeRef.current) return;

    let cancelled = false;
    let pollId: number | null = null;
    let ytPlayer: { getDuration: () => number; destroy?: () => void } | null = null;
    const targetIframe = iframeRef.current;

    void loadYouTubeIframeApi().then((YT) => {
      if (cancelled || !YT || !targetIframe) return;
      try {
        ytPlayer = new YT.Player(targetIframe as unknown as HTMLElement, {
          videoId: video.youtubeId,
          events: {
            onReady: (event) => {
              if (cancelled) return;
              const checkDuration = () => {
                try {
                  const sec = event.target.getDuration();
                  const formatted = formatDurationSeconds(sec);
                  if (formatted && formatted !== sanitizeRealDuration(video.duration)) {
                    onDurationDetectedRef.current?.(video.id, formatted);
                  }
                  return Boolean(formatted);
                } catch {
                  return false;
                }
              };
              if (!checkDuration()) {
                let tries = 0;
                pollId = window.setInterval(() => {
                  tries += 1;
                  if (checkDuration() || tries >= 10) {
                    if (pollId !== null) window.clearInterval(pollId);
                  }
                }, 400);
              }
            },
          },
        });
      } catch {
        // Fallback silently if YT.Player binding is restricted
      }
    });

    const onMessage = (event: MessageEvent) => {
      if (
        !event.origin.includes('youtube.com') &&
        !event.origin.includes('youtube-nocookie.com')
      ) {
        return;
      }
      try {
        const data =
          typeof event.data === 'string'
            ? (JSON.parse(event.data) as {
                event?: string;
                info?: { duration?: number; playerState?: number };
              })
            : (event.data as {
                event?: string;
                info?: { duration?: number; playerState?: number };
              });

        if (data?.info?.duration) {
          const formatted = formatDurationSeconds(data.info.duration);
          if (formatted && formatted !== sanitizeRealDuration(video.duration)) {
            onDurationDetectedRef.current?.(video.id, formatted);
          }
        }
        if (data?.info?.playerState === 0 && autoplayNextRef.current) {
          onNextEpisodeRef.current();
        }
      } catch {
        // Ignore non-JSON postMessage events
      }
    };

    window.addEventListener('message', onMessage);

    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      if (pollId !== null) window.clearInterval(pollId);
      void ytPlayer;
    };
  }, [video?.id, video?.youtubeId]);

  if (!video) return null;

  const originParam =
    typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : '';
  const embedUrl = `https://www.youtube.com/embed/${encodeURIComponent(
    video.youtubeId
  )}?autoplay=${autoplayNext ? '1' : '0'}&rel=0&modestbranding=1&playsinline=1&fs=1&enablejsapi=1${originParam}`;

  return (
    <section
      aria-label="Video player"
      className="shrink-0 z-20 w-full m-0 p-0 bg-black border-b border-[#272727]"
    >
      <div
        ref={playerContainerRef}
        className="w-full aspect-video max-h-[42vh] sm:max-h-[48vh] bg-black mx-auto"
      >
        <iframe
          ref={iframeRef}
          id={`yt-active-player-${video.id}`}
          key={`${video.id}-${video.youtubeId}`}
          src={embedUrl}
          title={video.title}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
        />
      </div>
    </section>
  );
};
