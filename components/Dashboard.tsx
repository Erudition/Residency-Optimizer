import React from 'react';
import { Resident, ScheduleStats, AssignmentType } from '../types';
import { ASSIGNMENT_COLORS } from '../constants';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Props {
  residents: Resident[];
  stats: ScheduleStats;
}

export const Dashboard: React.FC<Props> = ({ residents, stats }) => {
  
  // Transform data for Recharts
  const data = residents.map(r => {
    const s = stats[r.id] || {};
    return {
      name: r.name,
      pgy: `PGY${r.level}`,
      [AssignmentType.WARDS_RED]: s[AssignmentType.WARDS_RED] || 0,
      [AssignmentType.WARDS_BLUE]: s[AssignmentType.WARDS_BLUE] || 0,
      [AssignmentType.ICU]: s[AssignmentType.ICU] || 0,
      [AssignmentType.NIGHT_FLOAT]: s[AssignmentType.NIGHT_FLOAT] || 0,
      [AssignmentType.EM]: s[AssignmentType.EM] || 0,
      [AssignmentType.CLINIC]: s[AssignmentType.CLINIC] || 0,
      [AssignmentType.ELECTIVE]: s[AssignmentType.ELECTIVE] || 0,
      [AssignmentType.VACATION]: s[AssignmentType.VACATION] || 0,
      [AssignmentType.MET_WARDS]: s[AssignmentType.MET_WARDS] || 0,
      [AssignmentType.CARDS]: s[AssignmentType.CARDS] || 0,
      [AssignmentType.ID]: s[AssignmentType.ID] || 0,
      [AssignmentType.NEPH]: s[AssignmentType.NEPH] || 0,
      [AssignmentType.PULM]: s[AssignmentType.PULM] || 0,
      [AssignmentType.METRO]: s[AssignmentType.METRO] || 0,
      [AssignmentType.ONC]: s[AssignmentType.ONC] || 0,
      [AssignmentType.NEURO]: s[AssignmentType.NEURO] || 0,
      [AssignmentType.RHEUM]: s[AssignmentType.RHEUM] || 0,
      [AssignmentType.GI]: s[AssignmentType.GI] || 0,
      
      [AssignmentType.ADD_MED]: s[AssignmentType.ADD_MED] || 0,
      [AssignmentType.ENDO]: s[AssignmentType.ENDO] || 0,
      [AssignmentType.GERI]: s[AssignmentType.GERI] || 0,
      [AssignmentType.HPC]: s[AssignmentType.HPC] || 0,

      [AssignmentType.RESEARCH]: s[AssignmentType.RESEARCH] || 0,
      [AssignmentType.CCMA]: s[AssignmentType.CCMA] || 0,
      [AssignmentType.HF]: s[AssignmentType.HF] || 0,
      [AssignmentType.CC_ICU]: s[AssignmentType.CC_ICU] || 0,
      [AssignmentType.ENT]: s[AssignmentType.ENT] || 0,
    };
  });

  // Split by PGY for cleaner charts
  const pgy1Data = data.filter(d => d.pgy === 'PGY1');
  const pgy2Data = data.filter(d => d.pgy === 'PGY2');
  const pgy3Data = data.filter(d => d.pgy === 'PGY3');

  const ChartSection = ({ title, dataSet }: { title: string, dataSet: any[] }) => (
    <div className="mb-8 p-4 bg-white rounded-lg border shadow-sm">
      <h3 className="text-lg font-bold mb-4 text-gray-700">{title} Workload Distribution</h3>
      <div className="h-[400px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dataSet} margin={{ top: 20, right: 30, left: 20, bottom: 100 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
                dataKey="name" 
                fontSize={10} 
                angle={-45} 
                textAnchor="end" 
                height={80} 
                interval={0}
            />
            <YAxis domain={[0, 52]} />
            <Tooltip 
                cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
                wrapperStyle={{ zIndex: 100 }}
            />
            <Legend verticalAlign="bottom" height={36} />
            <Bar dataKey={AssignmentType.WARDS_RED} stackId="a" fill="#fca5a5" name="Wards Red" />
            <Bar dataKey={AssignmentType.WARDS_BLUE} stackId="a" fill="#93c5fd" name="Wards Blue" />
            <Bar dataKey={AssignmentType.ICU} stackId="a" fill="#d8b4fe" name="ICU" />
            <Bar dataKey={AssignmentType.NIGHT_FLOAT} stackId="a" fill="#c7d2fe" name="Night Float" />
            <Bar dataKey={AssignmentType.EM} stackId="a" fill="#fdba74" name="EM" />
            <Bar dataKey={AssignmentType.CLINIC} stackId="a" fill="#fde047" name="Clinic" />
            <Bar dataKey={AssignmentType.CARDS} stackId="a" fill="#fda4af" name="Cardiology" />
            <Bar dataKey={AssignmentType.ID} stackId="a" fill="#d9f99d" name="Inf. Disease" />
            <Bar dataKey={AssignmentType.NEPH} stackId="a" fill="#fcd34d" name="Nephrology" />
            <Bar dataKey={AssignmentType.PULM} stackId="a" fill="#a5f3fc" name="Pulmonology" />
            
            <Bar dataKey={AssignmentType.METRO} stackId="a" fill="#e879f9" name="Metro ICU" />
            <Bar dataKey={AssignmentType.ONC} stackId="a" fill="#f9a8d4" name="Heme/Onc" />
            <Bar dataKey={AssignmentType.NEURO} stackId="a" fill="#a78bfa" name="Neurology" />
            <Bar dataKey={AssignmentType.RHEUM} stackId="a" fill="#6ee7b7" name="Rheumatology" />
            <Bar dataKey={AssignmentType.GI} stackId="a" fill="#fbbf24" name="GI" />

            <Bar dataKey={AssignmentType.ADD_MED} stackId="a" fill="#d6d3d1" name="Addiction Med" />
            <Bar dataKey={AssignmentType.ENDO} stackId="a" fill="#ffedd5" name="Endocrinology" />
            <Bar dataKey={AssignmentType.GERI} stackId="a" fill="#cbd5e1" name="Geriatrics" />
            <Bar dataKey={AssignmentType.HPC} stackId="a" fill="#bae6fd" name="Palliative" />

            <Bar dataKey={AssignmentType.RESEARCH} stackId="a" fill="#e2e8f0" name="Research" />
            <Bar dataKey={AssignmentType.CCMA} stackId="a" fill="#fce7f3" name="CCMA" />
            <Bar dataKey={AssignmentType.HF} stackId="a" fill="#fee2e2" name="Heart Failure" />
            <Bar dataKey={AssignmentType.CC_ICU} stackId="a" fill="#fecdd3" name="Cardiac ICU" />
            <Bar dataKey={AssignmentType.ENT} stackId="a" fill="#99f6e4" name="ENT" />

            <Bar dataKey={AssignmentType.ELECTIVE} stackId="a" fill="#86efac" name="Elective" />
            <Bar dataKey={AssignmentType.VACATION} stackId="a" fill="#e5e7eb" name="Vacation" />
            <Bar dataKey={AssignmentType.MET_WARDS} stackId="a" fill="#99f6e4" name="Met Wards" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="p-6 bg-gray-50 min-h-full pb-32">
      <ChartSection title="PGY 1 (Interns)" dataSet={pgy1Data} />
      <ChartSection title="PGY 2" dataSet={pgy2Data} />
      <ChartSection title="PGY 3" dataSet={pgy3Data} />
    </div>
  );
};
