import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ConvergenceDataPoint } from '../types';

interface Props {
  data: number[][]; // Each element is an array of scores, one per algorithm
  maxTries: number;
  onStop: () => void;
  onSelectWinners: () => void;
  onCancelAlgorithm: (id: string) => void;
  algorithms: { id: string, name: string, color: string }[];
  canceledIds: Set<string>;
}

export const GenerationDashboard: React.FC<Props> = ({ data, maxTries, onStop, onSelectWinners, onCancelAlgorithm, algorithms, canceledIds }) => {
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
    return Math.max(...lastRow);
  }, [data]);

  return (
    <div className="bg-white rounded-3xl shadow-xl p-8 border border-light-5 flex flex-col gap-6 h-[550px]">

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
            onClick={onSelectWinners} 
            className="px-6 py-2.5 rounded-xl bg-blue text-white font-bold shadow-lg shadow-blue/20 hover:bg-blue-dark transition-all active:scale-95 text-sm"
          >
            Promote Best Now
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
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {algorithms.map((algo, i) => {
          const isCanceled = canceledIds.has(algo.id);
          const currentBest = data.length > 0 ? data[data.length - 1][i] : -Infinity;
          const isWinner = currentBest === bestScore && currentBest !== -Infinity;

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
                {currentBest === -Infinity ? '---' : currentBest.toFixed(1)}
                {isWinner && <span className="text-[8px] text-blue font-black uppercase">Best</span>}
              </div>
              <div className="text-[9px] font-bold text-muted mt-1 uppercase tracking-tight">Attempt #{data.length}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

