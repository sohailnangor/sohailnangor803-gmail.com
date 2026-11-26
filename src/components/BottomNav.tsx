import React from 'react';
import type { MainView } from '../types/video';

interface BottomNavProps {
  activeView: MainView;
  subscribedCount: number;
  inboxAlerts: boolean;
  onSelectView: (view: MainView) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeView,
  subscribedCount,
  inboxAlerts,
  onSelectView,
}) => {
  return (
    <nav
      aria-label="Primary bottom navigation"
      className="fixed bottom-0 left-0 right-0 z-30 h-16 bg-[#0f0f0f]/95 backdrop-blur border-t border-[#272727] grid grid-cols-2 pb-[env(safe-area-inset-bottom,0px)]"
    >
      <button
        type="button"
        onClick={() => onSelectView('home')}
        className={`flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors cursor-pointer ${
          activeView === 'home' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
        }`}
      >
        <svg
          className="w-5 h-5"
          fill={activeView === 'home' ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z"
          />
        </svg>
        <span>Home</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectView('inbox')}
        className={`relative flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors cursor-pointer ${
          activeView === 'inbox' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
        }`}
      >
        <div className="relative">
          <svg
            className="w-5 h-5"
            fill={activeView === 'inbox' ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 10h16M6 14h12l-1.5 6h-9L6 14z"
            />
          </svg>
          {inboxAlerts && subscribedCount > 0 && (
            <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 bg-[#ff0033] text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums">
              {subscribedCount}
            </span>
          )}
        </div>
        <span>Inbox</span>
      </button>
    </nav>
  );
};
