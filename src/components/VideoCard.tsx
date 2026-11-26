import React, { useState } from 'react';
import { sanitizeRealDuration } from '../utils/youtubePlayerMeta';
import type { FolderItem, VideoItem } from '../types/video';

interface VideoCardProps {
  video: VideoItem;
  folder?: FolderItem;
  isSubscribed: boolean;
  isCurrentlyPlaying?: boolean;
  isWatched?: boolean;
  dataSaverMode?: boolean;
  onPlay: (video: VideoItem) => void;
  onToggleSubscribe: (folderId: string) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  folder,
  isSubscribed,
  isCurrentlyPlaying = false,
  isWatched = false,
  dataSaverMode = false,
  onPlay,
  onToggleSubscribe,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const quality = dataSaverMode ? 'mqdefault' : 'hqdefault';
  const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(video.youtubeId)}/${quality}.jpg`;
  const realDuration = sanitizeRealDuration(video.duration);

  return (
    <article className="w-full m-0 p-0 bg-[#0f0f0f] border-b border-[#272727]">
      <button
        type="button"
        onClick={() => onPlay(video)}
        className="yt-aspect block w-full m-0 p-0 rounded-none cursor-pointer group overflow-hidden bg-black text-left focus:outline-none"
        aria-label={`Play ${video.title}`}
      >
        {!imgFailed ? (
          <img
            src={thumbUrl}
            alt={video.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className={`w-full h-full object-cover rounded-none ${
              dataSaverMode ? '' : 'group-hover:scale-[1.01] transition-transform duration-200'
            }`}
          />
        ) : (
          <div className="yt-overlay bg-gradient-to-br from-[#181818] via-[#121212] to-black flex flex-col items-center justify-center px-4 text-center">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              FilmDrama Box
            </span>
            <span className="text-sm font-bold text-gray-200 mt-1 line-clamp-2 max-w-md">
              {video.title}
            </span>
          </div>
        )}

        <div className="yt-overlay bg-gradient-to-t from-black/65 via-transparent to-transparent flex items-center justify-center">
          <span
            className={`w-12 h-12 rounded-full border text-white flex items-center justify-center shadow-lg transition-colors ${
              isCurrentlyPlaying
                ? 'bg-[#ff0033] border-red-400'
                : 'bg-black/75 border-white/25 group-hover:bg-[#ff0033] group-hover:border-[#ff0033]'
            }`}
          >
            <svg className="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>

        {isCurrentlyPlaying ? (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-[#ff0033] text-white text-[10px] font-extrabold uppercase tracking-wide">
            Now Playing
          </span>
        ) : isWatched ? (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/80 text-gray-300 text-[10px] font-bold uppercase tracking-wide">
            Watched
          </span>
        ) : null}

        {realDuration && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/85 text-white text-[11px] font-bold tabular-nums font-mono">
            {realDuration}
          </span>
        )}
      </button>

      <div className="w-full px-3 py-2.5 flex items-start justify-between gap-2.5">
        <button
          type="button"
          onClick={() => onPlay(video)}
          className="min-w-0 flex-1 text-left cursor-pointer focus:outline-none"
        >
          <h3 className="text-sm font-bold text-white leading-snug line-clamp-2 hover:text-amber-300 transition-colors">
            {video.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
            <span className="px-1.5 py-0.5 bg-[#181818] border border-[#272727] text-gray-300 font-semibold leading-none">
              {video.category}
            </span>
            {folder && (
              <span className="text-gray-300 font-medium truncate max-w-[175px]">
                {folder.title}
              </span>
            )}
            <span>&bull;</span>
            <span>{video.views || 'New'}</span>
          </div>
        </button>

        {folder && (
          <button
            type="button"
            onClick={() => onToggleSubscribe(folder.id)}
            className={`px-3 py-1.5 text-xs font-extrabold shrink-0 transition-colors cursor-pointer ${
              isSubscribed
                ? 'bg-[#222222] border border-[#272727] text-gray-200 hover:bg-[#2d2d2d]'
                : 'bg-white hover:bg-gray-200 text-black'
            }`}
          >
            {isSubscribed ? 'Subscribed' : 'Subscribe'}
          </button>
        )}
      </div>
    </article>
  );
};
