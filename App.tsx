
import React, { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import ExcelJS from 'exceljs';
import {
  Resident,

  ScheduleGrid,
  ScheduleHistory,
  AssignmentType,
  ScheduleCell,
  ConvergenceDataPoint
} from './types';
import {
  GENERATE_INITIAL_RESIDENTS,
  ASSIGNMENT_LABELS,
  ASSIGNMENT_HEX_COLORS,
  ASSIGNMENT_ABBREVIATIONS,
  ACTIVE_START_YEAR,
  TOTAL_WEEKS
} from './constants';
import historicalGridData from './specification/historical_schedules_grid_v2.json';
import { generateSchedule, calculateStats, calculateFairnessMetrics, calculateScheduleScore, getRequirementViolations, getWeeklyViolations } from './services/scheduler';
import { preloadHistoricalData } from './services/generators/historyPreloader';
import { ScheduleTable } from './components/ScheduleTable';
import { Dashboard } from './components/Dashboard';
import { ResidentManager } from './components/ResidentManager';
import { RelationshipStats } from './components/RelationshipStats';
import { AssignmentStats } from './components/AssignmentStats';
import { FairnessStats } from './components/FairnessStats';
import { RequirementsStats } from './components/RequirementsStats';
import { ScheduleComparison } from './components/ScheduleComparison';
import { ACGMEAudit } from './components/ACGMEAudit';
import { CompetitorStudio } from './components/CompetitorStudio';
import { CohortKanban } from './components/CohortKanban';
import { GenerationDashboard } from './components/GenerationDashboard';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
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
  Lock
} from 'lucide-react';

export interface ScheduleSession {
  id: string;
  name: string;
  data: ScheduleHistory; // Represents multiple active years (e.g. { 2026: ..., 2027: ... })
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
  cohortAssignments?: Record<number, Record<string, number>>; // year-specific mappings
  isHistory?: boolean;
  startYear?: number;
  lockedUntilWeek?: number;
}

const APP_DATA_VERSION = 4;

const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const storedVersion = localStorage.getItem('rsp_app_version');
    if (storedVersion && parseInt(storedVersion) < APP_DATA_VERSION) {
      console.warn("New version detected, clearing localStorage");
      localStorage.clear();
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
  onSave
}: {
  isOpen: boolean;
  onClose: () => void;
  current: AssignmentType | null;
  onSave: (val: AssignmentType | null) => void
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-bold mb-4">Edit Assignment</h3>
        <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-2">
          {Object.entries(ASSIGNMENT_LABELS).map(([key, label]) => (
            <Button
              key={key}
              onClick={() => onSave(key as AssignmentType)}
              className={`p-3 rounded border text-sm font-medium transition-colors text-left
                ${current === key ? 'ring-2 ring-blue bg-light-blue/20 border-blue' : 'hover:bg-light-1 border-light-5'}
              `}
            >
              {label}
            </Button>
          ))}
          <Button
            onClick={() => onSave(null)}
            className="p-3 rounded border border-light-5 text-sm font-medium text-red hover:bg-red/10 col-span-2"
          >
            Clear Assignment
          </Button>
        </div>
        <Button variant="secondary" size="md"  onClick={onClose}  className="mt-4 w-full py-2 bg-light-2 rounded hover:bg-light-3" >
          Cancel
        </Button>
      </div>
    </div>
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
        <h3 className="text-lg font-bold mb-4">Rename Schedule</h3>
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

const App: React.FC = () => {
  const [residents, setResidents] = useState<Resident[]>(() =>
    loadState('rsp_residents_v4', GENERATE_INITIAL_RESIDENTS())
  );

  const [schedules, setSchedules] = useState<ScheduleSession[]>(() =>
    loadState('rsp_schedules_v4', [])
  );


  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(() =>
    loadState('rsp_active_id', 'all')
  );

  const [activeYear, setActiveYear] = useState<number>(ACTIVE_START_YEAR);
  const [residentSortOrder, setResidentSortOrder] = useState<'pgy' | 'cohort'>(() =>
    loadState('rsp_sort_order', 'pgy')
  );

  // Dynamic history detection
  const historicalYears = useMemo(() => 
    Object.keys(historicalGridData)
      .map(Number)
      .filter(y => y < ACTIVE_START_YEAR)
      .sort((a, b) => a - b),
  []);

  // All academic years: historical + current + future
  const allAcademicYears = useMemo(() => [
    ...historicalYears,
    ACTIVE_START_YEAR,
    ACTIVE_START_YEAR + 1,
    ACTIVE_START_YEAR + 2
  ], [historicalYears]);

  const isHistoricalYear = activeYear < ACTIVE_START_YEAR;
  const isFutureYear = activeYear >= ACTIVE_START_YEAR;

  const { history: historySchedules, cohortAssignments: historicalCohortsByYear } = useMemo(() => preloadHistoricalData(residents), [residents]);

  const [activeTab, setActiveTab] = useState<'schedule' | 'workload' | 'assignments' | 'fairness' | 'requirements' | 'audit' | 'relationships' | 'residents' | 'reset' | 'backup' | 'export' | 'draft' | 'cohorts'>('schedule');
  
  const [algoConfig, setAlgoConfig] = useState<AlgorithmConfig[]>([
    { id: 'stochastic', name: 'Stochastic', description: 'The tried-and-true generalist. Good at everything, master of none. Uses weighted randomness to explore valid slots.', enabled: true, color: '#3b82f6' },
    { id: 'experimental', name: 'Staffing First', description: 'Staffing-centric optimization. Prioritizes 1-week slots to guarantee hospital minimums are met at all costs.', enabled: true, color: '#8b5cf6' },
    { id: 'strict', name: 'Education First', description: 'Objective-centric optimization. Prioritizes PGY educational targets with a residual capacity guard to ensure hospital coverage.', enabled: true, color: '#10b981' },
    { id: 'greedy', name: 'Week By Week', description: 'Staffing-centric generator. Iterates through each week and fills hospital gaps using first-available residents.', enabled: true, color: '#f59e0b' },

  ]);

  const [algoStats, setAlgoStats] = useState<AlgorithmStats[]>(() => {
    const saved = localStorage.getItem('rsp_algo_stats_v1');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [convergenceData, setConvergenceData] = useState<number[][]>([]);
  const convergenceBufferRef = useRef<number[][]>([]);
  const lastUpdateRef = useRef<number>(0);
  const [canceledAlgoIds, setCanceledAlgoIds] = useState<Set<string>>(new Set());
  const activeWorkersRef = useRef<Set<Worker>>(new Set());
  const currentWorkerRef = useRef<Worker | null>(null);
  const generationControllerRef = useRef<AbortController | null>(null);
  const [isCanceled, setIsCanceled] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genAttempts, setGenAttempts] = useState(0);
  const [genStatus, setGenStatus] = useState('');
  const isGeneratingRef = useRef(false);



  const [compParams, setCompParams] = useState<CompetitionParams>(() => {
    const loaded = loadState('rsp_comp_params_v1', {
      tries: 100,
      priority: CompetitionPriority.BEST_SCORE,
      algorithmIds: ['stochastic', 'experimental', 'strict'],
      topN: 10,
      multiYear: 3
    });

    const validIds = ['stochastic', 'experimental', 'strict', 'greedy'];
    return {
      ...loaded,
      topN: loaded.topN || 10,
      multiYear: loaded.multiYear || 3,
      algorithmIds: loaded.algorithmIds.filter(id => (validIds as string[]).includes(id))

    };
  });

  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);


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

  const getCurrentWeekForYear = (startYear: number): number => {
    const today = new Date();
    const ayStart = new Date(startYear, 6, 1); // July 1st
    if (today < ayStart) return -1;
    const diffMs = today.getTime() - ayStart.getTime();
    const weekIdx = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return Math.min(weekIdx, TOTAL_WEEKS - 1);
  };

  const activeSchedule = useMemo(() => {
    if (isHistoricalYear) {
      const lockedUntil = getCurrentWeekForYear(activeYear);
      
      // Augment history with pre-locked flags
      const baseHistory = historySchedules[activeYear] || {};
      const augmentedData: ScheduleGrid = {};
      
      Object.keys(baseHistory).forEach(resId => {
        augmentedData[resId] = (baseHistory[resId] || []).map((cell, idx) => ({
          ...cell,
          locked: cell.locked || idx <= lockedUntil
        }));
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
  }, [schedules, activeScheduleId, historySchedules, activeYear, isHistoricalYear]);
  
  // Sync convergence data from buffer when switching back to dashboard
  useEffect(() => {
    if (activeTab === 'loading' && activeSchedule?.isGenerating && convergenceBufferRef.current.length > convergenceData.length) {
      setConvergenceData([...convergenceBufferRef.current]);
    }
  }, [activeTab, activeSchedule?.isGenerating, convergenceData.length]);


  // Helper to derive active residents for any year (graduation aware)
  const getResidentsForYear = (year: number) => {
    const yearCohorts = activeSchedule?.cohortAssignments?.[year] || historicalCohortsByYear[year] || {};
    
    return residents.filter(r => {
      const level = year - r.startYear + 1;
      return level >= 1 && level <= 3;
    }).map(r => {
      const level = (year - r.startYear + 1) as 1 | 2 | 3;
      const clinicType = level === 2 ? AssignmentType.NIMA_CLINIC : AssignmentType.CLINIC;
      const cohort = yearCohorts[r.id] ?? 0;
      return { ...r, level, clinicType, cohort };
    }).sort((a, b) => {
      if (residentSortOrder === 'cohort') {
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
  const activeResidents = useMemo(() => getResidentsForYear(activeYear), [residents, activeYear, residentSortOrder, activeSchedule, historicalCohortsByYear]);

  const currentGrid = useMemo(() => {
    if (activeScheduleId === 'all' && !isHistoricalYear) return {};
    return activeSchedule?.data?.[activeYear] || historySchedules[activeYear] || {};
  }, [activeSchedule, activeYear, historySchedules, activeScheduleId, isHistoricalYear]);

  const { stats, violations, fairness } = useMemo(() => {
    if ((!activeSchedule || activeSchedule.isGenerating || activeScheduleId === 'all') && !isHistoricalYear) {
      return {
        stats: {} as any,
        violations: { reqs: [], constraints: [] },
        fairness: []
      };
    }

    // For requirement violations, we need full history (historical + active session data)
    const fullHistory = { ...historySchedules, ...(activeSchedule.data || {}) };

    return {
      stats: calculateStats(activeResidents, currentGrid),
      violations: {
        reqs: getRequirementViolations(activeResidents, currentGrid, fullHistory),
        constraints: getWeeklyViolations(activeResidents, currentGrid)
      },
      fairness: calculateFairnessMetrics(activeResidents, currentGrid)
    };
  }, [activeSchedule, activeResidents, activeYear, currentGrid, historySchedules, activeScheduleId]);

  const hasViolations = violations.reqs.length > 0 || violations.constraints.length > 0;

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ resId: string, week: number } | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [scheduleToRename, setScheduleToRename] = useState<ScheduleSession | null>(null);

  useEffect(() => {
    localStorage.setItem('rsp_sort_order', JSON.stringify(residentSortOrder));
  }, [residentSortOrder]);

  // Cleanup workers on unmount (when tab closes)
  useEffect(() => {
    return () => {
      activeWorkersRef.current.forEach(worker => worker.terminate());
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
    onProgress: (iteration: number, attempts: number, scores: number[] | undefined, year: number, overallProgress: number) => void, 
    historicalSchedules: ScheduleHistory, 
    cohortAssignments: Record<number, Record<string, number>>,
    algorithmIds: string[],
    signal?: AbortSignal
  ): Promise<{ results: any[] }> => {
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
        const { type, iteration, overallProgress, bestScore, attempts, year, results, error } = e.data;
        if (type === 'progress') {
          onProgress(iteration, attempts, bestScore, year, overallProgress);
        } else if (type === 'success') {
          if (signal) signal.removeEventListener('abort', onAbort);
          activeWorkersRef.current.delete(worker);
          worker.terminate();
          resolve({ results });
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
        historicalSchedules, 
        constraints: { residents, existing, cohortAssignments }, 
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



  useEffect(() => { localStorage.setItem('rsp_residents_v4', JSON.stringify(residents)); }, [residents]);
  useEffect(() => { localStorage.setItem('rsp_schedules_v4', JSON.stringify(schedules)); }, [schedules]);
  useEffect(() => { if (activeScheduleId) localStorage.setItem('rsp_active_id', JSON.stringify(activeScheduleId)); }, [activeScheduleId]);
  const handleGenerate = async () => {
    if (isGeneratingRef.current) return;
    
    isGeneratingRef.current = true;
    setIsGenerating(true);
    setGenProgress(0);
    setGenAttempts(0);
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

      const { results } = await runGenerationTask(
        activeYear,
        totalYears,
        residents,
        {},
        compParams,
        (iteration, attempts, scores, year, overallProgress) => {
          const now = Date.now();
          // Still throttle updates, but now we update localized state
          if (now - lastUpdateRef.current > 1000) {
            setGenProgress(Math.round(overallProgress * 100));
            setGenAttempts(attempts);
            setGenStatus(`Optimizing Years ${activeYear}-${activeYear + totalYears - 1} (${Math.round(overallProgress * 100)}%)`);
            
            // Only update convergence data if the user is looking at it
            if (scores && (activeScheduleId === 'all' || activeScheduleId === 'draft')) {
              convergenceBufferRef.current.push(scores);
              setConvergenceData([...convergenceBufferRef.current]);
            }
            lastUpdateRef.current = now;
          } else if (scores) {
            convergenceBufferRef.current.push(scores);
          }
        },
        historySchedules,
        activeSchedule?.cohortAssignments || {},
        compParams.algorithmIds || [],
        controller.signal
      );

      // Process results
      const resultSalt = Math.floor(Math.random() * 1000000);
      const newIds = results.map((_: any, idx: number) => `sched-${Date.now()}-${idx}-${resultSalt}`);
      
      setConvergenceData([...convergenceBufferRef.current]);

      startTransition(() => {
        setSchedules(prev => {
          const finalResults = results.map((res: any, idx: number) => ({
            id: newIds[idx],
            name: `${res.winnerName} (${idx === 0 ? 'Optimal' : `Rank ${idx + 1}`})`,
            data: res.schedule,
            metrics: {
              score: res.score,
              violations: { reqs: [], constraints: [] }, // Will be recalced on demand
              fairness: [], // Will be recalced on demand
              stats: {} // Will be recalced on demand
            },
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
    }
    setRenameModalOpen(false);
    setScheduleToRename(null);
  };

  const handleCellClick = (resId: string, week: number) => {
    setSelectedCell({ resId, week });
    setModalOpen(true);
  };

  const handleAssignmentSave = (type: AssignmentType | null) => {
    if (selectedCell && activeScheduleId) {
      setSchedules(prev => prev.map(s => {
        if (s.id !== activeScheduleId) return s;
        const copy = { ...s.data };
        if (!copy[selectedCell.resId]) copy[selectedCell.resId] = [];
        const updatedRow = [...copy[selectedCell.resId]];
        updatedRow[selectedCell.week] = { assignment: type as any, locked: true };
        copy[selectedCell.resId] = updatedRow;

        // Recalculate metrics for the edited schedule
        return {
          ...s,
          data: copy,
          metrics: {
            stats: calculateStats(residents, copy),
            violations: {
              reqs: getRequirementViolations(residents, copy),
              constraints: getWeeklyViolations(residents, copy)
            },
            fairness: calculateFairnessMetrics(residents, copy),
            score: calculateScheduleScore(residents, copy)
          }
        };
      }));
    }
    setModalOpen(false);
  };

  const handleAssignCohort = (residentId: string, cohortIndex: number) => {
    if (!activeScheduleId) return;
    setSchedules(prev => prev.map(s => {
      if (s.id !== activeScheduleId) return s;

      const updatedCohorts = { ...(s.cohortAssignments || {}) };
      const yearMapping = { ...(updatedCohorts[activeYear] || {}) };
      yearMapping[residentId] = cohortIndex;
      updatedCohorts[activeYear] = yearMapping;

      return {
        ...s,
        cohortAssignments: updatedCohorts
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
      alert("Failed to generate backup file.");
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

        const patchedSchedules = json.schedules.map((s: any) => ({
          ...s,
          createdAt: s.createdAt ? new Date(s.createdAt) : new Date()
        }));

        setResidents(json.residents);
        setSchedules(patchedSchedules);
        setActiveScheduleId('all');
        alert("Backup imported successfully!");
      } catch (err) {
        console.error("Import failed", err);
        alert("Failed to import backup. Please ensure it's a valid JSON file.");
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
      const headers = ['Resident', 'PGY', 'Cohort', ...Array.from({ length: 52 }, (_, i) => `Week ${i + 1}`)];
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true };

      residents.forEach(r => {
        const rowData = [r.name, r.level, String.fromCharCode(65 + r.cohort)];
        const residentCells: string[] = [];
        for (let i = 0; i < 52; i++) {
          const cell = activeSchedule.data[r.id]?.[i];
          residentCells.push(cell?.assignment ? ASSIGNMENT_ABBREVIATIONS[cell.assignment] : "");
        }
        const row = worksheet.addRow([...rowData, ...residentCells]);

        for (let i = 0; i < 52; i++) {
          const cell = activeSchedule.data[r.id]?.[i];
          if (cell?.assignment) {
            const hex = ASSIGNMENT_HEX_COLORS[cell.assignment]?.replace('#', '') || 'CCCCCC';
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
      alert("Failed to export Excel file. See console for details.");
    } finally {
      setIsExporting(false);
    }
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
      <div className="flex-1 flex flex-col items-center justify-center bg-light-1/50 p-12">
        <div className="w-full max-w-4xl">
          {convergenceData.length > 0 ? (
            <GenerationDashboard 
              data={convergenceData}
              maxTries={compParams.tries}
              onStop={stopGeneration}
              onSelectWinners={() => {
                if (currentWorkerRef.current) {
                  currentWorkerRef.current.postMessage({ type: 'cancel' });
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
        {/* Left: App Title */}
        <div className="flex items-center gap-2 mr-6">
          <span className="text-sm font-black text-primary tracking-tight">Residency Scheduler</span>
        </div>


        {/* Center: Academic Year Tabs */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex bg-light-2 p-0.5 rounded-xl border border-light-5">
            {allAcademicYears.map(y => {
              const isActive = activeYear === y;
              return (
                <Button
                  variant="ghost"
                  key={y}
                  onClick={() => {
                    startTransition(() => {
                      setActiveYear(y);
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
        </div>

        {/* Right: Settings Icons */}
        <div className="flex items-center gap-1">
          {[
            { tab: 'residents', icon: Users, title: 'Residents' },
            { tab: 'backup', icon: Download, title: 'Backup' },
            { tab: 'reset', icon: RotateCcw, title: 'Reset Data' },
          ].map(({ tab, icon: Icon, title }) => {
            const isActive = activeScheduleId === 'settings' && activeTab === tab;
            return (
              <div
                key={tab}
                title={title}
                onClick={() => {
                  startTransition(() => {
                    if (isActive) {
                      // Toggle off: go back to the first schedule or 'all'
                      const firstSched = schedules.find(s => !s.isGenerating);
                      setActiveScheduleId(firstSched?.id ?? 'all');
                      setActiveTab('schedule');
                    } else {
                      setActiveScheduleId('settings');
                      setActiveTab(tab);
                    }
                  });
                }}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer ${isActive ? 'bg-blue text-white' : 'text-muted hover:bg-light-2 hover:text-primary'}`}
              >
                <Icon size={16} />
              </div>
            );
          })}
        </div>
      </div>

      {(activeScheduleId !== 'all' && activeScheduleId !== 'settings' && activeScheduleId !== 'draft') || isHistoricalYear || schedules.some(s => s.isGenerating) ? (
        <div className="px-6 bg-white border-b border-light-5 flex gap-1 z-20 shadow-sm shrink-0 overflow-x-auto">
          <NavButton id="schedule" label="Schedule" icon={LayoutGrid} />
          <NavButton id="workload" label="Workload" icon={BarChart3} />
          <NavButton id="assignments" label="Assignments" icon={Table} badgeCount={violations.constraints.length} />
          <NavButton id="requirements" label="Requirements" icon={ClipboardList} badgeCount={violations.reqs.length} />
          <NavButton id="audit" label="ACGME Audit" icon={ShieldCheck} />
          <NavButton id="cohorts" label="Cohorts" icon={Users} />
          <NavButton id="relationships" label="Relationships" icon={Network} />
          <NavButton id="fairness" label="Fairness" icon={Scale} />
          <NavButton id="export" label="Export" icon={FileSpreadsheet} />
        </div>
      ) : null}

      <main className="flex-1 overflow-hidden relative bg-white min-h-0">
        <div className="absolute inset-0 flex flex-col">
          {activeScheduleId === 'settings' ? (
            <div className="flex-1 overflow-hidden flex flex-col bg-white">
              {activeTab === 'residents' && <div className="flex-1 overflow-y-auto"><ResidentManager residents={residents} setResidents={setResidents} activeYear={activeYear} /></div>}
              {activeTab === 'backup' && (
                <div className="flex-1 overflow-y-auto p-12 bg-light-1">
                  <div className="max-w-xl mx-auto space-y-8">
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-light-5">
                      <h2 className="text-2xl font-black text-black flex items-center gap-3 mb-2">
                        <Download className="text-blue" />
                        System Backup
                      </h2>
                      <p className="text-muted font-medium">Export your data for safekeeping or import an existing backup file.</p>

                      <div className="mt-8 grid grid-cols-1 gap-4">
                        <div className="p-6 bg-light-blue/20 border border-light-blue/40 rounded-xl space-y-4">
                          <h3 className="text-xs font-black text-blue uppercase tracking-widest">Export Data</h3>
                          <p className="text-sm text-muted">Download all residents and schedule versions into a single JSON file.</p>
                          <Button variant="primary" size="md" 
                            onClick={handleExportJSON}
                             className="w-full flex items-center justify-center gap-3 p-4 hover:-2-dark transition-all group" 
                          >
                            <Download size={18} className="group-hover:-translate-y-1 transition-transform" />
                            Download Backup (.json)
                          </Button>
                        </div>

                        <div className="p-6 bg-white border border-light-5 rounded-xl space-y-4">
                          <h3 className="text-xs font-black text-secondary uppercase tracking-widest">Import Data</h3>
                          <p className="text-sm text-muted">Upload a previously exported JSON file. <span className="text-red font-bold">Warning: This will overwrite your current data.</span></p>
                          <label className="w-full flex items-center justify-center gap-3 p-4 bg-light-2 text-primary rounded-lg font-bold hover:bg-light-3 transition-all cursor-pointer border border-dashed border-light-6">
                            <Plus size={18} />
                            Select Backup File
                            <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'reset' && (
                <div className="flex-1 overflow-y-auto p-12 bg-light-1">
                  <div className="max-w-xl mx-auto space-y-8">
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-light-5">
                      <h2 className="text-2xl font-black text-black flex items-center gap-3 mb-2">
                        <RotateCcw className="text-blue" />
                        System Reset
                      </h2>
                      <p className="text-muted font-medium">Clear specific parts of the system or perform a full factory reset.</p>

                      <div className="mt-8 space-y-4">
                        <div className="p-4 border border-red/20 bg-red/10/30 rounded-xl space-y-4">
                          <h3 className="text-xs font-black text-red uppercase tracking-widest">Danger Zone</h3>

                          <Button
                            onClick={() => { if (confirm("This will delete ALL data. Are you sure?")) { setResidents(GENERATE_INITIAL_RESIDENTS()); setSchedules([]); setActiveScheduleId('all'); } }}
                            className="w-full flex items-center justify-between p-4 bg-white border border-light-5 rounded-lg text-primary hover:border-red/40 hover:text-red transition-all group font-bold"
                          >
                            <span className="flex items-center gap-3"><Database size={18} /> Delete All Schedules</span>
                            <span className="text-[10px] uppercase opacity-50">Clear Versions</span>
                          </Button>

                          <Button
                            onClick={() => {
                                if (confirm("Unpin all assignments across all schedules?")) {
                                  setSchedules(prev => prev.map(s => ({
                                    ...s,
                                    data: Object.fromEntries(Object.entries(s.data).map(([year, grid]) => [
                                      year,
                                      Object.fromEntries(Object.entries(grid as ScheduleGrid).map(([rid, weeks]) => [
                                        rid,
                                        weeks.map(w => ({ ...w, locked: false }))
                                      ]))
                                    ]))
                                  })));
                                }
                            }}
                            className="w-full flex items-center justify-between p-4 bg-white border border-light-5 rounded-lg text-primary hover:border-blue-400 hover:text-blue transition-all group font-bold"
                          >
                            <span className="flex items-center gap-3"><Lock size={18} /> Unlock All Assignments</span>
                            <span className="text-[10px] uppercase opacity-50">Reset Pins</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeScheduleId === 'draft' && !isHistoricalYear ? (
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
            <div className="flex-1 overflow-hidden">
              <ScheduleComparison
                schedules={schedules}
                residents={residents}
                activeYear={activeYear}
                onSelectSchedule={(id) => setActiveScheduleId(id)}
                onRenameSchedule={(s) => {
                  setScheduleToRename(s);
                  setRenameModalOpen(true);
                }}
              />
            </div>
          ) : activeSchedule?.isGenerating ? (
            renderGenerationDashboard()
          ) : (
            <>
              {activeTab === 'schedule' && (
                <div className="flex-1 overflow-hidden flex flex-col">
                  {/* Schedule Sub-header: Group By + Violations */}
                  <div className="px-6 py-3 bg-white border-b flex items-center justify-between shrink-0">
                    {/* Left: Group By */}
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

                    {/* Right: Violations */}
                    <div>
                      {hasViolations && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-red/10 text-red rounded-full border border-red/20 animate-pulse">
                          <AlertCircle size={14} />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Staffing Violations</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden p-6">
                    <ScheduleTable
                      residents={activeResidents}
                      schedule={currentGrid}
                      startYear={activeSchedule?.isHistory ? activeSchedule.startYear : activeYear}
                      cohortAssignments={activeSchedule?.cohortAssignments?.[activeYear] || historicalCohortsByYear[activeYear] || {}}
                      onCellClick={handleCellClick}
                      onLockWeek={() => { }}
                      onLockResident={() => { }}
                      onToggleLock={() => { }}
                    />
                  </div>
                </div>
              )}
              {activeTab === 'workload' && <div className="flex-1 overflow-y-auto"><Dashboard residents={activeResidents} stats={stats} /></div>}
              {activeTab === 'assignments' && <div className="flex-1 overflow-hidden"><AssignmentStats residents={activeResidents} schedule={currentGrid} /></div>}
              {activeTab === 'requirements' && <div className="flex-1 overflow-y-auto"><RequirementsStats residents={activeResidents} schedule={currentGrid} precalculatedViolations={violations.reqs} /></div>}
              {activeTab === 'audit' && <div className="flex-1 overflow-y-auto"><ACGMEAudit residents={activeResidents} history={activeSchedule?.data || {}} activeYear={activeYear} /></div>}
              {activeTab === 'cohorts' && (
                <div className="flex-1 overflow-hidden">
                  <CohortKanban
                    residents={activeResidents}
                    activeYear={activeYear}
                    cohortAssignments={activeSchedule?.cohortAssignments?.[activeYear] || historicalCohortsByYear[activeYear] || {}}
                    onAssignCohort={handleAssignCohort}
                  />
                </div>
              )}
              {activeTab === 'relationships' && <div className="flex-1 overflow-y-auto"><RelationshipStats residents={activeResidents} schedule={currentGrid} /></div>}
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
                          <div className="text-[10px] text-muted uppercase font-bold mb-1">Active Target:</div>
                          <div className="text-sm font-bold text-primary truncate">
                            {activeSchedule?.name || 'No active schedule'}
                          </div>
                        </div>

                        <Button variant="primary" size="md" 
                          onClick={handleExportXLSX}
                          disabled={isExporting}
                           className="w-full py-4 bg-green hover:bg-emerald-700 disabled:bg-light-3 disabled:cursor-not-allowed flex items-center justify-center gap-3 transition-all" 
                        >
                          {isExporting ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
                          Export Current to Excel
                        </Button>
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

      {/* ─── Bottom Tab Bar (Spreadsheet-style, persistent) ─── */}
      {activeScheduleId !== 'settings' && (
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
              ) : schedules.filter(s => !s.isGenerating).map(sched => {
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
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" onClick={(e) => { 
                        e.stopPropagation(); 
                        setSchedules(s => s.filter(x => x.id !== sched.id)); 
                        if (activeScheduleId === sched.id) setActiveScheduleId('all'); 
                      }} className="p-0.5 rounded text-muted hover:text-red transition-colors">
                        <X size={10} />
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

      <AssignmentModal isOpen={modalOpen} onClose={() => setModalOpen(false)} current={selectedCell && currentGrid[selectedCell.resId]?.[selectedCell.week]?.assignment || null} onSave={handleAssignmentSave} />
      <RenameModal isOpen={renameModalOpen} initialName={scheduleToRename?.name || ''} onClose={() => setRenameModalOpen(false)} onSave={handleRename} />
    </div>
  );
};

export default App;
