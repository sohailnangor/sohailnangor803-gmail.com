export type VideoCategory = 'Film' | 'Drama' | 'Story';

export type MainView = 'home' | 'inbox';

export type HomeCategoryFilter = 'All' | VideoCategory;

export interface FolderItem {
  id: string;
  title: string;
  category: VideoCategory;
  thumbnail: string;
}

export interface VideoItem {
  id: string;
  youtubeId: string;
  title: string;
  category: VideoCategory;
  folderId: string;
  duration: string;
  views?: string;
  uploadedAt?: string;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  subscribedFolders: string[];
}

export interface AdConfig {
  topCode: string;
  feedCode: string;
  bottomCode: string;
}

export interface AdSlotState {
  index: number;
  remaining: number;
  cooldown: number;
}

export type AdSlotKey = 'top' | 'feed' | 'bottomSafe';

export interface PublicSettings {
  autoplayNext: boolean;
  dataSaverMode: boolean;
  inboxAlerts: boolean;
}
