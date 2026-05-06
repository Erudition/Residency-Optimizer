import React, { useMemo, useState } from 'react';
import { Resident, ScheduleGrid, AssignmentType } from '../types';
import { ArrowUpDown, Info, Network, Users, Handshake } from 'lucide-react';
import { calculateDiversityStats } from '../services/scheduler';

interface Props {
  residents: Resident[];
  schedule: ScheduleGrid;
}

type StatRow = {
  id: string;
  name: string;
  level: number;
  uniqueCount: number;
  totalPossible: number;
  percent: number;
  maxOverlapWeeks: number;
  maxOverlapName: string;
};

export const RelationshipStats: React.FC<Props> = React.memo(({ residents, schedule }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { rows, matrix } = useMemo(() => {
    const diversityScores = calculateDiversityStats(residents, schedule);
    const matrix: Record<string, Record<string, number>> = {};
    residents.forEach(r => matrix[r.id] = {});

    const relevantTypes = [
      AssignmentType.WARDS_RED,
      AssignmentType.WARDS_BLUE,
      AssignmentType.MICU,
      AssignmentType.NIGHT_FLOAT,
      AssignmentType.EM,
      AssignmentType.WARDS_METRO,
      AssignmentType.JR_HOSPITALIST
    ];

    for (let w = 0; w < 52; w++) {
      const byAssignment: Record<string, string[]> = {};
      residents.forEach(r => {
        const type = schedule[r.id]?.[w]?.assignment;
        if (type && relevantTypes.includes(type)) {
          if (!byAssignment[type]) byAssignment[type] = [];
          byAssignment[type].push(r.id);
        }
      });

      Object.values(byAssignment).forEach(group => {
        if (group.length < 2) return;
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const r1 = group[i];
            const r2 = group[j];
            matrix[r1][r2] = (matrix[r1][r2] || 0) + 1;
            matrix[r2][r1] = (matrix[r2][r1] || 0) + 1;
          }
        }
      });
    }

    const rows: StatRow[] = residents.map(r => {
      const partners = matrix[r.id];
      const partnerIds = Object.keys(partners);
      const uniqueCount = partnerIds.length;
      const totalPossible = residents.length - 1;

      let maxWeeks = 0;
      let maxPartnerId = '';

      partnerIds.forEach(pid => {
        if (partners[pid] > maxWeeks) {
          maxWeeks = partners[pid];
          maxPartnerId = pid;
        }
      });

      const maxPartner = residents.find(res => res.id === maxPartnerId);

      return {
        id: r.id,
        name: r.name,
        level: r.level,
        uniqueCount,
        totalPossible,
        percent: diversityScores[r.id] || 0,
        maxOverlapWeeks: maxWeeks,
        maxOverlapName: maxPartner ? maxPartner.name : '-'
      };
    });

    return { rows, matrix };
  }, [residents, schedule]);

  const [sortField, setSortField] = useState<keyof StatRow>('percent');
  const [sortAsc, setSortAsc] = useState(false);

  const sortedStats = useMemo(() => {
    return [...rows].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];

      if (valA === valB && sortField === 'percent') {
        return b.maxOverlapWeeks - a.maxOverlapWeeks;
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [rows, sortField, sortAsc]);

  const handleHeaderClick = (field: keyof StatRow) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'name' ? true : false);
    }
  };

  const getDiversityColor = (pct: number) => {
    if (pct < 30) return 'text-red-2-dark bg-red/20 border-red/40';
    if (pct < 50) return 'text-orange-dark bg-creamsicle/50 border-creamsicle';
    return 'text-green-dark bg-lime-green/40 border-lime-green';
  };

  // Node Calculations for Circular Layout (Enlarged)
  const nodes = useMemo(() => {
    const n = residents.length;
    return residents.map((r, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const radius = 220; // Increased radius for a significantly bigger layout
      return {
        id: r.id,
        name: r.name.split(' ').slice(0, 2).join(' '), // keep name compact
        level: r.level,
        cohort: r.cohort ?? 0,
        angle,
        x: 350 + radius * Math.cos(angle), // Center is now at 350, 350
        y: 350 + radius * Math.sin(angle)
      };
    });
  }, [residents]);

  // Link Calculations
  const links = useMemo(() => {
    const linkList: Array<{
      sourceId: string;
      targetId: string;
      sourceX: number;
      sourceY: number;
      targetX: number;
      targetY: number;
      weeks: number;
    }> = [];

    const n = nodes.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const source = nodes[i];
        const target = nodes[j];
        const weeks = matrix[source.id]?.[target.id] || 0;
        if (weeks > 0) {
          linkList.push({
            sourceId: source.id,
            targetId: target.id,
            sourceX: source.x,
            sourceY: source.y,
            targetX: target.x,
            targetY: target.y,
            weeks
          });
        }
      }
    }
    return linkList;
  }, [nodes, matrix]);

  const getCohortBg = (cohort: number) => {
    switch (cohort) {
      case 0: return 'fill-blue';
      case 1: return 'fill-purple';
      case 2: return 'fill-green';
      case 3: return 'fill-creamsicle';
      case 4: return 'fill-red';
      default: return 'fill-slate-400';
    }
  };

  const getCohortBorder = (cohort: number) => {
    switch (cohort) {
      case 0: return 'stroke-blue-dark';
      case 1: return 'stroke-purple-dark';
      case 2: return 'stroke-green-dark';
      case 3: return 'stroke-orange-dark';
      case 4: return 'stroke-red-dark';
      default: return 'stroke-slate-500';
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto bg-light-1">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Explanation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-light-5 flex gap-4">
            <div className="p-3 bg-light-blue/20 rounded-full h-fit text-blue">
              <Network size={24} />
            </div>
            <div>
              <h3 className="font-bold text-primary">What is Diversity %?</h3>
              <p className="text-xs text-secondary mt-1 leading-relaxed">
                It measures the percentage of unique residents this person has shared a team with.
                <strong> Goal: 50% or higher.</strong> High diversity ensures cross-cohort collaboration and prevents team isolation.
              </p>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-light-5 flex gap-4">
            <div className="p-3 bg-creamsicle/30 rounded-full h-fit text-orange">
              <Handshake size={24} />
            </div>
            <div>
              <h3 className="font-bold text-primary">What is Max Overlap?</h3>
              <p className="text-xs text-secondary mt-1 leading-relaxed">
                Tracks the partner someone works with most frequently.
                <strong> Goal: Under 10 weeks.</strong> Excessive overlap with one person can limit exposure to different clinical styles and feedback.
              </p>
            </div>
          </div>
        </div>

        {/* Table Report */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="p-4 border-b border-light-5 bg-light-1">
            <h2 className="text-lg font-bold text-primary">Co-Working Diversity Report</h2>
          </div>
          <table className="w-full text-sm text-left border-collapse">
            <thead className="text-xs text-muted uppercase bg-light-2 border-b sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 cursor-pointer hover:bg-light-3" onClick={() => handleHeaderClick('name')}>
                  <div className="flex items-center gap-1">Resident <ArrowUpDown size={12} /></div>
                </th>
                <th className="px-6 py-3 cursor-pointer hover:bg-light-3 text-center" onClick={() => handleHeaderClick('uniqueCount')}>
                  <div className="flex items-center gap-1 justify-center">Unique Co-workers <ArrowUpDown size={12} /></div>
                </th>
                <th className="px-6 py-3 cursor-pointer hover:bg-light-3" onClick={() => handleHeaderClick('percent')}>
                  <div className="flex items-center gap-1">Diversity % <ArrowUpDown size={12} /></div>
                </th>
                <th className="px-6 py-3 cursor-pointer hover:bg-light-3" onClick={() => handleHeaderClick('maxOverlapWeeks')}>
                  <div className="flex items-center gap-1">Most Frequent Partner <ArrowUpDown size={12} /></div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedStats.map(row => (
                <tr key={row.id} className="hover:bg-light-1">
                  <td className="px-6 py-4 font-medium text-black border-r border-gray-50">
                    <div>{row.name}</div>
                    <div className="text-xs text-muted">PGY-{row.level}</div>
                  </td>
                  <td className="px-6 py-4 text-center border-r border-gray-50">
                    <span className="font-bold text-base text-black">{row.uniqueCount}</span>
                    <span className="text-muted text-xs ml-1">/ {row.totalPossible}</span>
                  </td>
                  <td className="px-6 py-4 border-r border-gray-50">
                    <span className={`px-2 py-1 rounded text-xs font-bold border ${getDiversityColor(row.percent)}`}>
                      {row.percent.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-black">{row.maxOverlapName}</span>
                      <span className={`text-xs ${row.maxOverlapWeeks > 8 ? 'text-red font-bold' : 'text-muted'}`}>
                        {row.maxOverlapWeeks} weeks together
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Co-Working Network Visualization */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden p-6">
          <div className="border-b border-light-5 pb-4 mb-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple/10 rounded-lg text-purple">
                <Network size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-primary">Resident Co-working Network Map</h2>
                <p className="text-xs text-muted">Nodes are grouped/colored by cohort and display their PGY level. Hover to highlight connections.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue" /> <span className="text-slate-500">Cohort A</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple" /> <span className="text-slate-500">Cohort B</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green" /> <span className="text-slate-500">Cohort C</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-creamsicle" /> <span className="text-slate-500">Cohort D</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red" /> <span className="text-slate-500">Cohort E</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* SVG Network Circle (Enlarged to max-w-[550px]) */}
            <div className="lg:col-span-7 flex justify-center">
              <div className="relative w-full max-w-[550px] aspect-square">
                <svg viewBox="0 0 700 700" className="w-full h-full select-none overflow-visible">
                  {/* Outer Circular Track Guideline */}
                  <circle cx="350" cy="350" r="220" className="fill-none stroke-slate-100 stroke-1" />

                  {/* Connections (Links) */}
                  {links.map((link, idx) => {
                    const isHovered = hoveredId !== null;
                    const isConnectedToHovered = hoveredId === link.sourceId || hoveredId === link.targetId;
                    
                    const opacity = isHovered ? (isConnectedToHovered ? 0.95 : 0.04) : 0.28;
                    const strokeColor = isHovered && isConnectedToHovered 
                      ? 'stroke-purple' 
                      : link.weeks > 8 ? 'stroke-red/80' : 'stroke-slate-300';
                    
                    return (
                      <line
                        key={`${link.sourceId}-${link.targetId}-${idx}`}
                        x1={link.sourceX}
                        y1={link.sourceY}
                        x2={link.targetX}
                        y2={link.targetY}
                        strokeWidth={link.weeks * 0.8}
                        className={`${strokeColor} transition-all duration-300 ease-out`}
                        style={{ opacity }}
                      />
                    );
                  })}

                  {/* Nodes (Residents) */}
                  {nodes.map((node) => {
                    const isHovered = hoveredId !== null;
                    const isSelfHovered = hoveredId === node.id;
                    const isConnected = hoveredId !== null && (matrix[hoveredId]?.[node.id] > 0 || isSelfHovered);
                    
                    const opacity = isHovered ? (isSelfHovered || isConnected ? 1 : 0.15) : 1;
                    const nodeBg = getCohortBg(node.cohort);
                    const nodeBorder = getCohortBorder(node.cohort);
                    
                    const textX = 350 + (220 + 24) * Math.cos(node.angle);
                    const textY = 350 + (220 + 24) * Math.sin(node.angle) + 4;
                    const textAnchor = Math.cos(node.angle) > 0 ? 'start' : 'end';

                    return (
                      <g 
                        key={node.id}
                        className="cursor-pointer transition-all duration-300"
                        style={{ opacity }}
                        onMouseEnter={() => setHoveredId(node.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        {/* Interactive Area */}
                        <circle cx={node.x} cy={node.y} r={22} className="fill-transparent" />
                        
                        {/* Visual Node circle */}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={isSelfHovered ? 15 : 11}
                          className={`${nodeBg} ${nodeBorder} stroke-2 transition-all duration-300 shadow-sm`}
                        />
                        {/* PGY Level Inside Circle */}
                        <text
                          x={node.x}
                          y={node.y + 3.5}
                          textAnchor="middle"
                          className="fill-white font-extrabold text-[10px] select-none pointer-events-none"
                        >
                          {node.level}
                        </text>
                        {/* Name Label */}
                        <text
                          x={textX}
                          y={textY}
                          textAnchor={textAnchor}
                          className={`text-[10px] ${isSelfHovered ? 'font-black fill-primary' : 'font-bold fill-slate-500'} transition-all duration-200`}
                        >
                          {node.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Sidebar with dynamic metrics */}
            <div className="lg:col-span-5 h-full flex flex-col justify-center">
              <div className="bg-light-1/40 p-5 rounded-xl border border-light-5 flex flex-col justify-center min-h-[300px]">
                {hoveredId ? (() => {
                  const resident = residents.find(r => r.id === hoveredId);
                  const partnerStats = rows.find(r => r.id === hoveredId);
                  if (!resident || !partnerStats) return null;
                  
                  const partners = Object.entries(matrix[hoveredId] || {})
                    .map(([id, weeks]) => ({
                      name: residents.find(r => r.id === id)?.name || 'Unknown',
                      level: residents.find(r => r.id === id)?.level || 1,
                      cohort: residents.find(r => r.id === id)?.cohort ?? 0,
                      weeks: weeks as number
                    }))
                    .sort((a, b) => b.weeks - a.weeks);

                  return (
                    <div className="space-y-4">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selected Resident</div>
                        <h3 className="font-extrabold text-lg text-primary mt-0.5">{resident.name}</h3>
                        <div className="text-xs font-semibold text-muted">
                          PGY-{resident.level} • Cohort {String.fromCharCode(65 + (resident.cohort ?? 0))} • {partnerStats.uniqueCount} Co-workers
                        </div>
                      </div>
                      <div className="h-[1px] bg-light-5" />
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Team Diversity Score</div>
                        <div className="flex items-end gap-1">
                          <span className="text-3xl font-black text-primary">{partnerStats.percent.toFixed(0)}%</span>
                          <span className="text-xs text-muted font-bold mb-1">/ 100%</span>
                        </div>
                      </div>
                      <div className="h-[1px] bg-light-5" />
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Top Co-working Connections</div>
                        <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                          {partners.slice(0, 4).map((p, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-white px-2.5 py-1.5 rounded border border-light-5">
                              <div>
                                <div className="text-xs font-bold text-slate-700">{p.name}</div>
                                <div className="text-[10px] text-slate-400 font-semibold">
                                  PGY-{p.level} • Cohort {String.fromCharCode(65 + p.cohort)}
                                </div>
                              </div>
                              <span className="text-xs font-black text-purple-dark bg-purple/10 px-2.5 py-0.5 rounded-full">
                                {p.weeks}w
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <div className="text-center text-slate-400 py-8">
                    <Network size={36} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-sm font-bold text-slate-500">No Resident Selected</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-[220px] mx-auto">
                      Hover over any node around the circle to explore their specific co-working connections.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
});
