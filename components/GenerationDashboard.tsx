import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ConvergenceDataPoint } from '../types';

interface Props {
  data: (number | null)[][]; // Each element is an array of scores, one per algorithm
  attempts: Record<string, number>;
  exhaustionPoints: Record<string, number>;
  maxTries: number;
  onStop: () => void;
  onSelectWinners: () => void;
  onCancelAlgorithm: (id: string) => void;
  algorithms: { id: string, name: string, color: string }[];
  canceledIds: Set<string>;
  healerProgress?: number;
}


const CustomizedXDot = (props: any) => {
  const { cx, cy, stroke, payload, dataKey, index, fullData } = props;
  
  // Only show X if this is the last valid point for this series
  const currentVal = payload[dataKey];
  const nextVal = fullData[index + 1]?.[dataKey];
  
  if (currentVal !== null && (nextVal === null || nextVal === undefined)) {
    return (
      <svg x={cx - 6} y={cy - 6} width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={4} strokeLinecap="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    );
  }
  return null;
};

export const GenerationDashboard: React.FC<Props> = ({ data, attempts, exhaustionPoints, maxTries, onStop, onSelectWinners, onCancelAlgorithm, algorithms, canceledIds, healerProgress }) => {
  const [isPromoting, setIsPromoting] = React.useState(false);
  const startTimeRef = React.useRef<number>(Date.now());
  
  const eta = useMemo(() => {
    if (data.length < 5) return 'Calculating...';
    const elapsed = Date.now() - startTimeRef.current;
    const progress = data.length / maxTries;
    if (progress >= 1) return 'Done';
    
    const remainingTime = (elapsed / progress) - elapsed;
    const seconds = Math.ceil(remainingTime / 1000);
    
    if (seconds > 60) {
      return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }, [data.length, maxTries]);
  const chartData = useMemo(() => {
    const aggregated: any[] = [];
    const stride = Math.max(1, Math.floor(data.length / 300)); // Fewer points for faster rendering
    
    data.forEach((scores, idx) => {
      if (idx % stride === 0 || idx === data.length - 1) {
        const point: any = { round: idx };
        algorithms.forEach((algo, i) => {
          point[algo.id] = scores[i];
        });
        aggregated.push(point);
      }
    });
    return aggregated;
  }, [data, algorithms]);

  const bestScore = useMemo(() => {
    if (data.length === 0) return 0;
    const lastRow = data[data.length - 1];
    const validScores = lastRow.filter((s): s is number => s !== null);
    if (validScores.length === 0) return 0;
    return Math.max(...validScores);
  }, [data]);

  return (
    <div className="bg-white rounded-3xl shadow-xl p-8 border border-light-5 flex flex-col gap-6 h-[650px]">

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-2.5 h-2.5 rounded-full bg-green animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <div>
            <h2 className="text-xl font-black text-primary tracking-tight">
              Global Multi-Year Convergence
            </h2>
            <div className="flex items-center gap-3">
              <p className="text-muted text-sm font-medium">Holistic optimization across all academic years</p>
              <div className="h-1 w-1 rounded-full bg-light-6" />
              <p className="text-blue text-xs font-black uppercase tracking-widest">Est. {eta}</p>
              {healerProgress !== undefined && (
                <>
                  <div className="h-1 w-1 rounded-full bg-light-6" />
                  <p className="text-green text-xs font-black uppercase tracking-widest">Healer: {healerProgress}%</p>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={onStop} 
            className="px-6 py-2.5 rounded-xl border-2 border-red/10 text-red font-bold hover:bg-red/5 transition-all active:scale-95 text-sm"
          >
            Abort
          </button>
          <button 
            onClick={() => {
              setIsPromoting(true);
              onSelectWinners();
            }}
            disabled={isPromoting}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold shadow-lg transition-all active:scale-95 text-sm ${isPromoting ? 'bg-light-4 text-muted cursor-not-allowed' : 'bg-blue text-white shadow-blue/20 hover:bg-blue-dark'}`}
          >
            {isPromoting ? (
              <>
                <div className="w-4 h-4 border-2 border-muted/30 border-t-muted rounded-full animate-spin" />
                Promoting Best...
              </>
            ) : (
              'Promote Best Now'
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 w-full min-h-0 bg-light-1/30 rounded-2xl p-4 border border-light-5">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis 
              dataKey="round" 
              type="number" 
              domain={['auto', 'auto']} 
              tick={{fontSize: 10, fontWeight: 700, fill: '#64748b'}}
              stroke="#e2e8f0"
            />
            <YAxis 
              tick={{fontSize: 10, fontWeight: 700, fill: '#64748b'}}
              stroke="#e2e8f0"
              domain={['auto', 'auto']}
            />
            <Tooltip 
              contentStyle={{borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px'}}
              itemStyle={{fontSize: '12px', fontWeight: 700}}
              labelStyle={{fontSize: '10px', fontWeight: 800, color: '#64748b', marginBottom: '4px'}}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="circle"
              formatter={(value) => <span className="text-xs font-bold text-primary">{value}</span>}
            />
            
            {algorithms.map(algo => !canceledIds.has(algo.id) && (
              <Line 
                key={algo.id}
                type="monotone" 
                dataKey={algo.id} 
                name={algo.name}
                stroke={algo.color} 
                strokeWidth={2.5}
                dot={<CustomizedXDot fullData={chartData} />}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {algorithms.map((algo, i) => {
          const isCanceled = canceledIds.has(algo.id);
          
          let currentBest: number | null = -Infinity;
          for (let d = data.length - 1; d >= 0; d--) {
            const score = data[d]?.[i];
            if (score !== undefined && score !== null) {
              currentBest = score;
              break;
            }
          }

          
          const isWinner = currentBest === bestScore && currentBest !== -Infinity && currentBest !== null;

          return (
            <div 
              key={algo.id}
              className={`p-3 rounded-2xl border transition-all relative ${isCanceled ? 'bg-light-1 opacity-50 border-transparent' : 'bg-white border-light-5 shadow-sm'} ${isWinner ? 'ring-2 ring-blue ring-offset-2' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: algo.color }} />
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted">{algo.name}</span>
                </div>
                {!isCanceled && (
                  <button 
                    onClick={() => onCancelAlgorithm(algo.id)}
                    className="text-[10px] font-bold text-red/60 hover:text-red transition-colors"
                  >
                    Kill
                  </button>
                )}
              </div>
              <div className="text-xl font-black text-primary leading-none flex items-baseline gap-1">
                {(typeof currentBest === 'number' && currentBest !== -Infinity) ? currentBest.toFixed(1) : '---'}
                {isWinner && <span className="text-[8px] text-blue font-black uppercase">Best</span>}
              </div>
              <div className="text-[9px] font-bold text-muted mt-1 uppercase tracking-tight">
                Attempt {(attempts as any)?.[algo.id] || 0} / {(exhaustionPoints as any)?.[algo.id] || '?'}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
};

