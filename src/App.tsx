import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AD_COOLDOWN_SEC,
  AD_ROTATION_SEC,
  DEFAULT_PUBLIC_SETTINGS,
  EMPTY_AD_CONFIG,
  STORAGE_KEY,
  normalizeCategoryName,
} from './data/defaults';
import type {
  AdConfig,
  AdSlotKey,
  AdSlotState,
  FolderItem,
  HomeCategoryFilter,
  MainView,
  PublicSettings,
  UserProfile,
  VideoCategory,
  VideoItem,
} from './types/video';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { VideoPlayerSection } from './components/VideoPlayerSection';
import { VideoInfoSection } from './components/VideoInfoSection';
import { VideoCard } from './components/VideoCard';
import { InFeedBannerSlot } from './components/InFeedBannerSlot';
import { BottomSafeAdBanner } from './components/BottomSafeAdBanner';
import { FoldersView } from './components/FoldersView';
import { ProfileModal } from './components/ProfileModal';
import { PublicSettingsModal } from './components/PublicSettingsModal';
import { AdminStudioModal } from './components/AdminStudioModal';
import {
  syncPushSubscriptionIfAllowed,
  triggerVideoReleaseNotification,
} from './utils/notifications';
import { probeYouTubeDuration, sanitizeRealDuration } from './utils/youtubePlayerMeta';

interface PersistedFallbackState {
  folders: FolderItem[];
  videos: VideoItem[];
  subscribedFolderIds: string[];
  likedVideoIds: string[];
  savedVideoIds: string[];
  adConfig: AdConfig;
  publicSettings: PublicSettings;
  watchHistoryIds: string[];
  userProfile: UserProfile | null;
}

function loadLocalFallback(): PersistedFallbackState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        folders: [],
        videos: [],
        subscribedFolderIds: [],
        likedVideoIds: [],
        savedVideoIds: [],
        adConfig: EMPTY_AD_CONFIG,
        publicSettings: DEFAULT_PUBLIC_SETTINGS,
        watchHistoryIds: [],
        userProfile: null,
      };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedFallbackState>;
    return {
      folders: Array.isArray(parsed.folders)
        ? parsed.folders.map((f) => ({ ...f, category: normalizeCategoryName(f.category) }))
        : [],
      videos: Array.isArray(parsed.videos)
        ? parsed.videos.map((v) => ({
            ...v,
            category: normalizeCategoryName(v.category),
            duration: sanitizeRealDuration(v.duration),
          }))
        : [],
      subscribedFolderIds: Array.isArray(parsed.subscribedFolderIds)
        ? parsed.subscribedFolderIds
        : [],
      likedVideoIds: Array.isArray(parsed.likedVideoIds) ? parsed.likedVideoIds : [],
      savedVideoIds: Array.isArray(parsed.savedVideoIds) ? parsed.savedVideoIds : [],
      adConfig: parsed.adConfig
        ? {
            topCode: String(parsed.adConfig.topCode || ''),
            feedCode: String(parsed.adConfig.feedCode || ''),
            bottomCode: String(parsed.adConfig.bottomCode || ''),
          }
        : EMPTY_AD_CONFIG,
      publicSettings: parsed.publicSettings
        ? {
            autoplayNext: Boolean(parsed.publicSettings.autoplayNext),
            dataSaverMode: Boolean(parsed.publicSettings.dataSaverMode),
            inboxAlerts: parsed.publicSettings.inboxAlerts !== false,
          }
        : DEFAULT_PUBLIC_SETTINGS,
      watchHistoryIds: Array.isArray(parsed.watchHistoryIds)
        ? parsed.watchHistoryIds
        : [],
      userProfile:
        parsed.userProfile && parsed.userProfile.id !== 'admin' ? parsed.userProfile : null,
    };
  } catch {
    return {
      folders: [],
      videos: [],
      subscribedFolderIds: [],
      likedVideoIds: [],
      savedVideoIds: [],
      adConfig: EMPTY_AD_CONFIG,
      publicSettings: DEFAULT_PUBLIC_SETTINGS,
      watchHistoryIds: [],
      userProfile: null,
    };
  }
}

function saveLocalFallback(state: PersistedFallbackState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

type AdClockState = Record<AdSlotKey, AdSlotState>;

function advanceSlot(slot: AdSlotState): AdSlotState {
  if (slot.cooldown > 0) {
    const nextCooldown = slot.cooldown - 1;
    if (nextCooldown <= 0) {
      return {
        index: slot.index + 1,
        remaining: AD_ROTATION_SEC,
        cooldown: 0,
      };
    }
    return { ...slot, cooldown: nextCooldown };
  }

  const nextRemaining = slot.remaining - 1;
  if (nextRemaining <= 0) {
    return {
      index: slot.index + 1,
      remaining: AD_ROTATION_SEC,
      cooldown: 0,
    };
  }
  return { ...slot, remaining: nextRemaining };
}

function shouldShowSpacedFeedAd(idx: number): boolean {
  return idx === 2 || (idx > 2 && (idx - 2) % 5 === 0);
}

interface ServerFolderRow {
  id: string;
  title: string;
  category: string;
  thumbnail?: string;
}

interface ServerVideoRow {
  id: string;
  youtube_id?: string;
  youtubeId?: string;
  title: string;
  category: string;
  folder_id?: string;
  folderId?: string;
  duration?: string;
  views?: string;
}

export function App() {
  const [initial] = useState<PersistedFallbackState>(() => loadLocalFallback());

  const [supabaseConnected, setSupabaseConnected] = useState<boolean>(false);
  const [folders, setFolders] = useState<FolderItem[]>(initial.folders);
  const [videos, setVideos] = useState<VideoItem[]>(initial.videos);
  const [subscribedFolderIds, setSubscribedFolderIds] = useState<string[]>(
    initial.subscribedFolderIds
  );
  const [likedVideoIds, setLikedVideoIds] = useState<string[]>(initial.likedVideoIds);
  const [savedVideoIds, setSavedVideoIds] = useState<string[]>(initial.savedVideoIds);
  const [adConfig, setAdConfig] = useState<AdConfig>(initial.adConfig);
  const [publicSettings, setPublicSettings] = useState<PublicSettings>(initial.publicSettings);
  const [watchHistoryIds, setWatchHistoryIds] = useState<string[]>(initial.watchHistoryIds);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(initial.userProfile);

  // Session Bearer token kept in React memory only
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(false);

  const [mainView, setMainView] = useState<MainView>('home');
  const [categoryFilter, setCategoryFilter] = useState<HomeCategoryFilter>('All');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [currentPlayingVideoId, setCurrentPlayingVideoId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [profileAuthSubmitting, setProfileAuthSubmitting] = useState<boolean>(false);
  const [profileAuthError, setProfileAuthError] = useState<string | null>(null);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isAdminStudioOpen, setIsAdminStudioOpen] = useState<boolean>(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const feedScrollRef = useRef<HTMLElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const probedDurationIdsRef = useRef<Set<string>>(new Set());

  const [adState, setAdState] = useState<AdClockState>({
    top: { index: 0, remaining: AD_ROTATION_SEC, cooldown: 0 },
    feed: { index: 0, remaining: AD_ROTATION_SEC, cooldown: 0 },
    bottomSafe: { index: 0, remaining: AD_ROTATION_SEC, cooldown: 0 },
  });

  const showToast = useCallback((message: string) => {
    setToastMsg(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg(null);
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  const deepLinkResolvedRef = useRef<boolean>(false);

  // Resolve ?watch=... / ?video=... / ?v=... deep links once videos load
  useEffect(() => {
    if (deepLinkResolvedRef.current || videos.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('watch') || params.get('video') || params.get('v');
    const targetYt = params.get('yt');
    if (!targetId && !targetYt) {
      deepLinkResolvedRef.current = true;
      return;
    }

    const match =
      (targetId ? videos.find((v) => v.id === targetId || v.youtubeId === targetId) : undefined) ||
      (targetYt ? videos.find((v) => v.youtubeId === targetYt) : undefined);

    if (match) {
      deepLinkResolvedRef.current = true;
      setCurrentPlayingVideoId(match.id);
      setWatchHistoryIds((prev) => (prev.includes(match.id) ? prev : [match.id, ...prev]));
    }
  }, [videos]);

  // Bootstrap from server / Supabase on mount
  useEffect(() => {
    let active = true;
    fetch('/api/bootstrap')
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            supabaseConnected?: boolean;
            folders?: ServerFolderRow[];
            videos?: ServerVideoRow[];
            adConfig?: AdConfig;
          } | null
        ) => {
          if (!active || !data) return;
          setSupabaseConnected(Boolean(data.supabaseConnected));

          if (data.supabaseConnected || (data.folders && data.folders.length > 0)) {
            const mappedFolders: FolderItem[] = (data.folders || []).map((f) => ({
              id: f.id,
              title: f.title,
              category: normalizeCategoryName(f.category),
              thumbnail: f.thumbnail || '',
            }));
            const mappedVideos: VideoItem[] = (data.videos || []).map((v) => ({
              id: v.id,
              youtubeId: v.youtube_id || v.youtubeId || '',
              title: v.title,
              category: normalizeCategoryName(v.category),
              folderId: v.folder_id ?? v.folderId ?? '',
              duration: sanitizeRealDuration(v.duration),
              views: v.views || 'New',
            }));
            setFolders(mappedFolders);
            setVideos(mappedVideos);
          }

          if (
            data.adConfig &&
            (data.supabaseConnected ||
              data.adConfig.topCode ||
              data.adConfig.feedCode ||
              data.adConfig.bottomCode)
          ) {
            setAdConfig({
              topCode: data.adConfig.topCode || '',
              feedCode: data.adConfig.feedCode || '',
              bottomCode: data.adConfig.bottomCode || '',
            });
          }
        }
      )
      .catch(() => {
        // Offline / localStorage fallback remains active
      });

    return () => {
      active = false;
    };
  }, []);

  // Persist fallback state locally
  useEffect(() => {
    saveLocalFallback({
      folders,
      videos,
      subscribedFolderIds,
      likedVideoIds,
      savedVideoIds,
      adConfig,
      publicSettings,
      watchHistoryIds,
      userProfile: userProfile?.id === 'admin' ? null : userProfile,
    });
  }, [
    folders,
    videos,
    subscribedFolderIds,
    likedVideoIds,
    savedVideoIds,
    adConfig,
    publicSettings,
    watchHistoryIds,
    userProfile,
  ]);

  // Independent 30s ad rotation / 60s close cooldown clock
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setAdState((prev) => ({
        top: advanceSlot(prev.top),
        feed: advanceSlot(prev.feed),
        bottomSafe: advanceSlot(prev.bottomSafe),
      }));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProfileModalOpen(false);
        setIsSettingsModalOpen(false);
        setIsAdminStudioOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleDurationDetected = useCallback((videoId: string, detectedDuration: string) => {
    const clean = sanitizeRealDuration(detectedDuration);
    if (!clean) return;
    setVideos((prev) =>
      prev.map((v) => (v.id === videoId && !sanitizeRealDuration(v.duration) ? { ...v, duration: clean } : v))
    );
    void fetch(`/api/videos/${encodeURIComponent(videoId)}/duration`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: clean }),
    }).catch(() => {});
  }, []);

  // Probe real durations for any published video missing a formatted H:MM:SS / M:SS duration
  useEffect(() => {
    const missing = videos.filter(
      (v) => !sanitizeRealDuration(v.duration) && !probedDurationIdsRef.current.has(v.id)
    );
    if (missing.length === 0) return;

    let cancelled = false;
    const runQueue = async () => {
      for (const item of missing) {
        if (cancelled) break;
        probedDurationIdsRef.current.add(item.id);
        const result = await probeYouTubeDuration(item.youtubeId);
        if (!cancelled && result.duration) {
          handleDurationDetected(item.id, result.duration);
        }
      }
    };
    void runQueue();
    return () => {
      cancelled = true;
    };
  }, [handleDurationDetected, videos]);

  // Sync Web Push subscription & listen for live new release broadcasts
  useEffect(() => {
    void syncPushSubscriptionIfAllowed();
    const handleOnline = () => {
      void syncPushSubscriptionIfAllowed();
    };
    window.addEventListener('online', handleOnline);

    if (typeof EventSource === 'undefined') {
      return () => {
        window.removeEventListener('online', handleOnline);
      };
    }

    const source = new EventSource('/api/notifications/stream');
    const handleNewVideoEvent = (event: MessageEvent) => {
      try {
        const data = JSON.parse(String(event.data || '{}')) as {
          videoId?: string;
          youtubeId?: string;
          videoTitle?: string;
          category?: string;
        };
        if (data.videoId && data.youtubeId && data.videoTitle) {
          void triggerVideoReleaseNotification({
            videoId: data.videoId,
            youtubeId: data.youtubeId,
            title: data.videoTitle,
            category: data.category || 'Film',
          });
        }
      } catch {
        // Ignore malformed SSE frame
      }
    };

    source.addEventListener('new_video', handleNewVideoEvent as EventListener);
    return () => {
      window.removeEventListener('online', handleOnline);
      source.removeEventListener('new_video', handleNewVideoEvent as EventListener);
      source.close();
    };
  }, []);

  const hideAdForCooldown = useCallback((key: AdSlotKey) => {
    setAdState((prev) => ({
      ...prev,
      [key]: { ...prev[key], cooldown: AD_COOLDOWN_SEC },
    }));
  }, []);

  const restoreAdNow = useCallback((key: AdSlotKey) => {
    setAdState((prev) => ({
      ...prev,
      [key]: {
        index: prev[key].index + 1,
        remaining: AD_ROTATION_SEC,
        cooldown: 0,
      },
    }));
  }, []);

  const folderMap = useMemo(() => {
    const map = new Map<string, FolderItem>();
    for (const f of folders) {
      map.set(f.id, f);
    }
    return map;
  }, [folders]);

  const currentPlayingVideo = useMemo(
    () =>
      currentPlayingVideoId ? videos.find((v) => v.id === currentPlayingVideoId) ?? null : null,
    [currentPlayingVideoId, videos]
  );

  const currentVideoFolder = currentPlayingVideo?.folderId
    ? folderMap.get(currentPlayingVideo.folderId)
    : undefined;

  const activeFolder = selectedFolderId ? folderMap.get(selectedFolderId) ?? null : null;

  const toggleFolderSubscription = useCallback(
    (folderId: string) => {
      const folder = folderMap.get(folderId);
      setSubscribedFolderIds((prev) => {
        const exists = prev.includes(folderId);
        const nextList = exists ? prev.filter((id) => id !== folderId) : [...prev, folderId];

        if (authToken && !adminUnlocked) {
          void fetch('/api/profile/subscriptions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ subscribedFolders: nextList }),
          }).catch(() => {});
        }

        if (userProfile) {
          setUserProfile({ ...userProfile, subscribedFolders: nextList });
        }

        showToast(
          exists
            ? `Unsubscribed from "${folder?.title || 'Playlist'}"`
            : `Subscribed to "${folder?.title || 'Playlist'}"`
        );
        return nextList;
      });
    },
    [adminUnlocked, authToken, folderMap, showToast, userProfile]
  );

  const handlePlayVideo = useCallback((video: VideoItem) => {
    setCurrentPlayingVideoId(video.id);
    setWatchHistoryIds((prev) => (prev.includes(video.id) ? prev : [video.id, ...prev]));
    try {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('watch', video.id);
      nextUrl.searchParams.delete('video');
      nextUrl.searchParams.delete('v');
      window.history.replaceState(null, '', nextUrl.toString());
    } catch {
      // Ignore history errors in restricted contexts
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    feedScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleClosePlayer = useCallback(() => {
    setCurrentPlayingVideoId(null);
    try {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('watch');
      nextUrl.searchParams.delete('video');
      nextUrl.searchParams.delete('v');
      nextUrl.searchParams.delete('yt');
      window.history.replaceState(null, '', nextUrl.toString());
    } catch {
      // Ignore history errors
    }
  }, []);

  const toggleLikeVideo = useCallback(
    (videoId: string) => {
      setLikedVideoIds((prev) => {
        const exists = prev.includes(videoId);
        showToast(exists ? 'Removed from Liked videos' : 'Added to Liked videos');
        return exists ? prev.filter((id) => id !== videoId) : [...prev, videoId];
      });
    },
    [showToast]
  );

  const toggleSaveVideo = useCallback(
    (videoId: string) => {
      setSavedVideoIds((prev) => {
        const exists = prev.includes(videoId);
        showToast(exists ? 'Removed from Saved' : 'Saved for later');
        return exists ? prev.filter((id) => id !== videoId) : [...prev, videoId];
      });
    },
    [showToast]
  );

  const handlePlayerFullscreen = useCallback(() => {
    const el = playerContainerRef.current as
      | (HTMLDivElement & {
          webkitRequestFullscreen?: () => Promise<void> | void;
          mozRequestFullScreen?: () => Promise<void> | void;
          msRequestFullscreen?: () => Promise<void> | void;
        })
      | null;
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        void Promise.resolve(el.requestFullscreen()).catch(() =>
          showToast('Tap the fullscreen icon inside the YouTube player.')
        );
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else if (el.mozRequestFullScreen) {
        el.mozRequestFullScreen();
      } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
      } else {
        showToast('Tap the fullscreen icon inside the YouTube player.');
      }
    } catch {
      showToast('Tap the fullscreen icon inside the YouTube player.');
    }
  }, [showToast]);

  const handleShareVideo = useCallback(
    async (video: VideoItem) => {
      const shareUrl = `${window.location.origin}/?watch=${encodeURIComponent(video.id)}`;
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: video.title,
            text: `Watch "${video.title}" on FilmDrama Box`,
            url: shareUrl,
          });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            return;
          }
        }
      }

      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(shareUrl);
          showToast('FilmDrama Box video link copied!');
          return;
        }
      } catch {
        // Fall through to execCommand fallback
      }

      try {
        const textarea = document.createElement('textarea');
        textarea.value = shareUrl;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('FilmDrama Box video link copied!');
      } catch {
        showToast('Unable to copy link on this device.');
      }
    },
    [showToast]
  );

  const handleNextEpisode = useCallback(() => {
    if (videos.length === 0) return;
    if (!currentPlayingVideo) {
      handlePlayVideo(videos[0]);
      return;
    }
    const sameFolderList = currentPlayingVideo.folderId
      ? videos.filter((v) => v.folderId === currentPlayingVideo.folderId)
      : [];
    const pool = sameFolderList.length > 1 ? sameFolderList : videos;
    const idx = pool.findIndex((v) => v.id === currentPlayingVideo.id);
    const nextVideo = pool[(idx + 1) % pool.length];
    if (nextVideo) {
      handlePlayVideo(nextVideo);
    }
  }, [currentPlayingVideo, handlePlayVideo, videos]);

  const handleHomeClick = useCallback(() => {
    setMainView('home');
    setCategoryFilter('All');
    setSelectedFolderId(null);
    setSearchQuery('');
  }, []);

  const handleSelectBottomView = useCallback((view: MainView) => {
    setMainView(view);
    setSelectedFolderId(null);
  }, []);

  const handleJumpToFolder = useCallback((folderId: string) => {
    setSelectedFolderId(folderId);
    setMainView('inbox');
  }, []);

  // Profile Auth & Silent Admin Verification
  const handleAuthenticateProfile = useCallback(
    async (payload: { firstName: string; lastName: string; password: string }) => {
      setProfileAuthSubmitting(true);
      setProfileAuthError(null);
      try {
        const res = await fetch('/api/profile/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = (await res.json()) as {
          role?: 'user' | 'admin';
          token?: string;
          profile?: UserProfile;
          error?: string;
        };

        if (!res.ok || !data.token) {
          setProfileAuthError(data.error || 'Could not sign in.');
          return;
        }

        setAuthToken(data.token);
        if (data.role === 'admin') {
          setAdminUnlocked(true);
          setUserProfile(
            data.profile ?? {
              id: 'admin',
              firstName: payload.firstName,
              lastName: payload.lastName,
              subscribedFolders: [],
            }
          );
          setIsProfileModalOpen(false);
          setIsAdminStudioOpen(true);
          showToast('Studio unlocked.');
          return;
        }

        if (data.profile) {
          setAdminUnlocked(false);
          setUserProfile(data.profile);
          if (data.profile.subscribedFolders.length > 0) {
            setSubscribedFolderIds(data.profile.subscribedFolders);
          }
          setIsProfileModalOpen(false);
          showToast(`Signed in as ${data.profile.firstName} ${data.profile.lastName}`);
        }
      } catch {
        setProfileAuthError('Unable to reach server right now.');
      } finally {
        setProfileAuthSubmitting(false);
      }
    },
    [showToast]
  );

  const handleSignOut = useCallback(() => {
    setAuthToken(null);
    setAdminUnlocked(false);
    setUserProfile(null);
    setIsAdminStudioOpen(false);
    setIsProfileModalOpen(false);
    showToast('Signed out.');
  }, [showToast]);

  // Admin Content & Playlist Routing Handlers
  const handleCreateFolder = useCallback(
    async (data: {
      title: string;
      category: VideoCategory;
      thumbnail: string;
    }): Promise<FolderItem | null> => {
      try {
        const res = await fetch('/api/folders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify(data),
        });
        const json = (await res.json()) as { folder?: ServerFolderRow; error?: string };
        if (!res.ok || !json.folder) {
          showToast(json.error || 'Failed to create playlist.');
          return null;
        }
        const created: FolderItem = {
          id: json.folder.id,
          title: json.folder.title,
          category: normalizeCategoryName(json.folder.category),
          thumbnail: json.folder.thumbnail || '',
        };
        setFolders((prev) => [created, ...prev]);
        showToast(`Playlist "${created.title}" created.`);
        return created;
      } catch {
        showToast('Network error while creating playlist.');
        return null;
      }
    },
    [authToken, showToast]
  );

  const handleAddVideo = useCallback(
    async (data: {
      youtubeId: string;
      title: string;
      category: VideoCategory;
      folderId: string;
      duration: string;
    }): Promise<boolean> => {
      try {
        const res = await fetch('/api/videos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify(data),
        });
        const json = (await res.json()) as { video?: ServerVideoRow; error?: string };
        if (!res.ok || !json.video) {
          showToast(json.error || 'Failed to publish video.');
          return false;
        }
        const created: VideoItem = {
          id: json.video.id,
          youtubeId: json.video.youtube_id || data.youtubeId,
          title: json.video.title,
          category: normalizeCategoryName(json.video.category),
          folderId: json.video.folder_id ?? data.folderId,
          duration: sanitizeRealDuration(json.video.duration || data.duration),
          views: json.video.views || 'New',
        };
        setVideos((prev) => [created, ...prev]);
        if (created.folderId) {
          setFolders((prev) =>
            prev.map((f) =>
              f.id === created.folderId && !f.thumbnail
                ? {
                    ...f,
                    thumbnail: `https://i.ytimg.com/vi/${encodeURIComponent(
                      created.youtubeId
                    )}/hqdefault.jpg`,
                  }
                : f
            )
          );
        }
        void triggerVideoReleaseNotification({
          videoId: created.id,
          youtubeId: created.youtubeId,
          title: created.title,
          category: created.category,
        });
        showToast(`Published "${created.title}".`);
        return true;
      } catch {
        showToast('Network error while publishing video.');
        return false;
      }
    },
    [authToken, showToast]
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      try {
        await fetch(`/api/folders/${encodeURIComponent(folderId)}`, {
          method: 'DELETE',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
      } catch {
        // Proceed with local removal
      }
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      setVideos((prev) => prev.map((v) => (v.folderId === folderId ? { ...v, folderId: '' } : v)));
      setSubscribedFolderIds((prev) => prev.filter((id) => id !== folderId));
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
      showToast('Playlist deleted.');
    },
    [authToken, selectedFolderId, showToast]
  );

  const handleDeleteVideo = useCallback(
    async (videoId: string) => {
      try {
        await fetch(`/api/videos/${encodeURIComponent(videoId)}`, {
          method: 'DELETE',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
      } catch {
        // Proceed with local removal
      }
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
      if (currentPlayingVideoId === videoId) {
        setCurrentPlayingVideoId(null);
      }
      showToast('Video removed.');
    },
    [authToken, currentPlayingVideoId, showToast]
  );

  const handleSaveAdConfig = useCallback(
    async (nextConfig: AdConfig): Promise<boolean> => {
      try {
        const res = await fetch('/api/ads', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify(nextConfig),
        });
        if (!res.ok) {
          showToast('Failed to save ad configuration.');
          return false;
        }
        setAdConfig(nextConfig);
        showToast('Ad Network snippets saved.');
        return true;
      } catch {
        setAdConfig(nextConfig);
        showToast('Ad Network snippets saved locally.');
        return true;
      }
    },
    [authToken, showToast]
  );

  const handleExportJson = useCallback(() => {
    const payload = {
      folders,
      videos,
      subscribedFolderIds,
      adConfig,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `filmdrama-box-backup-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Backup JSON exported.');
  }, [adConfig, folders, showToast, subscribedFolderIds, videos]);

  const handleImportJson = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(String(reader.result || '{}')) as Partial<PersistedFallbackState>;
          if (Array.isArray(imported.folders) && Array.isArray(imported.videos)) {
            setFolders(
              imported.folders.map((f) => ({
                ...f,
                category: normalizeCategoryName(f.category),
              }))
            );
            setVideos(
              imported.videos.map((v) => ({
                ...v,
                category: normalizeCategoryName(v.category),
              }))
            );
            if (Array.isArray(imported.subscribedFolderIds)) {
              setSubscribedFolderIds(imported.subscribedFolderIds);
            }
            if (imported.adConfig) {
              setAdConfig({
                topCode: String(imported.adConfig.topCode || ''),
                feedCode: String(imported.adConfig.feedCode || ''),
                bottomCode: String(imported.adConfig.bottomCode || ''),
              });
            }
            showToast('Backup JSON restored.');
          } else {
            showToast('Invalid backup JSON file.');
          }
        } catch {
          showToast('Could not parse backup file.');
        }
      };
      reader.readAsText(file);
    },
    [showToast]
  );

  const handleClearWatchHistory = useCallback(() => {
    setWatchHistoryIds([]);
    showToast('Watch history cleared.');
  }, [showToast]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const folderVideos = useMemo(() => {
    if (!activeFolder) return [];
    return videos.filter(
      (v) => v.folderId === activeFolder.id && v.id !== currentPlayingVideoId
    );
  }, [activeFolder, currentPlayingVideoId, videos]);

  const feedVideos = useMemo(() => {
    return videos.filter((video) => {
      if (currentPlayingVideoId && video.id === currentPlayingVideoId) return false;
      const catMatch = categoryFilter === 'All' || video.category === categoryFilter;
      if (!catMatch) return false;
      if (!normalizedQuery) return true;
      const folder = video.folderId ? folderMap.get(video.folderId) : undefined;
      return (
        video.title.toLowerCase().includes(normalizedQuery) ||
        video.category.toLowerCase().includes(normalizedQuery) ||
        (folder ? folder.title.toLowerCase().includes(normalizedQuery) : false)
      );
    });
  }, [categoryFilter, currentPlayingVideoId, folderMap, normalizedQuery, videos]);

  const showCategoryBar = mainView === 'home' && !activeFolder;
  const isPlayingVideo = Boolean(currentPlayingVideo);
  const homeCategories: HomeCategoryFilter[] = ['All', 'Film', 'Drama', 'Story'];

  return (
    <div
      className={
        isPlayingVideo
          ? 'bg-[#0f0f0f] text-[#f1f1f1] h-[100dvh] w-full flex flex-col overflow-hidden'
          : 'bg-[#0f0f0f] text-[#f1f1f1] min-h-screen w-full pb-28'
      }
    >
      <Header
        showCategoryBar={showCategoryBar}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        onHomeClick={handleHomeClick}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isSearchOpen={isSearchOpen}
        onToggleSearch={() => setIsSearchOpen((prev) => !prev)}
        onOpenProfileModal={() => {
          setProfileAuthError(null);
          setIsProfileModalOpen(true);
        }}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        topAdCode={adConfig.topCode}
        topAdState={adState.top}
        onCloseTopAd={() => hideAdForCooldown('top')}
        onRestoreTopAd={() => restoreAdNow('top')}
        isPlayingVideo={isPlayingVideo}
      />

      <VideoPlayerSection
        video={currentPlayingVideo}
        autoplayNext={publicSettings.autoplayNext}
        playerContainerRef={playerContainerRef}
        onNextEpisode={handleNextEpisode}
        onDurationDetected={handleDurationDetected}
      />

      <main
        ref={feedScrollRef}
        className={
          isPlayingVideo
            ? 'w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain pb-28 m-0 p-0'
            : 'w-full m-0 p-0'
        }
      >
        {/* Scrollable Video Title, Like/Save/Share Actions & Details directly below anchored player */}
        {currentPlayingVideo && (
          <VideoInfoSection
            video={currentPlayingVideo}
            folder={currentVideoFolder}
            isSubscribed={
              currentVideoFolder ? subscribedFolderIds.includes(currentVideoFolder.id) : false
            }
            isLiked={likedVideoIds.includes(currentPlayingVideo.id)}
            isSaved={savedVideoIds.includes(currentPlayingVideo.id)}
            onClose={handleClosePlayer}
            onJumpToFolder={handleJumpToFolder}
            onToggleSubscribe={toggleFolderSubscription}
            onToggleLike={toggleLikeVideo}
            onToggleSave={toggleSaveVideo}
            onShare={handleShareVideo}
            onFullscreen={handlePlayerFullscreen}
            onNextEpisode={handleNextEpisode}
          />
        )}

        {/* Search & Category tabs inside scrollable feed while active video stays anchored above */}
        {isPlayingVideo && (isSearchOpen || showCategoryBar) && (
          <div className="w-full bg-[#0f0f0f] border-b border-[#272727]">
            {isSearchOpen && (
              <div className="w-full px-3 py-2 bg-[#141414] border-b border-[#272727]">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search films, dramas, stories or playlists..."
                    aria-label="Search films, dramas, stories or playlists"
                    className="w-full bg-[#0f0f0f] border border-[#272727] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#ff0033]"
                  />
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="px-3 py-2 bg-[#222222] hover:bg-[#2b2b2b] text-xs font-medium text-gray-200 shrink-0 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {showCategoryBar && (
              <div
                role="tablist"
                aria-label="Home video categories"
                className="w-full px-3 py-2 bg-[#0f0f0f] flex items-center gap-2 overflow-x-auto no-scrollbar"
              >
                {homeCategories.map((cat) => {
                  const isActive = categoryFilter === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3.5 py-1.5 text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-white text-black'
                          : 'bg-[#222222] text-gray-200 hover:bg-[#2d2d2d]'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Active Playlist / Folder Header */}
        {activeFolder && (
          <div className="w-full px-3 py-3 bg-[#141414] border-b border-[#272727]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(null)}
                  className="text-xs font-bold text-amber-400 hover:underline mb-1 inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>&larr; Back to Inbox</span>
                </button>
                <h2 className="text-base font-extrabold text-white truncate">{activeFolder.title}</h2>
                <p className="text-xs text-gray-400">
                  {activeFolder.category} &bull; {folderVideos.length} Video
                  {folderVideos.length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleFolderSubscription(activeFolder.id)}
                className={`px-3.5 py-1.5 text-xs shrink-0 transition-colors cursor-pointer ${
                  subscribedFolderIds.includes(activeFolder.id)
                    ? 'bg-[#222222] border border-[#272727] text-gray-200 font-bold hover:bg-[#2d2d2d]'
                    : 'bg-white hover:bg-gray-200 text-black font-extrabold'
                }`}
              >
                {subscribedFolderIds.includes(activeFolder.id) ? 'Subscribed ✓' : 'Subscribe'}
              </button>
            </div>
          </div>
        )}

        {/* VIEW 1: Inside a specific playlist/folder */}
        {activeFolder ? (
          folderVideos.length === 0 ? (
            <div className="w-full px-4 py-12 text-center text-sm text-gray-400">
              {currentPlayingVideo && currentPlayingVideo.folderId === activeFolder.id
                ? 'This episode is currently playing above.'
                : 'No episodes published to this playlist yet.'}
            </div>
          ) : (
            folderVideos.map((v, idx) => (
              <React.Fragment key={v.id}>
                <VideoCard
                  video={v}
                  folder={activeFolder}
                  isSubscribed={subscribedFolderIds.includes(activeFolder.id)}
                  isCurrentlyPlaying={currentPlayingVideoId === v.id}
                  isWatched={watchHistoryIds.includes(v.id)}
                  dataSaverMode={publicSettings.dataSaverMode}
                  onPlay={handlePlayVideo}
                  onToggleSubscribe={toggleFolderSubscription}
                />
                {shouldShowSpacedFeedAd(idx) && (
                  <InFeedBannerSlot
                    slotNumber={idx + 1}
                    feedAdCode={adConfig.feedCode}
                    feedAdState={adState.feed}
                    onCloseFeedAd={() => hideAdForCooldown('feed')}
                    onRestoreFeedAd={() => restoreAdNow('feed')}
                  />
                )}
              </React.Fragment>
            ))
          )
        ) : mainView === 'inbox' ? (
          /* VIEW 2: Inbox (Subscribed Episodes + All Playlists/Folders) */
          <FoldersView
            folders={folders}
            videos={videos}
            subscribedFolderIds={subscribedFolderIds}
            watchHistoryIds={watchHistoryIds}
            dataSaverMode={publicSettings.dataSaverMode}
            currentPlayingVideoId={currentPlayingVideoId}
            searchQuery={searchQuery}
            onOpenFolder={(folderId) => setSelectedFolderId(folderId)}
            onPlayVideo={handlePlayVideo}
            onToggleSubscribe={toggleFolderSubscription}
            feedAdCode={adConfig.feedCode}
            feedAdState={adState.feed}
            onCloseFeedAd={() => hideAdForCooldown('feed')}
            onRestoreFeedAd={() => restoreAdNow('feed')}
          />
        ) : /* VIEW 3: Home Feed (All / Film / Drama / Story) */
        feedVideos.length === 0 ? (
          <div className="w-full px-4 py-16 text-center space-y-2">
            <p className="text-sm font-bold text-white">
              {videos.length === 0
                ? 'No videos published yet'
                : currentPlayingVideo && videos.length === 1
                ? 'Now playing above'
                : 'No matching videos'}
            </p>
            <p className="text-xs text-gray-400 max-w-xs mx-auto">
              {videos.length === 0
                ? 'Published films, dramas, and stories will appear here.'
                : currentPlayingVideo && videos.length === 1
                ? 'Other published films, dramas, and stories will appear below.'
                : 'Try clearing your search filter or selecting another category.'}
            </p>
          </div>
        ) : (
          feedVideos.map((video, idx) => {
            const folder = video.folderId ? folderMap.get(video.folderId) : undefined;
            return (
              <React.Fragment key={video.id}>
                <VideoCard
                  video={video}
                  folder={folder}
                  isSubscribed={folder ? subscribedFolderIds.includes(folder.id) : false}
                  isCurrentlyPlaying={currentPlayingVideoId === video.id}
                  isWatched={watchHistoryIds.includes(video.id)}
                  dataSaverMode={publicSettings.dataSaverMode}
                  onPlay={handlePlayVideo}
                  onToggleSubscribe={toggleFolderSubscription}
                />
                {shouldShowSpacedFeedAd(idx) && (
                  <InFeedBannerSlot
                    slotNumber={idx + 1}
                    feedAdCode={adConfig.feedCode}
                    feedAdState={adState.feed}
                    onCloseFeedAd={() => hideAdForCooldown('feed')}
                    onRestoreFeedAd={() => restoreAdNow('feed')}
                  />
                )}
              </React.Fragment>
            );
          })
        )}
      </main>

      {/* AD_SLOT_BOTTOM_SAFE: Only rendered while video plays AND bottomCode is configured */}
      <BottomSafeAdBanner
        visible={Boolean(currentPlayingVideo)}
        bottomAdCode={adConfig.bottomCode}
        bottomSafeState={adState.bottomSafe}
        onCloseBottomSafeAd={() => hideAdForCooldown('bottomSafe')}
        onRestoreBottomSafeAd={() => restoreAdNow('bottomSafe')}
      />

      {/* FIXED 2-ICON BOTTOM BAR ("Home" & "Inbox") */}
      <BottomNav
        activeView={mainView}
        subscribedCount={subscribedFolderIds.length}
        inboxAlerts={publicSettings.inboxAlerts}
        onSelectView={handleSelectBottomView}
      />

      <ProfileModal
        isOpen={isProfileModalOpen}
        userProfile={userProfile}
        adminUnlocked={adminUnlocked}
        isSubmitting={profileAuthSubmitting}
        errorMsg={profileAuthError}
        onClose={() => setIsProfileModalOpen(false)}
        onAuthenticate={handleAuthenticateProfile}
        onSignOut={handleSignOut}
        onOpenAdminPanel={() => setIsAdminStudioOpen(true)}
      />

      <PublicSettingsModal
        isOpen={isSettingsModalOpen}
        settings={publicSettings}
        watchHistoryCount={watchHistoryIds.length}
        onClose={() => setIsSettingsModalOpen(false)}
        onUpdateSettings={setPublicSettings}
        onClearWatchHistory={handleClearWatchHistory}
        onNotify={showToast}
      />

      {adminUnlocked && (
        <AdminStudioModal
          isOpen={isAdminStudioOpen}
          supabaseConnected={supabaseConnected}
          authToken={authToken}
          folders={folders}
          videos={videos}
          adConfig={adConfig}
          onClose={() => setIsAdminStudioOpen(false)}
          onCreateFolder={handleCreateFolder}
          onAddVideo={handleAddVideo}
          onDeleteFolder={handleDeleteFolder}
          onDeleteVideo={handleDeleteVideo}
          onSaveAdConfig={handleSaveAdConfig}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
          onNotify={showToast}
        />
      )}

      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[#181818] border border-amber-400/60 text-xs font-bold text-white shadow-xl whitespace-nowrap animate-fade-in"
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default App;
