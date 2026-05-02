import React, { useState, useRef, useEffect, useTransition } from 'react';
import { 
  Resident, 
  ScheduleSession, 
  CompetitionParams, 
  ScheduleHistory,
  AlgorithmConfig,
  AssignmentType
} from '../types';
import { GenerationDashboard } from './GenerationDashboard';

interface Props {
  activeYear: number;
  residents: Resident[];
  compParams: CompetitionParams;
  historySchedules: ScheduleHistory;
  activeSchedule: ScheduleSession | undefined;
  algoConfig: AlgorithmConfig[];
  onComplete: (results: any[]) => void;
  onCancel: () => void;
}

export const GlobalOptimizer: React.FC<Props> = ({
  activeYear,
  residents,
  compParams,
  historySchedules,
  activeSchedule,
  algoConfig,
  onComplete,
  onCancel
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genAttempts, setGenAttempts] = useState(0);
  const [genStatus, setGenStatus] = useState('');
  const [convergenceData, setConvergenceData] = useState<number[][]>([]);
  const [canceledAlgoIds, setCanceledAlgoIds] = useState<Set<string>>(new Set());
  const [isCanceled, setIsCanceled] = useState(false);

  const activeWorkersRef = useRef<Set<Worker>>(new Set());
  const generationControllerRef = useRef<AbortController | null>(null);
  const convergenceBufferRef = useRef<number[][]>([]);
  const lastUpdateRef = useRef<number>(0);
  const isGeneratingRef = useRef(false);

  useEffect(() => {
    // Auto-start on mount if not already generating
    if (!isGeneratingRef.current) {
      handleGenerate();
    }
    
    return () => {
      // Cleanup workers on unmount
      activeWorkersRef.current.forEach(worker => worker.terminate());
      activeWorkersRef.current.clear();
      if (generationControllerRef.current) {
        generationControllerRef.current.abort();
      }
    };
  }, []);

  const runGenerationTask = (
    startYear: number,
    totalYears: number,
    residents: Resident[], 
    existing: any, 
    params: CompetitionParams, 
    onProgress: (iteration: number, attempts: number, scores: number[] | undefined, year: number, overallProgress: number) => void,
    historicalSchedules: ScheduleHistory, 
    cohortAssignments: Record<number, Record<string, number>>,
    algorithmIds: string[],
    signal?: AbortSignal
  ): Promise<{ results: any[] }> => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../services/scheduler.worker.ts', import.meta.url), { type: 'module' });
      activeWorkersRef.current.add(worker);

      const onAbort = () => {
        worker.postMessage({ type: 'cancel' });
        worker.terminate();
        activeWorkersRef.current.delete(worker);
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
          worker.terminate();
          reject(new DOMException('Aborted', 'AbortError'));
        }
      };
      
      worker.onerror = (e) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        activeWorkersRef.current.delete(worker);
        worker.terminate();
        reject(e);
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
      convergenceBufferRef.current = [];
      lastUpdateRef.current = Date.now();

      const { results } = await runGenerationTask(
        activeYear,
        totalYears,
        residents,
        {},
        compParams,
        (iteration, attempts, scores, year, overallProgress) => {
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
            setGenAttempts(attempts);
            setGenStatus(`Optimizing Years ${activeYear}-${activeYear + totalYears - 1} (${Math.round(overallProgress * 100)}%)`);

            if (scores) {
              setConvergenceData([...convergenceBufferRef.current]);
            }
            lastUpdateRef.current = now;
          }
        },
        historySchedules,
        activeSchedule?.cohortAssignments || {},
        compParams.algorithmIds || [],
        controller.signal
      );

      setConvergenceData([...convergenceBufferRef.current]);
      onComplete(results);
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

  const handleCancelAlgorithm = (id: string) => {
    setCanceledAlgoIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // In a real implementation, we would send a message to the worker to stop a specific algo
    // For now, we just update the UI
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-light-1 flex flex-col items-center justify-center min-h-0">
      <div className="max-w-full w-full px-2 md:px-6">
        <GenerationDashboard 
          data={convergenceData}
          maxTries={compParams.tries || 300}
          onStop={() => {
            if (generationControllerRef.current) {
              generationControllerRef.current.abort();
              setIsCanceled(true);
            }
            onCancel();
          }}
          onSelectWinners={() => {
            // Signal to worker to wrap up early if possible, 
            // but here we can just terminate and use current best if we had it.
            // For now, abort triggers normal flow if results were available.
            if (generationControllerRef.current) {
              generationControllerRef.current.abort();
            }
          }}
          onCancelAlgorithm={handleCancelAlgorithm}
          algorithms={algoConfig.filter(a => (compParams.algorithmIds || []).includes(a.id))}
          canceledIds={canceledAlgoIds}
        />
      </div>
    </div>
  );
};
