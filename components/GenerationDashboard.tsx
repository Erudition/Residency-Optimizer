import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ConvergenceDataPoint } from '../types';

interface Props {
  data: ConvergenceDataPoint[];
  onStop: () => void;
  onSelectWinners: () => void;
  algorithms: { id: string, name: string, color: string }[];
}

export const GenerationDashboard: React.FC<Props> = ({ data, onStop, onSelectWinners, algorithms }) => {
  const chartData = useMemo(() => {
    const aggregated: any[] = [];
    const latestScores: Record<string, number> = {};
    let currentGlobalBest = -Infinity;

    // Throttle data points for performance
    const stride = Math.max(1, Math.floor(data.length / 300));
    
    data.forEach((p, idx) => {
      latestScores[p.algorithmId] = p.bestScoreSoFar;
      currentGlobalBest = Math.max(currentGlobalBest, p.globalBestScore);
      
      if (idx % stride === 0 || idx === data.length - 1) {
        aggregated.push({
          round: p.attemptIndex,
          ...latestScores,
          globalBest: currentGlobalBest
        });
      }
    });
    return aggregated;
  }, [data]);

  return (
    <div className="bg-white rounded-3xl shadow-xl p-8 border border-light-5 flex flex-col gap-6 h-[500px] animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
          <div>
            <h2 className="text-xl font-black text-primary tracking-tight">Evolutionary Progress</h2>
            <p className="text-muted text-sm font-medium">Tracking score convergence across algorithms</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={onStop} 
            className="px-6 py-2.5 rounded-xl border-2 border-red/20 text-red font-bold hover:bg-red/5 transition-all active:scale-95"
          >
            Cancel
          </button>
          <button 
            onClick={onSelectWinners} 
            className="px-6 py-2.5 rounded-xl bg-green text-white font-bold shadow-lg shadow-green/20 hover:bg-green-dark transition-all active:scale-95"
          >
            Select Winners Now
          </button>
        </div>
      </div>

      <div className="flex-1 w-full min-h-0 bg-light-1/30 rounded-2xl p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis 
              dataKey="round" 
              type="number" 
              domain={['auto', 'auto']} 
              tick={{fontSize: 10, fontWeight: 700, fill: '#64748b'}}
              stroke="#e2e8f0"
              label={{ value: 'Attempts', position: 'insideBottomRight', offset: -5, fontSize: 10, fontWeight: 800 }}
            />
            <YAxis 
              tick={{fontSize: 10, fontWeight: 700, fill: '#64748b'}}
              stroke="#e2e8f0"
              domain={['auto', 'auto']}
              label={{ value: 'Score', angle: -90, position: 'insideLeft', fontSize: 10, fontWeight: 800 }}
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
            
            {algorithms.map(algo => (
              <Line 
                key={algo.id}
                type="monotone" 
                dataKey={algo.id} 
                name={algo.name}
                stroke={algo.color} 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            ))}
            <Line 
              type="monotone" 
              dataKey="globalBest" 
              name="Global Best"
              stroke="#0f172a" 
              strokeWidth={3}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
