
import React, { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import ExcelJS from 'exceljs';
import {
  Resident,

  ScheduleGrid,
  ScheduleHistory,
  AssignmentType,
  ScheduleCell,
  ConvergenceDataPoint,
  CandidateSchedule,
  DraftCandidate,
  PublishedCandidate,
  isDraft,
  isPublished
} from './types';
import {
  TOTAL_WEEKS
} from './constants';
import { deriveActiveStartYear } from './services/programDataUtils';
const ACTIVE_START_YEAR = deriveActiveStartYear();
import { 
  generateSchedule, 
  calculateStats, 
  calculateFairnessMetrics, 
  calculateScheduleScore, 
  getRequirementViolations, 
  getWeeklyViolations, 
  getAuditViolations,
  getRequirementsViolationsCount,
  sliceIntoYears,
  getUnifiedResidents,
  getAugmentedResidents
} from './services/scheduler';
import { loadProgramData, ProgramData, serializeProgramData, promoteScheduleToCanonical, getCanonicalScheduleId } from './services/api/client';
import { getScheduleSyncService, SyncError, type SyncStatus, type ScheduleSyncEvent } from './services/api/sync';
import { extractTokenFromURL, isAuthenticated } from './services/api/auth';
import { ProgramDataProvider, useProgramData } from './contexts/ProgramDataContext';
import { getAssignmentColor } from './utils/colorUtils';
import { healSchedule } from './services/healer';
import { ScheduleTable } from './components/ScheduleTable';
import { Dashboard } from './components/Dashboard';
import { ResidentManager } from './components/ResidentManager';
import { RelationshipStats } from './components/RelationshipStats';
import { AssignmentStats } from './components/AssignmentStats';
import { ResidentAssignmentsStats } from './components/ResidentAssignmentsStats';
import { FairnessStats } from './components/FairnessStats';
import { RequirementsStats } from './components/RequirementsStats';
import { ScheduleComparison } from './components/ScheduleComparison';
import { CompetitorStudio } from './components/CompetitorStudio';
import { CycleKanban } from './components/CycleKanban';
import { GenerationDashboard } from './components/GenerationDashboard';
import { SettingsOverlay } from './components/SettingsOverlay';
import { HealerPanel } from './components/HealerPanel';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { ToastProvider, useToast } from './components/ui/Toast';
import {
  CompetitionParams,
  CompetitionPriority,
  AlgorithmConfig,
  AlgorithmStats,
} from './types';
import {
  LayoutGrid,
  BarChart3,
  Plus,
  Network,
  X,
  Table,
  Scale,
  ClipboardList,
  Pencil,
  ShieldCheck,
  ShieldAlert,
  Users,
  Sparkles,
  Database,
  FileSpreadsheet,
  AlertCircle,
  Download,
  Loader2,

  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  History,
  Copy,
  Crown,
  CheckSquare,
  Square,
  CloudUpload
} from 'lucide-react';



const APP_DATA_VERSION = 5; // Bumped: year keys changed from ending-year to start-year convention

const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const storedVersion = localStorage.getItem('rsp_app_version');
    if (storedVersion && parseInt(storedVersion) < APP_DATA_VERSION) {
      console.warn("New version detected, clearing versioned localStorage keys");
      // Only wipe data keys — never the auth token, which is version-independent
      const DATA_KEYS = ['rsp_schedules_v4', 'rsp_residents_v4', 'rsp_active_id', 'rsp_sort_order'];
      DATA_KEYS.forEach(k => localStorage.removeItem(k));
      localStorage.setItem('rsp_app_version', APP_DATA_VERSION.toString());
      return fallback;
    }
    localStorage.setItem('rsp_app_version', APP_DATA_VERSION.toString());

    const item = localStorage.getItem(key);
    if (!item) return fallback;
    const parsed = JSON.parse(item);

    // Patch schedules to ensure Dates are actual Date objects
    if (key === 'rsp_schedules_v4' && Array.isArray(parsed)) {
      return parsed.map((s: any) => ({
        ...s,
        createdAt: s.createdAt ? new Date(s.createdAt) : new Date()
      })) as unknown as T;
    }

    return parsed;
  } catch (e) {
    console.warn("Failed to load state", e);
    return fallback;
  }
};


const AssignmentModal = ({
  isOpen,
  onClose,
  current,
  onSave,
  anchorRect
}: {
  isOpen: boolean;
  onClose: () => void;
  current: AssignmentType | null;
  onSave: (val: AssignmentType | null) => void;
  anchorRect: DOMRect | null;
}) => {
  if (!isOpen || !anchorRect) return null;

  const programData = useProgramData();
  const keys = Array.from(programData.rotations.keys());
  let r = 0;
  let c = 0;

  if (current && keys.includes(current)) {
    const i = keys.indexOf(current);
    r = Math.floor(i / 4);
    c = i % 4;
  }

  const btnWidth = 112;
  const btnHeight = 40;
  const gap = 6;
  const pPadding = 12;
  const titleHeight = 24;

  const popupBtnLeft = pPadding + c * (btnWidth + gap) + btnWidth / 2;
  const popupBtnTop = pPadding + titleHeight + gap + r * (btnHeight + gap) + btnHeight / 2;

  const popupWidth = 490;
  const popupHeight = 462;

  let left = anchorRect.left + anchorRect.width / 2 - popupBtnLeft;
  let top = anchorRect.top + anchorRect.height / 2 - popupBtnTop;

  if (left + popupWidth > window.innerWidth - 16) {
    left = window.innerWidth - popupWidth - 16;
  }
  if (left < 16) {
    left = 16;
  }

  if (top + popupHeight > window.innerHeight - 16) {
    top = window.innerHeight - popupHeight - 16;
  }
  if (top < 16) {
    top = 16;
  }

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/5 select-none" onClick={onClose} />
      <div
        className="fixed bg-white rounded-xl shadow-2xl border border-light-4 p-3.5 z-[101] select-none flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100"
        style={{
          width: `${popupWidth + 6}px`,
          height: `${popupHeight + 6}px`,
          left: `${left}px`,
          top: `${top}px`,
        }}
      >
        <div className="flex justify-between items-center px-1" style={{ height: `${titleHeight}px` }}>
          <span className="text-xs font-bold text-muted uppercase tracking-wider select-none">Select Rotation</span>
          <button onClick={onClose} className="text-muted hover:text-black text-sm select-none px-1">✕</button>
        </div>
        <div className="grid grid-cols-4 gap-1.5 select-none">
          {Array.from(programData.rotations.entries()).map(([key, config]) => {
            const label = config.label;
            const bgHex = getAssignmentColor(config.color || 0, config.intensity, false);
            return (
              <button
                key={key}
                onClick={() => onSave(key as AssignmentType)}
                className="h-10 rounded font-bold text-[10px] text-black transition-all flex items-center justify-center text-center leading-tight hover:brightness-95 active:translate-y-[1px] select-none p-1"
                style={{
                  width: `${btnWidth}px`,
                  backgroundColor: bgHex,
                  border: `1.5px solid oklch(from ${bgHex} calc(l - 0.08) c h)`,
                  boxShadow: `0 2px 0 oklch(from ${bgHex} calc(l - 0.12) c h)`,
                  outline: current === key ? '3px solid #2f80fa' : 'none',
                  outlineOffset: '2px',
                }}
              >
                {label}
              </button>
            );
          })}
          <button
            onClick={() => onSave(null)}
            className="p-2 h-10 rounded font-bold text-xs text-red hover:bg-red/10 border border-light-4 transition-all active:translate-y-[1px] col-span-4 select-none"
          >
            Clear Assignment
          </button>
        </div>
      </div>
    </>
  );
};

const RenameModal = ({
  isOpen,
  initialName,
  onSave,
  onClose
}: { isOpen: boolean, initialName: string, onSave: (n: string) => void, onClose: () => void }) => {
  const [name, setName] = useState(initialName);
  useEffect(() => { setName(initialName); }, [initialName]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-96">
        <h3 className="text-lg font-bold mb-4">Rename Candidate</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border rounded p-2 mb-4 focus:ring-2 focus:ring-blue outline-none"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="md"  onClick={onClose}  className="px-4 py-2 text-secondary hover:bg-light-2 rounded" >Cancel</Button>
          <Button onClick={() => onSave(name)} className="px-4 py-2 bg-blue text-white rounded hover:bg-blue-2-dark">Save</Button>
        </div>
      </div>
    </div>
  );
};

const Identicon = ({ id, size = 16 }: { id: string, size?: number }) => {
  const colors = [
    'bg-red-2', 'bg-orange-500', 'bg-yellow', 'bg-yellow-500',
    'bg-lime-500', 'bg-green-2', 'bg-green-2', 'bg-teal-500',
    'bg-cyan-500', 'bg-sky-500', 'bg-blue', 'bg-purple',
    'bg-violet-500', 'bg-purple', 'bg-fuchsia', 'bg-pink-500',
    'bg-rose-500', 'bg-slate-500', 'bg-light-6', 'bg-zinc-500'
  ];

  // Simple hash for ID
  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color1 = colors[hash % colors.length];
  const color2 = colors[(hash * 7) % colors.length];
  const color3 = colors[(hash * 13) % colors.length];
  const color4 = colors[(hash * 19) % colors.length];

  return (
    <div className={`grid grid-cols-2 rounded-sm overflow-hidden flex-shrink-0 bg-white shadow-sm border border-black/5`} style={{ width: size, height: size }}>
      <div className={color1}></div>
      <div className={color2}></div>
      <div className={color3}></div>
      <div className={color4}></div>
    </div>
  );
};

const sanitizeScheduleGrid = (
  grid: ScheduleGrid,
  residentsList: Resident[],
  year?: number,
  startYear: number = 2026
): ScheduleGrid => {
  if (!grid || typeof grid !== 'object') return grid;
  
  const residentsMap = new Map<string, Resident>();
  if (Array.isArray(residentsList)) {
    residentsList?.forEach(r => {
      residentsMap.set(r.id, r);
      residentsMap.set(r.name, r);
    });
  } else if (residentsList && typeof residentsList === 'object') {
    Object.entries(residentsList)?.forEach(([name, data]: [string, any]) => {
      const id = data.id || name;
      const r = { id, name, ...data } as Resident;
      residentsMap.set(id, r);
      residentsMap.set(name, r);
    });
  }
  
  const sanitized: ScheduleGrid = {};
  
  Object.entries(grid)?.forEach(([rId, row]) => {
    const resident = residentsMap.get(rId);
    if (!resident || !Array.isArray(row)) {
      sanitized[rId] = row;
      return;
    }
    
    // Compute bounds from transferInYear / transferOutYear and startYear
    const residentFirstYear = resident.transferInYear ?? resident.startYear;
    const residentLastYear = resident.transferOutYear ?? (resident.startYear + 2);
    
    let start: number;
    let end: number;
    
    if (year !== undefined) {
      // Single-year grid (52 weeks): compute if resident is active in this academic year
      if (year < residentFirstYear || year > residentLastYear) {
        // Resident is completely outside this academic year
        start = 0;
        end = 0;
      } else {
        start = 0;
        end = 52;
      }
    } else {
      // Unified grid: compute global week indices
      const totalSpanWeeks = row.length;
      start = Math.max(0, (residentFirstYear - startYear) * 52);
      end = Math.min(totalSpanWeeks, (residentLastYear + 1 - startYear) * 52);
    }
    
    sanitized[rId] = row.map((cell, idx) => {
      if (idx < start || idx >= end) {
        if (cell && cell.assignment !== null) {
          return { ...cell, assignment: null };
        }
      }
      return cell;
    });
  });
  return sanitized;
};

const normalizeAndSanitizeSchedule = (s: any, residentsList: Resident[]): CandidateSchedule => {
  const data = s.data || s.schedule || {};
  const id = s.id || `sched-imported-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  const name = s.name || s.winnerName || 'Imported Schedule';
  const startYear = s.startYear || 2026;

  const sanitizedData: Record<string, ScheduleGrid> = {};
  Object.entries(data)?.forEach(([yearStr, grid]) => {
    sanitizedData[yearStr] = sanitizeScheduleGrid(grid as ScheduleGrid, residentsList, parseInt(yearStr), startYear);
  });

  const rawUnified = s.unifiedData || s.unifiedSchedule;
  const sanitizedUnifiedData = rawUnified 
    ? sanitizeScheduleGrid(rawUnified as ScheduleGrid, residentsList, undefined, startYear) 
    : undefined;

  // Preserve kind if already set (e.g. from a previous session), default to draft
  const kind = s.kind === 'published' ? 'published' : 'draft';
  const base = {
    id,
    name,
    data: sanitizedData,
    unifiedData: sanitizedUnifiedData,
    startYear,
    createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
    isGenerating: false,
    metrics: s.metrics,
    cohortAssignments: s.cohortAssignments,
    isHistory: s.isHistory,
    lockedUntilWeek: s.lockedUntilWeek,
  };
  if (kind === 'published') {
    return {
      ...base,
      kind: 'published' as const,
      candidateId: s.candidateId,
      scheduleIds: s.scheduleIds || {},
      lastSyncedAt: s.lastSyncedAt ? new Date(s.lastSyncedAt) : undefined,
    };
  }
  return { ...base, kind: 'draft' as const };
};

const syncResidentsWithBackend = (cached: Resident[], backendResidents: Resident[]): Resident[] => {
  if (!cached || cached.length === 0) {
    return backendResidents;
  }
  const cachedMap = new Map(cached.map(r => [r.id, r]));
  const merged: Resident[] = [];
  
  // Process all backend residents (active source of truth)
  backendResidents.forEach(backendRes => {
    const cachedRes = cachedMap.get(backendRes.id);
    if (cachedRes) {
      merged.push({
        ...backendRes,
        // Preserve local relationship constraints if customized
        avoidResidentIds: cachedRes.avoidResidentIds || backendRes.avoidResidentIds || [],
        // Preserve cohort if assigned locally
        cohort: cachedRes.cohort !== undefined ? cachedRes.cohort : backendRes.cohort,
      });
    } else {
      merged.push(backendRes);
    }
  });
  
  // Keep manually added local residents that are not in the backend
  cached.forEach(cachedRes => {
    if (cachedRes.id.startsWith('manual-') || cachedRes.id.startsWith('imported-')) {
      merged.push(cachedRes);
    }
  });
  
  return merged;
};

// Extract JWT from URL if present (set by Payload admin "Launch Scheduler" redirect)
extractTokenFromURL();

const AppContent: React.FC = () => {
  const programData = useProgramData();
  const toast = useToast();

  const [residents, setResidents] = useState<Resident[]>(() => {
    const cached = loadState<Resident[]>('rsp_residents_v4', []);
    return syncResidentsWithBackend(cached, programData.residents);
  });

  const [schedules, setSchedules] = useState<CandidateSchedule[]>(() => {
    const rawSchedules = loadState<CandidateSchedule[]>('rsp_schedules_v4', []);
    const cached = loadState<Resident[]>('rsp_residents_v4', []);
    const loadedResidents = syncResidentsWithBackend(cached, programData.residents);
    return rawSchedules.map((s: any) => normalizeAndSanitizeSchedule(s, loadedResidents));
  });
  const [algoAttempts, setAlgoAttempts] = useState<number[]>([]);
  const [exhaustionPoints, setExhaustionPoints] = useState<number[]>([]);
  const [healerProgress, setHealerProgress] = useState<number | undefined>(undefined);



  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(() =>
    loadState('rsp_active_id', 'all')
  );

  const [activeYear, setActiveYear] = useState<number>(ACTIVE_START_YEAR);
  const [residentSortOrder, setResidentSortOrder] = useState<'pgy' | 'cycle'>(() =>
    loadState('rsp_sort_order', 'pgy')
  );
  // Dynamic history detection
  const historicalYears = useMemo(() => 
    Object.keys(programData.historicalSchedules)
      .map(Number)
      .filter(y => y < ACTIVE_START_YEAR)
      .sort((a, b) => a - b),
    [programData.historicalSchedules]
  );

  // All academic years: historical + current + future
  const allAcademicYears = useMemo(() => [
    ...historicalYears,
    ACTIVE_START_YEAR,
    ACTIVE_START_YEAR + 1,
    ACTIVE_START_YEAR + 2,
    ACTIVE_START_YEAR + 3
  ], [historicalYears]);

  const isHistoricalYear = activeYear <= ACTIVE_START_YEAR;
  const isFutureYear = activeYear > ACTIVE_START_YEAR;

  const { history: historySchedules, cohortAssignments: historicalCohortsByYear } = useMemo(() => {
    return {
      history: programData.historicalSchedules,
      cohortAssignments: programData.historicalCohorts,
    };
  }, [programData.historicalSchedules, programData.historicalCohorts]);

  const [activeTab, setActiveTab] = useState<'schedule' | 'workload' | 'assignments' | 'fairness' | 'requirements' | 'coworking' | 'residents' | 'reset' | 'backup' | 'export' | 'draft' | 'cycles' | 'totals'>('schedule');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'residents' | 'backup' | 'reset'>('residents');
  
  const [algoConfig, setAlgoConfig] = useState<AlgorithmConfig[]>([
    { id: 'stochastic', name: 'Stochastic', description: 'The tried-and-true generalist. Good at everything, master of none. Uses weighted randomness to explore valid slots.', enabled: true, color: '#3b82f6' },
    { id: 'staffingFirst', name: 'Staffing First', description: 'Staffing-centric optimization. Prioritizes 1-week slots to guarantee hospital minimums are met at all costs.', enabled: true, color: '#8b5cf6' },
    { id: 'educationFirst', name: 'Education First', description: 'Objective-centric optimization. Prioritizes PGY educational minimums with a residual capacity guard to ensure hospital coverage.', enabled: true, color: '#10b981' },
    { id: 'weekByWeek', name: 'Week By Week', description: 'Staffing-centric generator. Iterates through each week and fills hospital gaps using first-available residents.', enabled: true, color: '#f59e0b' },

  ]);

  const [algoStats, setAlgoStats] = useState<AlgorithmStats[]>(() => {
    const saved = localStorage.getItem('rsp_algo_stats_v1');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [convergenceData, setConvergenceData] = useState<(number | null)[][]>([]);

  const convergenceBufferRef = useRef<(number | null)[][]>([]);
  const lastUpdateRef = useRef<number>(0);
  const [canceledAlgoIds, setCanceledAlgoIds] = useState<Set<string>>(new Set());
  const activeWorkersRef = useRef<Set<Worker>>(new Set());
  const currentWorkerRef = useRef<Worker | null>(null);
  const generationControllerRef = useRef<AbortController | null>(null);
  const [isCanceled, setIsCanceled] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);

  const [genStatus, setGenStatus] = useState('');
  const isGeneratingRef = useRef(false);

  const [isHealing, setIsHealing] = useState(false);
  const [bestHealCount, setBestHealCount] = useState<number | null>(null);
  const [bestHealGrid, setBestHealGrid] = useState<ScheduleGrid | null>(null);
  const healWorkerRef = useRef<Worker | null>(null);
  
  const [isHealerPanelOpen, setIsHealerPanelOpen] = useState(false);
  const [isHealerRunning, setIsHealerRunning] = useState(false);
  const [originalHealCount, setOriginalHealCount] = useState<number | null>(null);
  const [originalHealGrid, setOriginalHealGrid] = useState<ScheduleGrid | null>(null);



  const [compParams, setCompParams] = useState<CompetitionParams>(() => {
    const loaded = loadState('rsp_comp_params_v1', {
      tries: 1000000,
      priority: CompetitionPriority.BEST_SCORE,
      algorithmIds: ['staffingFirst'],
      topN: 3,
      multiYear: 3
    });

    const defaultIds = ['staffingFirst'];
    return {
      ...loaded,
      priority: CompetitionPriority.BEST_SCORE,
      multiYear: 3,
      topN: loaded.topN || 3,
      algorithmIds: (loaded.algorithmIds && loaded.algorithmIds.length > 0 ? loaded.algorithmIds : defaultIds).map((id: string) => {
        if (id === 'experimental') return 'staffingFirst';
        if (id === 'strict') return 'educationFirst';
        if (id === 'greedy') return 'weekByWeek';
        return id;
      })
    };
  });

  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [promoteOnExport, setPromoteOnExport] = useState(true);
  const [isPromoting, setIsPromoting] = useState(false);

  // ── Sync Service ──
  const syncService = useMemo(() => getScheduleSyncService(), []);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    isAuthenticated() ? 'connected' : 'local-only'
  );

  // ── Load Published Candidates on Mount ──
  // Fetches existing backend candidates when authenticated so published
  // schedules survive page refreshes (they are not saved to localStorage).
  useEffect(() => {
    if (!isAuthenticated()) return;

    let cancelled = false;
    (async () => {
      try {
        const loaded = await syncService.loadAllCandidates();
        if (cancelled || loaded.length === 0) return;

        setSchedules(prev => {
          // Build set of candidateIds already in state (avoid duplicates)
          const existingIds = new Set(
            prev
              .filter(isPublished)
              .map(s => (s as PublishedCandidate).candidateId)
          );

          const toAdd: PublishedCandidate[] = [];

          for (const c of loaded) {
            if (existingIds.has(c.candidateId)) continue;

            // Convert flat assignment list → ScheduleGrid per year
            type RawAssignment = { residentId: number; week: number; rotation: string; locked: boolean };
            const data: ScheduleHistory = {};
            for (const [yearStr, assignments] of Object.entries(c.yearData) as [string, RawAssignment[]][]) {
              const year = parseInt(yearStr, 10);
              const grid: ScheduleGrid = {};
              for (const a of assignments) {
                const key = a.residentId.toString();
                if (!grid[key]) grid[key] = Array(TOTAL_WEEKS).fill(null) as ScheduleCell[];
                grid[key][a.week - 1] = { assignment: a.rotation, locked: a.locked };
              }
              data[year] = grid;
            }

            toAdd.push({
              kind: 'published',
              id: `pub-${c.candidateId}`,
              candidateId: c.candidateId,
              scheduleIds: c.scheduleIds,
              name: c.title,
              data,
              createdAt: new Date(),
              startYear: c.startYear,
              lastSyncedAt: new Date(),
            });
          }

          if (toAdd.length === 0) return prev;
          console.log(`[App] Loaded ${toAdd.length} published candidate(s) from backend`);
          return [...prev, ...toAdd];
        });
      } catch (err) {
        console.error('[App] Failed to load candidates from backend:', err);
        if (!cancelled) {
          toast.warning(
            err instanceof SyncError
              ? `Could not load published schedules: ${err.message}`
              : 'Could not load published schedules from server. Working in local-only mode.',
          );
        }
      }
    })();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const tabContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (tabContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabContainerRef.current;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
    }
  };

  const getCurrentWeekForYear = (startYear: number, totalWeeks: number = TOTAL_WEEKS): number => {
    const today = new Date();
    const ayStart = new Date(startYear, 6, 1); // July 1st
    if (today < ayStart) return -1;
    const diffMs = today.getTime() - ayStart.getTime();
    const weekIdx = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return Math.min(weekIdx, totalWeeks - 1);
  };

  const activeSchedule = useMemo(() => {
    if (isHistoricalYear) {
      const baseHistory = historySchedules[activeYear] || {};
      const firstRow = (Object.values(baseHistory)[0] as any) || [];
      const totalWeeks = firstRow.length || TOTAL_WEEKS;
      const lockedUntil = getCurrentWeekForYear(activeYear, totalWeeks);
      
      // Augment history with pre-locked flags

      const augmentedData: ScheduleGrid = {};
      
      Object.keys(baseHistory)?.forEach(resId => {
        augmentedData[resId] = (baseHistory[resId] || []).map((cell, idx) => {
          // Null (unassigned) and placeholder slots remain editable even in
          // past weeks, so admins can resolve them retroactively.
          const isEditable = !cell?.assignment || programData.placeholderCodenames.has(cell.assignment);
          if (!cell) return { assignment: null, locked: isEditable ? false : idx <= lockedUntil };
          return {
            ...cell,
            locked: isEditable ? false : (!!cell.locked || idx <= lockedUntil)
          };
        });
      });

      return {
        id: `history-${activeYear}`,
        name: `${activeYear} - ${(activeYear + 1).toString().slice(-2)}`,
        data: { [activeYear]: augmentedData },
        cohortAssignments: { [activeYear]: historicalCohortsByYear[activeYear] },
        createdAt: new Date(),
        isHistory: true,
        startYear: activeYear,
        lockedUntilWeek: lockedUntil
      } as any;
    }
    return schedules.find(s => s.id === activeScheduleId);
  }, [schedules, activeScheduleId, historySchedules, activeYear, isHistoricalYear, programData.placeholderCodenames]);
  
  const [viewMode, setViewMode] = useState<'singleYear' | 'unified'>('singleYear');

  const handleSetViewMode = (mode: 'singleYear' | 'unified') => {
    setViewMode(mode);
    if (mode === 'unified') {
      if (['cycles', 'coworking', 'fairness', 'workload'].includes(activeTab)) {
        setActiveTab('schedule');
      }
    }
  };
  // Sync convergence data from buffer when switching back to dashboard
  useEffect(() => {
    if (activeTab === 'loading' && activeSchedule?.isGenerating && convergenceBufferRef.current.length > convergenceData.length) {
      setConvergenceData([...convergenceBufferRef.current]);
    }
  }, [activeTab, activeSchedule?.isGenerating, convergenceData.length]);




  // Derive cohort assignments for the selected year
  const activeYearCohorts = useMemo(() => {
    let yearCohorts = activeSchedule?.cohortAssignments?.[activeYear] || historicalCohortsByYear[activeYear];
    if (!yearCohorts || Object.keys(yearCohorts).length === 0) {
      const augmented = getAugmentedResidents(residents, activeYear + 1);
      const activeResidentsForDefault = augmented.filter(r => {
        const level = activeYear - r.startYear + 1;
        const isPgyInRange = level >= 1 && level <= 3;
        const hasJoined = r.transferInYear === undefined || r.transferInYear <= activeYear;
        const hasNotLeft = r.transferOutYear === undefined || r.transferOutYear >= activeYear;
        return isPgyInRange && hasJoined && hasNotLeft;
      }).sort((a, b) => {
        const levelA = activeYear - a.startYear + 1;
        const levelB = activeYear - b.startYear + 1;
        if (levelA !== levelB) return levelA - levelB;
        return a.name.localeCompare(b.name);
      });
      const defaultCohorts: Record<string, number> = {};
      activeResidentsForDefault?.forEach((r, idx) => {
        defaultCohorts[r.id] = idx % 5;
      });
      yearCohorts = defaultCohorts;
    }
    return yearCohorts;
  }, [activeSchedule, activeYear, historicalCohortsByYear, residents]);

  // Helper to derive active residents for any year (graduation aware)
  const getResidentsForYear = (year: number) => {
    let yearCohorts = year === activeYear ? activeYearCohorts : (activeSchedule?.cohortAssignments?.[year] || historicalCohortsByYear[year]);
    const augmented = getAugmentedResidents(residents, year + 1);

    if (!yearCohorts || Object.keys(yearCohorts).length === 0) {
      const activeResidents = augmented.filter(r => {
        const level = year - r.startYear + 1;
        const isPgyInRange = level >= 1 && level <= 3;
        const hasJoined = r.transferInYear === undefined || r.transferInYear <= year;
        const hasNotLeft = r.transferOutYear === undefined || r.transferOutYear >= year;
        return isPgyInRange && hasJoined && hasNotLeft;
      }).sort((a, b) => {
        const levelA = year - a.startYear + 1;
        const levelB = year - b.startYear + 1;
        if (levelA !== levelB) return levelA - levelB;
        return a.name.localeCompare(b.name);
      });
      const defaultCohorts: Record<string, number> = {};
      activeResidents?.forEach((r, idx) => {
        defaultCohorts[r.id] = idx % 5;
      });
      yearCohorts = defaultCohorts;
    }

    return augmented.filter(r => {
      const level = year - r.startYear + 1;
      const isPgyInRange = level >= 1 && level <= 3;
      const hasJoined = r.transferInYear === undefined || r.transferInYear <= year;
      const hasNotLeft = r.transferOutYear === undefined || r.transferOutYear >= year;
      return isPgyInRange && hasJoined && hasNotLeft;
    }).map(r => {
      const level = (year - r.startYear + 1) as 1 | 2 | 3;
      const clinicType = r.startYear === 2025 ? 'NIMA' : 'CCIM';
      const cohort = yearCohorts[r.id] ?? 0;
      return { ...r, level, clinicType, cohort };
    }).sort((a, b) => {

      if (residentSortOrder === 'cycle') {
        if (a.cohort !== b.cohort) return a.cohort - b.cohort;
        if (a.level !== b.level) return a.level - b.level;
        return a.name.localeCompare(b.name);
      } else {
        if (a.level !== b.level) return a.level - b.level;
        return a.name.localeCompare(b.name);
      }
    });
  };

  // Derive active residents for the selected year
  const activeResidents = useMemo(() => getResidentsForYear(activeYear), [residents, activeYear, residentSortOrder, activeSchedule, historicalCohortsByYear, activeYearCohorts]);

  const currentGrid = useMemo(() => {
    if (isHealing && bestHealGrid) {
      if (activeSchedule?.unifiedData && viewMode === 'unified') {
        const startYear = activeSchedule.startYear || ACTIVE_START_YEAR;
        const offset = (activeYear - startYear) * TOTAL_WEEKS;
        const sliced: ScheduleGrid = {};
        Object.entries(bestHealGrid)?.forEach(([rId, row]) => {
          sliced[rId] = (row as any).slice(offset, offset + TOTAL_WEEKS);
        });
        return sliced;
      }
      return bestHealGrid;
    }
    if (activeScheduleId === 'all' && !isHistoricalYear) return {};
    return activeSchedule?.data?.[activeYear] || historySchedules[activeYear] || {};
  }, [activeSchedule, activeYear, historySchedules, activeScheduleId, isHistoricalYear, isHealing, bestHealGrid, viewMode]);



  const displayGrid = useMemo(() => {
    if (isHealing && bestHealGrid && activeSchedule?.unifiedData && viewMode === 'unified') return bestHealGrid;
    if (viewMode === 'unified' && activeSchedule?.unifiedData) return activeSchedule.unifiedData;
    return currentGrid;
  }, [currentGrid, isHealing, bestHealGrid, viewMode, activeSchedule]);

  const displayResidents = useMemo(() => {
    if (viewMode === 'unified' && activeSchedule?.unifiedData) {
       const startYear = activeSchedule.startYear || ACTIVE_START_YEAR;
       return getUnifiedResidents(residents, startYear, 3).map(r => ({
           ...r,
           clinicType: r.startYear === 2025 ? 'NIMA' : 'CCIM',
           cohort: (activeSchedule?.cohortAssignments?.[startYear] || historicalCohortsByYear[startYear] || {})[r.id] ?? 0
       })).sort((a, b) => {
           if (a.startYear !== b.startYear) return a.startYear - b.startYear;
           if (a.cohort !== b.cohort) return a.cohort - b.cohort;
           return a.name.localeCompare(b.name);
       });
    }
    return activeResidents;
  }, [viewMode, activeSchedule, residents, activeResidents, historicalCohortsByYear]);

  const { stats, violations, fairness } = useMemo(() => {
    if ((!activeSchedule || activeSchedule.isGenerating || activeScheduleId === 'all') && !isHistoricalYear) {
      return {
        stats: {} as any,
        violations: { reqs: [], constraints: [], audit: 0 },
        fairness: []
      };
    }

    // For requirement violations, we need full history (historical + active session data)
    const fullHistory = { ...historySchedules, ...(activeSchedule.data || {}) };

    return {
      stats: calculateStats(activeResidents, currentGrid),
      violations: {
        reqs: getRequirementViolations(activeResidents, currentGrid, programData, fullHistory, activeYear),
        constraints: getWeeklyViolations(activeResidents, currentGrid, programData),
        audit: getAuditViolations(activeResidents, fullHistory, programData, activeYear)
      },
      fairness: calculateFairnessMetrics(activeResidents, currentGrid, programData)
    };
  }, [activeSchedule, activeResidents, activeYear, currentGrid, historySchedules, activeScheduleId, programData]);

  const currentCoverageViolationsCount = useMemo(() => {
    if (!activeSchedule || activeSchedule.isGenerating || activeScheduleId === 'all') return 0;
    const useUnified = viewMode === 'unified' && !!activeSchedule.unifiedData;
    const startYear = useUnified ? (activeSchedule.startYear || ACTIVE_START_YEAR) : activeYear;

    if (useUnified) {
      let total = 0;
      for (let offset = 0; offset < 3; offset++) {
        const y = startYear + offset;
        const yrResidents = getResidentsForYear(y);
        const yrGrid = activeSchedule.data[y] || {};
        const constraintsList = getWeeklyViolations(yrResidents, yrGrid, programData, y);
        total += constraintsList.reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);
      }
      return total;
    } else {
      return violations.constraints.reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);
    }
  }, [activeSchedule, activeScheduleId, viewMode, activeYear, violations.constraints, residents, programData, getResidentsForYear]);

  const currentRequirementsViolationsCount = useMemo(() => {
    if (!activeSchedule || activeSchedule.isGenerating || activeScheduleId === 'all') return 0;
    const useUnified = viewMode === 'unified' && !!activeSchedule.unifiedData;
    const startYear = useUnified ? (activeSchedule.startYear || ACTIVE_START_YEAR) : activeYear;
    const fullHistory = { ...historySchedules, ...(activeSchedule.data || {}) };

    const reqsDeficit = getRequirementsViolationsCount(
      useUnified ? displayResidents : activeResidents,
      useUnified ? displayGrid : currentGrid,
      fullHistory,
      startYear,
      useUnified,
      programData
    );

    let audit = 0;
    if (useUnified) {
      for (let offset = 0; offset < 3; offset++) {
        const y = startYear + offset;
        const yrResidents = getResidentsForYear(y);
        audit += getAuditViolations(yrResidents, fullHistory, programData, y);
      }
    } else {
      audit = getAuditViolations(activeResidents, fullHistory, programData, activeYear);
    }

    return reqsDeficit + audit;
  }, [activeSchedule, activeScheduleId, viewMode, activeYear, historySchedules, displayResidents, activeResidents, displayGrid, currentGrid, residents, programData, getResidentsForYear]);

  const activeViolationsCount = useMemo(() => {
    return currentCoverageViolationsCount + currentRequirementsViolationsCount;
  }, [currentCoverageViolationsCount, currentRequirementsViolationsCount]);

  const hasViolations = activeViolationsCount > 0;

  const [modalOpen, setModalOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ resId: string, week: number } | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [scheduleToRename, setScheduleToRename] = useState<CandidateSchedule | null>(null);

  useEffect(() => {
    localStorage.setItem('rsp_sort_order', JSON.stringify(residentSortOrder));
  }, [residentSortOrder]);

  // Cleanup workers on unmount (when tab closes)
  useEffect(() => {
    return () => {
      activeWorkersRef.current?.forEach(worker => worker.terminate());
      activeWorkersRef.current.clear();
    };
  }, []);

  // Helper to spawn a web worker for background generation
  const runGenerationTask = (
    startYear: number,
    totalYears: number,
    residents: Resident[], 
    existing: ScheduleGrid, 
    params: CompetitionParams, 
    onProgress: (iteration: number, attempts: number[], scores: (number | null)[] | undefined, year: number, overallProgress: number, exhaustionPoints: number[], exhaustedCount: number, healerProgress?: number) => void,
    historicalSchedules: ScheduleHistory, 
    cohortAssignments: Record<number, Record<string, number>>,
    algorithmIds: string[],
    signal?: AbortSignal
  ): Promise<{ results: any[], unifiedResidents?: Resident[] }> => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./services/scheduler.worker.ts', import.meta.url), { type: 'module' });
      activeWorkersRef.current.add(worker);
      currentWorkerRef.current = worker;

      const onAbort = () => {
        worker.postMessage({ type: 'cancel' });
        worker.terminate();
        activeWorkersRef.current.delete(worker);
        if (currentWorkerRef.current === worker) currentWorkerRef.current = null;
        reject(new DOMException('Aborted', 'AbortError'));
      };


      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      worker.onmessage = (e) => {
        const { type, iteration, overallProgress, bestScore, attempts, exhaustionPoints, exhaustedCount, results, error, unifiedResidents, healerProgress } = e.data;
        if (type === 'progress') {
          onProgress(iteration, attempts, bestScore, startYear, overallProgress, exhaustionPoints, exhaustedCount || 0, healerProgress);
        } else if (type === 'success') {
          if (signal) signal.removeEventListener('abort', onAbort);
          activeWorkersRef.current.delete(worker);
          worker.terminate();
          resolve({ results, unifiedResidents });
        } else if (type === 'error') {
          if (signal) signal.removeEventListener('abort', onAbort);
          activeWorkersRef.current.delete(worker);
          worker.terminate();
          reject(new Error(error));
        } else if (type === 'aborted') {
          if (signal) signal.removeEventListener('abort', onAbort);
          activeWorkersRef.current.delete(worker);
          if (currentWorkerRef.current === worker) currentWorkerRef.current = null;
          worker.terminate();
          reject(new DOMException('Aborted', 'AbortError'));
        }
      };
      
      worker.onerror = (e) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        activeWorkersRef.current.delete(worker);
        if (currentWorkerRef.current === worker) currentWorkerRef.current = null;
        worker.terminate();
        reject(e);
      };

      // Clean up ref on completion
      const originalResolve = resolve;
      resolve = (val: any) => {
        if (currentWorkerRef.current === worker) currentWorkerRef.current = null;
        originalResolve(val);
      };

      worker.postMessage({ 
        type: 'generate', 
        year: startYear, 
        totalYears, 
        residents,
        historicalSchedules,
        constraints: { existing, cohortAssignments },
        programData: serializeProgramData(programData),
        params,
        algorithmIds
      });
    });
  };


  const startTimeRef = useRef<number>(0);
  useEffect(() => {
    if (activeSchedule?.isGenerating) {
      startTimeRef.current = Date.now();
    }
  }, [activeSchedule?.isGenerating]);

  const getEta = () => {
    if (!activeSchedule?.progress || activeSchedule.progress < 2 || !startTimeRef.current) return 'Calculating...';
    const elapsed = Date.now() - startTimeRef.current;
    const progress = activeSchedule.progress / 100;
    const totalEst = elapsed / progress;
    const remaining = totalEst - elapsed;
    const seconds = Math.ceil(remaining / 1000);
    return seconds > 60 ? `~${Math.ceil(seconds / 60)}m left` : `~${seconds}s left`;
  };

  const getPriorityText = () => {
    switch (compParams.priority) {
      case CompetitionPriority.LEAST_UNDERSTAFFING: return "ensure minimal understaffing...";
      case CompetitionPriority.MOST_PGY_REQS: return "optimize graduation requirements...";
      default: return "balance fairness and coverage...";
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [schedules]);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabContainerRef.current) {
      const scrollAmount = 300;
      tabContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };



  useEffect(() => { 
    try {
      localStorage.setItem('rsp_residents_v4', JSON.stringify(residents)); 
    } catch (e) {
      console.warn('Failed to save residents to localStorage:', e);
    }
  }, [residents]);

  useEffect(() => { 
    try {
      // Only persist draft candidates to localStorage — published ones live on the server
      const drafts = schedules.filter(s => isDraft(s));
      const pruned = drafts.slice(-3).map(sch => {
        if (!sch.metrics) return sch;
        return {
          ...sch,
          metrics: {
            ...sch.metrics,
            violations: { reqs: [], constraints: [] }
          }
        };
      });
      localStorage.setItem('rsp_schedules_v4', JSON.stringify(pruned)); 
    } catch (e) {
      console.warn('Failed to save schedules to localStorage (likely quota exceeded):', e);
    }
  }, [schedules]);

  useEffect(() => { 
    if (activeScheduleId) {
      try {
        localStorage.setItem('rsp_active_id', JSON.stringify(activeScheduleId)); 
      } catch (e) {
        console.warn('Failed to save active ID to localStorage:', e);
      }
    }
  }, [activeScheduleId]);

  // ── SSE Sync Lifecycle ──
  // Derive candidateId from the active tab's backendId
  const activeSched = schedules.find(s => s.id === activeScheduleId);
  const activeSyncId = (activeSched && isPublished(activeSched)) ? activeSched.candidateId : null;

  useEffect(() => {
    if (!activeSyncId) return;

    syncService.connect(activeSyncId);
    setSyncStatus('connected');

    // Poll sync status periodically
    const statusInterval = setInterval(() => {
      setSyncStatus(syncService.syncStatus);
    }, 2000);

    // Handle incoming events from other clients
    const unsubscribe = syncService.onEvent((event: ScheduleSyncEvent) => {
      switch (event.type) {
        case 'assignment-change': {
          // Apply remote cell edit to local state
          setSchedules(prev => prev.map(s => {
            if (s.backendId !== event.scheduleId) return s;
            // Find which year this schedule covers
            const yearKeys = Object.keys(s.data).map(Number);
            for (const year of yearKeys) {
              const grid = s.data[year];
              if (!grid) continue;
              const resId = event.residentId.toString();
              if (grid[resId]) {
                const weekIdx = event.week - 1; // Backend is 1-based
                const updatedRow = [...grid[resId]];
                updatedRow[weekIdx] = {
                  assignment: event.rotation,
                  locked: event.locked,
                };
                return {
                  ...s,
                  data: {
                    ...s.data,
                    [year]: {
                      ...grid,
                      [resId]: updatedRow,
                    },
                  },
                };
              }
            }
            return s;
          }));
          break;
        }
        case 'schedule-created': {
          // A remote client created a new schedule — we'll load it on next full sync
          console.log('[Sync] Remote schedule created:', event.scheduleId, event.title);
          break;
        }
        case 'schedule-updated': {
          // Apply remote rename
          setSchedules(prev => prev.map(s =>
            s.backendId === event.scheduleId ? { ...s, name: event.title } : s
          ));
          break;
        }
        case 'schedule-deleted': {
          // Remove schedule deleted by remote client
          setSchedules(prev => prev.filter(s => s.backendId !== event.scheduleId));
          break;
        }
      }
    });

    // Surface batched cell upsert failures as toast warnings
    const unsubscribeErrors = syncService.onError((error) => {
      toast.warning(error.message);
    });

    return () => {
      clearInterval(statusInterval);
      unsubscribe();
      unsubscribeErrors();
      syncService.disconnect();
      setSyncStatus(isAuthenticated() ? 'connected' : 'local-only');
    };
  }, [activeSyncId, syncService]);


  const handleGenerate = async () => {
    if (isGeneratingRef.current) return;
    
    isGeneratingRef.current = true;
    setIsGenerating(true);
    setGenProgress(0);
    setAlgoAttempts([]);
    setGenStatus('Initializing...');

    setConvergenceData([]);
    setCanceledAlgoIds(new Set());
    setIsCanceled(false);
    
    const controller = new AbortController();
    generationControllerRef.current = controller;

    try {
      const totalYears = compParams.multiYear || 1;
      
      startTransition(() => {
        setConvergenceData([]);
        convergenceBufferRef.current = [];
        lastUpdateRef.current = Date.now();
      });

      const fullCohortAssignments: Record<number, Record<string, number>> = {};
      for (let y = activeYear; y < activeYear + totalYears; y++) {
        let yearCohorts = y === activeYear ? activeYearCohorts : (activeSchedule?.cohortAssignments?.[y] || historicalCohortsByYear[y]);
        if (!yearCohorts || Object.keys(yearCohorts).length === 0) {
          const augmented = getAugmentedResidents(residents, y + 1);
          const activeResidents = augmented.filter(r => {
            const level = y - r.startYear + 1;
            const isPgyInRange = level >= 1 && level <= 3;
            const hasJoined = r.transferInYear === undefined || r.transferInYear <= y;
            const hasNotLeft = r.transferOutYear === undefined || r.transferOutYear >= y;
            return isPgyInRange && hasJoined && hasNotLeft;
          }).sort((a, b) => {
            const levelA = y - a.startYear + 1;
            const levelB = y - b.startYear + 1;
            if (levelA !== levelB) return levelA - levelB;
            return a.name.localeCompare(b.name);
          });
          const defaultCohorts: Record<string, number> = {};
          activeResidents?.forEach((r, idx) => {
            defaultCohorts[r.id] = idx % 5;
          });
          yearCohorts = defaultCohorts;
        }
        fullCohortAssignments[y] = yearCohorts;
      }

      const { results, unifiedResidents } = await runGenerationTask(
        activeYear,
        totalYears,
        residents,
        {},
        compParams,
        (iteration, attempts, scores, year, overallProgress, exhPoints, exhCount, hProgress) => {
          const now = Date.now();
          if (scores) {
            while (convergenceBufferRef.current.length < iteration) {
              const prev = convergenceBufferRef.current[convergenceBufferRef.current.length - 1] || scores.map(() => 0);
              convergenceBufferRef.current.push(prev);
            }
            convergenceBufferRef.current[iteration] = scores;
          }
          if (now - lastUpdateRef.current > 1000) {
            setGenProgress(Math.round(overallProgress * 100));
            if (attempts) setAlgoAttempts(attempts);
            if (exhPoints) setExhaustionPoints(exhPoints);
            setHealerProgress(hProgress);
            setGenStatus(`Optimizing Years ${activeYear}-${activeYear + totalYears - 1} (${Math.round(overallProgress * 100)}%)`);
            if (scores && (activeScheduleId === 'all' || activeScheduleId === 'draft')) {
              setConvergenceData([...convergenceBufferRef.current]);
            }
            lastUpdateRef.current = now;
          }
        },
        historySchedules,
        fullCohortAssignments,
        compParams.algorithmIds || [],
        controller.signal
      );


      // Process results
      const resultSalt = Math.floor(Math.random() * 1000000);
      const newIds = results.map((_: any, idx: number) => `sched-${Date.now()}-${idx}-${resultSalt}`);
      
      setConvergenceData([...convergenceBufferRef.current]);

      startTransition(() => {
        if (unifiedResidents) {
          setResidents(prev => {
            const updated = prev.map(r => {
              const u = unifiedResidents.find(ur => ur.id === r.id);
              return u ? { ...r, level: u.level } : r;
            });
            const newRes = unifiedResidents.filter(ur => !prev.some(r => r.id === ur.id));
            return [...updated, ...newRes];
          });
        }
        setSchedules(prev => {
          const finalResults: DraftCandidate[] = results.map((res: any, idx: number) => ({
            kind: 'draft' as const,
            id: newIds[idx],
            name: `${res.winnerName} (${idx === 0 ? 'Optimal' : `Rank ${idx + 1}`})`,
            data: res.schedule,
            unifiedData: res.unifiedSchedule,
            metrics: res.metrics,
            cohortAssignments: fullCohortAssignments,
            startYear: activeYear,
            createdAt: new Date(),
            isGenerating: false,
          }));

          return [...prev, ...finalResults];
        });
        setActiveScheduleId(newIds[0]);
      });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Generation canceled');
      } else {
        console.error('Generation failed:', err);
        toast.error(`Schedule generation failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
      generationControllerRef.current = null;
    }
  };




  const stopGeneration = () => {
    if (generationControllerRef.current) {
      generationControllerRef.current.abort();
      setIsCanceled(true);
    }
  };

  const handleRename = (newName: string) => {
    if (scheduleToRename && newName.trim()) {
      setSchedules(prev => prev.map(s => s.id === scheduleToRename.id ? { ...s, name: newName } : s));
      // Sync rename to backend if published
      if (isPublished(scheduleToRename)) {
        syncService.renameSchedule(scheduleToRename.candidateId, newName.trim());
      }
    }
    setRenameModalOpen(false);
    setScheduleToRename(null);
  };
  const handleOpenHealerPanel = () => {
    if (!activeScheduleId) return;
    const activeSched = schedules.find(s => s.id === activeScheduleId);
    if (!activeSched) return;

    const useUnified = !!activeSched.unifiedData;
    const gridToHeal = useUnified ? activeSched.unifiedData! : activeSched.data[activeYear];
    if (!gridToHeal) return;

    const startYear = useUnified ? (activeSched.startYear || ACTIVE_START_YEAR) : activeYear;
    const totalYears = useUnified ? 3 : 1;

    setIsHealerPanelOpen(true);
    setIsHealing(true);
    setBestHealGrid(gridToHeal);
    setOriginalHealGrid(gridToHeal);
    setOriginalHealCount(activeViolationsCount);
    setBestHealCount(activeViolationsCount);
    setHealerProgress(0);
    setIsHealerRunning(false);
  };

  const handleStartHealerStrategy = (strategy: string) => {
    if (!activeScheduleId) return;
    const activeSched = schedules.find(s => s.id === activeScheduleId);
    if (!activeSched) return;

    const useUnified = !!activeSched.unifiedData;
    const gridToHeal = bestHealGrid || (useUnified ? activeSched.unifiedData! : activeSched.data[activeYear]);
    if (!gridToHeal) return;

    const startYear = useUnified ? (activeSched.startYear || ACTIVE_START_YEAR) : activeYear;
    const totalYears = useUnified ? 3 : 1;

    const healingResidents = useUnified 
      ? getUnifiedResidents(residents, startYear, totalYears)
      : getResidentsForYear(startYear);

    // Stop current worker if running
    if (healWorkerRef.current) {
      healWorkerRef.current.terminate();
      healWorkerRef.current = null;
    }

    const worker = new Worker(new URL('./services/scheduler.worker.ts', import.meta.url), { type: 'module' });
    healWorkerRef.current = worker;
    setIsHealerRunning(true);

    worker.onmessage = (e) => {
      const { type, schedule, violations: count, healerProgress: hProgress } = e.data;
      console.log('Heal worker message:', type, count);
      if (type === 'heal-update') {
        setBestHealGrid(schedule);
        setBestHealCount(count);
        if (hProgress !== undefined) setHealerProgress(hProgress);
      } else if (type === 'heal-ping') {
        setBestHealCount(count);
        if (hProgress !== undefined) setHealerProgress(hProgress);
      } else if (type === 'heal-complete') {
        setIsHealerRunning(false);
        setHealerProgress(100);
      }
    };

    worker.postMessage({
      type: 'start-heal',
      grid: gridToHeal,
      residents: healingResidents,
      historicalSchedules: historySchedules,
      startYear,
      totalYears,
      cohortAssignments: activeSched.cohortAssignments,
      programData: serializeProgramData(programData),
      strategy
    });
  };

  const handleStopHealerStrategy = () => {
    if (healWorkerRef.current) {
      healWorkerRef.current.postMessage({ type: 'stop-heal' });
      healWorkerRef.current.terminate();
      healWorkerRef.current = null;
    }
    setIsHealerRunning(false);
  };

  const handleApplyHealedSchedule = () => {
    handleStopHealerStrategy();

    if (bestHealGrid && activeScheduleId) {
      const activeSched = schedules.find(s => s.id === activeScheduleId);
      const useUnified = activeSched?.unifiedData;
      const startYear = useUnified ? (activeSched?.startYear || ACTIVE_START_YEAR) : activeYear;

      setSchedules(prev => prev.map(s => {
        if (s.id !== activeScheduleId) return s;
        if (useUnified) {
          const newSliced = sliceIntoYears(bestHealGrid, startYear, 3);
          return { ...s, data: newSliced, unifiedData: bestHealGrid };
        }
        return { ...s, data: { ...s.data, [activeYear]: bestHealGrid } };
      }));
    }

    setIsHealing(false);
    setIsHealerPanelOpen(false);
    setIsHealerRunning(false);
    setBestHealGrid(null);
    setOriginalHealGrid(null);
    setOriginalHealCount(null);
    setBestHealCount(null);
    setHealerProgress(undefined);
  };

  const handleCancelHealedSchedule = () => {
    handleStopHealerStrategy();

    setIsHealing(false);
    setIsHealerPanelOpen(false);
    setIsHealerRunning(false);
    setBestHealGrid(null);
    setOriginalHealGrid(null);
    setOriginalHealCount(null);
    setBestHealCount(null);
    setHealerProgress(undefined);
  };


  // Publish state: 'idle' | 'naming' (modal open) | 'saving' (network)
  const [publishState, setPublishState] = useState<'idle' | 'naming' | 'saving'>('idle');

  const handlePublishClick = () => {
    if (!activeSchedule || !isDraft(activeSchedule) || !activeSchedule.startYear) return;
    if (!isAuthenticated()) return;
    // Open the rename modal pre-filled with the draft's name for the user to confirm/edit
    setScheduleToRename(activeSchedule);
    setPublishState('naming');
    setRenameModalOpen(true);
  };

  const handlePublishSave = async (candidateName: string) => {
    const sched = scheduleToRename;
    setRenameModalOpen(false);
    setScheduleToRename(null);

    if (!sched || !isDraft(sched) || !sched.startYear || !candidateName.trim()) {
      setPublishState('idle');
      return;
    }

    setPublishState('saving');
    try {
      const { candidateId } = await syncService.createCandidate(sched.startYear, candidateName.trim());
      const { scheduleIds, errors: saveErrors, residentIdMap } = await syncService.saveCandidateGrids(
        candidateId,
        candidateName.trim(),
        sched.data,
        residents,
      );

      // Remap synthetic frontend keys → backend numeric IDs in the grid data
      // so subsequent cell edits sync correctly via real-time upserts.
      let publishData = sched.data;
      if (Object.keys(residentIdMap).length > 0) {
        publishData = { ...sched.data };
        for (const [yearStr, grid] of Object.entries(publishData)) {
          const remappedGrid = { ...grid };
          for (const [synthKey, backendId] of Object.entries(residentIdMap)) {
            if (remappedGrid[synthKey]) {
              remappedGrid[backendId.toString()] = remappedGrid[synthKey];
              delete remappedGrid[synthKey];
            }
          }
          publishData[parseInt(yearStr, 10)] = remappedGrid;
        }
      }

      // Replace the draft with a published candidate
      const published: PublishedCandidate = {
        kind: 'published',
        id: `pub-${candidateId}`,
        candidateId,
        scheduleIds,
        name: candidateName.trim(),
        data: publishData,
        unifiedData: sched.unifiedData,
        createdAt: sched.createdAt,
        metrics: sched.metrics,
        cohortAssignments: sched.cohortAssignments,
        startYear: sched.startYear,
        lastSyncedAt: new Date(),
      };

      setSchedules(prev => prev.map(s => s.id === sched.id ? published : s));
      setActiveScheduleId(published.id);

      if (saveErrors.length > 0) {
        toast.warning(
          `Published "${candidateName}" but ${saveErrors.length} year(s) failed to save: ${saveErrors.join('; ')}`,
        );
      } else {
        toast.success(`Published "${candidateName}" to server`);
      }
    } catch (err) {
      console.error('[Publish] Failed:', err);
      toast.error(
        err instanceof SyncError
          ? `Publish failed: ${err.message}`
          : 'Failed to publish schedule to server',
      );
    } finally {
      setPublishState('idle');
    }
  };

  const handleDeleteSchedule = async (sched: CandidateSchedule) => {
    if (isPublished(sched)) {
      const confirmed = window.confirm(
        `Delete "${sched.name}"?\n\nThis will permanently remove this candidate for all users.`
      );
      if (!confirmed) return;
      try {
        await syncService.deleteCandidate(sched.candidateId);
      } catch (err) {
        console.error('[Delete] Failed:', err);
        toast.error(
          err instanceof SyncError
            ? `Delete failed: ${err.message}`
            : 'Failed to delete candidate from server',
        );
        return; // Don't remove tab if backend delete failed
      }
    }
    setSchedules(prev => prev.filter(x => x.id !== sched.id));
    if (activeScheduleId === sched.id) setActiveScheduleId('all');
  };

  const handleCellClick = (resId: string, week: number, rect?: DOMRect) => {
    setSelectedCell({ resId, week });
    if (rect) setAnchorRect(rect);
    setModalOpen(true);
  };

  const handleAssignmentSave = (type: AssignmentType | null) => {
    if (selectedCell && activeScheduleId) {
      setSchedules(prev => prev.map(s => {
        if (s.id !== activeScheduleId) return s;
        const yearGrid = s.data?.[activeYear] || {};
        const yearCopy = { ...yearGrid };
        if (!yearCopy[selectedCell.resId]) yearCopy[selectedCell.resId] = [];
        const updatedRow = [...yearCopy[selectedCell.resId]];
        updatedRow[selectedCell.week] = { assignment: type as any, locked: true };
        yearCopy[selectedCell.resId] = updatedRow;

        const dataCopy = { ...s.data, [activeYear]: yearCopy };

        // Fire background sync for this cell edit
        if (s.backendId && type) {
          syncService.upsertCell(
            s.backendId,
            parseInt(selectedCell.resId, 10),
            selectedCell.week + 1, // Backend uses 1-based weeks
            type,
            true,
          );
        }

        return {
          ...s,
          data: dataCopy
        };
      }));
    }
    setModalOpen(false);
  };

  const handleAssignCycle = (residentId: string, cycleIndex: number) => {
    if (!activeScheduleId) return;
    setSchedules(prev => prev.map(s => {
      if (s.id !== activeScheduleId) return s;

      const updatedCycles = { ...(s.cohortAssignments || {}) };
      // BUG FIX: If the year mapping doesn't exist yet, we must initialize it with the CURRENT state
      // otherwise, all other residents reset to cycle 0.
      const yearMapping = { ...(updatedCycles[activeYear] || activeYearCohorts) };
      yearMapping[residentId] = cycleIndex;
      updatedCycles[activeYear] = yearMapping;

      return {
        ...s,
        cohortAssignments: updatedCycles
      };
    }));
  };

  const handleExportJSON = () => {
    try {
      const data = {
        residents,
        schedules,
        exportDate: new Date().toISOString(),
        version: "2.0"
      };
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `residency_scheduler_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 500);
    } catch (err) {
      console.error("Export JSON failed", err);
      toast.error('Failed to generate backup file.');
    }
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.residents || !json.schedules) {
          throw new Error("Invalid backup format");
        }

        const residentsToUse = Array.isArray(json.residents) ? json.residents : residents;
        const patchedSchedules = json.schedules.map((s: any) => normalizeAndSanitizeSchedule(s, residentsToUse));

        if (Array.isArray(json.residents)) {
          setResidents(json.residents);
        }
        setSchedules(patchedSchedules);
        setActiveScheduleId('all');
        toast.success(`Imported ${patchedSchedules.length} schedule(s) from backup`);
      } catch (err) {
        console.error("Import failed", err);
        toast.error("Failed to import backup. Please ensure it's a valid JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportXLSX = async () => {
    if (!activeSchedule) return;
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Schedule');
      const totalWeeksInGrid = (Object.values(displayGrid)[0] as any)?.length || 52;
      const headers = ['Resident', 'PGY', 'Cohort', ...Array.from({ length: totalWeeksInGrid }, (_, i) => `Week ${i + 1}`)];
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };

      displayResidents?.forEach(r => {
        const rowData = [r.name, r.level, String.fromCharCode(65 + (r.cohort ?? 0))];
        const residentCells: string[] = [];
        for (let i = 0; i < totalWeeksInGrid; i++) {
          const cell = displayGrid[r.id]?.[i];
          residentCells.push(cell?.assignment ? cell.assignment : "");
        }
        const row = worksheet.addRow([...rowData, ...residentCells]);

        for (let i = 0; i < totalWeeksInGrid; i++) {
          const cell = displayGrid[r.id]?.[i];
          if (cell?.assignment) {
            const rotation = programData.rotations.get(cell.assignment);
            const hex = getAssignmentColor(rotation?.color || 0, rotation?.intensity ?? 1, false).replace('#', '');
            row.getCell(4 + i).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF' + hex }
            };
          }
        }
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeSchedule.name.replace(/\s+/g, '_').toLowerCase()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (e) {
      console.error("Export failed", e);
      toast.error('Failed to export Excel file');
    } finally {
      setIsExporting(false);
    }

    // After successful export, optionally promote to canonical
    if (promoteOnExport && !activeSchedule.isHistory && activeSchedule.data?.[activeYear]) {
      setIsPromoting(true);
      try {
        const existingCanonical = await getCanonicalScheduleId(activeYear);
        if (existingCanonical) {
          const confirmed = confirm(
            `AY ${activeYear}-${(activeYear + 1).toString().slice(-2)} already has an official schedule. ` +
            `Replace it with "${activeSchedule.name}"?`
          );
          if (!confirmed) {
            setIsPromoting(false);
            return;
          }
        }

        await promoteScheduleToCanonical({
          academicYear: activeYear,
          grid: activeSchedule.data[activeYear],
          title: `Official: ${activeSchedule.name} (AY ${activeYear}-${(activeYear + 1).toString().slice(-2)})`,
        });
        toast.success(`Schedule promoted to official record for AY ${activeYear}-${(activeYear + 1).toString().slice(-2)}`);
      } catch (e) {
        console.error('Promotion failed', e);
        toast.error(`Excel export succeeded, but promotion to official schedule failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setIsPromoting(false);
      }
    }
  };

  const handleDuplicateSchedule = (sched: CandidateSchedule) => {
    const newId = Math.random().toString(36).substring(2, 9);
    // Duplicates always start as drafts — user must Publish explicitly
    const duplicated: DraftCandidate = {
      kind: 'draft',
      id: newId,
      name: `${sched.name} (Copy)`,
      data: JSON.parse(JSON.stringify(sched.data)),
      unifiedData: sched.unifiedData ? JSON.parse(JSON.stringify(sched.unifiedData)) : undefined,
      createdAt: new Date(),
      cohortAssignments: sched.cohortAssignments ? JSON.parse(JSON.stringify(sched.cohortAssignments)) : undefined,
      startYear: sched.startYear,
      metrics: sched.metrics,
    };
    setSchedules(prev => [...prev, duplicated]);
    setActiveScheduleId(newId);
  };

  const handleToggleLock = (residentId: string, weekIdx: number) => {
    if (!activeScheduleId) return;
    setSchedules(prev => prev.map(s => {
      if (s.id !== activeScheduleId) return s;
      const updatedData = { ...s.data };
      const grid = { ...(updatedData[activeYear] || {}) };
      const weeks = [...(grid[residentId] || [])];
      if (weeks[weekIdx]) {
        weeks[weekIdx] = { ...weeks[weekIdx], locked: !weeks[weekIdx].locked };
      }
      grid[residentId] = weeks;
      updatedData[activeYear] = grid;
      return { ...s, data: updatedData };
    }));
  };

  const handleLockWeek = (weekIdx: number) => {
    if (!activeScheduleId) return;
    setSchedules(prev => prev.map(s => {
      if (s.id !== activeScheduleId) return s;
      const updatedData = { ...s.data };
      const grid = { ...(updatedData[activeYear] || {}) };
      
      // Determine if we should lock or unlock based on the first resident's state
      const firstRid = Object.keys(grid)[0];
      const shouldLock = firstRid ? !grid[firstRid][weekIdx]?.locked : true;

      Object.keys(grid)?.forEach(rid => {
        const weeks = [...(grid[rid] || [])];
        if (weeks[weekIdx]) {
          weeks[weekIdx] = { ...weeks[weekIdx], locked: shouldLock };
        }
        grid[rid] = weeks;
      });
      updatedData[activeYear] = grid;
      return { ...s, data: updatedData };
    }));
  };

  const handleFactoryReset = () => {
    if (confirm("This will delete ALL data. Are you sure?")) {
      setResidents(programData.residents);
      setSchedules([]);
      setActiveScheduleId("all");
    }
  };

  const handleDeleteAllSchedules = () => {
    if (confirm("Delete all schedule versions?")) {
      // Delete from backend in background
      const schedulesToDelete = schedules.filter(s => s.backendId);
      schedulesToDelete.forEach(s => {
        syncService.deleteSchedule(s.backendId!);
      });
      setSchedules([]);
      setActiveScheduleId("all");
    }
  };

  const handleUnpinAllWeeks = () => {
    if (confirm("Unpin all assignments across all schedules?")) {
      setSchedules(prev => prev.map(s => ({
        ...s,
        data: Object.fromEntries(Object.entries(s.data).map(([year, grid]) => [
          year,
          Object.fromEntries(Object.entries(grid as ScheduleGrid).map(([rid, weeks]) => [
            rid,
            (weeks || []).map(w => w ? { ...w, locked: false } : { assignment: null, locked: false })
          ]))
        ]))
      })));
    }
  };


  const handleResetResidents = () => {
    if (confirm("Reset all residents to defaults?")) {
      setResidents(programData.residents);
    }
  };
  const handleLockResident = (residentId: string) => {
    if (!activeScheduleId) return;
    setSchedules(prev => prev.map(s => {
      if (s.id !== activeScheduleId) return s;
      const updatedData = { ...s.data };
      const grid = { ...(updatedData[activeYear] || {}) };
      const weeks = [...(grid[residentId] || [])];
      const shouldLock = !weeks.some(w => w.locked);
      grid[residentId] = weeks.map(w => ({ ...w, locked: shouldLock }));
      updatedData[activeYear] = grid;
      return { ...s, data: updatedData };
    }));
  };


  const NavButton = ({ id, label, icon: Icon, badgeCount }: any) => (
    <Button
      variant="ghost"
      onClick={() => startTransition(() => setActiveTab(id))}
      className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-all relative whitespace-nowrap
        ${activeTab === id
          ? 'border-blue text-blue bg-light-blue/20'
          : 'border-transparent text-muted hover:text-primary hover:border-light-6'}
        `}
    >
      <Icon size={16} />
      {label}
      {badgeCount > 0 && (
        <span className="bg-red-2 text-white text-[10px] px-1.5 rounded-full font-bold ml-1 animate-pulse">
          {badgeCount}
        </span>
      )}
    </Button>
  );

  const renderGenerationDashboard = () => {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-light-1/50 p-6">
        <div className="w-full max-w-full px-2 md:px-6">
          {convergenceData.length > 0 ? (
            <GenerationDashboard
              data={convergenceData}
              attempts={algoAttempts}
              exhaustionPoints={exhaustionPoints}
              maxTries={2000}
              onStop={stopGeneration}
              onSelectWinners={() => {
                if (currentWorkerRef.current) {
                  currentWorkerRef.current.postMessage({ type: 'promote' });
                }
              }}
              onCancelAlgorithm={(algoId) => {
                setCanceledAlgoIds(prev => new Set(prev).add(algoId));
                if (currentWorkerRef.current) {
                  currentWorkerRef.current.postMessage({ type: 'cancelAlgorithm', algoId });
                }
              }}
              algorithms={compParams.algorithmIds.map(id => {
                const algo = algoConfig.find(a => a.id === id);
                return { id, name: algo?.name || id, color: algo?.color || '#000' };
              })}
              canceledIds={canceledAlgoIds}
              healerProgress={healerProgress}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl shadow-xl border border-light-5">
              <div className="w-12 h-12 rounded-full border-4 border-light-5 border-t-blue animate-spin mb-4" />
              <p className="text-muted font-bold tracking-tight">Initializing algorithms...</p>
            </div>
          )}
          
          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <Loader2 size={20} className="text-blue animate-spin" />
              <span className="text-lg font-black text-primary uppercase tracking-tight">
                {genStatus || 'Engine Initializing...'}
              </span>
            </div>
            <p className="text-muted font-medium text-sm">
              {genProgress || 0}% through global optimization
            </p>
          </div>
        </div>
      </div>
    );
  };


  const getYearLabel = (y: number) => {
    const now = new Date();
    // Academic year starts July 1st (month index 6)
    const currentAY = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    
    if (y === currentAY) return `AY ${y}-${(y+1).toString().slice(-2)} (Current)`;
    
    const diff = y - currentAY;
    if (diff === 1) return `AY ${y}-${(y+1).toString().slice(-2)} (Next)`;
    
    const sign = diff > 0 ? '+' : '';
    return `AY ${y}-${(y+1).toString().slice(-2)} (${sign}${diff}y)`;
  };

  return (
    <div className={`min-h-screen bg-light-1 flex flex-col font-sans transition-all duration-300 ${isGenerating ? 'engine-busy' : ''}`}>
      {/* ─── Global Header Bar ─── */}
      <div className="h-11 bg-light-3 flex items-center shrink-0 z-30 px-4 border-b border-light-4">

        {/* Left: App Title */}
        <div className="flex items-center gap-2 mr-6">
          <span className="text-sm font-black text-primary tracking-tight">Residency Scheduler</span>
          {isGenerating && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue/10 rounded-full border border-blue/20 animate-pulse">
              <Loader2 size={10} className="text-blue animate-spin" />
              <span className="text-[9px] font-black text-blue uppercase tracking-tighter">Engine Busy</span>
            </div>
          )}
          {/* Sync Status Indicator */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border cursor-default"
            style={{
              backgroundColor: syncStatus === 'error' ? 'rgba(239,68,68,0.1)'
                : syncStatus === 'live' ? 'rgba(139,92,246,0.1)'
                : syncStatus === 'connected' ? 'rgba(16,185,129,0.1)'
                : 'rgba(156,163,175,0.1)',
              borderColor: syncStatus === 'error' ? 'rgba(239,68,68,0.2)'
                : syncStatus === 'live' ? 'rgba(139,92,246,0.2)'
                : syncStatus === 'connected' ? 'rgba(16,185,129,0.2)'
                : 'rgba(156,163,175,0.2)',
            }}
            title={
              syncStatus === 'error' ? 'Sync Error — server communication failed'
              : syncStatus === 'live' ? 'Live — real-time sync active with other clients'
              : syncStatus === 'connected' ? 'Connected — authenticated with server'
              : 'Local Only — not connected to a server'
            }
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: syncStatus === 'error' ? '#ef4444'
                  : syncStatus === 'live' ? '#8b5cf6'
                  : syncStatus === 'connected' ? '#10b981'
                  : '#9ca3af',
              }}
            />
            <span
              className="text-[9px] font-black uppercase tracking-tighter"
              style={{
                color: syncStatus === 'error' ? '#ef4444'
                  : syncStatus === 'live' ? '#8b5cf6'
                  : syncStatus === 'connected' ? '#10b981'
                  : '#9ca3af',
              }}
            >
              {syncStatus === 'error' ? 'Sync Error'
                : syncStatus === 'live' ? 'Live'
                : syncStatus === 'connected' ? 'Connected'
                : 'Local Only'}
            </span>
          </div>
        </div>

        {/* Center: Academic Year Tabs */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <div className="flex bg-light-2 p-0.5 rounded-xl border border-light-5">
            {allAcademicYears.map(y => {
              const isUnifiedRelevant = viewMode === 'unified' && y >= (activeSchedule?.startYear || ACTIVE_START_YEAR) && y <= (activeSchedule?.startYear || ACTIVE_START_YEAR) + 2;
              const isActive = viewMode === 'unified' ? isUnifiedRelevant : activeYear === y;
              return (
                <Button
                  variant="ghost"
                  key={y}
                  onClick={() => {
                    startTransition(() => {
                      setActiveYear(y);
                      handleSetViewMode('singleYear');
                      if (activeScheduleId === 'settings') {
                        // keep settings open
                      } else if (y < ACTIVE_START_YEAR) {
                        // For historical years, switch to schedule view but preserve candidate selection
                        if (['residents', 'backup', 'reset'].includes(activeTab)) {
                          setActiveTab('schedule');
                        }
                      }
                    });
                  }}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-blue shadow-sm border border-light-5'
                      : 'text-muted hover:text-primary'
                  }`}
                >
                  {y < ACTIVE_START_YEAR && <History size={11} className="inline mr-1 -mt-px" />}
                  {getYearLabel(y)}
                </Button>
              );
            })}
          </div>
          {activeSchedule?.unifiedData && (
            <div className="flex items-center gap-1.5 ml-4">
              <span className="text-[9px] font-black text-muted uppercase tracking-wider">Scope</span>
              <div 
                onClick={() => handleSetViewMode(viewMode === 'unified' ? 'singleYear' : 'unified')}
                className="rocker-toggle"
                title="Toggle between single-year (1Y) and 3-year unified (3Y) views"
              >
                <div className={`rocker-toggle-thumb ${viewMode === 'unified' ? 'unified' : ''}`} />
                <div className={`rocker-toggle-option ${viewMode !== 'unified' ? 'active' : ''}`}>1Y</div>
                <div className={`rocker-toggle-option ${viewMode === 'unified' ? 'active' : ''}`}>3Y</div>
              </div>
            </div>
          )}
        </div>
        {/* Right: Settings Icons */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            onClick={() => {
              setActiveSettingsTab('residents');
              setIsSettingsOpen(true);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-muted hover:text-primary transition-all"
          >
            <Users size={14} />
            Residents
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setActiveSettingsTab('backup');
              setIsSettingsOpen(true);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-muted hover:text-primary transition-all"
          >
            <Download size={14} />
            Backup
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setActiveSettingsTab('reset');
              setIsSettingsOpen(true);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-muted hover:text-primary transition-all"
          >
            <RotateCcw size={14} />
            Reset
          </Button>
        </div>
     </div>

      {(activeScheduleId !== 'all' && activeScheduleId !== 'settings' && activeScheduleId !== 'draft') || isHistoricalYear || schedules.some(s => s.isGenerating) ? (
        <div className="px-6 bg-white border-b border-light-5 flex gap-1 z-20 shadow-sm shrink-0 overflow-x-auto">
          <NavButton id="schedule" label={viewMode === 'unified' ? "Schedule 3yr" : "Schedule"} icon={LayoutGrid} />
          {viewMode !== 'unified' && <NavButton id="workload" label="Workload" icon={BarChart3} />}
          <NavButton id="coverage" label={viewMode === 'unified' ? "Coverage 3yr" : "Coverage"} icon={Table} badgeCount={currentCoverageViolationsCount} />
          <NavButton id="totals" label={viewMode === 'unified' ? "Totals 3yr" : "Totals"} icon={Users} />
          <NavButton 
            id="requirements" 
            label={viewMode === 'unified' ? "Requirements 3yr" : "Requirements"} 
            icon={ClipboardList} 
            badgeCount={currentRequirementsViolationsCount} 
          />
          {viewMode !== 'unified' && (
            <>
              <NavButton id="cycles" label="Cycles" icon={Users} />
              <NavButton id="coworking" label="Coworking" icon={Network} />
              <NavButton id="fairness" label="Fairness" icon={Scale} />
            </>
          )}
          <NavButton id="export" label={viewMode === 'unified' ? "Export 3yr" : "Export"} icon={FileSpreadsheet} />
        </div>
      ) : null}

      <main className="flex-1 overflow-hidden relative bg-white min-h-0">
        <div className="absolute inset-0 flex flex-col">
          {activeScheduleId === 'draft' && !isHistoricalYear ? (
            isGenerating ? renderGenerationDashboard() : (
              <CompetitorStudio
                algorithms={algoConfig}
                stats={algoStats}
                params={compParams}
                onParamsChange={setCompParams}
                onToggleAlgorithm={(id) => {
                  setCompParams(prev => ({
                    ...prev,
                    algorithmIds: prev.algorithmIds.includes(id)
                      ? prev.algorithmIds.filter(a => a !== id)
                      : [...prev.algorithmIds, id]
                  }));
                }}
                onCompete={handleGenerate}
                onClearStats={() => setAlgoStats([])}
              />
            )
          ) : (activeScheduleId === 'all' && !isHistoricalYear) ? (
            <div className="flex-1 bg-white overflow-y-auto">
              <ScheduleComparison
                residents={residents}
                schedules={schedules}
                activeScheduleId={activeScheduleId}
                activeYear={activeYear}
                history={historySchedules}
                onSelect={(id) => {
                  startTransition(() => {
                    setActiveScheduleId(id);
                    if (['residents', 'backup', 'reset', 'export'].includes(activeTab)) {
                      setActiveTab('schedule');
                    }
                  });
                }}
                onRename={(id) => {
                  const sched = schedules.find(s => s.id === id);
                  if (sched) {
                    setScheduleToRename(sched);
                    setRenameModalOpen(true);
                  }
                }}
              />
            </div>
          ) : activeSchedule?.isGenerating ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-light-1/50 p-6">
              <div className="w-full max-w-full px-2 md:px-6">
            {/* Multiple charts for multi-year generation */}
              {convergenceData.length > 0 ? (
                <GenerationDashboard 
                  data={convergenceData}
                  attempts={algoAttempts}
                  exhaustionPoints={exhaustionPoints}
                  maxTries={2000}
                  onStop={stopGeneration}
                  onSelectWinners={() => {
                    if (currentWorkerRef.current) {
                      currentWorkerRef.current.postMessage({ type: 'promote' });
                    }
                  }}
                  onCancelAlgorithm={(algoId) => {
                    setCanceledAlgoIds(prev => new Set(prev).add(algoId));
                    if (currentWorkerRef.current) {
                      currentWorkerRef.current.postMessage({ type: 'cancelAlgorithm', algoId });
                    }
                  }}
                  algorithms={compParams.algorithmIds.map(id => {
                    const algo = algoConfig.find(a => a.id === id);
                    return { id, name: algo?.name || id, color: algo?.color || '#000' };
                  })}
                  canceledIds={canceledAlgoIds}
                  healerProgress={healerProgress}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-64 bg-white rounded-3xl shadow-xl border border-light-5">
                  <div className="w-12 h-12 rounded-full border-4 border-light-5 border-t-blue animate-spin mb-4" />
                  <p className="text-muted font-bold tracking-tight">Initializing algorithms...</p>
                </div>
              )}
                
                <div className="mt-8 flex flex-col items-center gap-2">
                  <div className="flex items-center gap-3">
                    <Loader2 size={20} className="text-blue animate-spin" />
                    <span className="text-lg font-black text-primary uppercase tracking-tight">
                      {activeSchedule.progressLabel || 'Engine Initializing...'}
                    </span>
                  </div>
                  <p className="text-muted font-medium text-sm">
                    {activeSchedule.progress || 0}% through global optimization
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'schedule' && (
                <div className="flex-1 overflow-hidden flex flex-col">
                  {/* Schedule Sub-header: Group By + Violations */}
                  <div className="px-6 py-3 bg-white border-b flex items-center justify-between shrink-0">
                    {/* Left: Group By */}
                    <div className="flex items-center gap-6">
                      {viewMode !== 'unified' && (
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-muted uppercase tracking-wider">Group By</span>
                          <div className="flex bg-light-2 p-1 rounded-xl border border-light-5">
                            <Button
                              variant="ghost"
                              onClick={() => setResidentSortOrder('pgy')}
                              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${residentSortOrder === 'pgy' ? 'bg-white text-blue shadow-sm border border-light-5' : 'text-muted hover:text-primary'}`}
                            >
                              <LayoutGrid size={14} />
                              PGY Level
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => setResidentSortOrder('cohort')}
                              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${residentSortOrder === 'cohort' ? 'bg-white text-blue shadow-sm border border-light-5' : 'text-muted hover:text-primary'}`}
                            >
                              <Users size={14} />
                              Cohort
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>


                    <div className="flex items-center gap-3">
                      {!activeSchedule?.isHistory && (
                        <Button
                          variant={isHealing ? 'ghost' : 'secondary'}
                          size="sm"
                          onClick={handleOpenHealerPanel}
                          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isHealing ? 'bg-light-3 text-primary shadow-inner' : 'text-muted hover:text-primary'}`}
                        >
                          {isHealerRunning ? (
                            <>
                              <Loader2 size={14} className="animate-spin text-violet" />
                              Healing {bestHealCount ?? activeViolationsCount} {healerProgress !== undefined && healerProgress > 0 ? `(${healerProgress}%)` : ''}
                            </>
                          ) : isHealing ? (
                            <>
                              <Sparkles size={14} className="text-violet animate-pulse" />
                              Healer Mode ({bestHealCount ?? activeViolationsCount})
                            </>
                          ) : (
                            <>
                              <Sparkles size={14} />
                              Heal {activeViolationsCount}
                            </>
                          )}
                        </Button>
                      )}
                      {/* Publish button — only for draft, non-history schedules when authenticated */}
                      {!activeSchedule?.isHistory && isAuthenticated() && activeSchedule && (
                        isPublished(activeSchedule) ? (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                            <CloudUpload size={13} />
                            Published
                          </span>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handlePublishClick}
                            disabled={publishState !== 'idle' || !activeSchedule?.startYear}
                            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold text-muted hover:text-primary transition-all"
                          >
                            {publishState === 'saving' ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                Publishing…
                              </>
                            ) : (
                              <>
                                <CloudUpload size={14} />
                                Publish
                              </>
                            )}
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                          <ScheduleTable
                    residents={displayResidents}
                    schedule={displayGrid}
                    startYear={viewMode === 'unified' ? (activeSchedule?.startYear || ACTIVE_START_YEAR) : (activeSchedule?.isHistory ? activeSchedule.startYear : activeYear)}
                    cohortAssignments={activeYearCohorts}
                    isReadOnly={activeSchedule?.isHistory}

                    onCellClick={handleCellClick}
                    onLockWeek={handleLockWeek}
                    onLockResident={handleLockResident}
                    onToggleLock={handleToggleLock}
                  />
                </div>
              )}
              {activeTab === 'workload' && <div className="flex-1 overflow-y-auto"><Dashboard residents={activeResidents} stats={stats} /></div>}
              {activeTab === 'coverage' && (
                <div className="flex-1 overflow-hidden">
                  <AssignmentStats
                    residents={viewMode === 'unified' ? displayResidents : activeResidents}
                    schedule={viewMode === 'unified' ? displayGrid : currentGrid}
                  />
                </div>
              )}
              {activeTab === 'totals' && (
                <div className="flex-1 overflow-hidden">
                  <ResidentAssignmentsStats
                    residents={viewMode === 'unified' ? displayResidents : activeResidents}
                    schedule={viewMode === 'unified' ? displayGrid : currentGrid}
                  />
                </div>
              )}
              {activeTab === 'requirements' && (
                <div className="flex-1 overflow-hidden">
                  <RequirementsStats
                    residents={viewMode === 'unified' ? displayResidents : activeResidents}
                    schedule={viewMode === 'unified' ? displayGrid : currentGrid}
                    history={{ ...historySchedules, ...(activeSchedule?.data || {}) }}
                    activeYear={viewMode === 'unified' ? (activeSchedule?.startYear || ACTIVE_START_YEAR) : activeYear}
                  />
                </div>
              )}
              {activeTab === 'cycles' && (
                <div className="flex-1 overflow-hidden">
                  <CycleKanban
                    residents={activeResidents}
                    activeYear={activeYear}
                    cycleAssignments={activeYearCohorts}
                    onAssignCycle={handleAssignCycle}
                  />
                </div>
              )}
              {activeTab === 'coworking' && <div className="flex-1 overflow-hidden"><RelationshipStats residents={activeResidents} schedule={currentGrid} /></div>}
              {activeTab === 'fairness' && <div className="flex-1 overflow-y-auto"><FairnessStats residents={activeResidents} schedule={currentGrid} precalculated={fairness} /></div>}
              {activeTab === 'export' && (
                <div className="flex-1 overflow-y-auto p-8 bg-light-1">
                  <div className="max-w-2xl mx-auto">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-light-5 flex flex-col">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-green/10 rounded-lg text-green">
                          <FileSpreadsheet size={24} />
                        </div>
                        <div>
                          <h3 className="font-bold text-primary">Printable Schedule (XLSX)</h3>
                          <p className="text-xs text-muted">Formatted spreadsheet for the active version</p>
                        </div>
                      </div>

                      <div className="flex-1 space-y-4">
                        <div className="p-4 bg-light-1 rounded-lg border border-light-3">
                          <div className="text-[10px] text-muted uppercase font-bold mb-1">Active Schedule:</div>
                          <div className="text-sm font-bold text-primary truncate">
                            {activeSchedule?.name || 'No active schedule'}
                          </div>
                        </div>

                        <Button variant="primary" size="md" 
                          onClick={handleExportXLSX}
                          disabled={isExporting || isPromoting}
                           className="w-full py-4 bg-green hover:bg-emerald-700 disabled:bg-light-3 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all" 
                        >
                          {(isExporting || isPromoting) ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
                          {isPromoting ? 'Promoting to Official...' : 'Export Current to Excel'}
                        </Button>

                        {!activeSchedule?.isHistory && activeSchedule?.data?.[activeYear] && (
                          <button
                            onClick={() => setPromoteOnExport(!promoteOnExport)}
                            className="w-full flex items-center gap-3 p-3 rounded-lg border border-light-3 hover:bg-light-1 transition-colors cursor-pointer"
                          >
                            {promoteOnExport
                              ? <CheckSquare size={18} className="text-green shrink-0" />
                              : <Square size={18} className="text-muted shrink-0" />
                            }
                            <div className="text-left">
                              <div className="text-sm font-medium text-primary flex items-center gap-1.5">
                                <Crown size={14} className="text-amber-500" />
                                Set as official schedule for AY {activeYear}-{(activeYear + 1).toString().slice(-2)}
                              </div>
                              <div className="text-[10px] text-muted mt-0.5">
                                Copies this year's assignments to the historical record (locked)
                              </div>
                            </div>
                          </button>
                        )}
                      </div>

                      <div className="mt-6 bg-highlight p-4 rounded-lg flex gap-3 items-start">
                        <AlertCircle size={16} className="text-orange shrink-0 mt-0.5" />
                        <p className="text-[11px] text-orange-dark leading-relaxed">
                          XLSX exports contain coloring and labeling suitable for printing, but
                          <strong> cannot be imported back into the system.</strong> Use JSON for backups.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <SettingsOverlay
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        activeTab={activeSettingsTab}
        setActiveTab={setActiveSettingsTab}
        residents={residents}
        setResidents={setResidents}
        activeYear={activeYear}
        handleExportJSON={handleExportJSON}
        handleImportJSON={handleImportJSON}
        handleFactoryReset={handleFactoryReset}
        onDeleteAllSchedules={handleDeleteAllSchedules}
        onUnpinAllWeeks={handleUnpinAllWeeks}
        onResetResidents={handleResetResidents}
      />

      <HealerPanel
        isOpen={isHealerPanelOpen}
        onClose={handleCancelHealedSchedule}
        isRunning={isHealerRunning}
        progress={healerProgress ?? 0}
        originalViolations={originalHealCount}
        currentViolations={bestHealCount}
        onStart={handleStartHealerStrategy}
        onStop={handleStopHealerStrategy}
        onApply={handleApplyHealedSchedule}
        onCancel={handleCancelHealedSchedule}
      />

      {activeScheduleId !== 'settings' && !isHistoricalYear && (
        <div className="h-9 bg-light-3 flex items-stretch shrink-0 z-30 px-2 border-t border-light-4 relative">
          {/* Left: Future Schedules label */}
          <div
            onClick={() => {
              startTransition(() => {
                setActiveScheduleId('all');
                if (['residents', 'backup', 'reset'].includes(activeTab)) setActiveTab('schedule');
              });
            }}
            className={`flex items-center px-4 text-[11px] font-bold cursor-pointer transition-all border-r border-light-4 ${
              activeScheduleId === 'all'
                ? 'bg-white text-blue'
                : 'text-muted hover:text-primary hover:bg-light-2'
            }`}
          >
            Future Schedules
          </div>

          {/* Center: Scrollable candidate tabs */}
          <div className="flex-1 relative flex items-stretch overflow-hidden">
            {canScrollLeft && (
              <div className="absolute left-0 top-0 bottom-0 z-40 w-8 flex items-center justify-start bg-gradient-to-r from-light-3 to-transparent pointer-events-none">
                <Button onClick={() => scrollTabs('left')} className="ml-0.5 p-0.5 rounded-full bg-white/80 hover:bg-white text-primary shadow-sm pointer-events-auto"><ChevronLeft size={12} /></Button>
              </div>
            )}

            <div
              ref={tabContainerRef}
              onScroll={checkScroll}
              className="flex-1 flex items-stretch gap-px overflow-x-auto overflow-y-hidden no-scrollbar scroll-smooth"
            >
              {isGenerating && (
                <div
                  onClick={() => {
                    startTransition(() => {
                      setActiveScheduleId('draft');
                    });
                  }}
                  className={`flex items-center gap-1.5 px-3 text-[11px] font-medium transition-all relative cursor-pointer whitespace-nowrap ${
                    activeScheduleId === 'draft'
                      ? 'bg-white text-blue border-t-2 border-t-blue'
                      : 'text-muted hover:bg-light-2 hover:text-primary border-t-2 border-t-transparent'
                  }`}
                >
                  <div className="animate-spin h-2.5 w-2.5 border-[1.5px] border-blue border-t-transparent rounded-full flex-shrink-0" />
                  <span className="truncate max-w-[120px]">Generating... ({genProgress}%)</span>
                  <Button variant="ghost" size="sm" onClick={(e) => { 
                    e.stopPropagation(); 
                    stopGeneration();
                  }} className="p-0.5 rounded text-muted hover:text-red transition-colors ml-1">
                    <X size={10} />
                  </Button>
                </div>
              )}
              {schedules.length === 0 && !isGenerating ? (
                <div className="flex items-center justify-center flex-1 text-[11px] text-muted italic">
                  No future schedule candidates generated yet
                </div>
              ) : schedules.map(sched => {
                const isActive = activeScheduleId === sched.id;
                return (
                  <div
                    key={sched.id}
                    onClick={() => {
                      startTransition(() => {
                        setActiveScheduleId(sched.id);
                        if (['residents', 'backup', 'reset'].includes(activeTab)) setActiveTab('schedule');
                      });
                    }}
                    className={`group flex items-center gap-1.5 px-3 text-[11px] font-medium transition-all relative cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-white text-blue border-t-2 border-t-blue'
                        : 'text-muted hover:bg-light-2 hover:text-primary border-t-2 border-t-transparent'
                    } ${isPending ? 'opacity-70' : ''}`}
                  >
                    <Identicon id={sched.id} />
                    <span className="truncate max-w-[120px]">{sched.name}</span>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                      <Button variant="ghost" size="sm" onClick={(e) => { 
                        e.stopPropagation(); 
                        handleDuplicateSchedule(sched);
                      }} title="Duplicate Schedule" className="p-0.5 rounded text-muted hover:text-blue transition-colors">
                        <Copy size={10} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => { 
                        e.stopPropagation(); 
                        handleDeleteSchedule(sched);
                      }} className="p-0.5 rounded text-muted hover:text-red transition-colors" title={isPublished(sched) ? 'Delete candidate for all users' : 'Remove draft'}>
                        <Trash2 size={10} />
                      </Button>
                    </div>
                  </div>
                );
              })}

            </div>

            {canScrollRight && (
              <div className="absolute right-0 top-0 bottom-0 z-40 w-8 flex items-center justify-end bg-gradient-to-l from-light-3 to-transparent pointer-events-none">
                <Button onClick={() => scrollTabs('right')} className="mr-0.5 p-0.5 rounded-full bg-white/80 hover:bg-white text-primary shadow-sm pointer-events-auto"><ChevronRight size={12} /></Button>
              </div>
            )}
          </div>

          {/* Right: Generate button */}
          <div
            onClick={() => {
              startTransition(() => {
                setActiveScheduleId('draft');
              });
            }}
            className={`flex items-center gap-1.5 px-4 text-[11px] font-bold cursor-pointer transition-all border-l border-light-4 ${
              activeScheduleId === 'draft'
                ? 'bg-white text-blue'
                : 'text-muted hover:text-primary hover:bg-light-2'
            }`}
          >
            <Sparkles size={12} />
            Generate
          </div>
        </div>
      )}

      <AssignmentModal isOpen={modalOpen} onClose={() => setModalOpen(false)} current={selectedCell && currentGrid[selectedCell.resId]?.[selectedCell.week]?.assignment || null} onSave={handleAssignmentSave} anchorRect={anchorRect} />
      <RenameModal isOpen={renameModalOpen} initialName={scheduleToRename?.name || ''} onClose={() => { setRenameModalOpen(false); setPublishState('idle'); setScheduleToRename(null); }} onSave={publishState === 'naming' ? handlePublishSave : handleRename} />
    </div>
  );
};

const App: React.FC = () => {
  const [programData, setProgramData] = useState<ProgramData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSlow, setIsSlow] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setLoadError(null);
    setIsSlow(false);
    const slowTimer = setTimeout(() => setIsSlow(true), 5000);

    loadProgramData(ACTIVE_START_YEAR)
      .then(data => {
        clearTimeout(slowTimer);
        setProgramData(data);
      })
      .catch(err => {
        clearTimeout(slowTimer);
        const message = err instanceof Error ? err.message : String(err);
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        if (message.includes('fetch') || message.includes('network') || message.includes('ECONNREFUSED') || message.includes('Failed')) {
          setLoadError(`Could not reach the CMS backend at ${apiUrl}.\n\nPossible causes:\n• The backend server is not running\n• A CORS policy is blocking the request (check the browser console)\n• The API URL is incorrect`);
        } else {
          setLoadError(message);
        }
      });

    return () => clearTimeout(slowTimer);
  }, [retryCount]);

  if (loadError) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#fafafa', color: '#333', gap: '16px', padding: '24px',
      }}>
        <div style={{
          background: '#fff', borderRadius: '16px', padding: '40px 48px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.04)',
          border: '1px solid #eee', maxWidth: '480px', width: '100%', textAlign: 'center',
        }}>
          <AlertCircle size={40} style={{ color: '#e06c4a', marginBottom: '16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: '#222' }}>
            Connection Failed
          </h2>
          <pre style={{
            fontSize: '13px', color: '#888', lineHeight: '1.6', whiteSpace: 'pre-wrap',
            margin: '0 0 24px', fontFamily: 'inherit',
          }}>
            {loadError}
          </pre>
          <button
            onClick={() => { setLoadError(null); setRetryCount(c => c + 1); }}
            style={{
              background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px',
              padding: '10px 28px', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
              transition: 'background 150ms',
            }}
            onMouseOver={e => (e.currentTarget.style.background = '#2563eb')}
            onMouseOut={e => (e.currentTarget.style.background = '#3b82f6')}
          >
            <RotateCcw size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!programData) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#fafafa', color: '#555', gap: '12px',
      }}>
        <Loader2 size={28} style={{ color: '#3b82f6', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: '14px', fontWeight: 500 }}>
          Loading Residency Data from CMS…
        </div>
        {isSlow && (
          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
            This is taking longer than usual. Is the backend server running?
          </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <ToastProvider>
      <ProgramDataProvider programData={programData}>
        <AppContent />
      </ProgramDataProvider>
    </ToastProvider>
  );
};

export default App;
