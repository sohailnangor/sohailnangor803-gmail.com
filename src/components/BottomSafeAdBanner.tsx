import React, { useMemo } from 'react';
import { buildSandboxedAdSrcDoc, parseAdSnippets } from '../data/defaults';
import type { AdSlotState } from '../types/video';

interface BottomSafeAdBannerProps {
  visible: boolean;
  bottomAdCode: string;
  bottomSafeState: AdSlotState;
  onCloseBottomSafeAd: () => void;
  onRestoreBottomSafeAd: () => void;
}

export const BottomSafeAdBanner: React.FC<BottomSafeAdBannerProps> = ({
  visible,
  bottomAdCode,
  bottomSafeState,
  onCloseBottomSafeAd,
  onRestoreBottomSafeAd,
}) => {
  const snippets = useMemo(() => parseAdSnippets(bottomAdCode), [bottomAdCode]);

  if (!visible || snippets.length === 0) return null;

  const activeSnippet = snippets[bottomSafeState.index % snippets.length];
  const srcDoc = buildSandboxedAdSrcDoc(activeSnippet);
  const isCoolingDown = bottomSafeState.cooldown > 0;

  return (
    <div className="fixed left-0 right-0 z-30 safe-bottom-ad px-2 pointer-events-none">
      <div className="w-full max-w-2xl mx-auto pointer-events-auto bg-[#181818]/95 backdrop-blur-md border border-[#272727] shadow-2xl overflow-hidden">
        {!isCoolingDown ? (
          <div className="w-full h-[50px] px-2 flex items-center justify-between gap-2">
            <iframe
              key={`bottom-ad-${bottomSafeState.index}-${activeSnippet.length}`}
              title="Sponsored bottom playback banner"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
              className="flex-1 h-[44px] border-0 bg-transparent overflow-hidden"
            />

            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className="text-[10px] font-semibold text-gray-400 tabular-nums font-mono"
                title="Rotates every 30s"
              >
                {bottomSafeState.remaining}s
              </span>
              <button
                type="button"
                onClick={onCloseBottomSafeAd}
                className="w-6 h-6 bg-[#222222] hover:bg-[#303030] text-gray-300 text-xs font-bold flex items-center justify-center cursor-pointer"
                title="Hide banner for 60 seconds"
                aria-label="Close bottom banner"
              >
                &times;
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full h-[28px] px-3 flex items-center justify-between text-[10px] text-gray-400 bg-[#121212]">
            <span>
              Playback banner hidden &mdash; resuming in{' '}
              <strong className="text-white tabular-nums">{bottomSafeState.cooldown}s</strong>
            </span>
            <button
              type="button"
              onClick={onRestoreBottomSafeAd}
              className="text-amber-400 font-semibold hover:underline cursor-pointer"
            >
              Show Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
