import { loadProgramData } from '../services/api/client';
import { getStandardCohortMap } from '../services/generators/utils';
import { RequirementsEngine } from '../services/requirementsEngine';
import { getWeeklyViolations } from '../services/scheduler';
import { ScheduleGrid, Resident, ScheduleHistory } from '../types';

import { WeekByWeekGenerator } from '../services/generators/weekByWeek';
import { StaffingFirstGenerator } from '../services/generators/staffingFirst';

import { test } from 'vitest';

test('StaffingFirst vs WeekByWeek intern diagnostic', async () => {
  const startYear = 2026;
  const programData = await loadProgramData(startYear);
  const residents = programData.residents;

  // Show which rotations have minInterns > 0
  console.log("\n=== ROTATIONS WITH minInterns > 0 ===");
  for (const [codename, config] of programData.rotations.entries()) {
    if (config.minInterns && config.minInterns > 0) {
      console.log(`  ${codename}: minInterns=${config.minInterns}, maxInterns=${config.maxInterns}, minSeniors=${config.minSeniors}, maxSeniors=${config.maxSeniors}, duration=${config.duration}`);
    }
  }

  console.log("\n=== ROTATIONS WITH minSeniors > 0 ===");
  for (const [codename, config] of programData.rotations.entries()) {
    if (config.minSeniors && config.minSeniors > 0) {
      console.log(`  ${codename}: minInterns=${config.minInterns}, maxInterns=${config.maxInterns}, minSeniors=${config.minSeniors}, maxSeniors=${config.maxSeniors}, duration=${config.duration}`);
    }
  }

  // Count PGY-1 residents
  const firstRes = residents.find(res => res.startYear && res.startYear > 0);
  const gridStartYear = firstRes ? (firstRes.startYear + Number(firstRes.level) - 1) : startYear;
  
  for (let yr = 0; yr < 3; yr++) {
    const pgy1s = residents.filter(r => {
      const pgy = gridStartYear + yr - r.startYear + 1;
      return pgy === 1;
    });
    const pgy2s = residents.filter(r => {
      const pgy = gridStartYear + yr - r.startYear + 1;
      return pgy >= 2 && pgy <= 3;
    });
    console.log(`  Year ${gridStartYear + yr}: ${pgy1s.length} interns, ${pgy2s.length} seniors`);
  }

  // Generate with both
  for (const { name, gen } of [
    { name: 'StaffingFirst', gen: StaffingFirstGenerator },
    { name: 'WeekByWeek', gen: WeekByWeekGenerator },
  ]) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${name}`);
    console.log(`${'='.repeat(60)}`);

    const grid = await gen.generate(residents, {}, programData, 0);
    const weekV = getWeeklyViolations(residents, grid, programData, startYear);
    
    // Group intern-min violations by rotation codename
    const internMinByRotation: Record<string, number[]> = {};
    weekV.forEach(v => {
      if (v.issue.includes('Min Interns')) {
        const rotation = v.type;
        if (!internMinByRotation[rotation]) internMinByRotation[rotation] = [];
        internMinByRotation[rotation].push(v.week);
      }
    });

    console.log(`\n  Intern-min violations by rotation:`);
    for (const [rot, weeks] of Object.entries(internMinByRotation).sort((a, b) => b[1].length - a[1].length)) {
      const meta = programData.rotations.get(rot);
      console.log(`    ${rot} (minInterns=${meta?.minInterns}): ${weeks.length} week-violations`);
      // Show first few week ranges
      const ranges: string[] = [];
      let rangeStart = weeks[0], prev = weeks[0];
      for (let i = 1; i <= weeks.length; i++) {
        if (i < weeks.length && weeks[i] === prev + 1) {
          prev = weeks[i];
        } else {
          ranges.push(rangeStart === prev ? `${rangeStart}` : `${rangeStart}-${prev}`);
          if (i < weeks.length) {
            rangeStart = weeks[i];
            prev = weeks[i];
          }
        }
      }
      console.log(`      Weeks: ${ranges.slice(0, 20).join(', ')}${ranges.length > 20 ? '...' : ''}`);
    }

    // Also check: for StaffingFirst, did it actually place anyone on these rotations?
    if (name === 'StaffingFirst') {
      console.log(`\n  Assignment counts for violated rotations:`);
      for (const rot of Object.keys(internMinByRotation)) {
        let totalAssigned = 0;
        let internAssigned = 0;
        let seniorAssigned = 0;
        for (const r of residents) {
          const row = grid[r.id] || [];
          const count = row.filter(c => c?.assignment === rot).length;
          if (count > 0) {
            const pgy = gridStartYear - r.startYear + 1;
            if (pgy === 1) internAssigned += count;
            else seniorAssigned += count;
            totalAssigned += count;
          }
        }
        console.log(`    ${rot}: ${totalAssigned} total week-slots (${internAssigned} intern, ${seniorAssigned} senior)`);
      }
    }
  }
}, 60000);
