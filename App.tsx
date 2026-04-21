
import React, { useState, useEffect, useRef, useMemo, useTransition } from 'react';
import ExcelJS from 'exceljs';
import {
  Resident,
  ScheduleGrid,
  ScheduleHistory,
  AssignmentType,
  ScheduleCell
} from './types';
import {
  GENERATE_INITIAL_RESIDENTS,
  ASSIGNMENT_LABELS,
  ASSIGNMENT_HEX_COLORS,
  ASSIGNMENT_ABBREVIATIONS,
  ACTIVE_START_YEAR,
  TOTAL_WEEKS
} from './constants';
import historicalGridData from './specification/historical_schedules_grid.json';
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
  Settings as SettingsIcon,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  History
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
}

const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    const parsed = JSON.parse(item);

    // Patch schedules to ensure Dates are actual Date objects
    if (key === 'rsp_schedules_v3' && Array.isArray(parsed)) {
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
    loadState('rsp_residents_v3', GENERATE_INITIAL_RESIDENTS())
  );

  const [schedules, setSchedules] = useState<ScheduleSession[]>(() =>
    loadState('rsp_schedules_v3', [])
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

  const historySchedules = useMemo(() => preloadHistoricalData(residents), [residents]);

  const [activeTab, setActiveTab] = useState<'schedule' | 'workload' | 'assignments' | 'fairness' | 'requirements' | 'audit' | 'relationships' | 'residents' | 'reset' | 'backup' | 'export' | 'draft'>('schedule');

  const [algoConfig, setAlgoConfig] = useState<AlgorithmConfig[]>([
    { id: 'stochastic', name: 'Stochastic', description: 'The tried-and-true generalist. Good at everything, master of none. Uses weighted randomness to explore valid slots.', enabled: true, color: '#3b82f6' },
    { id: 'experimental', name: 'Staffing First', description: 'Staffing-centric optimization. Prioritizes 1-week slots to guarantee hospital minimums are met at all costs.', enabled: true, color: '#8b5cf6' },
    { id: 'strict', name: 'Education First', description: 'Objective-centric optimization. Prioritizes PGY educational targets with a residual capacity guard to ensure hospital coverage.', enabled: true, color: '#10b981' },
    { id: 'greedy', name: 'Greedy', description: 'The original fast generator. Takes the best immediate choice at every step. Ideal for quick reference drafts.', enabled: false, color: '#f59e0b' },
  ]);

  const [algoStats, setAlgoStats] = useState<Record<string, AlgorithmStats>>(() =>
    loadState('rsp_algo_stats_v1', {})
  );

  const [compParams, setCompParams] = useState<CompetitionParams>(() => {
    const loaded = loadState('rsp_comp_params_v1', {
      tries: 100,
      priority: CompetitionPriority.BEST_SCORE,
      algorithmIds: ['stochastic', 'experimental', 'strict'],
      topN: 1
    });

    const validIds = ['stochastic', 'experimental', 'strict', 'greedy'];
    return {
      ...loaded,
      topN: loaded.topN || 1,
      algorithmIds: loaded.algorithmIds.filter(id => validIds.includes(id))
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
    if (activeScheduleId?.startsWith('history-')) {
      const year = parseInt(activeScheduleId.replace('history-', ''));
      const lockedUntil = getCurrentWeekForYear(year);
      
      // Augment history with pre-locked flags
      const baseHistory = historySchedules[year] || {};
      const augmentedData: ScheduleGrid = {};
      
      Object.keys(baseHistory).forEach(resId => {
        augmentedData[resId] = (baseHistory[resId] || []).map((cell, idx) => ({
          ...cell,
          locked: cell.locked || idx <= lockedUntil
        }));
      });

      return {
        id: activeScheduleId,
        name: `${year} - ${year + 1}`,
        data: { [year]: augmentedData },
        createdAt: new Date(),
        isHistory: true,
        startYear: year,
        lockedUntilWeek: lockedUntil
      } as any;
    }
    return schedules.find(s => s.id === activeScheduleId);
  }, [schedules, activeScheduleId, historySchedules]);

  // Helper to derive active residents for any year (graduation aware)
  const getResidentsForYear = (year: number) => {
    return residents.filter(r => {
      const level = year - r.startYear + 1;
      return level >= 1 && level <= 3;
    }).map(r => {
      const level = (year - r.startYear + 1) as 1 | 2 | 3;
      const clinicType = level === 2 ? AssignmentType.NIMA_CLINIC : AssignmentType.CLINIC;
      return { ...r, level, clinicType };
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
  const activeResidents = useMemo(() => getResidentsForYear(activeYear), [residents, activeYear, residentSortOrder]);

  const { stats, violations } = useMemo(() => {
    if (!activeSchedule || activeSchedule.isGenerating) {
      return {
        stats: {} as any,
        violations: { reqs: [], constraints: [] }
      };
    }

    const yearData = activeSchedule.data[activeYear] || {};

    return {
      stats: calculateStats(activeResidents, yearData),
      violations: {
        reqs: getRequirementViolations(activeResidents, yearData),
        constraints: getWeeklyViolations(activeResidents, yearData)
      }
    };
  }, [activeSchedule, activeResidents, activeYear]);

  const currentGrid = activeSchedule?.data[activeYear] || {};
  const hasViolations = violations.reqs.length > 0 || violations.constraints.length > 0;

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ resId: string, week: number } | null>(null);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [scheduleToRename, setScheduleToRename] = useState<ScheduleSession | null>(null);

  useEffect(() => {
    localStorage.setItem('rsp_sort_order', JSON.stringify(residentSortOrder));
  }, [residentSortOrder]);

  // Track active workers for cleanup
  const activeWorkersRef = useRef<Set<Worker>>(new Set());

  // Cleanup workers on unmount (when tab closes)
  useEffect(() => {
    return () => {
      activeWorkersRef.current.forEach(worker => worker.terminate());
      activeWorkersRef.current.clear();
    };
  }, []);

  // Helper to spawn a web worker for background generation
  const runGenerationTask = (residents: Resident[], existing: ScheduleGrid, params: CompetitionParams, onProgress: (p: number, a: number) => void, historicalSchedules?: ScheduleHistory, cohortAssignments?: Record<string, number>): Promise<{ results: any[] }> => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./services/scheduler.worker.ts', import.meta.url), { type: 'module' });
      activeWorkersRef.current.add(worker);

      worker.onmessage = (e) => {
        const { type, progress, attemptsMade, results, error } = e.data;
        if (type === 'progress') {
          onProgress(progress, attemptsMade);
        } else if (type === 'success') {
          activeWorkersRef.current.delete(worker);
          worker.terminate();
          resolve({ results });
        } else if (type === 'error') {
          activeWorkersRef.current.delete(worker);
          worker.terminate();
          reject(new Error(error));
        }
      };
      worker.onerror = (e) => {
        activeWorkersRef.current.delete(worker);
        worker.terminate();
        reject(e);
      };
      worker.postMessage({ residents, existing, params, historicalSchedules, cohortAssignments });
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
    if (schedules.length === 0) {
      const runInit = async () => {
        // Preload historical data from JSON
        const history = preloadHistoricalData(residents);
        
        // Generate current active year based on that history
        const result = await generateSchedule(activeResidents, {}, compParams, undefined, history);
        const sched = result.results[0];
        
        const initialSession: ScheduleSession = {
          id: 'init-1',
          name: `S1 (${sched.winnerName})`,
          data: { ...history, [activeYear]: sched.schedule },
          createdAt: new Date(),
          metrics: {
            stats: calculateStats(activeResidents, sched.schedule),
            violations: {
              reqs: getRequirementViolations(activeResidents, sched.schedule, history),
              constraints: getWeeklyViolations(activeResidents, sched.schedule)
            },
            fairness: calculateFairnessMetrics(activeResidents, sched.schedule),
            score: sched.score
          }
        };
        setSchedules([initialSession]);
      };
      runInit();
    }
  }, [schedules.length, residents, activeResidents, activeYear, compParams]);

  useEffect(() => { localStorage.setItem('rsp_residents_v3', JSON.stringify(residents)); }, [residents]);
  useEffect(() => { localStorage.setItem('rsp_schedules_v3', JSON.stringify(schedules)); }, [schedules]);
  useEffect(() => { if (activeScheduleId) localStorage.setItem('rsp_active_id', JSON.stringify(activeScheduleId)); }, [activeScheduleId]);
  useEffect(() => { localStorage.setItem('rsp_algo_stats_v1', JSON.stringify(algoStats)); }, [algoStats]);
  useEffect(() => { localStorage.setItem('rsp_comp_params_v1', JSON.stringify(compParams)); }, [compParams]);

  const handleGenerate = () => {
    const salt = Math.floor(Math.random() * 1000000);
    const newId = `sched-master-${Date.now()}-${salt}`;
    const newSession: ScheduleSession = {
      id: newId,
      name: `Generating...`,
      data: {},
      createdAt: new Date(),
      isGenerating: true,
      progress: 0,
    };

    setSchedules(prev => [...prev, newSession]);
    setActiveScheduleId(newId);

    (async () => {
      try {
        const yearsToGenerate = [ACTIVE_START_YEAR, ACTIVE_START_YEAR + 1, ACTIVE_START_YEAR + 2];
        const runningData: ScheduleHistory = {};
        let finalWinnerName = "";
        let finalScore = 0;

        for (let i = 0; i < yearsToGenerate.length; i++) {
          const year = yearsToGenerate[i];
          const activeResForYear = getResidentsForYear(year);
          const cohortMap = Object.fromEntries(activeResForYear.map(r => [r.id, r.cohort]));

          // Update progress label
          setSchedules(prev => prev.map(s =>
            s.id === newId ? { ...s, progressLabel: `Year ${i + 1} of 3 (${year})` } : s
          ));

          const { results } = await runGenerationTask(
            activeResForYear, 
            {}, 
            compParams, 
            (progress, attempts) => {
              // Adjust progress to be relative to the 3-year process
              const overallProgress = Math.round((i * 100 + progress) / yearsToGenerate.length);
              setSchedules(prev => prev.map(s =>
                s.id === newId ? { ...s, progress: overallProgress, attemptsMade: attempts } : s
              ));
            }, 
            runningData,
            cohortMap
          );

          const best = results[0];
          runningData[year] = best.schedule;
          if (year === activeYear) {
            finalWinnerName = best.winnerName;
            finalScore = best.score;
          }
          
          // Small delay to allow state updates and UI responsiveness
          await new Promise(r => setTimeout(r, 100));
        }

        const newIds = [0].map((_, idx) => `sched-${Date.now()}-${idx}-${salt}`);
        const firstId = newIds[0];

        setSchedules(prev => {
          const filtered = prev.filter(s => s.id !== newId);
          const nameOffset = filtered.length;

          const newSessions: ScheduleSession[] = [0].map((_, idx) => {
            return {
              id: newIds[idx],
              name: `S${nameOffset + idx + 1} (${finalWinnerName})`,
              data: runningData,
              createdAt: new Date(),
              metrics: {
                stats: calculateStats(residents, runningData[activeYear]),
                violations: {
                  reqs: getRequirementViolations(residents, runningData[activeYear], runningData),
                  constraints: getWeeklyViolations(residents, runningData[activeYear])
                },
                fairness: calculateFairnessMetrics(residents, runningData[activeYear]),
                score: finalScore
              }
            };
          });

          return [...filtered, ...newSessions];
        });

        if (firstId) {
          startTransition(() => {
            setActiveScheduleId(firstId);
          });
        }
      } catch (e) {
        console.error("3-Year Generation failed", e);
        setSchedules(prev => prev.filter(s => s.id !== newId));
        alert("Failed to generate 3-year schedule.");
      }
    })();
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

  return (
    <div className={`flex flex-col h-screen bg-light-1 bg-[url('https://res.cloudinary.com/dmukukwp6/image/upload/carpet_light_27d74f73b5.png')] bg-repeat text-black font-sans overflow-hidden ${activeSchedule?.isGenerating || isPending ? 'cursor-wait' : ''}`}>

      <div className="h-12 bg-light-3 flex items-stretch shrink-0 z-30 px-2 pt-2 gap-1 relative overflow-y-hidden">
        {/* Bottom Seam Line - Layered at z-30 so it's above inactive (z-20) but below active (z-40) */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-light-4 z-30" />

        {/* Settings Tab */}
        <div className={`flex-none flex items-end relative mr-1 ${activeScheduleId === 'settings' ? 'z-40' : 'z-20'}`}>
          <div
            onClick={() => {
              startTransition(() => {
                setActiveScheduleId('settings');
                setActiveTab('residents');
              });
            }}
            className={`flex items-center justify-center w-12 h-10 rounded-t-lg border-t border-x transition-all relative cursor-pointer ${activeScheduleId === 'settings' ? 'bg-blue border-blue-2-dark text-white z-50' : 'bg-light-3/50 border-transparent text-muted hover:bg-light-2'}`}
          >
            <SettingsIcon size={20} />
            {activeScheduleId === 'settings' && (
              <div className="absolute bottom-0 left-[-1px] right-[-1px] h-px bg-blue z-20" />
            )}
          </div>
        </div>

        {/* Dynamic History Tabs */}
        {historicalYears.map(year => {
          const tabId = `history-${year}`;
          const isActive = activeScheduleId === tabId;
          return (
            <div key={tabId} className={`flex-none flex items-end relative mr-1 ${isActive ? 'z-40' : 'z-20'}`}>
              <div
                onClick={() => {
                  startTransition(() => {
                    setActiveScheduleId(tabId);
                    setActiveYear(year);
                    if (['residents', 'backup', 'reset'].includes(activeTab)) {
                      setActiveTab('schedule');
                    }
                  });
                }}
                className={`flex items-center gap-2 px-4 h-10 text-sm font-bold rounded-t-lg border-t border-x transition-all relative cursor-pointer ${isActive ? 'bg-blue border-blue-2-dark text-white z-50' : 'bg-light-3/50 border-transparent text-muted hover:bg-light-2'}`}
              >
                <History size={14} className={isActive ? 'text-white' : 'text-blue'} />
                AY {year}-{year + 1} ({year - ACTIVE_START_YEAR}y)
                {isActive && (
                  <div className="absolute bottom-0 left-[-1px] right-[-1px] h-px bg-blue z-20" />
                )}
              </div>
            </div>
          );
        })}

        {/* Sticky All Tab */}
        <div className={`flex-none flex items-end relative mr-1 ${activeScheduleId === 'all' ? 'z-40' : 'z-20'}`}>
          <div
            onClick={() => {
              startTransition(() => {
                setActiveScheduleId('all');
                if (['residents', 'backup', 'reset'].includes(activeTab)) {
                  setActiveTab('schedule');
                }
              });
            }}
            className={`flex items-center gap-2 px-6 h-10 text-sm font-bold rounded-t-lg border-t border-x transition-all relative cursor-pointer ${activeScheduleId === 'all' ? 'bg-blue border-blue-2-dark text-white z-50' : 'bg-light-3/50 border-transparent text-muted hover:bg-light-2'}`}
          >
            AY {ACTIVE_START_YEAR}-{ACTIVE_START_YEAR + 1} (Current)
            {activeScheduleId === 'all' && (
              <div className="absolute bottom-0 left-[-1px] right-[-1px] h-px bg-blue z-20" />
            )}
          </div>
        </div>

        {/* Scrollable Schedules area */}
        <div className="flex-1 relative flex items-end overflow-hidden">
          {canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-0 z-40 w-12 flex items-center justify-start bg-gradient-to-r from-gray-200 to-transparent pointer-events-none">
              <Button
                onClick={() => scrollTabs('left')}
                className="ml-1 p-1 rounded-full bg-white/80 hover:bg-white text-primary shadow-md pointer-events-auto transition-all transform hover:scale-110"
              >
                <ChevronLeft size={16} />
              </Button>
            </div>
          )}

          <div
            ref={tabContainerRef}
            onScroll={checkScroll}
            className="flex-1 flex items-end gap-2 overflow-x-auto overflow-y-hidden no-scrollbar scroll-smooth relative"
          >
            {schedules.map(sched => {
              const isActive = activeScheduleId === sched.id;
              return (
                <div
                  key={sched.id}
                  onClick={() => {
                    startTransition(() => {
                      setActiveScheduleId(sched.id);
                      if (['residents', 'backup', 'reset'].includes(activeTab)) {
                        setActiveTab('schedule');
                      }
                    });
                  }}
                  className={`group flex items-center gap-2 px-3 h-10 text-sm font-medium rounded-t-lg border-t border-x transition-all relative min-w-[160px] cursor-pointer ${isActive ? 'bg-blue text-white border-blue-2-dark z-40' : 'bg-light-3/50 border-transparent text-muted hover:bg-light-2 z-20'} ${isPending ? 'opacity-70' : ''}`}
                >
                  {sched.isGenerating && <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full flex-shrink-0"></div>}
                  {!sched.isGenerating && <Identicon id={sched.id} />}
                  {isPending && isActive && <div className="animate-pulse h-2 w-2 bg-blue-2 rounded-full mr-1"></div>}
                  <div className="flex-1 min-w-0 font-bold text-xs truncate pr-6">{sched.name}</div>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 hover:bg-white/40 rounded-full">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSchedules(s => s.filter(x => x.id !== sched.id)); activeScheduleId === sched.id && setActiveScheduleId('all'); }} className="p-1 rounded-full text-white/80 hover:text-white transition-colors"><X size={12} /></Button>
                  </div>
                  {isActive && (
                    <div className="absolute bottom-0 left-[-1px] right-[-1px] h-px bg-blue z-50" />
                  )}
                </div>
              );
            })}
          </div>

          {canScrollRight && (
            <div className="absolute right-0 top-0 bottom-0 z-40 w-12 flex items-center justify-end bg-gradient-to-l from-gray-200 to-transparent pointer-events-none">
              <Button
                onClick={() => scrollTabs('right')}
                className="mr-1 p-1 rounded-full bg-white/80 hover:bg-white text-primary shadow-md pointer-events-auto transition-all transform hover:scale-110"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          )}
        </div>

        {/* Sticky Generate Tab */}
        <div className={`flex-none flex items-end relative px-2 ${activeScheduleId === 'draft' ? 'z-40' : 'z-20'}`}>
          <div
            onClick={() => {
              startTransition(() => {
                setActiveScheduleId('draft');
              });
            }}
            className={`flex items-center gap-2 px-6 h-10 text-sm font-bold rounded-t-lg border-t border-x transition-all relative cursor-pointer ${activeScheduleId === 'draft' ? 'bg-blue border-blue-2-dark text-white z-50' : 'bg-light-3/50 border-transparent text-muted hover:bg-light-2'}`}
          >
            <Sparkles size={16} />
            Generate
            {activeScheduleId === 'draft' && (
              <div className="absolute bottom-0 left-[-1px] right-[-1px] h-px bg-blue z-20" />
            )}
          </div>
        </div>
      </div>

      {(activeScheduleId !== 'all' && activeScheduleId !== 'settings' && activeScheduleId !== 'draft' && !activeSchedule?.isGenerating) && (
        <div className="px-6 bg-white border-b border-light-5 flex gap-1 z-20 shadow-sm shrink-0 overflow-x-auto">
          <NavButton id="schedule" label="Schedule" icon={LayoutGrid} />
          <NavButton id="workload" label="Workload" icon={BarChart3} />
          <NavButton id="assignments" label="Assignments" icon={Table} badgeCount={violations.constraints.length} />
          <NavButton id="requirements" label="Requirements" icon={ClipboardList} badgeCount={violations.reqs.length} />
          <NavButton id="audit" label="ACGME Audit" icon={ShieldCheck} />
          <NavButton id="relationships" label="Relationships" icon={Network} />
          <NavButton id="fairness" label="Fairness" icon={Scale} />
          <NavButton id="export" label="Export" icon={FileSpreadsheet} />
        </div>
      )}

      {activeScheduleId === 'settings' && (
        <div className="px-6 bg-white border-b border-light-5 flex gap-1 z-20 shadow-sm shrink-0 overflow-x-auto">
          <NavButton id="residents" label="Residents" icon={Users} />
          <NavButton id="backup" label="Backup" icon={Download} />
          <NavButton id="reset" label="Reset Data" icon={RotateCcw} />
        </div>
      )}

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
                            className="w-full flex items-center justify-between p-4 bg-white border border-red/40 rounded-lg text-red hover:bg-red hover:text-white transition-all group font-bold"
                          >
                            <span className="flex items-center gap-3"><Trash2 size={18} /> Clear All Records</span>
                            <span className="text-[10px] uppercase opacity-50 group-hover:opacity-100">Factory Reset</span>
                          </Button>

                          <Button
                            onClick={() => { if (confirm("Reset all residents to defaults?")) { setResidents(GENERATE_INITIAL_RESIDENTS()); } }}
                            className="w-full flex items-center justify-between p-4 bg-white border border-light-5 rounded-lg text-primary hover:border-red-400 hover:text-red transition-all group font-bold"
                          >
                            <span className="flex items-center gap-3"><Users size={18} /> Reset Residents</span>
                            <span className="text-[10px] uppercase opacity-50">Set to Default</span>
                          </Button>

                          <Button
                            onClick={() => { if (confirm("Delete all schedule versions?")) { setSchedules([]); setActiveScheduleId('all'); } }}
                            className="w-full flex items-center justify-between p-4 bg-white border border-light-5 rounded-lg text-primary hover:border-red-400 hover:text-red transition-all group font-bold"
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
                            <span className="flex items-center gap-3"><LayoutGrid size={18} /> Unpin All Weeks</span>
                            <span className="text-[10px] uppercase opacity-50">Unlock All</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeScheduleId === 'draft' ? (
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
              onClearStats={() => setAlgoStats({})}
            />
          ) : activeScheduleId === 'all' ? (
            <div className="flex-1 bg-white overflow-y-auto">
              <ScheduleComparison
                residents={residents}
                schedules={schedules}
                activeScheduleId={activeScheduleId}
                activeYear={activeYear}
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
            <div className="flex-1 flex flex-col items-center justify-center bg-white p-12 text-center">
              <div className="relative">
                <div className="absolute inset-0 bg-light-blue rounded-full animate-ping opacity-25"></div>
                <div className="relative bg-white p-6 rounded-full shadow-sm border mb-8">
                  <Loader2 size={48} className="text-blue animate-spin" />
                </div>
              </div>
              <h3 className="text-2xl font-black text-black mb-2">Generating Candidate Schedules</h3>
              <p className="text-muted font-medium max-w-sm mb-8">
                Running {(compParams.tries * compParams.algorithmIds.length).toLocaleString()} permutations to {getPriorityText()}
              </p>

              <div className="w-80 space-y-4">
                {compParams.algorithmIds.map(algoId => {
                  const algo = algoConfig.find(a => a.id === algoId);
                  if (!algo) return null;
                  return (
                    <div key={algoId} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-black text-muted uppercase tracking-widest">
                        <span>{activeSchedule.progressLabel || algo.name}</span>
                        <span>{activeSchedule.progress || 0}%</span>
                      </div>
                      <div className="w-full bg-light-2 rounded-full h-2 overflow-hidden border border-light-5">
                        <div
                          className="h-full transition-all duration-500 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]"
                          style={{
                            width: `${activeSchedule.progress || 0}%`,
                            backgroundColor: algo.color
                          }}
                        ></div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-between items-center pt-2">
                  <div className="text-[10px] font-bold text-muted uppercase tracking-widest">
                    ETA: {getEta()}
                  </div>
                  <div className="text-[10px] font-bold text-blue uppercase tracking-widest bg-light-blue/20 py-1 px-3 rounded-full inline-block">
                    {activeSchedule.attemptsMade ? `${activeSchedule.attemptsMade.toLocaleString()} permutations checked` : 'Initializing engine...'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'schedule' && (
                <div className="flex-1 overflow-hidden flex flex-col">
                  {/* Year Tabs Overlay/Bar */}
                  <div className="px-6 py-3 bg-white border-b grid grid-cols-3 items-center shrink-0">
                    {/* Left: Group By */}
                    <div className="flex items-center gap-3 justify-self-start">
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

                    {/* Center: Academic Year */}
                    <div className="flex items-center gap-3 justify-self-center">
                      <span className="text-[10px] font-black text-muted uppercase tracking-wider">Academic Year</span>
                      <div className="flex bg-light-2 p-1 rounded-xl border border-light-5">
                        {activeSchedule?.isHistory ? (
                          <div className="px-6 py-1.5 bg-white text-blue shadow-sm rounded-lg text-xs font-bold transition-all">
                            {activeYear} - {activeYear + 1}
                          </div>
                        ) : (
                          [ACTIVE_START_YEAR, ACTIVE_START_YEAR + 1, ACTIVE_START_YEAR + 2].map(y => (
                            <Button
                              variant="ghost"
                              key={y}
                              onClick={() => {
                                startTransition(() => {
                                  setActiveYear(y);
                                });
                              }}
                              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeYear === y ? 'bg-white text-blue shadow-sm border border-light-5' : 'text-muted hover:text-primary'}`}
                            >
                              {y} - {y + 1}
                            </Button>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Right: Violations */}
                    <div className="justify-self-end">
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
              {activeTab === 'requirements' && <div className="flex-1 overflow-y-auto"><RequirementsStats residents={activeResidents} schedule={currentGrid} precalculatedViolations={activeSchedule?.metrics?.violations.reqs} /></div>}
              {activeTab === 'audit' && <div className="flex-1 overflow-y-auto"><ACGMEAudit residents={activeResidents} history={activeSchedule!.data} activeYear={activeYear} /></div>}
              {activeTab === 'relationships' && <div className="flex-1 overflow-y-auto"><RelationshipStats residents={activeResidents} schedule={currentGrid} /></div>}
              {activeTab === 'fairness' && <div className="flex-1 overflow-y-auto"><FairnessStats residents={activeResidents} schedule={currentGrid} precalculated={activeSchedule?.metrics?.fairness} /></div>}
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

      <AssignmentModal isOpen={modalOpen} onClose={() => setModalOpen(false)} current={selectedCell && currentGrid[selectedCell.resId]?.[selectedCell.week]?.assignment || null} onSave={handleAssignmentSave} />
      <RenameModal isOpen={renameModalOpen} initialName={scheduleToRename?.name || ''} onClose={() => setRenameModalOpen(false)} onSave={handleRename} />
    </div>
  );
};

export default App;
