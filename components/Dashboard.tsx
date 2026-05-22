
import React from 'react';
import { Resident, ScheduleStats, AssignmentType } from '../types';
import { oklchToHex } from '../utils/colorUtils';
import { useProgramData } from '../contexts/ProgramDataContext';
import { getDisplayOrderedCodenames } from '../services/programDataUtils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Props {
  residents: Resident[];
  stats: ScheduleStats;
}

const getHighChromaColor = (type: AssignmentType, rotations: Map<string, any>): string => {
  const rotation = rotations.get(type);
  const hue = rotation?.color ?? 180;
  const intensity = rotation?.intensity ?? 1;

  const chroma = intensity === 0 ? 0.04 : 0.07 + intensity * 0.045;
  const lightness = 0.76;

  return oklchToHex(lightness, chroma, hue);
};

export const Dashboard: React.FC<Props> = React.memo(({ residents, stats }) => {
  const programData = useProgramData();

  // Get the display-ordered codenames dynamically
  const orderedCodenames = React.useMemo(() => getDisplayOrderedCodenames(programData), [programData]);

  // Transform data for Recharts - fully dynamic from programData
  const data = React.useMemo(() => residents.map(r => {
    const s = stats[r.id] || {};
    const row: Record<string, any> = {
      name: r.name,
      pgy: `PGY${r.level}`,
    };
    orderedCodenames.forEach(codename => {
      row[codename] = s[codename] || 0;
    });
    return row;
  }), [residents, stats, orderedCodenames]);

  // Split by PGY for cleaner charts - Memoized references
  const pgy1Data = React.useMemo(() => data.filter(d => d.pgy === 'PGY1'), [data]);
  const pgy2Data = React.useMemo(() => data.filter(d => d.pgy === 'PGY2'), [data]);
  const pgy3Data = React.useMemo(() => data.filter(d => d.pgy === 'PGY3'), [data]);

  const ChartSection = ({ title, dataSet }: { title: string, dataSet: any[] }) => {
    // Dynamic height based on number of residents (35px per resident + padding)
    const chartHeight = Math.max(400, dataSet.length * 35 + 80);
    
    return (
      <div className="p-4 bg-white rounded-lg border shadow-sm flex flex-col h-full">
        <h3 className="text-lg font-bold mb-4 text-primary">{title} Workload Distribution</h3>
        <div style={{ height: `${chartHeight}px` }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={dataSet} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                type="number" 
                domain={[0, 52]} 
              />
              <YAxis 
                type="category" 
                dataKey="name" 
                width={110} 
                interval={0}
                fontSize={11}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                wrapperStyle={{ zIndex: 100 }}
              />

              {orderedCodenames.map(codename => {
                const meta = programData.rotations.get(codename);
                return (
                  <Bar
                    key={codename}
                    isAnimationActive={false}
                    dataKey={codename}
                    stackId="a"
                    fill={getHighChromaColor(codename, programData.rotations)}
                    name={meta?.label || codename}
                  />
                );
              })}

            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-light-1 min-h-full">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <ChartSection title="PGY 1 (Interns)" dataSet={pgy1Data} />
        <ChartSection title="PGY 2" dataSet={pgy2Data} />
        <ChartSection title="PGY 3" dataSet={pgy3Data} />
      </div>
    </div>
  );
});

