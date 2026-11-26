import React, { useMemo } from 'react';
import { buildSandboxedAdSrcDoc, parseAdSnippets } from '../data/defaults';
import type { AdSlotState } from '../types/video';

interface InFeedBannerSlotProps {
  slotNumber: number;
  feedAdCode: string;
  feedAdState: AdSlotState;
  onCloseFeedAd: () => void;
  onRestoreFeedAd: () => void;
}

export const InFeedBannerSlot: React.FC<InFeedBannerSlotProps> = ({
  slotNumber,
  feedAdCode,
  feedAdState,
  onCloseFeedAd,
  onRestoreFeedAd,
}) => {
  const snippets = useMemo(() => parseAdSnippets(feedAdCode), [feedAdCode]);

  if (snippets.length === 0) return null;

  const activeSnippet = snippets[(feedAdState.index + slotNumber) % snippets.length];
  const srcDoc = buildSandboxedAdSrcDoc(activeSnippet);
  const isCoolingDown = feedAdState.cooldown > 0;

  return (
    <div
      className="w-full bg-[#141414] border-b border-[#272727]"
      data-feed-slot={slotNumber}
    >
      {!isCoolingDown ? (
        <div className="w-full">
          <div className="w-full px-3 py-1.5 flex items-center justify-between text-[11px] text-gray-400 bg-[#121212] border-b border-[#272727]">
            <span className="uppercase tracking-wider font-semibold text-gray-300">Sponsored</span>
            <div className="flex items-center gap-2">
              <span className="font-mono tabular-nums">{feedAdState.remaining}s</span>
              <button
                type="button"
                onClick={onCloseFeedAd}
                className="w-6 h-6 bg-[#222222] hover:bg-[#303030] text-gray-300 text-xs font-bold flex items-center justify-center cursor-pointer"
                title="Hide banner for 60 seconds"
                aria-label="Hide feed banner"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Larger video-proportioned edge-to-edge slot (16:9) */}
          <div className="yt-aspect w-full bg-[#181818]">
            <iframe
              key={`feed-ad-${slotNumber}-${feedAdState.index}-${activeSnippet.length}`}
              title={`Sponsored feed placement ${slotNumber}`}
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      ) : (
        <div className="w-full px-3 py-2 flex items-center justify-between text-[11px] text-gray-400 bg-[#121212]">
          <span>
            Sponsored slot hidden &mdash; returning in{' '}
            <strong className="text-gray-200 tabular-nums">{feedAdState.cooldown}s</strong>
          </span>
          <button
            type="button"
            onClick={onRestoreFeedAd}
            className="text-amber-400 font-semibold hover:underline cursor-pointer"
          >
            Show Now
          </button>
        </div>
      )}
    </div>
  );
};
