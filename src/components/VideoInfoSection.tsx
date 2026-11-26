import React from 'react';
import { sanitizeRealDuration } from '../utils/youtubePlayerMeta';
import type { FolderItem, VideoItem } from '../types/video';

interface VideoInfoSectionProps {
  video: VideoItem;
  folder?: FolderItem;
  isSubscribed: boolean;
  isLiked: boolean;
  isSaved: boolean;
  onClose: () => void;
  onJumpToFolder: (folderId: string) => void;
  onToggleSubscribe: (folderId: string) => void;
  onToggleLike: (videoId: string) => void;
  onToggleSave: (videoId: string) => void;
  onShare: (video: VideoItem) => void;
  onFullscreen: () => void;
  onNextEpisode: () => void;
}

export const VideoInfoSection: React.FC<VideoInfoSectionProps> = ({
  video,
  folder,
  isSubscribed,
  isLiked,
  isSaved,
  onClose,
  onJumpToFolder,
  onToggleSubscribe,
  onToggleLike,
  onToggleSave,
  onShare,
  onFullscreen,
  onNextEpisode,
}) => {
  const realDuration = sanitizeRealDuration(video.duration);

  return (
    <section
      aria-label="Playing video details and actions"
      className="w-full px-3 py-3 bg-[#121212] border-b border-[#272727]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="px-1.5 py-0.5 bg-[#ff0033]/20 text-red-400 text-[10px] font-extrabold uppercase">
              {video.category}
            </span>
            {realDuration && (
              <span className="px-1.5 py-0.5 bg-[#1c1c1c] border border-[#272727] text-gray-200 text-[10px] font-bold tabular-nums font-mono">
                {realDuration}
              </span>
            )}
            {folder && (
              <button
                type="button"
                onClick={() => onJumpToFolder(folder.id)}
                className="text-[11px] font-semibold text-amber-400 hover:underline truncate cursor-pointer"
              >
                {folder.title}
              </button>
            )}
          </div>
          <h1 className="font-display text-sm sm:text-base font-bold text-white leading-snug line-clamp-2">
            {video.title}
          </h1>
          <p className="mt-1 text-[11px] text-gray-400">
            {video.views || 'New'}
            {folder ? ` • ${folder.title}` : ' • Single Release'}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 bg-[#222222] hover:bg-[#303030] border border-[#272727] text-gray-300 flex items-center justify-center text-sm font-bold shrink-0 cursor-pointer"
          title="Close Player"
          aria-label="Close video player"
        >
          &times;
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {folder && (
          <button
            type="button"
            onClick={() => onToggleSubscribe(folder.id)}
            className={`px-3.5 py-1.5 text-xs font-extrabold shrink-0 transition-colors cursor-pointer ${
              isSubscribed
                ? 'bg-[#222222] border border-[#272727] text-gray-200 hover:bg-[#2d2d2d]'
                : 'bg-white hover:bg-gray-200 text-black'
            }`}
          >
            {isSubscribed ? 'Subscribed ✓' : 'Subscribe'}
          </button>
        )}

        <button
          type="button"
          onClick={() => onToggleLike(video.id)}
          aria-pressed={isLiked}
          className={`px-3 py-1.5 border text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
            isLiked
              ? 'bg-[#ff0033]/20 border-[#ff0033]/60 text-red-300'
              : 'bg-[#222222] hover:bg-[#2d2d2d] border-[#272727] text-gray-200'
          }`}
        >
          <svg
            className="w-3.5 h-3.5"
            fill={isLiked ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"
            />
          </svg>
          <span>{isLiked ? 'Liked' : 'Like'}</span>
        </button>

        <button
          type="button"
          onClick={() => onToggleSave(video.id)}
          aria-pressed={isSaved}
          className={`px-3 py-1.5 border text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
            isSaved
              ? 'bg-amber-400/20 border-amber-400/60 text-amber-300'
              : 'bg-[#222222] hover:bg-[#2d2d2d] border-[#272727] text-gray-200'
          }`}
        >
          <svg
            className="w-3.5 h-3.5"
            fill={isSaved ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
            />
          </svg>
          <span>{isSaved ? 'Saved' : 'Save'}</span>
        </button>

        <button
          type="button"
          onClick={() => onShare(video)}
          className="px-3 py-1.5 bg-[#222222] hover:bg-[#2d2d2d] border border-[#272727] text-xs font-semibold text-gray-200 flex items-center gap-1.5 shrink-0 cursor-pointer"
          title="Share FilmDrama Box link"
          aria-label="Share video link"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" />
          </svg>
          <span>Share</span>
        </button>

        <button
          type="button"
          onClick={onFullscreen}
          className="px-3 py-1.5 bg-[#222222] hover:bg-[#2d2d2d] border border-[#272727] text-xs font-semibold text-gray-200 flex items-center gap-1.5 shrink-0 cursor-pointer"
          title="Enter Full Screen"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
          </svg>
          <span>Fullscreen</span>
        </button>

        <button
          type="button"
          onClick={onNextEpisode}
          className="px-3 py-1.5 bg-[#222222] hover:bg-[#2d2d2d] border border-[#272727] text-xs font-semibold text-gray-200 shrink-0 cursor-pointer"
        >
          Next &rarr;
        </button>
      </div>
    </section>
  );
};
