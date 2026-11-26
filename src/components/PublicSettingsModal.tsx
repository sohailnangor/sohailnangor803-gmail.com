import React, { useEffect, useState } from 'react';
import {
  getBrowserNotificationPermission,
  requestAndSubscribeNotifications,
  unsubscribeNotifications,
  type BrowserNotificationPermission,
} from '../utils/notifications';
import { PWAInstallButton } from './PWAInstallButton';
import type { PublicSettings } from '../types/video';

interface PublicSettingsModalProps {
  isOpen: boolean;
  settings: PublicSettings;
  watchHistoryCount: number;
  onClose: () => void;
  onUpdateSettings: (next: PublicSettings) => void;
  onClearWatchHistory: () => void;
  onNotify?: (msg: string) => void;
}

export const PublicSettingsModal: React.FC<PublicSettingsModalProps> = ({
  isOpen,
  settings,
  watchHistoryCount,
  onClose,
  onUpdateSettings,
  onClearWatchHistory,
  onNotify,
}) => {
  const [notifPermission, setNotifPermission] = useState<BrowserNotificationPermission>(() =>
    getBrowserNotificationPermission()
  );
  const [isUpdatingNotif, setIsUpdatingNotif] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNotifPermission(getBrowserNotificationPermission());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleEnableNotifications = async () => {
    setIsUpdatingNotif(true);
    try {
      const result = await requestAndSubscribeNotifications();
      setNotifPermission(result.permission);
      if (result.permission === 'granted') {
        onNotify?.('Push notifications enabled for new films & dramas!');
      } else if (result.permission === 'denied') {
        onNotify?.('Notifications are blocked in your browser settings.');
      } else if (result.permission === 'unsupported') {
        onNotify?.('This browser does not support notifications.');
      }
    } finally {
      setIsUpdatingNotif(false);
    }
  };

  const handleDisableNotifications = async () => {
    setIsUpdatingNotif(true);
    try {
      await unsubscribeNotifications();
      onNotify?.('Push subscription removed from this device.');
    } finally {
      setIsUpdatingNotif(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-settings-title"
    >
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-[#181818] border border-[#272727] shadow-2xl overflow-hidden animate-fade-in">
        <div className="px-4 py-3.5 border-b border-[#272727] flex items-center justify-between gap-2 shrink-0">
          <div>
            <h2 id="public-settings-title" className="text-sm font-bold text-white">
              Settings
            </h2>
            <p className="text-[11px] text-gray-400">
              Playback, data saver, notifications, and app install
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 bg-[#222222] hover:bg-[#2d2d2d] text-gray-300 flex items-center justify-center font-bold cursor-pointer"
            aria-label="Close settings"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <label className="flex items-center justify-between gap-3 p-3 bg-[#0f0f0f] border border-[#272727] cursor-pointer">
            <div>
              <p className="text-xs font-bold text-white">Autoplay Next Episode</p>
              <p className="text-[11px] text-gray-400">
                Automatically start playback and queue the next episode
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.autoplayNext}
              onChange={(e) =>
                onUpdateSettings({ ...settings, autoplayNext: e.target.checked })
              }
              className="w-4 h-4 accent-[#ff0033] cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between gap-3 p-3 bg-[#0f0f0f] border border-[#272727] cursor-pointer">
            <div>
              <p className="text-xs font-bold text-white">Data Saver Mode</p>
              <p className="text-[11px] text-gray-400">
                Load lighter thumbnails to reduce mobile data usage
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.dataSaverMode}
              onChange={(e) =>
                onUpdateSettings({ ...settings, dataSaverMode: e.target.checked })
              }
              className="w-4 h-4 accent-[#ff0033] cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between gap-3 p-3 bg-[#0f0f0f] border border-[#272727] cursor-pointer">
            <div>
              <p className="text-xs font-bold text-white">Inbox Alerts</p>
              <p className="text-[11px] text-gray-400">
                Show unread subscription counts on the Inbox tab
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.inboxAlerts}
              onChange={(e) =>
                onUpdateSettings({ ...settings, inboxAlerts: e.target.checked })
              }
              className="w-4 h-4 accent-[#ff0033] cursor-pointer"
            />
          </label>

          {/* Instant Push Notifications with Film/Drama Thumbnail */}
          <div className="p-3 bg-[#0f0f0f] border border-[#272727] flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-white">Instant Release Push Alerts</p>
              <p className="text-[11px] text-gray-400">
                {notifPermission === 'granted'
                  ? 'Allowed — receive thumbnail alerts for new films & dramas'
                  : notifPermission === 'denied'
                  ? 'Blocked in browser settings — allow notifications to enable'
                  : notifPermission === 'unsupported'
                  ? 'Notifications are not supported in this browser'
                  : 'Get instant alerts with thumbnail when new videos are added'}
              </p>
            </div>
            {notifPermission === 'granted' ? (
              <button
                type="button"
                disabled={isUpdatingNotif}
                onClick={() => void handleDisableNotifications()}
                className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 text-xs font-bold shrink-0 cursor-pointer"
              >
                Allowed ✓
              </button>
            ) : (
              <button
                type="button"
                disabled={isUpdatingNotif || notifPermission === 'unsupported' || notifPermission === 'denied'}
                onClick={() => void handleEnableNotifications()}
                className="px-3 py-1.5 bg-[#ff0033] hover:bg-red-600 disabled:opacity-40 text-white text-xs font-bold shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                {isUpdatingNotif ? 'Enabling...' : 'Allow'}
              </button>
            )}
          </div>

          <PWAInstallButton />

          <div className="p-3 bg-[#0f0f0f] border border-[#272727] flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-white">Watch History</p>
              <p className="text-[11px] text-gray-400">
                {watchHistoryCount} watched video{watchHistoryCount === 1 ? '' : 's'} recorded on this device
              </p>
            </div>
            <button
              type="button"
              onClick={onClearWatchHistory}
              disabled={watchHistoryCount === 0}
              className="px-3 py-1.5 bg-[#222222] hover:bg-[#2c2c2c] disabled:opacity-40 text-gray-200 text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
            >
              Clear Watch History
            </button>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#ff0033] hover:bg-red-600 text-white text-xs font-bold cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
