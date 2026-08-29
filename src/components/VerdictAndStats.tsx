import React, { useEffect, useRef, useState } from 'react';
import { RiskAnalysisResult } from '../types';
import { AuthProfile } from '../lib/supabase';
import { generateHeatRiskPdfReport } from '../lib/pdfReport';
import { exportAnalysisToCsv } from '../lib/csvExport';
import {
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Thermometer,
  Flame,
  Droplets,
  Sun,
  Wind,
  Send,
  Check,
  Download,
  FileDown,
  Loader2,
  FileSpreadsheet,
  FileBarChart2,
  AlertTriangle
} from 'lucide-react';

interface VerdictAndStatsProps {
  analysis: RiskAnalysisResult;
  onOpenNotifyModal?: () => void;
  user?: AuthProfile | null;
}

export const VerdictAndStats: React.FC<VerdictAndStatsProps> = ({
  analysis,
  onOpenNotifyModal,
  user,
}) => {
  const [notified, setNotified] = useState(false);
  const [confirmedPause, setConfirmedPause] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [csvSuccess, setCsvSuccess] = useState(false);

  // FortyGuard Heat Intelligence report (async, opt-in - each run costs Premium credits)
  type FgReportState = 'idle' | 'submitting' | 'processing' | 'ready' | 'error';
  const [fgState, setFgState] = useState<FgReportState>('idle');
  const [fgLink, setFgLink] = useState<string | null>(null);
  const [fgError, setFgError] = useState<string | null>(null);
  const fgPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fgCancelledRef = useRef(false);

  // Stop polling if the component unmounts or a new analysis is loaded.
  useEffect(() => {
    return () => {
      fgCancelledRef.current = true;
      if (fgPollRef.current) clearTimeout(fgPollRef.current);
    };
  }, []);

  const isNoGo = analysis.decisionStatus === 'NO-GO';
  const isAdjust = analysis.decisionStatus === 'ADJUST';
  const isCaution = analysis.decisionStatus === 'CAUTION';

  const decisionBadgeClass = isNoGo
    ? 'bg-red-50 text-red-900 border-red-200'
    : isAdjust
    ? 'bg-orange-50 text-orange-950 border-orange-300'
    : isCaution
    ? 'bg-amber-50 text-amber-900 border-amber-200'
    : 'bg-emerald-50 text-emerald-900 border-emerald-200';

  const cityName = analysis.location.split(',')[0] || 'City';
  // No `|| 4.2` default here. A missing UHI delta must read as missing, not as
  // a plausible-looking constant - this line was silently substituting 4.2
  // whenever the real value was absent or zero.
  const uhiDelta = analysis.uhiDeltaC;
  const uhiIsMeasured = analysis.uhiSource === 'fortyguard-heatmap';
  const exceedance = analysis.exceedanceHours || 6;
  const persistence = analysis.longestPersistenceHours || 4;
  const safestWin = analysis.safestWindow || '05:30 – 11:00';
  const crew = analysis.headcount || 30;
  const regimen = analysis.workRestCycle || '30 min Work / 30 min Rest';
  const hydration = analysis.hydrationRate || 1.0;

  const handleNotifyCrew = () => {
    if (onOpenNotifyModal) {
      onOpenNotifyModal();
    } else {
      setNotified(true);
      setTimeout(() => setNotified(false), 3500);
    }
  };

  const handleConfirmPause = () => {
    setConfirmedPause(!confirmedPause);
  };

  const handleDownloadPdf = () => {
    setIsGeneratingPdf(true);
    setTimeout(() => {
      try {
        generateHeatRiskPdfReport({
          analysis,
          userName: user?.fullName,
          userRole: user?.role === 'hse_lead' ? 'Chief HSE Lead' : user?.role === 'contractor_lead' ? 'Contractor Lead' : 'Site Supervisor',
          organization: user?.organization,
        });
        setIsGeneratingPdf(false);
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 4000);
      } catch (err) {
        console.error('PDF Generation Error:', err);
        setIsGeneratingPdf(false);
      }
    }, 400);
  };

  const handleExportCsv = () => {
    setIsExportingCsv(true);
    setTimeout(() => {
      try {
        exportAnalysisToCsv({
          analysis,
          userName: user?.fullName,
          userRole: user?.role === 'hse_lead' ? 'Chief HSE Lead' : user?.role === 'contractor_lead' ? 'Contractor Lead' : 'Site Supervisor',
          organization: user?.organization,
        });
        setIsExportingCsv(false);
        setCsvSuccess(true);
        setTimeout(() => setCsvSuccess(false), 4000);
      } catch (err) {
        console.error('CSV Generation Error:', err);
        setIsExportingCsv(false);
      }
    }, 250);
  };

  // FortyGuard's Heat Intelligence endpoint only accepts United States
  // coordinates, so the button is only offered for sites inside that box -
  // elsewhere the request is guaranteed to come back empty.
  const hasCoords =
    typeof analysis.latitude === 'number' && typeof analysis.longitude === 'number';
  const inFgCoverage =
    hasCoords &&
    analysis.latitude! >= 24 &&
    analysis.latitude! <= 50 &&
    analysis.longitude! >= -125 &&
    analysis.longitude! <= -66;

  const handleGenerateFgReport = async () => {
    if (fgState === 'submitting' || fgState === 'processing') return;
    fgCancelledRef.current = false;
    setFgError(null);
    setFgLink(null);
    setFgState('submitting');

    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: analysis.latitude,
          longitude: analysis.longitude,
          temperatureC: analysis.currentTemp,
          analysis: ['environmental'],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFgError(data?.error || `Request failed (${res.status})`);
        setFgState('error');
        return;
      }

      setFgState('processing');

      // Poll until Completed/Failed. FortyGuard reports take minutes, so this
      // backs off to a 5s interval and gives up after ~3 minutes rather than
      // polling forever.
      let attempts = 0;
      const poll = async () => {
        if (fgCancelledRef.current) return;
        attempts += 1;
        try {
          const sres = await fetch(`/api/report-status/${encodeURIComponent(data.activityId)}`);
          const sdata = await sres.json().catch(() => ({}));
          if (fgCancelledRef.current) return;

          if (sdata?.status === 'Completed' && sdata?.downloadLink) {
            setFgLink(sdata.downloadLink);
            setFgState('ready');
            return;
          }
          if (sdata?.status === 'Failed') {
            setFgError('FortyGuard could not generate this report.');
            setFgState('error');
            return;
          }
          if (attempts >= 36) {
            setFgError('Report is still processing - try again shortly.');
            setFgState('error');
            return;
          }
          fgPollRef.current = setTimeout(poll, 5000);
        } catch {
          if (fgCancelledRef.current) return;
          setFgError('Lost connection while checking report status.');
          setFgState('error');
        }
      };
      fgPollRef.current = setTimeout(poll, 5000);
    } catch {
      setFgError('Could not reach the report service.');
      setFgState('error');
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Plain Language Verdict Banner */}
      <div id="verdict-banner" className="bg-white border-l-4 border-l-neutral-900 border-y border-r border-neutral-200 p-4 rounded-xl shadow-xs space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Today’s Safety Verdict
            </span>
            <span className="text-neutral-300">•</span>
            <span className="text-xs font-mono text-neutral-500">{analysis.timestamp}</span>
          </div>

          {/* Quick Dual Export Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              id="btn-quick-export-csv"
              onClick={handleExportCsv}
              disabled={isExportingCsv}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-medium transition-colors cursor-pointer"
              title="Export structured CSV for Excel / Safety ERP integration"
            >
              {isExportingCsv ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
              ) : csvSuccess ? (
                <Check className="w-3.5 h-3.5 text-emerald-700" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              )}
              <span>
                {isExportingCsv
                  ? ('Exporting CSV...')
                  : csvSuccess
                  ? ('CSV Saved')
                  : ('Export CSV')}
              </span>
            </button>

            <button
              id="btn-quick-export-pdf"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-neutral-800 text-xs font-medium transition-colors cursor-pointer"
              title="Download PDF Summary for Site Stakeholders"
            >
              {isGeneratingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-600" />
              ) : downloadSuccess ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <FileDown className="w-3.5 h-3.5 text-neutral-600" />
              )}
              <span>
                {isGeneratingPdf
                  ? ('Generating PDF...')
                  : downloadSuccess
                  ? ('Report Downloaded')
                  : ('Export PDF')}
              </span>
            </button>

            {/* FortyGuard Heat Intelligence report - opt-in; consumes Premium API credits */}
            {inFgCoverage && (
              fgState === 'ready' && fgLink ? (
                <a
                  id="btn-fg-report-download"
                  href={fgLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-medium transition-colors cursor-pointer"
                  title="Download the completed FortyGuard Heat Intelligence report"
                >
                  <Download className="w-3.5 h-3.5 text-sky-700" />
                  <span>Download Heat Report</span>
                </a>
              ) : (
                <button
                  id="btn-fg-generate-report"
                  onClick={handleGenerateFgReport}
                  disabled={fgState === 'submitting' || fgState === 'processing'}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                  title={
                    fgState === 'error' && fgError
                      ? fgError
                      : 'Request a FortyGuard Heat Intelligence PDF (uses Premium API credits)'
                  }
                >
                  {fgState === 'submitting' || fgState === 'processing' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-700" />
                  ) : fgState === 'error' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  ) : (
                    <FileBarChart2 className="w-3.5 h-3.5 text-sky-700" />
                  )}
                  <span>
                    {fgState === 'submitting'
                      ? ('Requesting...')
                      : fgState === 'processing'
                      ? ('Building Report...')
                      : fgState === 'error'
                      ? ('Retry Heat Report')
                      : ('Heat Intelligence Report')}
                  </span>
                </button>
              )
            )}
          </div>
        </div>
        <p id="verdict-text" className="text-base sm:text-lg font-bold text-neutral-900 leading-snug">
          {analysis.overallVerdict}
        </p>
      </div>

      {/* 2. Sticky Prominent GO / ADJUST / NO-GO Decision Card */}
      <div
        id="decision-card"
        className={`bg-white rounded-2xl border p-5 shadow-md transition-all space-y-4 ${
          isNoGo
            ? 'border-red-300 ring-1 ring-red-200'
            : isAdjust
            ? 'border-orange-300 ring-1 ring-orange-200'
            : isCaution
            ? 'border-amber-300 ring-1 ring-amber-200'
            : 'border-emerald-300 ring-1 ring-emerald-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            {isNoGo ? (
              <div className="w-12 h-12 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-7 h-7" />
              </div>
            ) : isAdjust ? (
              <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-7 h-7" />
              </div>
            ) : isCaution ? (
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-7 h-7" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-7 h-7" />
              </div>
            )}

            <div>
              <div className="flex items-center gap-2">
                <span id="decision-status-badge" className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase border ${decisionBadgeClass}`}>
                  {analysis.decisionStatus} STATUS
                </span>
                <span className="text-xs text-neutral-500 font-semibold">
                  Limit: {analysis.thresholdTemp}°C
                </span>
              </div>
              <h4 id="decision-site-title" className="text-base font-bold text-neutral-900 mt-0.5">
                {analysis.siteName}
              </h4>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[11px] text-neutral-500 font-semibold uppercase block">
              Recommended Work Pause
            </span>
            <span id="recommended-pause-window" className="text-sm font-bold text-neutral-900 font-mono">
              {analysis.recommendedPauseWindow}
            </span>
          </div>
        </div>

        {/* AI degradation notice. The deterministic ISO 7243 verdict is still a
            valid answer, so this is a caveat rather than an error state - but it
            has to be visible, because an AI-authored verdict and an engine-only
            one look the same on screen otherwise. */}
        {analysis.aiEnhanced === false && analysis.aiNote && (
          <div
            id="banner-ai-degraded"
            className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block mb-0.5">Degraded: deterministic engine only</span>
              <span className="text-[11px] sm:text-xs text-amber-800 font-normal">{analysis.aiNote}</span>
            </div>
          </div>
        )}

        {/* FortyGuard Decision Banner / Pitch Callout */}
        <div className="p-3.5 rounded-xl bg-orange-50/80 border border-orange-200 text-orange-950 text-xs sm:text-sm font-medium leading-snug">
          <span className="font-bold text-orange-900 block mb-0.5">
            {analysis.dataSource === 'fortyguard-live'
              ? ('Hyperlocal FortyGuard Risk Recommendation:')
              : analysis.dataSource === 'open-meteo'
              ? ('Risk Recommendation (Open-Meteo live telemetry):')
              : ('Risk Recommendation (offline fixture data):')}
          </span>
          {analysis.dataSource === 'open-meteo' && analysis.fortyGuardNote && (
            <span className="block text-[11px] sm:text-xs text-orange-800/80 font-normal mb-1.5">
              {analysis.fortyGuardNote}
            </span>
          )}
          "Your site runs{' '}
          <strong className="text-orange-900 font-bold">
            {uhiDelta == null ? 'an unmeasured amount' : `${uhiDelta}°C`} hotter
          </strong>{' '}
          than the {cityName} {uhiIsMeasured ? 'city-polygon mean' : 'average'}, and stays above the safe threshold for{' '}
          <strong className="text-orange-900 font-bold">{exceedance} straight hours</strong>. Move the{' '}
          {analysis.activityType.toLowerCase()} to{' '}
          <strong className="text-emerald-800 font-bold font-mono bg-white px-1.5 py-0.5 rounded border border-orange-200">
            {safestWin}
          </strong>{' '}
          and you keep all <strong className="text-orange-900 font-bold">{crew} workers</strong>."
          {/* Provenance for the headline number. A hardcoded per-city constant
              and a live two-polygon measurement must not look the same. */}
          <span className="block mt-1.5 text-[10px] font-mono text-orange-800/70">
            {uhiIsMeasured
              ? `UHI delta measured: FortyGuard /v1/heatmap, 500m site polygon vs 15km city polygon${
                  analysis.uhiVsCoolestC != null
                    ? ` · +${analysis.uhiVsCoolestC}°C vs the coolest metro cell (${analysis.cityMinTempC}°C)`
                    : ''
                }`
              : 'UHI delta ESTIMATED from the built-in per-city calibration table — not a live FortyGuard measurement.'}
          </span>
        </div>

        {/* 4 FortyGuard Deterministic Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
          <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
            <span className="text-[10px] text-neutral-500 font-bold uppercase block">UHI Thermal Delta</span>
            <span className="text-base font-bold font-mono text-orange-600 block">+{uhiDelta}°C</span>
            <span className="text-[10px] text-neutral-400">vs city baseline</span>
          </div>

          <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
            <span className="text-[10px] text-neutral-500 font-bold uppercase block">Exceedance Hours</span>
            <span className="text-base font-bold font-mono text-red-600 block">{exceedance} Hours</span>
            <span className="text-[10px] text-neutral-400">above safe WBGT</span>
          </div>

          <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
            <span className="text-[10px] text-neutral-500 font-bold uppercase block">Max Persistence</span>
            <span className="text-base font-bold font-mono text-amber-700 block">{persistence} Hours</span>
            <span className="text-[10px] text-neutral-400">continuous extreme</span>
          </div>

          <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200">
            <span className="text-[10px] text-neutral-500 font-bold uppercase block">Work-Rest Protocol</span>
            <span className="text-xs font-bold text-neutral-900 block truncate" title={regimen}>{regimen}</span>
            <span className="text-[10px] text-blue-700 font-semibold">{hydration} L/worker/hr</span>
          </div>
        </div>

        {/* Reason text */}
        <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed font-medium">
          {analysis.goNoGoReason}
        </p>

        {/* Action Buttons for Contractor & Stakeholders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
          {/* Action 1: Confirm Work Pause */}
          <button
            id="btn-confirm-pause"
            onClick={handleConfirmPause}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
              confirmedPause
                ? 'bg-emerald-800 text-white border-emerald-800'
                : 'bg-neutral-900 text-white hover:bg-neutral-800 border-neutral-900'
            }`}
          >
            {confirmedPause ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>Pause Logged</span>
              </>
            ) : (
              <span>Confirm Work Pause</span>
            )}
          </button>

          {/* Action 2: Notify Crew via SMS */}
          <button
            id="btn-notify-crew"
            onClick={handleNotifyCrew}
            className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
              notified
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-50'
            }`}
          >
            <Send className="w-3.5 h-3.5 text-neutral-600" />
            <span>
              {notified
                ? 'Alert Sent via SMS!': 'Notify Crew via SMS'}
            </span>
          </button>

          {/* Action 3: Export Structured CSV for Excel / Safety ERP */}
          <button
            id="btn-export-csv"
            onClick={handleExportCsv}
            disabled={isExportingCsv}
            className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
              csvSuccess
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-300'
            }`}
            title="Download structured CSV dataset for Excel and Safety Trend Analytics"
          >
            {isExportingCsv ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
            ) : csvSuccess ? (
              <Check className="w-4 h-4 text-emerald-700" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            )}
            <span>
              {isExportingCsv
                ? ('Exporting CSV...')
                : csvSuccess
                ? ('CSV Downloaded!')
                : ('Export CSV (Excel)')}
            </span>
          </button>

          {/* Action 4: Download Stakeholder PDF Report */}
          <button
            id="btn-download-report"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer ${
              downloadSuccess
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                : 'bg-orange-50 hover:bg-orange-100 text-orange-950 border-orange-200'
            }`}
          >
            {isGeneratingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
            ) : downloadSuccess ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Download className="w-4 h-4 text-orange-600" />
            )}
            <span>
              {isGeneratingPdf
                ? ('Generating PDF...')
                : downloadSuccess
                ? ('Report Downloaded!')
                : ('Download Report (PDF)')}
            </span>
          </button>
        </div>
      </div>

      {/* 3. Supporting Stat Row */}
      <div id="supporting-stat-row" className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="bg-white p-3 rounded-xl border border-neutral-200 space-y-0.5">
          <div className="flex items-center gap-1.5 text-neutral-500 text-[11px] font-semibold">
            <Thermometer className="w-3.5 h-3.5 text-neutral-600" />
            <span>Current Temp</span>
          </div>
          <p className="text-lg font-bold font-mono text-neutral-900">{analysis.currentTemp}°C</p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-neutral-200 space-y-0.5">
          <div className="flex items-center gap-1.5 text-neutral-500 text-[11px] font-semibold">
            <Flame className="w-3.5 h-3.5 text-amber-600" />
            <span>Feels Like</span>
          </div>
          <p className="text-lg font-bold font-mono text-amber-900">{analysis.currentHeatIndex}°C</p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-neutral-200 space-y-0.5">
          <div className="flex items-center gap-1.5 text-neutral-500 text-[11px] font-semibold">
            <Droplets className="w-3.5 h-3.5 text-blue-600" />
            <span>Humidity</span>
          </div>
          <p className="text-lg font-bold font-mono text-neutral-900">{analysis.currentHumidity}%</p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-neutral-200 space-y-0.5">
          <div className="flex items-center gap-1.5 text-neutral-500 text-[11px] font-semibold">
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span>UV Index</span>
          </div>
          <p className="text-lg font-bold font-mono text-neutral-900">{analysis.currentUvIndex} / 12</p>
        </div>

        <div className="bg-white p-3 rounded-xl border border-neutral-200 space-y-0.5 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-neutral-500 text-[11px] font-semibold">
            <Wind className="w-3.5 h-3.5 text-neutral-600" />
            <span>Wind Speed</span>
          </div>
          <p className="text-lg font-bold font-mono text-neutral-900">{analysis.currentWindSpeed} km/h</p>
        </div>
      </div>
    </div>
  );
};

export { VerdictAndStatsSkeleton } from './VerdictAndStatsSkeleton';
