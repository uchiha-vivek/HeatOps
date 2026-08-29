import React from 'react';
import { WifiOff, RefreshCw, AlertOctagon, FileWarning, HelpCircle } from 'lucide-react';

interface EdgeCaseBannersProps {
  isOffline: boolean;
  onRetryConnection: () => void;
  isPartialData: boolean;
  isLowConfidence: boolean;
  hasSensorSpike?: boolean;
  // Real values for the spike banner. Previously the banner rendered a fixed
  // string ("+4.2°C at 12:30 PM (Roofing asphalt heat reflection)") regardless
  // of the site or trade actually selected, so a concrete-pouring assessment
  // displayed roofing text.
  spike?: {
    deltaC: number;
    hourLabel: string;
    activityType: string;
  } | null;
}

export const EdgeCaseBanners: React.FC<EdgeCaseBannersProps> = ({
  isOffline,
  onRetryConnection,
  isPartialData,
  isLowConfidence,
  hasSensorSpike = false,
  spike = null,
}) => {
  return (
    <div className="space-y-2">
      {/* 1. Offline / No Internet Connection Lost Banner */}
      {isOffline && (
        <div id="banner-offline" className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-3 shadow-2xs animate-fade-in">
          <div className="flex items-center gap-2.5">
            <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
            <div>
              <span className="font-bold block">
                Connection Lost — Showing Offline Cached Risk Data
              </span>
              <span className="text-[11px] text-amber-800">
                Last updated today at 07:15 AM. On-site decisions remain active.
              </span>
            </div>
          </div>

          <button
            id="btn-retry-offline"
            onClick={onRetryConnection}
            className="px-3 py-1.5 rounded-lg bg-amber-900 text-white font-semibold text-xs hover:bg-amber-800 transition-colors shrink-0 flex items-center gap-1 min-h-[36px]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* 2. Partial-Day / Stale Weather Data Banner */}
      {isPartialData && (
        <div id="banner-partial-data" className="p-3 rounded-xl bg-neutral-100 border border-neutral-300 text-neutral-800 text-xs flex items-center gap-2.5">
          <FileWarning className="w-4 h-4 text-neutral-600 shrink-0" />
          <div>
            <span className="font-bold">
              Partial Satellite Feed:
            </span>{' '}
            Live weather sensor feed interrupted after 1:00 PM. Afternoon hours marked UNKNOWN — verify locally.
          </div>
        </div>
      )}

      {/* 3. Low Confidence Model Warning */}
      {isLowConfidence && !isOffline && (
        <div id="banner-low-confidence" className="p-3 rounded-xl bg-neutral-900 text-white text-xs flex items-center gap-2.5">
          <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <span className="font-bold text-amber-300">
              High Meteorological Flux:
            </span>{' '}
            Model confidence moderate for afternoon windows. Increase on-site WBGT reading frequency.
          </div>
        </div>
      )}

      {/* 4. Extreme Sensor Spike Flag */}
      {hasSensorSpike && spike && (
        <div id="banner-sensor-spike" className="p-3 rounded-xl bg-red-100 border border-red-300 text-red-900 text-xs flex items-center gap-2.5">
          <AlertOctagon className="w-4 h-4 text-red-700 shrink-0" />
          <div>
            <span className="font-bold">
              Extreme Microclimate Thermal Spike Flagged
            </span>
            <p className="text-[11px] mt-0.5">
              Peak heat index runs +{spike.deltaC.toFixed(1)}°C over the configured limit at{' '}
              {spike.hourLabel} under {spike.activityType.toLowerCase()} metabolic load. Unaveraged for
              safety transparency.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
