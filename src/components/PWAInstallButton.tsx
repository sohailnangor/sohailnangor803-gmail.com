import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <div className="p-3 bg-[#0f0f0f] border border-[#272727] flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-white">Install FilmDrama Box App</p>
          <p className="text-[11px] text-gray-400">
            Add to your home screen for full-screen playback and instant alerts
          </p>
        </div>
        <button
          type="button"
          onClick={() => void install()}
          className="px-3 py-1.5 bg-[#ff0033] hover:bg-red-600 text-white text-xs font-bold shrink-0 cursor-pointer"
        >
          Install App
        </button>
      </div>
    );
  }

  if (isIOS) {
    return (
      <>
        <div className="p-3 bg-[#0f0f0f] border border-[#272727] flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-white">Install on iPhone / iPad</p>
            <p className="text-[11px] text-gray-400">
              Add to Home Screen for app mode and push notifications
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowIOSGuide(true)}
            className="px-3 py-1.5 bg-[#222222] hover:bg-[#2d2d2d] text-gray-200 text-xs font-bold shrink-0 cursor-pointer"
          >
            How to Install
          </button>
        </div>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-sm bg-[#181818] border border-[#272727] p-5 space-y-3 shadow-2xl">
              <h3 className="text-sm font-bold text-white">Install FilmDrama Box on iOS</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                1. Tap the <strong className="text-white">Share</strong> button in Safari&apos;s toolbar.
                <br />
                2. Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 bg-[#ff0033] hover:bg-red-600 text-white text-xs font-bold cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
