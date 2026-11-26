import React, { useEffect, useMemo, useRef } from 'react';
import { buildSandboxedAdSrcDoc, parseAdSnippets } from '../data/defaults';
import type { AdSlotState, HomeCategoryFilter } from '../types/video';

interface HeaderProps {
  showCategoryBar: boolean;
  categoryFilter: HomeCategoryFilter;
  onCategoryChange: (cat: HomeCategoryFilter) => void;
  onHomeClick: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  isSearchOpen: boolean;
  onToggleSearch: () => void;
  onOpenProfileModal: () => void;
  onOpenSettingsModal: () => void;
  topAdCode: string;
  topAdState: AdSlotState;
  onCloseTopAd: () => void;
  onRestoreTopAd: () => void;
  isPlayingVideo: boolean;
}

const HOME_CATEGORIES: HomeCategoryFilter[] = ['All', 'Film', 'Drama', 'Story'];

export const Header: React.FC<HeaderProps> = ({
  showCategoryBar,
  categoryFilter,
  onCategoryChange,
  onHomeClick,
  searchQuery,
  onSearchChange,
  isSearchOpen,
  onToggleSearch,
  onOpenProfileModal,
  onOpenSettingsModal,
  topAdCode,
  topAdState,
  onCloseTopAd,
  onRestoreTopAd,
  isPlayingVideo,
}) => {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isSearchOpen) {
      const id = window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 40);
      return () => window.clearTimeout(id);
    }
  }, [isSearchOpen]);

  const snippets = useMemo(() => parseAdSnippets(topAdCode), [topAdCode]);
  const hasTopAd = snippets.length > 0;
  const activeSnippet = hasTopAd ? snippets[topAdState.index % snippets.length] : '';
  const srcDoc = useMemo(
    () => (activeSnippet ? buildSandboxedAdSrcDoc(activeSnippet) : ''),
    [activeSnippet]
  );

  const subHeaderDrawer = (
    <>
      {isSearchOpen && (
        <div className="w-full px-3 py-2 bg-[#141414] border-t border-[#272727]">
          <div className="flex items-center gap-2">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search films, dramas, stories or playlists..."
              aria-label="Search films, dramas, stories or playlists"
              className="w-full bg-[#0f0f0f] border border-[#272727] px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#ff0033]"
            />
            <button
              type="button"
              onClick={() => onSearchChange('')}
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
          className="w-full px-3 py-2 bg-[#0f0f0f] border-t border-[#272727] flex items-center gap-2 overflow-x-auto no-scrollbar"
        >
          {HOME_CATEGORIES.map((cat) => {
            const isActive = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onCategoryChange(cat)}
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
    </>
  );

  return (
    <>
      {/* AD_SLOT_TOP: Only rendered when live ad code is configured */}
      {hasTopAd && (
        <div className="shrink-0 w-full bg-[#141414] border-b border-[#272727] px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
          {topAdState.cooldown <= 0 ? (
            <>
              <div className="flex-1 min-h-[36px] flex items-center justify-between gap-2 overflow-hidden">
                <iframe
                  key={`top-ad-${topAdState.index}-${activeSnippet.length}`}
                  title="Sponsored top banner"
                  srcDoc={srcDoc}
                  sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                  className="w-full h-[36px] border-0 bg-transparent overflow-hidden"
                />
                <span className="text-[10px] font-mono text-gray-400 tabular-nums shrink-0">
                  {topAdState.remaining}s
                </span>
              </div>
              <button
                type="button"
                onClick={onCloseTopAd}
                aria-label="Close top ad"
                title="Hide banner for 60 seconds"
                className="text-gray-400 hover:text-white px-1.5 py-0.5 text-sm leading-none shrink-0 cursor-pointer"
              >
                &times;
              </button>
            </>
          ) : (
            <div className="flex-1 min-h-[26px] flex items-center justify-between gap-2 text-[11px] text-gray-400">
              <span>
                Banner hidden &mdash; returning in{' '}
                <strong className="text-gray-200 tabular-nums">{topAdState.cooldown}s</strong>
              </span>
              <button
                type="button"
                onClick={onRestoreTopAd}
                className="text-amber-400 font-semibold hover:underline cursor-pointer"
              >
                Show Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* TOP HEADER BAR (Search, Profile, Public Settings) */}
      <header className="shrink-0 sticky top-0 z-30 w-full bg-[#0f0f0f]/95 backdrop-blur border-b border-[#272727]">
        <div className="w-full px-3 h-12 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onHomeClick}
            className="flex items-center gap-2 text-left shrink-0 cursor-pointer focus:outline-none"
          >
            <span className="inline-flex items-center justify-center w-7 h-7 bg-[#ff0033] text-white font-bold text-xs">
              &#9654;
            </span>
            <span className="font-display font-bold tracking-tight text-sm sm:text-base text-white">
              FilmDrama Box
            </span>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleSearch}
              aria-label="Search"
              className={`w-9 h-9 flex items-center justify-center transition-colors cursor-pointer ${
                isSearchOpen ? 'bg-[#272727] text-white' : 'text-gray-200 hover:bg-[#222222]'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onOpenProfileModal}
              aria-label="Profile"
              title="Profile"
              className="w-9 h-9 flex items-center justify-center bg-[#1c1c1c] border border-[#272727] hover:bg-[#262626] text-gray-200 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M20 21a8 8 0 0 0-16 0" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onOpenSettingsModal}
              aria-label="Settings"
              title="Settings"
              className="w-9 h-9 flex items-center justify-center text-gray-200 hover:bg-[#222222] transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

        {!isPlayingVideo && subHeaderDrawer}
      </header>
    </>
  );
};
