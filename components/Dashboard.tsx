
import React from 'react';
import { Resident, ScheduleStats, AssignmentType } from '../types';
import { ASSIGNMENT_COLORS, ASSIGNMENT_HEX_COLORS, ASSIGNMENT_HUES, oklchToHex } from '../constants';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Props {
  residents: Resident[];
  stats: ScheduleStats;
}

const getHighChromaColor = (type: AssignmentType): string => {
  const hue = ASSIGNMENT_HUES[type] ?? 180;
  
  let intensity = 1;
  switch (type) {
    case 'MICU':
    case 'METRO_ICU':
      intensity = 5;
      break;
    case 'RED':
    case 'NF':
      intensity = 4;
      break;
    case 'BLUE':
    case 'EM':
    case 'METRO':
    case 'AMCS_CONSULTS':
    case 'CCMA':
    case 'ANAESTHESIA':
    case 'Jr Hosp':
      intensity = 3;
      break;
    case 'CCIM':
    case 'NIMA (Clinic)':
    case 'Cards':
    case 'NIMA':
    case 'PMNR':
      intensity = 2;
      break;
    case 'VAC':
      intensity = 0;
      break;
    default:
      intensity = 1;
  }

  const chroma = intensity === 0 ? 0.04 : 0.07 + intensity * 0.045;
  const lightness = 0.76;

  return oklchToHex(lightness, chroma, hue);
};

export const Dashboard: React.FC<Props> = React.memo(({ residents, stats }) => {

  // Transform data for Recharts - Memoized to prevent animation resets on App re-render
  const data = React.useMemo(() => residents.map(r => {
    const s = stats[r.id] || {};
    return {
      name: r.name,
      pgy: `PGY${r.level}`,
      ['RED']: s['RED'] || 0,
      ['BLUE']: s['BLUE'] || 0,
      ['MICU']: s['MICU'] || 0,
      ['NF']: s['NF'] || 0,
      ['EM']: s['EM'] || 0,
      ['CCIM']: s['CCIM'] || 0,
      ['ELECTIVE']: s['ELECTIVE'] || 0,
      ['VAC']: s['VAC'] || 0,
      ['METRO']: s['METRO'] || 0,
      ['Cards']: s['Cards'] || 0,
      ['ID']: s['ID'] || 0,
      ['Neph']: s['Neph'] || 0,
      ['Pulm']: s['Pulm'] || 0,
      ['METRO_ICU']: s['METRO_ICU'] || 0,
      ['Onc']: s['Onc'] || 0,
      ['Neuro']: s['Neuro'] || 0,
      ['Rheum']: s['Rheum'] || 0,
      ['GI']: s['GI'] || 0,

      ['Add Med']: s['Add Med'] || 0,
      ['Endo']: s['Endo'] || 0,
      ['Geri']: s['Geri'] || 0,
      ['HPC']: s['HPC'] || 0,

      ['Research']: s['Research'] || 0,
      ['CCMA']: s['CCMA'] || 0,
      ['Heart Failure']: s['Heart Failure'] || 0,
      ['AMCS_CONSULTS']: s['AMCS_CONSULTS'] || 0,
      ['ENT']: s['ENT'] || 0,
      ['PMNR']: s['PMNR'] || 0,
      ['Jr Hosp']: s['Jr Hosp'] || 0,
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
              <Bar isAnimationActive={false} dataKey={'RED'} stackId="a" fill={getHighChromaColor('RED')} name="Wards Red" />
              <Bar isAnimationActive={false} dataKey={'BLUE'} stackId="a" fill={getHighChromaColor('BLUE')} name="Wards Blue" />
              <Bar isAnimationActive={false} dataKey={'MICU'} stackId="a" fill={getHighChromaColor('MICU')} name="ICU" />
              <Bar isAnimationActive={false} dataKey={'NF'} stackId="a" fill={getHighChromaColor('NF')} name="Night Float" />
              <Bar isAnimationActive={false} dataKey={'EM'} stackId="a" fill={getHighChromaColor('EM')} name="EM" />
              <Bar isAnimationActive={false} dataKey={'CCIM'} stackId="a" fill={getHighChromaColor('CCIM')} name="Clinic" />
              <Bar isAnimationActive={false} dataKey={'Cards'} stackId="a" fill={getHighChromaColor('Cards')} name="Cardiology" />
              <Bar isAnimationActive={false} dataKey={'ID'} stackId="a" fill={getHighChromaColor('ID')} name="Inf. Disease" />
              <Bar isAnimationActive={false} dataKey={'Neph'} stackId="a" fill={getHighChromaColor('Neph')} name="Nephrology" />
              <Bar isAnimationActive={false} dataKey={'Pulm'} stackId="a" fill={getHighChromaColor('Pulm')} name="Pulmonology" />

              <Bar isAnimationActive={false} dataKey={'METRO_ICU'} stackId="a" fill={getHighChromaColor('METRO_ICU')} name="Metro ICU" />
              <Bar isAnimationActive={false} dataKey={'Onc'} stackId="a" fill={getHighChromaColor('Onc')} name="Heme/Onc" />
              <Bar isAnimationActive={false} dataKey={'Neuro'} stackId="a" fill={getHighChromaColor('Neuro')} name="Neurology" />
              <Bar isAnimationActive={false} dataKey={'Rheum'} stackId="a" fill={getHighChromaColor('Rheum')} name="Rheumatology" />
              <Bar isAnimationActive={false} dataKey={'GI'} stackId="a" fill={getHighChromaColor('GI')} name="GI" />

              <Bar isAnimationActive={false} dataKey={'Add Med'} stackId="a" fill={getHighChromaColor('Add Med')} name="Addiction Med" />
              <Bar isAnimationActive={false} dataKey={'Endo'} stackId="a" fill={getHighChromaColor('Endo')} name="Endocrinology" />
              <Bar isAnimationActive={false} dataKey={'Geri'} stackId="a" fill={getHighChromaColor('Geri')} name="Geriatrics" />
              <Bar isAnimationActive={false} dataKey={'HPC'} stackId="a" fill={getHighChromaColor('HPC')} name="Palliative" />

              <Bar isAnimationActive={false} dataKey={'Research'} stackId="a" fill={getHighChromaColor('Research')} name="Research" />
              <Bar isAnimationActive={false} dataKey={'CCMA'} stackId="a" fill={getHighChromaColor('CCMA')} name="CCMA" />
              <Bar isAnimationActive={false} dataKey={'Heart Failure'} stackId="a" fill={getHighChromaColor('Heart Failure')} name="Heart Failure" />
              <Bar isAnimationActive={false} dataKey={'AMCS_CONSULTS'} stackId="a" fill={getHighChromaColor('AMCS_CONSULTS')} name="AMCS Consults" />
              <Bar isAnimationActive={false} dataKey={'ENT'} stackId="a" fill={getHighChromaColor('ENT')} name="ENT" />
              <Bar isAnimationActive={false} dataKey={'PMNR'} stackId="a" fill={getHighChromaColor('PMNR')} name="PMNR" />

              <Bar isAnimationActive={false} dataKey={'ELECTIVE'} stackId="a" fill={getHighChromaColor('ELECTIVE')} name="Elective" />
              <Bar isAnimationActive={false} dataKey={'VAC'} stackId="a" fill={getHighChromaColor('VAC')} name="Vacation" />
              <Bar isAnimationActive={false} dataKey={'METRO'} stackId="a" fill={getHighChromaColor('METRO')} name="Metro Wards" />
              <Bar isAnimationActive={false} dataKey={'Jr Hosp'} stackId="a" fill={getHighChromaColor('Jr Hosp')} name="Jr Hospitalist" />

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
