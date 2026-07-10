export type WorkstationMode = "study" | "coding" | "writing" | "music" | "review" | "rest";

export type TaskStatus = "todo" | "doing" | "done" | "blocked";
export type TaskSource = "manual" | "github" | "calendar" | "super-productivity-import";

export interface Project {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkTaskContext {
  note?: string;
  links?: string[];
  files?: string[];
  command?: string;
}

export interface WorkTask {
  id: string;
  title: string;
  projectId?: string;
  source: TaskSource;
  status: TaskStatus;
  tags: string[];
  context?: WorkTaskContext;
  timerPolicyId?: string;
  estimateMinutes?: number;
  plannedDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type TimerMode = "fixed-pomodoro" | "elastic-block" | "count-up" | "deadline-backward" | "budget-split";

export interface TimerPolicyConfig {
  defaultFocusMinutes: number;
  defaultBreakMinutes: number;
  allowExtend: boolean;
  allowShorten: boolean;
  allowSkipBreak: boolean;
  allowManualAdjustment: boolean;
  softReminderAfterMinutes?: number;
  hardReminderAfterMinutes?: number;
}

export interface TimerPolicy {
  id: string;
  name: string;
  mode: TimerMode;
  config: TimerPolicyConfig;
  createdAt: string;
  updatedAt: string;
}

export type FocusSegmentType = "focus" | "break" | "afk" | "manual";

export interface FocusSegment {
  id: string;
  sessionId: string;
  type: FocusSegmentType;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  note?: string;
}

export interface TimerAdjustment {
  at: string;
  reason: string;
  source?: "user" | "system" | "adapter";
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changes: Record<string, unknown>;
}

export interface FocusSession {
  id: string;
  taskId?: string;
  projectId?: string;
  policyId: string;
  plannedMinutes?: number;
  actualMinutes?: number;
  startedAt: string;
  endedAt?: string;
  segments: FocusSegment[];
  activityEvidence?: Record<string, unknown>;
  musicContext?: Record<string, unknown>;
  adjustmentLog: TimerAdjustment[];
}

export interface TimerCurrent {
  session?: FocusSession;
  running: boolean;
  paused: boolean;
}

export type ActivitySource = "tokei" | "github" | "activitywatch" | "timer" | "music";

export interface ActivitySnapshot {
  id: string;
  source: ActivitySource;
  date: string;
  startedAt?: string;
  endedAt?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ActivitySummary {
  date: string;
  focusMinutes: number;
  effectiveFocusMinutes?: number;
  afkMinutes: number;
  tokenTotal?: number;
  githubContributionCount?: number;
  topApps: Array<{ name: string; minutes: number }>;
  topProjects: Array<{ name: string; minutes: number }>;
  musicMinutes?: number;
  taskCompletedCount?: number;
  sessionCount?: number;
  errors: string[];
}

export interface MusicTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  durationSeconds?: number;
  cover?: string;
  coverUrl?: string;
  url?: string;
  lyric?: string;
  lrc?: string;
  source?: string;
}

export interface MusicState {
  playing: boolean;
  mood: string;
  current?: MusicTrack;
  queue: MusicTrack[];
  updatedAt: string;
}

export interface DailyReview {
  id: string;
  date: string;
  summary?: string;
  review: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkstationStatus {
  enabled: boolean;
  mode: WorkstationMode;
  core: {
    ok: boolean;
    version: string;
    databasePath: string;
  };
  modules: {
    tasks: boolean;
    timer: boolean;
    activitywatch: boolean;
    music: boolean;
    activityStats: boolean;
    review: boolean;
  };
}

export interface ApiErrorPayload {
  error: string;
  detail?: string;
}

export interface ModeSettings {
  theme: string;
  timerPolicyId: string;
  musicMood: string;
  widgets: string[];
  activityWatchCorrection: boolean;
  activityStatsEnabled: boolean;
}

export interface WidgetSettings {
  id: string;
  enabled: boolean;
  modes: WorkstationMode[];
  refreshIntervalSeconds?: number;
  size?: {
    w: number;
    h: number;
  };
  position?: {
    x: number;
    y: number;
  };
  options?: Record<string, unknown>;
  updatedAt: string;
}

export interface ActivityWatchSettings {
  enabled: boolean;
  baseUrl: string;
  watchers: {
    window: boolean;
    afk: boolean;
    web: boolean;
  };
  afkCorrection: {
    enabled: boolean;
    thresholdMinutes: number;
  };
  showEvidenceInReview: boolean;
}

export interface ActivityStatsSettings {
  tokeiRepo: string;
  tokeiPython?: string;
  githubUsername: string;
  refreshIntervalMinutes: number;
  cacheEnabled: boolean;
  includeInReview: boolean;
  linkToCurrentProject: boolean;
}

export interface MusicSettings {
  enabled: boolean;
  provider: "mock" | "remote" | "mineradio";
  serviceUrl?: string;
  enableLyrics: boolean;
  enableDesktopLyrics: boolean;
  moodRules: Record<string, string>;
  playlistTrackIds: string[];
}

export interface ProjectPreference {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  defaultTimerPolicyId?: string;
  defaultMusicMood?: string;
  githubRepo?: string;
  localPath?: string;
  command?: string;
}

export interface TaskProjectSettings {
  defaultPlannedDate: "today" | "none";
  defaultTags: string[];
  allowTasksWithoutProject: boolean;
  autoStopTimerOnDone: boolean;
  projectPreferences: ProjectPreference[];
}

export interface ThemeSettings {
  globalTheme: string;
  modeThemes: Partial<Record<WorkstationMode, string>>;
  widgetOpacity: number;
  blur: boolean;
  animationLevel: "none" | "low" | "normal";
  density: "compact" | "comfortable";
}

export interface PrivacySettings {
  dataDirectory?: string;
  keepActivityWatchRawDays: number;
  keepApiCacheDays: number;
  allowSensitiveTitlesInReview: boolean;
}

export interface WorkstationSettings {
  defaultMode: WorkstationMode;
  modes: Record<WorkstationMode, ModeSettings>;
  activitywatch: ActivityWatchSettings;
  activityStats: ActivityStatsSettings;
  music: MusicSettings;
  tasks: TaskProjectSettings;
  theme: ThemeSettings;
  privacy: PrivacySettings;
  updatedAt: string;
}
