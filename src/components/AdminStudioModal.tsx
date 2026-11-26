import React, { useEffect, useState } from 'react';
import { extractYouTubeId } from '../data/defaults';
import { probeYouTubeDuration, sanitizeRealDuration } from '../utils/youtubePlayerMeta';
import type { AdConfig, FolderItem, VideoCategory, VideoItem } from '../types/video';

interface AdminStudioModalProps {
  isOpen: boolean;
  supabaseConnected: boolean;
  authToken: string | null;
  folders: FolderItem[];
  videos: VideoItem[];
  adConfig: AdConfig;
  onClose: () => void;
  onCreateFolder: (folder: {
    title: string;
    category: VideoCategory;
    thumbnail: string;
  }) => Promise<FolderItem | null>;
  onAddVideo: (video: {
    youtubeId: string;
    title: string;
    category: VideoCategory;
    folderId: string;
    duration: string;
  }) => Promise<boolean>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onDeleteVideo: (videoId: string) => Promise<void>;
  onSaveAdConfig: (config: AdConfig) => Promise<boolean>;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onNotify: (msg: string) => void;
}

type AdminTab = 'publish' | 'playlists' | 'library';

export const AdminStudioModal: React.FC<AdminStudioModalProps> = ({
  isOpen,
  supabaseConnected,
  authToken,
  folders,
  videos,
  adConfig,
  onClose,
  onCreateFolder,
  onAddVideo,
  onDeleteFolder,
  onDeleteVideo,
  onSaveAdConfig,
  onExportJson,
  onImportJson,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('publish');
  const [showAdSetup, setShowAdSetup] = useState(false);

  // Content & Playlist Routing + YouTube Link Detector state
  const [videoUrl, setVideoUrl] = useState('');
  const [verifiedYtId, setVerifiedYtId] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [verifyMessage, setVerifyMessage] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [isTitleManuallyEdited, setIsTitleManuallyEdited] = useState(false);
  const [videoCategory, setVideoCategory] = useState<VideoCategory>('Drama');
  const [videoFolderId, setVideoFolderId] = useState('');
  const [inlineNewFolderTitle, setInlineNewFolderTitle] = useState('');
  const [videoDuration, setVideoDuration] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  // Separate New Playlist form
  const [folderTitle, setFolderTitle] = useState('');
  const [folderCategory, setFolderCategory] = useState<VideoCategory>('Drama');
  const [folderThumb, setFolderThumb] = useState('');

  // Ad Network Setup state (hidden until "Ad Network Setup" button clicked)
  const [topCode, setTopCode] = useState(adConfig.topCode);
  const [feedCode, setFeedCode] = useState(adConfig.feedCode);
  const [bottomCode, setBottomCode] = useState(adConfig.bottomCode);
  const [isSavingAds, setIsSavingAds] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTopCode(adConfig.topCode);
      setFeedCode(adConfig.feedCode);
      setBottomCode(adConfig.bottomCode);
    }
  }, [isOpen, adConfig]);

  const verifyYouTubeLink = async (
    rawUrl: string,
    forceTitleOverwrite = false
  ): Promise<{ youtubeId: string; title: string; duration: string } | null> => {
    const trimmed = rawUrl.trim();
    const extracted = extractYouTubeId(trimmed);
    if (!extracted) {
      setVerifyStatus('invalid');
      setVerifiedYtId(null);
      setVerifyMessage('Invalid YouTube URL or 11-character video ID.');
      return null;
    }

    setVerifyStatus('checking');
    setVerifyMessage('Fetching original YouTube title, availability & real duration...');

    try {
      const res = await fetch('/api/youtube/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ urlOrId: trimmed }),
      });
      const data = (await res.json()) as {
        valid?: boolean;
        youtubeId?: string;
        title?: string;
        duration?: string;
        error?: string;
      };

      if (!res.ok || !data.valid || !data.youtubeId) {
        setVerifyStatus('invalid');
        setVerifiedYtId(null);
        setVerifyMessage(data.error || 'Video unavailable or embedding disabled.');
        return null;
      }

      const resolvedTitle = (data.title || '').trim() || `YouTube Video (${data.youtubeId})`;
      let resolvedDuration = sanitizeRealDuration(data.duration);

      setVerifyStatus('valid');
      setVerifiedYtId(data.youtubeId);
      setVerifyMessage(
        resolvedDuration
          ? `Verified playable • "${resolvedTitle}" (${resolvedDuration})`
          : `Verified playable • Detecting real duration for "${resolvedTitle}"...`
      );
      if (forceTitleOverwrite || !isTitleManuallyEdited || !videoTitle.trim()) {
        setVideoTitle(resolvedTitle);
        setIsTitleManuallyEdited(false);
      }

      if (resolvedDuration) {
        setVideoDuration(resolvedDuration);
      } else {
        setVideoDuration('');
        const probed = await probeYouTubeDuration(data.youtubeId);
        if (probed.duration) {
          resolvedDuration = probed.duration;
          setVideoDuration(probed.duration);
          setVerifyMessage(`Verified playable • "${resolvedTitle}" (${probed.duration})`);
        } else {
          setVerifyMessage(`Verified playable • Title: "${resolvedTitle}"`);
        }
      }

      return { youtubeId: data.youtubeId, title: resolvedTitle, duration: resolvedDuration };
    } catch {
      setVerifyStatus('invalid');
      setVerifiedYtId(null);
      setVerifyMessage('Could not verify video availability.');
      return null;
    }
  };

  // Automatically detect & fetch original YouTube title as soon as a valid URL/ID is pasted
  useEffect(() => {
    if (!isOpen || showAdSetup || activeTab !== 'publish') return;
    const candidateId = extractYouTubeId(videoUrl);
    if (!candidateId || candidateId === verifiedYtId) return;

    const timerId = window.setTimeout(() => {
      void verifyYouTubeLink(videoUrl, !isTitleManuallyEdited);
    }, 250);

    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, isOpen, showAdSetup, activeTab]);

  if (!isOpen) return null;

  const handleVideoUrlChange = (val: string) => {
    const nextId = extractYouTubeId(val);
    const prevId = extractYouTubeId(videoUrl);
    if (nextId !== prevId) {
      setIsTitleManuallyEdited(false);
      if (!val.trim()) {
        setVideoTitle('');
        setVideoDuration('');
      }
    }
    setVideoUrl(val);
    setVerifyStatus('idle');
    setVerifiedYtId(null);
    setVerifyMessage('');
  };

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPublishing) return;

    setIsPublishing(true);
    try {
      let ytId = verifiedYtId;
      let resolvedTitle = videoTitle.trim();
      let resolvedDuration = sanitizeRealDuration(videoDuration);

      if (!ytId || extractYouTubeId(videoUrl) !== ytId || !resolvedTitle) {
        const verified = await verifyYouTubeLink(videoUrl, !resolvedTitle);
        if (verified) {
          ytId = verified.youtubeId;
          if (!resolvedTitle) {
            resolvedTitle = verified.title;
          }
          if (!resolvedDuration && verified.duration) {
            resolvedDuration = verified.duration;
          }
        }
      }

      if (!ytId) {
        onNotify('Please provide a verified playable YouTube video link.');
        return;
      }

      if (!resolvedDuration) {
        const probed = await probeYouTubeDuration(ytId);
        if (probed.duration) {
          resolvedDuration = probed.duration;
        }
      }

      const finalTitle = resolvedTitle || `YouTube Video (${ytId})`;

      let targetFolderId = videoFolderId;
      if (targetFolderId === '__NEW__') {
        const cleanNewTitle = inlineNewFolderTitle.trim();
        if (!cleanNewTitle) {
          onNotify('Please enter a name for the new playlist/folder.');
          return;
        }
        const created = await onCreateFolder({
          title: cleanNewTitle,
          category: videoCategory,
          thumbnail: `https://i.ytimg.com/vi/${encodeURIComponent(ytId)}/hqdefault.jpg`,
        });
        if (!created) return;
        targetFolderId = created.id;
        setInlineNewFolderTitle('');
      }

      const ok = await onAddVideo({
        youtubeId: ytId,
        title: finalTitle,
        category: videoCategory,
        folderId: targetFolderId,
        duration: resolvedDuration,
      });

      if (ok) {
        setVideoUrl('');
        setVideoTitle('');
        setVideoDuration('');
        setIsTitleManuallyEdited(false);
        setVerifiedYtId(null);
        setVerifyStatus('idle');
        setVerifyMessage('');
        if (targetFolderId) {
          setVideoFolderId(targetFolderId);
        }
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const handleFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = folderTitle.trim();
    if (!cleanTitle) {
      onNotify('Please enter a playlist or folder title.');
      return;
    }
    const created = await onCreateFolder({
      title: cleanTitle,
      category: folderCategory,
      thumbnail: folderThumb.trim(),
    });
    if (created) {
      setFolderTitle('');
      setFolderThumb('');
      setVideoFolderId(created.id);
      setVideoCategory(created.category);
      setActiveTab('publish');
    }
  };

  const handleSaveAds = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAds(true);
    try {
      const ok = await onSaveAdConfig({
        topCode,
        feedCode,
        bottomCode,
      });
      if (ok) {
        setShowAdSetup(false);
      }
    } finally {
      setIsSavingAds(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJson(file);
    }
    e.target.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-studio-title"
    >
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-[#181818] border border-[#272727] shadow-2xl overflow-hidden animate-fade-in">
        {/* Top Studio Header */}
        <div className="px-4 py-3 border-b border-[#272727] flex items-center justify-between gap-2 bg-[#121212]">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`px-2 py-0.5 text-[10px] font-extrabold uppercase shrink-0 ${
                supabaseConnected ? 'bg-emerald-500 text-black' : 'bg-amber-400 text-black'
              }`}
            >
              {supabaseConnected ? 'Supabase Sync' : 'Local Mode'}
            </span>
            <h2 id="admin-studio-title" className="text-sm font-extrabold text-white truncate">
              Admin Studio
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowAdSetup((prev) => !prev)}
              className={`px-2.5 py-1.5 text-xs font-bold border transition-colors cursor-pointer ${
                showAdSetup
                  ? 'bg-amber-400 text-black border-amber-400'
                  : 'bg-[#222222] hover:bg-[#2d2d2d] text-amber-300 border-[#272727]'
              }`}
            >
              {showAdSetup ? 'Back to Content' : 'Ad Network Setup'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 bg-[#222222] hover:bg-[#303030] text-gray-300 flex items-center justify-center font-bold cursor-pointer"
              aria-label="Close Admin Studio"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Dedicated Ad Network Setup View (opens ONLY when clicked) */}
        {showAdSetup ? (
          <form onSubmit={handleSaveAds} className="p-4 overflow-y-auto space-y-4 flex-1">
            <div className="p-3 bg-[#121212] border border-[#272727] space-y-1.5 text-xs text-gray-300">
              <p className="font-bold text-white">Connection Steps — Live Ad Network Snippets</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-gray-400">
                <li>Copy your live ad tag / HTML snippet from your ad network dashboard.</li>
                <li>
                  Paste into the matching slot below. Leave a slot blank to keep it completely hidden.
                </li>
                <li>
                  Optional: separate multiple rotating creatives inside one slot using{' '}
                  <code className="text-amber-300 font-mono">&lt;!-- NEXT_AD --&gt;</code>. Each
                  slot rotates every 30s and hides for 60s on close.
                </li>
              </ol>
            </div>

            <div>
              <label htmlFor="topAdCodeInput" className="block text-xs font-semibold text-gray-300 mb-1">
                AD_SLOT_TOP — Slim Persistent Top Strip
              </label>
              <textarea
                id="topAdCodeInput"
                rows={3}
                value={topCode}
                onChange={(e) => setTopCode(e.target.value)}
                placeholder="Paste live HTML / script snippet for the slim top banner strip..."
                className="w-full p-2.5 bg-[#0f0f0f] border border-[#272727] focus:border-amber-400 text-xs font-mono text-white placeholder-gray-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="feedAdCodeInput" className="block text-xs font-semibold text-gray-300 mb-1">
                AD_SLOT_FEED — Spaced Video-Size Feed Banner (16:9)
              </label>
              <textarea
                id="feedAdCodeInput"
                rows={3}
                value={feedCode}
                onChange={(e) => setFeedCode(e.target.value)}
                placeholder="Paste live HTML / script snippet for spaced video-proportioned feed placements..."
                className="w-full p-2.5 bg-[#0f0f0f] border border-[#272727] focus:border-amber-400 text-xs font-mono text-white placeholder-gray-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="bottomAdCodeInput" className="block text-xs font-semibold text-gray-300 mb-1">
                AD_SLOT_BOTTOM_SAFE — Safe Bottom Playback Strip
              </label>
              <textarea
                id="bottomAdCodeInput"
                rows={3}
                value={bottomCode}
                onChange={(e) => setBottomCode(e.target.value)}
                placeholder="Paste live HTML / script snippet for the bottom playback safe zone..."
                className="w-full p-2.5 bg-[#0f0f0f] border border-[#272727] focus:border-amber-400 text-xs font-mono text-white placeholder-gray-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAdSetup(false)}
                className="px-3 py-2 bg-[#222222] hover:bg-[#2d2d2d] text-gray-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingAds}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black text-xs font-extrabold cursor-pointer"
              >
                {isSavingAds ? 'Saving...' : 'Save Ad Snippets'}
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Content Routing Tabs */}
            <div className="grid grid-cols-3 bg-[#101010] border-b border-[#272727] text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('publish')}
                className={`py-2.5 text-center border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'publish'
                    ? 'border-amber-400 text-amber-400 bg-[#181818]'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                1. Import &amp; Publish
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('playlists')}
                className={`py-2.5 text-center border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'playlists'
                    ? 'border-amber-400 text-amber-400 bg-[#181818]'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                2. New Playlist
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('library')}
                className={`py-2.5 text-center border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'library'
                    ? 'border-amber-400 text-amber-400 bg-[#181818]'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                3. Library &amp; Backup
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {activeTab === 'publish' && (
                <form onSubmit={handlePublishSubmit} className="space-y-3.5">
                  <div className="p-3 bg-[#121212] border border-[#272727] text-xs text-gray-300">
                    Import any YouTube link, verify availability, assign it to a category and
                    playlist/folder, and publish to both <strong className="text-white">Home</strong>{' '}
                    and <strong className="text-white">Inbox</strong>.
                  </div>

                  {/* YouTube Link Detector */}
                  <div>
                    <label htmlFor="videoUrlInput" className="block text-xs font-semibold text-gray-300 mb-1">
                      YouTube URL or Video ID
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="videoUrlInput"
                        type="text"
                        value={videoUrl}
                        onChange={(e) => handleVideoUrlChange(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        required
                        className="flex-1 h-10 px-3 bg-[#0f0f0f] border border-[#272727] focus:border-amber-400 text-sm text-white placeholder-gray-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void verifyYouTubeLink(videoUrl, true)}
                        disabled={!videoUrl.trim() || verifyStatus === 'checking'}
                        className="h-10 px-3 bg-[#222222] hover:bg-[#2d2d2d] disabled:opacity-40 border border-[#272727] text-xs font-bold text-amber-300 shrink-0 cursor-pointer"
                      >
                        {verifyStatus === 'checking' ? 'Checking...' : 'Detect & Verify'}
                      </button>
                    </div>
                    {verifyMessage && (
                      <p
                        className={`mt-1 text-[11px] font-semibold ${
                          verifyStatus === 'valid'
                            ? 'text-emerald-400'
                            : verifyStatus === 'invalid'
                            ? 'text-red-400'
                            : 'text-gray-400'
                        }`}
                      >
                        {verifyMessage}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="videoTitleInput" className="block text-xs font-semibold text-gray-300 mb-1">
                      Original YouTube Title <span className="text-gray-400 font-normal">(auto-filled)</span>
                    </label>
                    <input
                      id="videoTitleInput"
                      type="text"
                      value={videoTitle}
                      onChange={(e) => {
                        setVideoTitle(e.target.value);
                        setIsTitleManuallyEdited(e.target.value.trim().length > 0);
                      }}
                      placeholder="Auto-fills exact original YouTube title when you paste a link..."
                      className="w-full h-10 px-3 bg-[#0f0f0f] border border-[#272727] focus:border-amber-400 text-sm text-white placeholder-gray-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="videoCategorySelect" className="block text-xs font-semibold text-gray-300 mb-1">
                        Category
                      </label>
                      <select
                        id="videoCategorySelect"
                        value={videoCategory}
                        onChange={(e) => setVideoCategory(e.target.value as VideoCategory)}
                        className="w-full h-10 px-3 bg-[#0f0f0f] border border-[#272727] focus:border-amber-400 text-sm text-white focus:outline-none"
                      >
                        <option value="Drama">Drama</option>
                        <option value="Film">Film</option>
                        <option value="Story">Story</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="videoFolderSelect" className="block text-xs font-semibold text-gray-300 mb-1">
                        Playlist / Folder
                      </label>
                      <select
                        id="videoFolderSelect"
                        value={videoFolderId}
                        onChange={(e) => setVideoFolderId(e.target.value)}
                        className="w-full h-10 px-3 bg-[#0f0f0f] border border-[#272727] focus:border-amber-400 text-sm text-white focus:outline-none"
                      >
                        <option value="">-- Home Feed Only --</option>
                        <option value="__NEW__">+ Create New Playlist...</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.title} ({f.category})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="videoDurationInput" className="block text-xs font-semibold text-gray-300 mb-1">
                        Duration <span className="text-gray-400 font-normal">(auto-detected)</span>
                      </label>
                      <input
                        id="videoDurationInput"
                        type="text"
                        value={videoDuration}
                        onChange={(e) => setVideoDuration(e.target.value)}
                        placeholder="Auto-detected (e.g. 2:14:05)"
                        className="w-full h-10 px-3 bg-[#0f0f0f] border border-[#272727] focus:border-amber-400 text-sm text-white placeholder-gray-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {videoFolderId === '__NEW__' && (
                    <div>
                      <label htmlFor="inlineFolderTitle" className="block text-xs font-semibold text-amber-300 mb-1">
                        New Playlist / Folder Name
                      </label>
                      <input
                        id="inlineFolderTitle"
                        type="text"
                        value={inlineNewFolderTitle}
                        onChange={(e) => setInlineNewFolderTitle(e.target.value)}
                        placeholder="e.g., Drama Series Season 1 or Hero Collection"
                        required
                        className="w-full h-10 px-3 bg-[#0f0f0f] border border-amber-400/60 text-sm text-white placeholder-gray-500 focus:outline-none"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isPublishing}
                    className="w-full py-2.5 bg-[#ff0033] hover:bg-red-600 disabled:opacity-50 text-white text-xs font-extrabold uppercase tracking-wide cursor-pointer transition-colors"
                  >
                    {isPublishing ? 'Verifying & Publishing...' : 'Verify & Publish Video'}
                  </button>
                </form>
              )}

              {activeTab === 'playlists' && (
                <form onSubmit={handleFolderSubmit} className="space-y-3.5">
                  <div className="p-3 bg-[#121212] border border-[#272727] text-xs text-gray-300">
                    Create a playlist or folder for a drama series, film/hero collection, or story
                    anthology.
                  </div>

                  <div>
                    <label htmlFor="folderTitleInput" className="block text-xs font-semibold text-gray-300 mb-1">
                      Playlist / Folder Title
                    </label>
                    <input
                      id="folderTitleInput"
                      type="text"
                      value={folderTitle}
                      onChange={(e) => setFolderTitle(e.target.value)}
                      placeholder="Enter playlist or series title"
                      required
                      className="w-full h-10 px-3 bg-[#0f0f0f] border border-[#272727] focus:border-amber-400 text-sm text-white placeholder-gray-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="folderCategorySelect" className="block text-xs font-semibold text-gray-300 mb-1">
                        Category
                      </label>
                      <select
                        id="folderCategorySelect"
                        value={folderCategory}
                        onChange={(e) => setFolderCategory(e.target.value as VideoCategory)}
                        className="w-full h-10 px-3 bg-[#0f0f0f] border border-[#272727] focus:border-amber-400 text-sm text-white focus:outline-none"
                      >
                        <option value="Drama">Drama</option>
                        <option value="Film">Film</option>
                        <option value="Story">Story</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="folderThumbInput" className="block text-xs font-semibold text-gray-300 mb-1">
                        Cover URL (Optional)
                      </label>
                      <input
                        id="folderThumbInput"
                        type="url"
                        value={folderThumb}
                        onChange={(e) => setFolderThumb(e.target.value)}
                        placeholder="https://i.ytimg.com/vi/.../hqdefault.jpg"
                        className="w-full h-10 px-3 bg-[#0f0f0f] border border-[#272727] focus:border-amber-400 text-sm text-white placeholder-gray-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-black text-xs font-extrabold uppercase tracking-wide cursor-pointer transition-colors"
                  >
                    Create Playlist Folder
                  </button>
                </form>
              )}

              {activeTab === 'library' && (
                <div className="space-y-4">
                  <div className="p-3 bg-[#121212] border border-[#272727] space-y-2.5">
                    <h3 className="text-xs font-extrabold text-white uppercase">Backup &amp; Restore</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={onExportJson}
                        className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold cursor-pointer"
                      >
                        Export JSON Backup
                      </button>
                      <label className="px-3 py-1.5 bg-[#222222] hover:bg-[#2d2d2d] text-gray-200 text-xs font-bold cursor-pointer">
                        Import JSON
                        <input type="file" accept=".json" onChange={handleFileChange} className="hidden" />
                      </label>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-extrabold text-gray-300 uppercase mb-2">
                      Playlists &amp; Folders ({folders.length})
                    </h3>
                    <div className="space-y-1.5">
                      {folders.length === 0 ? (
                        <p className="text-xs text-gray-500">No playlists created yet.</p>
                      ) : (
                        folders.map((f) => (
                          <div
                            key={f.id}
                            className="px-3 py-2 bg-[#121212] border border-[#272727] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">{f.title}</p>
                              <p className="text-[10px] text-gray-400">{f.category}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void onDeleteFolder(f.id)}
                              className="px-2.5 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-[11px] font-bold shrink-0 cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-extrabold text-gray-300 uppercase mb-2">
                      Published Videos ({videos.length})
                    </h3>
                    <div className="space-y-1.5">
                      {videos.length === 0 ? (
                        <p className="text-xs text-gray-500">No videos published yet.</p>
                      ) : (
                        videos.map((v) => {
                          const folder = folders.find((f) => f.id === v.folderId);
                          return (
                            <div
                              key={v.id}
                              className="px-3 py-2 bg-[#121212] border border-[#272727] flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{v.title}</p>
                                <p className="text-[10px] text-gray-400">
                                  {v.category}
                                  {folder ? ` • ${folder.title}` : ''}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => void onDeleteVideo(v.id)}
                                className="px-2.5 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-[11px] font-bold shrink-0 cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
