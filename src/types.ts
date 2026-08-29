export type RiskLevel = 'safe' | 'caution' | 'high' | 'extreme' | 'unknown';

export type ActivityType = 
  | 'Excavation & Earthwork'
  | 'Concrete Pouring'
  | 'Material Loading/Unloading'
  | 'Roofing & Structural Steel'
  | 'Asphalt Paving'
  | 'General Masonry & Scaffolding';

export interface SiteConfig {
  id?: string;
  siteName: string;
  location: string;
  activityType: ActivityType;
  startTime: string; // e.g. "06:00"
  endTime: string;   // e.g. "18:00"
  thresholdTemp: number; // e.g. 35°C
  headcount?: number; // e.g. 30 workers
  acclimatized?: boolean;
  shadeAvailable?: boolean;
  waterAvailable?: boolean;
}

export interface HourlyRisk {
  hour: string;        // e.g., "11:00"
  hourLabel: string;   // e.g., "11 AM"
  tempC: number;
  heatIndexC: number;
  humidity: number;    // %
  uvIndex: number;
  riskLevel: RiskLevel;
  recommendation: string;
  confidence: 'high' | 'moderate' | 'low';
  isUnknown?: boolean;
  solarWm2?: number;
  windMs?: number;   // m/s — used only for internal WBGT convective cooling math
  windKmh?: number;  // km/h — the raw Open-Meteo reading; use this for any display
}

export interface PipelineStageLog {
  stageNumber: number;
  name: string;
  agentRole: string;
  status: 'completed' | 'running' | 'pending';
  durationMs: number;
  details: string;
  outputSummary: string;
}

export interface ToolboxBriefing {
  english: string;
  wordCount?: number;
}

export interface RiskAnalysisResult {
  id: string;
  siteName: string;
  location: string;
  activityType: ActivityType;
  plannedHours: string;
  thresholdTemp: number;
  dataSource?: 'fortyguard-live' | 'open-meteo' | 'fixture';
  latitude?: number;  // resolved site coordinates, needed for the FortyGuard report request
  longitude?: number;
  fortyGuardNote?: string; // human-readable reason FortyGuard live data wasn't used, when applicable
  aiEnhanced?: boolean; // true when the verdict was authored by Gemini, false when it came straight from the deterministic ISO 7243 engine
  aiNote?: string; // human-readable reason the AI narrative is missing, when applicable
  currentTemp: number;
  currentHeatIndex: number;
  currentHumidity: number;
  currentUvIndex: number;
  currentWindSpeed: number;
  overallVerdict: string;
  decisionStatus: 'GO' | 'ADJUST' | 'NO-GO' | 'CAUTION';
  goNoGoReason: string;
  aiReasoning: string[];
  hourlyRisks: HourlyRisk[];
  peakHeatWindow: string;
  recommendedPauseWindow: string;
  hydratedBreaksFrequency: string;
  timestamp: string;
  
  // FortyGuard & Deterministic Risk Engine Specifications (Optional/Computed)
  uhiDeltaC?: number; // Hyperlocal UHI intensity delta vs city baseline (e.g. +4.2°C)
  // Whether uhiDeltaC was measured by two FortyGuard /v1/heatmap polygon calls
  // or read off the hardcoded per-city calibration table. These look identical
  // on screen otherwise, which is exactly the problem.
  uhiSource?: 'fortyguard-heatmap' | 'calibration-table';
  // True only for the pre-seeded demo record. Every number in that record is
  // handwritten, so it must never be mistaken for an assessment the engine
  // produced - it is the first thing on screen at load.
  isSample?: boolean;
  uhiVsCoolestC?: number | null; // site mean vs the coolest cell in the 15km city polygon
  cityMinTempC?: number | null;
  cityMaxTempC?: number | null;
  fortyGuardDiagnostics?: { site: string; city: string; envParams: string } | null;
  cityBaselineTempC?: number; // City baseline peak temperature
  exceedanceHours?: number; // Total hours at HIGH or EXTREME risk
  longestPersistenceHours?: number; // Longest unbroken run of severe heat
  cumulativeExposure?: number; // Cumulative thermal stress score across shift
  safestWindow?: string; // Recommended shifted safe work window (e.g. "05:30 – 11:00")
  workRestCycle?: string; // ISO 7243 / ACGIH grounded work-rest cycle
  hydrationRate?: number; // Litres per worker per hour (e.g. 1.0)
  headcount?: number; // Number of workers on site (e.g. 30)
  acclimatized?: boolean;
  shadeAvailable?: boolean;
  waterAvailable?: boolean;
  briefing?: ToolboxBriefing; // 120-word spoken toolbox talk
  toolboxBriefing?: ToolboxBriefing; // 120-word spoken toolbox talk
  pipelineStages?: PipelineStageLog[]; // Multi-agent execution trail

  isPartialData?: boolean;
  isOfflineCached?: boolean;
  dataUnavailableNote?: string;
}

export type AppView = 'landing' | 'empty' | 'setup' | 'dashboard' | 'tokens';

export interface PredefinedSitePreset {
  siteName: string;
  location: string;
  activityType: ActivityType;
  startTime: string;
  endTime: string;
  thresholdTemp: number;
  headcount?: number;
  acclimatized?: boolean;
  shadeAvailable?: boolean;
  waterAvailable?: boolean;
  description?: string;
}