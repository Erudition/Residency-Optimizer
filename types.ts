
import type { ProgramData } from './services/api/client';
export type PgyLevel = 1 | 2 | 3;

export enum ClinicalSetting {
  INPATIENT = 'Inpatient',
  OUTPATIENT = 'Outpatient',
  CRITICAL_CARE = 'Critical Care',
  EMERGENCY = 'Emergency',
  NON_CLINICAL = 'Non-Clinical'
}

export interface Resident {
  id: string;
  name: string;
  level: PgyLevel; // Computed level for the active year context
  startYear: number; // Matriculation year: the calendar year they entered PGY-1 (e.g. 2026)
  avoidResidentIds: string[];
  activeWeekStart?: number; // Index in unified grid where resident starts
  activeWeekEnd?: number;   // Index in unified grid where resident ends
  clinicType?: AssignmentType;
  transferInYear?: number; // First academic year they joined (if not PGY-1)
  transferOutYear?: number; // Last academic year they completed (if they left early)
  cohort?: number; // 4+1 cycle assignment (0-4)
}

export const CODENAMES = {
  WARDS_RED: 'W-RED',
  WARDS_BLUE: 'W-BLUE',
  WARDS_METRO: 'W-MET',
  MICU: 'ICU',
  METRO_ICU: 'MET-ICU',
  AMCS_CONSULTS: 'AMCS',
  NIGHT_FLOAT: 'NF',
  EM: 'EM',
  CLINIC: 'CCIM',
  NIMA_BLOCK: 'NIMA',
  ELECTIVE: 'ELEC',
  VACATION: 'VAC',

  // PGY1 Required Electives
  CARDS: 'CARDS',
  ID: 'ID',
  NEPH: 'NEPH',
  PULM: 'PULM',
 
  // PGY2 Required Rotations
  ONC: 'ONC',
  NEURO: 'NEURO',
  RHEUM: 'RHEUM',
  GI: 'GI',
 
  ADD_MED: 'ADDM',
  ENDO: 'ENDO',
  GERI: 'GERI',
  PALLIATIVE: 'HPC', // Hospice & Palliative Care
  JR_HOSPITALIST: 'JH',
 
  // Voluntary / Other Electives (Available to all years)
  RESEARCH: 'RSCH',
  CCMA: 'CCMA',
  HF: 'HF',
  ENT: 'ENT',
  PMNR: 'PMNR',
  ANAESTHESIA: 'ANES',
  NIMA_CLINIC: 'NIMA_CLINIC',
} as const;

export type AssignmentType = string; // (typeof CODENAMES)[keyof typeof CODENAMES];
export interface ScheduleCell {
  assignment: AssignmentType;
  locked: boolean; // If manually set, don't overwrite
}

// Map: ResidentID -> Array of 52 weeks of assignments
export type ScheduleGrid = Record<string, ScheduleCell[]>; // residentId -> Weekly cells

export type ScheduleHistory = Record<number, ScheduleGrid>; // year -> ScheduleGrid

export type ScheduleStats = Record<string, Record<AssignmentType, number>>;

export interface Requirement {
  [residentId: string]: Record<AssignmentType, number>;
}
export interface RotationConfig {
  type: AssignmentType;
  label: string;
  category?: string;
  intensity: number; // 1-5
  duration: number; // Standard block duration
  setting: ClinicalSetting;

  // Staffing Constraints per week
  minInterns: number;
  maxInterns: number;
  minSeniors: number;
  maxSeniors: number;

  // Minimum weeks per resident per year
  minWeeksIntern?: number;
  minWeeksSenior?: number; // General senior minimum
  minWeeksPGY2?: number;   // Specific PGY2 minimum
  minWeeksPGY3?: number;   // Specific PGY3 minimum

  notes?: string;
  color?: number; // OKLCH hue value configured in the backend
}

export interface ResidentFairnessMetrics {
  id: string;
  name: string;
  level: number;
  coreWeeks: number;
  electiveWeeks: number;
  requiredWeeks: number;
  vacationWeeks: number;
  nightFloatWeeks: number;
  totalIntensityScore: number;
  maxIntensityStreak: number;
  streakSummary: string[];
}

export interface CohortFairnessMetrics {
  level: number;
  residents: ResidentFairnessMetrics[];
  meanCore: number;
  sdCore: number;
  meanElective: number;
  sdElective: number;
  meanIntensity: number;
  sdIntensity: number;
  fairnessScore: number;
}

export interface RequirementViolation {
  residentId: string;
  type: AssignmentType;
  minWeeks: number;
  actual: number;
  year?: number;
}

export interface WeeklyViolation {
  week: number;
  type: AssignmentType;
  issue: string;
  year?: number;
  instances?: number;
}

export interface AdaptationParams {
  fillMissingReqs: boolean; // Try to replace electives with missing reqs
  fixUnderstaffing: boolean; // Try to pull from electives to fix min constraints
  fixOverstaffing: boolean; // Try to push to electives to fix max constraints
  allowResearchOverride: boolean; // Treat Research as Elective for overrides
  allowVacationOverride: boolean; // Treat Vacation as Elective for overrides (Dangerous)
}

export enum CompetitionPriority {
  BEST_SCORE = 'Best Score',
  LEAST_UNDERSTAFFING = 'Least Understaffing',
  MOST_PGY_REQS = 'Most PGY Requirements Met'
}

export interface AlgorithmStats {
  bestScore: number;
  worstScore: number;
  bestViolations: number;
  worstViolations: number;
}

export interface CompetitionResult {
  schedule: ScheduleHistory; // Sliced into years for UI
  unifiedSchedule?: ScheduleGrid; // Full span for healer/analysis
  winnerName: string;
  score: number;
  totalViolations: number;
  understaffing: number;
}

export interface AlgorithmConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  color: string;
}

export interface CompetitionParams {
  tries: number;
  priority: CompetitionPriority;
  algorithmIds?: string[];
  topN: number;
  multiYear?: boolean;
}


export interface ConvergenceDataPoint {
  attemptIndex: number;
  algorithmId: string;
  score: number;
  bestScoreSoFar: number;
  globalBestScore: number;
  timestamp: number;
}


export interface ScheduleGenerator {
  name: string;
  generate: (
    residents: Resident[],
    existing: ScheduleGrid,
    programData: ProgramData,
    attemptIndex?: number,
    priorRequirementCounts?: Record<string, Record<string, number>>,  // replaces historicalSchedules
    onProgress?: (step: number, maxSteps: number, currentPenalty?: number) => void
  ) => ScheduleGrid | Promise<ScheduleGrid>;
}
export interface ScheduleSession {
  id: string;
  name: string;
  data: ScheduleHistory;
  unifiedData?: ScheduleGrid;
  createdAt: Date;
  isGenerating?: boolean;
  progress?: number;
  progressLabel?: string;
  attemptsMade?: number;
  metrics?: {
    stats: any;
    violations: {
      reqs: any[];
      constraints: any[];
    };
    fairness: any[];
    score: number;
  };
  cohortAssignments?: Record<number, Record<string, number>>;
  isHistory?: boolean;
  startYear?: number;
  lockedUntilWeek?: number;
}

export interface DetailedScore {
  finalScore: number;
  educationScore: number;
  staffingScore: number;
  intensityScore: number;
  streakScore: number;
  diversityScore: number;
  jeopardyPoolStabilityScore: number;
  cohortFairnessScores: Record<number, number>;
}

