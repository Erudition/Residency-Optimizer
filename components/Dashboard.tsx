
import React from 'react';
import { Resident, ScheduleStats, AssignmentType } from '../types';
import { ASSIGNMENT_COLORS, ASSIGNMENT_HEX_COLORS } from '../constants';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Props {
  residents: Resident[];
  stats: ScheduleStats;
}


export const Dashboard: React.FC<Props> = React.memo(({ residents, stats }) => {

  // Transform data for Recharts - Memoized to prevent animation resets on App re-render
  const data = React.useMemo(() => residents.map(r => {
    const s = stats[r.id] || {};
    return {
      name: r.name,
      pgy: `PGY${r.level}`,
      [AssignmentType.WARDS_RED]: s[AssignmentType.WARDS_RED] || 0,
      [AssignmentType.WARDS_BLUE]: s[AssignmentType.WARDS_BLUE] || 0,
      [AssignmentType.MICU]: s[AssignmentType.MICU] || 0,
      [AssignmentType.NIGHT_FLOAT]: s[AssignmentType.NIGHT_FLOAT] || 0,
      [AssignmentType.EM]: s[AssignmentType.EM] || 0,
      [AssignmentType.CLINIC]: s[AssignmentType.CLINIC] || 0,
      [AssignmentType.ELECTIVE]: s[AssignmentType.ELECTIVE] || 0,
      [AssignmentType.VACATION]: s[AssignmentType.VACATION] || 0,
      [AssignmentType.WARDS_METRO]: s[AssignmentType.WARDS_METRO] || 0,
      [AssignmentType.CARDS]: s[AssignmentType.CARDS] || 0,
      [AssignmentType.ID]: s[AssignmentType.ID] || 0,
      [AssignmentType.NEPH]: s[AssignmentType.NEPH] || 0,
      [AssignmentType.PULM]: s[AssignmentType.PULM] || 0,
      [AssignmentType.METRO_ICU]: s[AssignmentType.METRO_ICU] || 0,
      [AssignmentType.ONC]: s[AssignmentType.ONC] || 0,
      [AssignmentType.NEURO]: s[AssignmentType.NEURO] || 0,
      [AssignmentType.RHEUM]: s[AssignmentType.RHEUM] || 0,
      [AssignmentType.GI]: s[AssignmentType.GI] || 0,

      [AssignmentType.ADD_MED]: s[AssignmentType.ADD_MED] || 0,
      [AssignmentType.ENDO]: s[AssignmentType.ENDO] || 0,
      [AssignmentType.GERI]: s[AssignmentType.GERI] || 0,
      [AssignmentType.PALLIATIVE]: s[AssignmentType.PALLIATIVE] || 0,

      [AssignmentType.RESEARCH]: s[AssignmentType.RESEARCH] || 0,
      [AssignmentType.CCMA]: s[AssignmentType.CCMA] || 0,
      [AssignmentType.HF]: s[AssignmentType.HF] || 0,
      [AssignmentType.AMCS_CONSULTS]: s[AssignmentType.AMCS_CONSULTS] || 0,
      [AssignmentType.ENT]: s[AssignmentType.ENT] || 0,
      [AssignmentType.PMNR]: s[AssignmentType.PMNR] || 0,
      [AssignmentType.JR_HOSPITALIST]: s[AssignmentType.JR_HOSPITALIST] || 0,
    };
  }), [residents, stats]);

  // Split by PGY for cleaner charts - Memoized references
  const pgy1Data = React.useMemo(() => data.filter(d => d.pgy === 'PGY1'), [data]);
  const pgy2Data = React.useMemo(() => data.filter(d => d.pgy === 'PGY2'), [data]);
  const pgy3Data = React.useMemo(() => data.filter(d => d.pgy === 'PGY3'), [data]);

  const ChartSection = ({ title, dataSet }: { title: string, dataSet: any[] }) => (
    <div className="mb-8 p-4 bg-white rounded-lg border shadow-sm">
      <h3 className="text-lg font-bold mb-4 text-primary">{title} Workload Distribution</h3>
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
            <Bar isAnimationActive={false} dataKey={AssignmentType.WARDS_RED} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.WARDS_RED]} name="Wards Red" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.WARDS_BLUE} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.WARDS_BLUE]} name="Wards Blue" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.MICU} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.MICU]} name="ICU" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.NIGHT_FLOAT} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.NIGHT_FLOAT]} name="Night Float" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.EM} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.EM]} name="EM" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.CLINIC} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.CLINIC]} name="Clinic" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.CARDS} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.CARDS]} name="Cardiology" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.ID} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.ID]} name="Inf. Disease" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.NEPH} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.NEPH]} name="Nephrology" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.PULM} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.PULM]} name="Pulmonology" />

            <Bar isAnimationActive={false} dataKey={AssignmentType.METRO_ICU} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.METRO_ICU]} name="Metro ICU" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.ONC} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.ONC]} name="Heme/Onc" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.NEURO} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.NEURO]} name="Neurology" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.RHEUM} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.RHEUM]} name="Rheumatology" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.GI} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.GI]} name="GI" />

            <Bar isAnimationActive={false} dataKey={AssignmentType.ADD_MED} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.ADD_MED]} name="Addiction Med" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.ENDO} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.ENDO]} name="Endocrinology" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.GERI} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.GERI]} name="Geriatrics" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.PALLIATIVE} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.PALLIATIVE]} name="Palliative" />

            <Bar isAnimationActive={false} dataKey={AssignmentType.RESEARCH} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.RESEARCH]} name="Research" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.CCMA} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.CCMA]} name="CCMA" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.HF} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.HF]} name="Heart Failure" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.AMCS_CONSULTS} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.AMCS_CONSULTS]} name="AMCS Consults" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.ENT} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.ENT]} name="ENT" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.PMNR} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.PMNR]} name="PMNR" />

            <Bar isAnimationActive={false} dataKey={AssignmentType.ELECTIVE} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.ELECTIVE]} name="Elective" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.VACATION} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.VACATION]} name="Vacation" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.WARDS_METRO} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.WARDS_METRO]} name="Metro Wards" />
            <Bar isAnimationActive={false} dataKey={AssignmentType.JR_HOSPITALIST} stackId="a" fill={ASSIGNMENT_HEX_COLORS[AssignmentType.JR_HOSPITALIST]} name="Jr Hospitalist" />

          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="p-6 bg-light-1 min-h-full">
      <ChartSection title="PGY 1 (Interns)" dataSet={pgy1Data} />
      <ChartSection title="PGY 2" dataSet={pgy2Data} />
      <ChartSection title="PGY 3" dataSet={pgy3Data} />
    </div>
  );
});
