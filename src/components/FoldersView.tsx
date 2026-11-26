import React, { useState } from 'react';
import type { AdSlotState, FolderItem, VideoItem } from '../types/video';
import { VideoCard } from './VideoCard';
import { InFeedBannerSlot } from './InFeedBannerSlot';

interface FoldersViewProps {
  folders: FolderItem[];
  videos: VideoItem[];
  subscribedFolderIds: string[];
  watchHistoryIds: string[];
  dataSaverMode: boolean;
  currentPlayingVideoId: string | null;
  searchQuery: string;
  onOpenFolder: (folderId: string) => void;
  onPlayVideo: (video: VideoItem) => void;
  onToggleSubscribe: (folderId: string) => void;
  feedAdCode: string;
  feedAdState: AdSlotState;
  onCloseFeedAd: () => void;
  onRestoreFeedAd: () => void;
}

interface FolderCoverProps {
  cover: string;
  folder: FolderItem;
  videoCount: number;
}

const FolderCover: React.FC<FolderCoverProps> = ({ cover, folder, videoCount }) => {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="yt-aspect w-full m-0 p-0 rounded-none relative overflow-hidden bg-black">
      {!imgFailed && cover ? (
        <img
          src={cover}
          alt={folder.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover rounded-none group-hover:scale-[1.01] transition-transform duration-200"
        />
      ) : (
        <div className="yt-overlay bg-gradient-to-br from-[#181818] via-[#121212] to-black flex flex-col items-center justify-center px-4 text-center">
          <span className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">
            {folder.category} Playlist
          </span>
          <span className="text-sm font-bold text-white mt-1 line-clamp-2 max-w-md">
            {folder.title}
          </span>
        </div>
      )}

      <div className="yt-overlay bg-gradient-to-t from-black/85 via-black/20 to-transparent flex flex-col justify-end p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="px-2 py-0.5 bg-[#ff0033] text-white text-[10px] font-extrabold uppercase">
            {folder.category} Playlist
          </span>
          <span className="px-2 py-0.5 bg-black/85 text-amber-300 text-xs font-extrabold tabular-nums">
            {videoCount} Video{videoCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
};

function shouldShowSpacedFeedAd(idx: number): boolean {
  return idx === 2 || (idx > 2 && (idx - 2) % 5 === 0);
}

export const FoldersView: React.FC<FoldersViewProps> = ({
  folders,
  videos,
  subscribedFolderIds,
  watchHistoryIds,
  dataSaverMode,
  currentPlayingVideoId,
  searchQuery,
  onOpenFolder,
  onPlayVideo,
  onToggleSubscribe,
  feedAdCode,
  feedAdState,
  onCloseFeedAd,
  onRestoreFeedAd,
}) => {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const folderMap = new Map(folders.map((f) => [f.id, f]));

  const subscribedVideos = videos.filter((v) => {
    if (currentPlayingVideoId && v.id === currentPlayingVideoId) return false;
    if (!v.folderId || !subscribedFolderIds.includes(v.folderId)) return false;
    if (!normalizedQuery) return true;
    const folder = folderMap.get(v.folderId);
    return (
      v.title.toLowerCase().includes(normalizedQuery) ||
      v.category.toLowerCase().includes(normalizedQuery) ||
      (folder ? folder.title.toLowerCase().includes(normalizedQuery) : false)
    );
  });

  const matchingFolders = folders.filter((f) => {
    if (!normalizedQuery) return true;
    return (
      f.title.toLowerCase().includes(normalizedQuery) ||
      f.category.toLowerCase().includes(normalizedQuery)
    );
  });

  return (
    <div className="w-full m-0 p-0">
      {/* Subscribed Episodes Section */}
      <section aria-label="Subscribed episodes" className="w-full border-b border-[#272727]">
        <div className="w-full px-3 py-3 bg-[#141414] border-b border-[#272727] flex items-center justify-between gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-white">
            Subscribed Episodes ({subscribedVideos.length})
          </h2>
          <span className="text-[11px] text-gray-400">
            {subscribedFolderIds.length} Subscribed Playlist
            {subscribedFolderIds.length === 1 ? '' : 's'}
          </span>
        </div>

        {subscribedVideos.length > 0 ? (
          subscribedVideos.map((v) => {
            const folder = v.folderId ? folderMap.get(v.folderId) : undefined;
            return (
              <VideoCard
                key={v.id}
                video={v}
                folder={folder}
                isSubscribed={folder ? subscribedFolderIds.includes(folder.id) : false}
                isCurrentlyPlaying={currentPlayingVideoId === v.id}
                isWatched={watchHistoryIds.includes(v.id)}
                dataSaverMode={dataSaverMode}
                onPlay={onPlayVideo}
                onToggleSubscribe={onToggleSubscribe}
              />
            );
          })
        ) : (
          <div className="w-full px-4 py-6 bg-[#0f0f0f] text-xs text-gray-400">
            {subscribedFolderIds.length === 0
              ? 'No subscriptions yet. Subscribe to any playlist below to receive episodes in your Inbox.'
              : 'No episodes have been added to your subscribed playlists yet.'}
          </div>
        )}
      </section>

      {/* All Playlists / Folders Section */}
      <section aria-label="All playlists and folders" className="w-full">
        <div className="w-full px-3 py-3 bg-[#141414] border-b border-[#272727] flex items-center justify-between gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
            All Playlists &amp; Folders ({matchingFolders.length})
          </h2>
          <span className="text-[11px] text-gray-400">Tap any folder to browse episodes</span>
        </div>

        {matchingFolders.length === 0 ? (
          <div className="w-full px-4 py-12 text-center text-sm text-gray-400">
            {folders.length === 0
              ? 'No playlists or folders available yet.'
              : 'No playlists match your search.'}
          </div>
        ) : (
          matchingFolders.map((folder, index) => {
            const folderVideos = videos.filter((v) => v.folderId === folder.id);
            const subscribed = subscribedFolderIds.includes(folder.id);
            const cover =
              folder.thumbnail ||
              (folderVideos[0]
                ? `https://i.ytimg.com/vi/${encodeURIComponent(folderVideos[0].youtubeId)}/${
                    dataSaverMode ? 'mqdefault' : 'hqdefault'
                  }.jpg`
                : '');

            return (
              <React.Fragment key={folder.id}>
                <div className="w-full m-0 p-0 bg-[#0f0f0f] border-b border-[#272727]">
                  <button
                    type="button"
                    onClick={() => onOpenFolder(folder.id)}
                    className="block w-full m-0 p-0 cursor-pointer group text-left focus:outline-none"
                    aria-label={`Open playlist ${folder.title}`}
                  >
                    <FolderCover
                      cover={cover}
                      folder={folder}
                      videoCount={folderVideos.length}
                    />
                  </button>

                  <div className="w-full px-3 py-2.5 flex items-center justify-between gap-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenFolder(folder.id)}
                      className="min-w-0 flex-1 text-left cursor-pointer focus:outline-none"
                    >
                      <h3 className="text-sm font-extrabold text-white truncate hover:text-amber-300 transition-colors">
                        {folder.title}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Tap to browse episodes &amp; watch
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleSubscribe(folder.id)}
                      className={`px-3.5 py-1.5 text-xs font-extrabold shrink-0 transition-colors cursor-pointer ${
                        subscribed
                          ? 'bg-[#222222] border border-[#272727] text-gray-200 hover:bg-[#2d2d2d]'
                          : 'bg-white hover:bg-gray-200 text-black'
                      }`}
                    >
                      {subscribed ? 'Subscribed' : 'Subscribe'}
                    </button>
                  </div>
                </div>

                {shouldShowSpacedFeedAd(index) && (
                  <InFeedBannerSlot
                    slotNumber={index + 1}
                    feedAdCode={feedAdCode}
                    feedAdState={feedAdState}
                    onCloseFeedAd={onCloseFeedAd}
                    onRestoreFeedAd={onRestoreFeedAd}
                  />
                )}
              </React.Fragment>
            );
          })
        )}
      </section>
    </div>
  );
};
