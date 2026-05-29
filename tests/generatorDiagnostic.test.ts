import { loadProgramData } from '../services/api/client';
import { getStandardCohortMap } from '../services/generators/utils';
import { RequirementsEngine } from '../services/requirementsEngine';
import { getRequirementsViolationsCount, sliceIntoYears, getWeeklyViolations } from '../services/scheduler';
import { ScheduleGrid, Resident, ScheduleHistory } from '../types';

// Import all generators
import { WeekByWeekGenerator } from '../services/generators/weekByWeek';
import { StaffingFirstGenerator } from '../services/generators/staffingFirst';
import { EducationFirstGenerator } from '../services/generators/educationFirst';
import { StochasticGenerator } from '../services/generators/stochastic';

import { test } from 'vitest';

test('Generator Violation Diagnostic (Real Data)', async () => {
  console.log("Starting Generator Diagnostic...\n");

  const startYear = 2026;
  console.log("Fetching program data from the backend...");
  const programData = await loadProgramData(startYear);

  if (!programData.cycleConfig) {
    console.error("CRITICAL: cycleConfig is undefined!");
    return;
  }
  console.log("cycleConfig:", programData.cycleConfig);

  const residents = programData.residents;
  const cohortMap = getStandardCohortMap(residents, programData);

  // --- Generate Perfect History for Past Years ---
  const historicalSchedules: ScheduleHistory = {};
  const { Z, Y } = programData.cycleConfig;

  residents.forEach(r => {
    if (!r.startYear || r.startYear >= startYear) return;

    for (let y = r.startYear; y < startYear; y++) {
      const pgy = y - r.startYear + 1;
      if (pgy < 1 || pgy > 3) continue;

      if (!historicalSchedules[y]) historicalSchedules[y] = {};

      const cells = Array.from({ length: 52 }, () => ({ assignment: 'ELEC' as any, locked: true }));
      const cohortIndex = cohortMap[r.id] ?? 0;
      for (let w = 0; w < 52; w++) {
        if (Math.floor((w % Z) / Y) === cohortIndex) {
          cells[w] = { assignment: 'CLINIC' as any, locked: true };
        }
      }

      let vacsSet = 0;
      for (let w = 51; w >= 0 && vacsSet < 4; w--) {
        if (cells[w].assignment !== 'CLINIC') {
          cells[w] = { assignment: 'VAC' as any, locked: true };
          vacsSet++;
        }
      }

      (programData.requirements || []).forEach(req => {
        const idealWeeks = pgy === 1 ? (req.pgy1Ideal || 0) :
                           (pgy === 2 ? (req.pgy2Ideal || 0) : (req.pgy3Ideal || 0));
        let placed = 0;
        const findRotation = (tagTitle: string): string => {
          for (const [codename, tags] of programData.rotationTags.entries()) {
            if (tags.includes(tagTitle)) return codename;
          }
          return tagTitle;
        };
        for (let w = 0; w < 52 && placed < idealWeeks; w++) {
          if (cells[w].assignment === 'ELEC') {
            cells[w] = { assignment: findRotation(req.tag.title) as any, locked: true };
            placed++;
          }
        }
      });

      historicalSchedules[y][r.id] = cells;
    }
  });

  // --- Run each generator and diagnose ---
  const generators = [
    { name: 'StaffingFirst', gen: StaffingFirstGenerator },
    { name: 'WeekByWeek', gen: WeekByWeekGenerator },
    { name: 'EducationFirst', gen: EducationFirstGenerator },
    { name: 'Stochastic', gen: StochasticGenerator },
  ];

  for (const { name, gen } of generators) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  GENERATOR: ${name}`);
    console.log(`${'='.repeat(60)}`);

    const grid = await gen.generate(residents, {}, programData, 0);

    const totalWeeks = Object.values(grid)[0]?.length || 52;
    const isUnified = Math.floor(totalWeeks / 52) === 3;

    const fullHistory: ScheduleHistory = JSON.parse(JSON.stringify(historicalSchedules));
    const sliced = sliceIntoYears(grid, startYear, 3);
    Object.assign(fullHistory, sliced);

    // --- Requirements violations ---
    const reqsDeficit = getRequirementsViolationsCount(residents, grid, fullHistory, startYear, isUnified, programData);
    const auditViolations = RequirementsEngine.getAuditViolations(residents, fullHistory, programData, startYear);

    // --- Weekly violations (full list) ---
    const weekV = getWeeklyViolations(residents, grid, programData, startYear);
    const weeklyInstances = weekV.reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);

    console.log(`\n  SUMMARY:`);
    console.log(`    Req deficit weeks:      ${reqsDeficit}`);
    console.log(`    Audit violations:       ${auditViolations}`);
    console.log(`    Weekly violation rules:  ${weekV.length}`);
    console.log(`    Weekly violation badge:  ${weeklyInstances}`);
    console.log(`    TOTAL UI penalty:        ${reqsDeficit + weeklyInstances + auditViolations}`);

    // --- Break down weekly violations by category ---
    const categories = {
      staffingMin: { count: 0, instances: 0, details: {} as Record<string, number> },
      staffingMax: { count: 0, instances: 0, details: {} as Record<string, number> },
      jeopardy:    { count: 0, instances: 0, details: {} as Record<string, number> },
      clinic:      { count: 0, instances: 0, details: {} as Record<string, number> },
      vacation:    { count: 0, instances: 0, details: {} as Record<string, number> },
      other:       { count: 0, instances: 0, details: {} as Record<string, number> },
    };

    weekV.forEach(v => {
      const inst = v.instances !== undefined ? v.instances : 1;
      const normalized = v.issue.replace(/\d+/g, 'N').replace(/for .+$/, 'for ...');
      let cat: keyof typeof categories;

      if (v.issue.includes('Min Interns') || v.issue.includes('Min Seniors')) {
        cat = 'staffingMin';
      } else if (v.issue.includes('Max Interns') || v.issue.includes('Max Seniors')) {
        cat = 'staffingMax';
      } else if (v.issue.includes('Jeopardy')) {
        cat = 'jeopardy';
      } else if (v.issue.includes('clinic') || v.issue.includes('No residents in clinic')) {
        cat = 'clinic';
      } else if (v.issue.includes('Vacation')) {
        cat = 'vacation';
      } else {
        cat = 'other';
      }

      categories[cat].count += 1;
      categories[cat].instances += inst;
      categories[cat].details[normalized] = (categories[cat].details[normalized] || 0) + inst;
    });

    console.log(`\n  WEEKLY VIOLATIONS BREAKDOWN:`);
    for (const [catName, cat] of Object.entries(categories)) {
      if (cat.count === 0) continue;
      console.log(`\n    [${catName.toUpperCase()}] ${cat.count} rules, ${cat.instances} instances`);
      Object.entries(cat.details)
        .sort((a, b) => b[1] - a[1])
        .forEach(([issue, n]) => {
          console.log(`      ${issue}: ${n}`);
        });
    }

    // --- Per-year breakdown (1-year slices) ---
    if (isUnified) {
      console.log(`\n  PER-YEAR BREAKDOWN:`);
      for (let yr = 0; yr < 3; yr++) {
        const yearGrid: ScheduleGrid = {};
        for (const [resId, weeks] of Object.entries(grid)) {
          yearGrid[resId] = weeks.slice(yr * 52, (yr + 1) * 52);
        }
        const yearV = getWeeklyViolations(residents, yearGrid, programData, startYear + yr);
        const yearInst = yearV.reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);

        const yearStaffMin = yearV.filter(v => v.issue.includes('Min Interns') || v.issue.includes('Min Seniors'));
        const yearStaffMax = yearV.filter(v => v.issue.includes('Max Interns') || v.issue.includes('Max Seniors'));
        const yearJeop = yearV.filter(v => v.issue.includes('Jeopardy'));
        const yearClinic = yearV.filter(v => v.issue.includes('clinic') || v.issue.includes('No residents in clinic'));

        const staffMinInst = yearStaffMin.reduce((s, v) => s + (v.instances ?? 1), 0);
        const staffMaxInst = yearStaffMax.reduce((s, v) => s + (v.instances ?? 1), 0);
        const jeopInst = yearJeop.reduce((s, v) => s + (v.instances ?? 1), 0);
        const clinicInst = yearClinic.reduce((s, v) => s + (v.instances ?? 1), 0);

        console.log(`    Year ${startYear + yr}: badge=${yearInst}  (staffMin=${staffMinInst} staffMax=${staffMaxInst} jeopardy=${jeopInst} clinic=${clinicInst})`);
      }
      // Sum check
      const perYearSum = [0, 1, 2].reduce((total, yr) => {
        const yearGrid: ScheduleGrid = {};
        for (const [resId, weeks] of Object.entries(grid)) {
          yearGrid[resId] = weeks.slice(yr * 52, (yr + 1) * 52);
        }
        return total + getWeeklyViolations(residents, yearGrid, programData, startYear + yr)
          .reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);
      }, 0);
      console.log(`    Sum of per-year badges: ${perYearSum}  vs  unified badge: ${weeklyInstances}  (delta: ${weeklyInstances - perYearSum})`);
    }
  }

  console.log("\n\nDiagnostic complete.");
}, 120000);
