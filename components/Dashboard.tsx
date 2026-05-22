
import React from 'react';
import { Resident, ScheduleStats, AssignmentType } from '../types';
import { oklchToHex } from '../utils/colorUtils';
import { useProgramData } from '../contexts/ProgramDataContext';
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

  // Transform data for Recharts - Memoized to prevent animation resets on App re-render
  const data = React.useMemo(() => residents.map(r => {
    const s = stats[r.id] || {};
    return {
      name: r.name,
      pgy: `PGY${r.level}`,
      ['W-RED']: s['W-RED'] || 0,
      ['W-BLUE']: s['W-BLUE'] || 0,
      ['ICU']: s['ICU'] || 0,
      ['NF']: s['NF'] || 0,
      ['EM']: s['EM'] || 0,
      ['CCIM']: s['CCIM'] || 0,
      ['ELEC']: s['ELEC'] || 0,
      ['VAC']: s['VAC'] || 0,
      ['MET']: s['MET'] || 0,
      ['CARDS']: s['CARDS'] || 0,
      ['ID']: s['ID'] || 0,
      ['NEPH']: s['NEPH'] || 0,
      ['PULM']: s['PULM'] || 0,
      ['METRO']: s['METRO'] || 0,
      ['ONC']: s['ONC'] || 0,
      ['NEURO']: s['NEURO'] || 0,
      ['RHEUM']: s['RHEUM'] || 0,
      ['GI']: s['GI'] || 0,

      ['ADDM']: s['ADDM'] || 0,
      ['ENDO']: s['ENDO'] || 0,
      ['GERI']: s['GERI'] || 0,
      ['HPC']: s['HPC'] || 0,

      ['RSCH']: s['RSCH'] || 0,
      ['CCMA']: s['CCMA'] || 0,
      ['HF']: s['HF'] || 0,
      ['AMCS']: s['AMCS'] || 0,
      ['ENT']: s['ENT'] || 0,
      ['PMNR']: s['PMNR'] || 0,
      ['JH']: s['JH'] || 0,
    };
  }), [residents, stats]);

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

              <Bar isAnimationActive={false} dataKey={'METRO'} stackId="a" fill={getHighChromaColor('METRO', programData.rotations)} name="Metro ICU" />
              <Bar isAnimationActive={false} dataKey={'ONC'} stackId="a" fill={getHighChromaColor('ONC', programData.rotations)} name="Heme/Onc" />
              <Bar isAnimationActive={false} dataKey={'NEURO'} stackId="a" fill={getHighChromaColor('NEURO', programData.rotations)} name="Neurology" />
              <Bar isAnimationActive={false} dataKey={'RHEUM'} stackId="a" fill={getHighChromaColor('RHEUM', programData.rotations)} name="Rheumatology" />
              <Bar isAnimationActive={false} dataKey={'GI'} stackId="a" fill={getHighChromaColor('GI', programData.rotations)} name="GI" />

              <Bar isAnimationActive={false} dataKey={'ADDM'} stackId="a" fill={getHighChromaColor('ADDM', programData.rotations)} name="Addiction Med" />
              <Bar isAnimationActive={false} dataKey={'ENDO'} stackId="a" fill={getHighChromaColor('ENDO', programData.rotations)} name="Endocrinology" />
              <Bar isAnimationActive={false} dataKey={'GERI'} stackId="a" fill={getHighChromaColor('GERI', programData.rotations)} name="Geriatrics" />
              <Bar isAnimationActive={false} dataKey={'HPC'} stackId="a" fill={getHighChromaColor('HPC', programData.rotations)} name="Palliative" />

              <Bar isAnimationActive={false} dataKey={'RSCH'} stackId="a" fill={getHighChromaColor('RSCH', programData.rotations)} name="Research" />
              <Bar isAnimationActive={false} dataKey={'CCMA'} stackId="a" fill={getHighChromaColor('CCMA', programData.rotations)} name="CCMA" />
              <Bar isAnimationActive={false} dataKey={'HF'} stackId="a" fill={getHighChromaColor('HF', programData.rotations)} name="Heart Failure" />
              <Bar isAnimationActive={false} dataKey={'AMCS'} stackId="a" fill={getHighChromaColor('AMCS', programData.rotations)} name="AMCS Consults" />
              <Bar isAnimationActive={false} dataKey={'ENT'} stackId="a" fill={getHighChromaColor('ENT', programData.rotations)} name="ENT" />
              <Bar isAnimationActive={false} dataKey={'PMNR'} stackId="a" fill={getHighChromaColor('PMNR', programData.rotations)} name="PMNR" />

              <Bar isAnimationActive={false} dataKey={'ELEC'} stackId="a" fill={getHighChromaColor('ELEC', programData.rotations)} name="Elective" />
              <Bar isAnimationActive={false} dataKey={'VAC'} stackId="a" fill={getHighChromaColor('VAC', programData.rotations)} name="Vacation" />
              <Bar isAnimationActive={false} dataKey={'MET'} stackId="a" fill={getHighChromaColor('MET', programData.rotations)} name="Metro Wards" />
              <Bar isAnimationActive={false} dataKey={'JH'} stackId="a" fill={getHighChromaColor('JH', programData.rotations)} name="Jr Hospitalist" />

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
