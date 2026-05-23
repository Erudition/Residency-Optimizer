import { loadProgramData } from '../services/api/client';
import { getStandardCohortMap } from '../services/generators/utils';
import { RequirementsEngine } from '../services/requirementsEngine';
import { getRequirementsViolationsCount, sliceIntoYears, getWeeklyViolations } from '../services/scheduler';
import { healSchedule } from '../services/healer';
import { ScheduleGrid, Resident, ScheduleHistory } from '../types';

// Import all generators
import { WeekByWeekGenerator } from '../services/generators/weekByWeek';
import { StaffingFirstGenerator } from '../services/generators/staffingFirst';
import { EducationFirstGenerator } from '../services/generators/educationFirst';
import { StochasticGenerator } from '../services/generators/stochastic';

import { test, expect } from 'vitest';

test('Healer Telemetry Parity Check (Real Data)', async () => {
  console.log("Starting Out-of-Band Healer Test...\n");

  const startYear = 2026;
  console.log("Fetching program data from the backend...");
  const programData = await loadProgramData(startYear);

  if (!programData.cycleConfig) {
      console.error("CRITICAL: cycleConfig is undefined directly after loadProgramData!");
      console.log(Object.keys(programData));
  } else {
      console.log("cycleConfig is defined:", programData.cycleConfig);
  }

  const residents = programData.residents;

  const generators = [
    { name: 'WeekByWeek', gen: WeekByWeekGenerator },
    { name: 'StaffingFirst', gen: StaffingFirstGenerator },
    { name: 'EducationFirst', gen: EducationFirstGenerator },
    { name: 'Stochastic', gen: StochasticGenerator }
  ];

  const randomGen = generators[Math.floor(Math.random() * generators.length)];
  console.log(`\nSelected Generator: ${randomGen.name}`);

  console.log("Generating initial schedule...");
  const initialGrid = await randomGen.gen.generate(residents, {}, programData, 0);

  const firstRes = residents.find(res => res.startYear && res.startYear > 0);
  const gridStartYear = firstRes ? (firstRes.startYear + Number(firstRes.level) - 1) : 2026;

  const cohortMap = getStandardCohortMap(residents, programData);

  // --- Generate Perfect History for Past Years ---
  const historicalSchedules: ScheduleHistory = {};
  const cycleConfig = programData.cycleConfig || { cohortCount: 5, Y: 1, Z: 5 };
  const Z = cycleConfig.Z;
  const Y = cycleConfig.Y;

  residents.forEach(r => {
    if (!r.startYear || r.startYear >= gridStartYear) return;

    for (let y = r.startYear; y < gridStartYear; y++) {
      const pgy = y - r.startYear + 1;
      if (pgy < 1 || pgy > 3) continue;

      if (!historicalSchedules[y]) {
        historicalSchedules[y] = {};
      }

      // Initialize 52 empty weeks for this year
      const cells = Array.from({ length: 52 }, () => ({ assignment: 'ELEC' as any, locked: true }));

      // Set clinic weeks
      const cohortIndex = cohortMap[r.id] ?? 0;
      for (let w = 0; w < 52; w++) {
        if (Math.floor((w % Z) / Y) === cohortIndex) {
          cells[w] = { assignment: 'CLINIC' as any, locked: true };
        }
      }

      // Set vacation weeks (4 weeks at the end of the year, on non-clinic weeks)
      let vacsSet = 0;
      for (let w = 51; w >= 0 && vacsSet < 4; w--) {
        if (cells[w].assignment !== 'CLINIC') {
          cells[w] = { assignment: 'VAC' as any, locked: true };
          vacsSet++;
        }
      }

      // Find a rotation that has this tag
      const findRotationForTag = (tagTitle: string): string => {
        for (const [codename, tags] of programData.rotationTags.entries()) {
          if (tags.includes(tagTitle)) {
            return codename;
          }
        }
        if (tagTitle === 'Neurology') return 'NEURO';
        if (tagTitle === 'Cardiology') return 'CARDS';
        if (tagTitle === 'Geriatrics') return 'GERI';
        if (tagTitle === 'Palliative Care') return 'PALL';
        if (tagTitle === 'Wards') return 'CCIM';
        if (tagTitle === 'Night Float') return 'NF';
        return tagTitle;
      };

      // Set curriculum requirements for this PGY level
      (programData.requirements || []).forEach(req => {
        const idealWeeks = pgy === 1 ? (req.pgy1Ideal || 0) :
                           (pgy === 2 ? (req.pgy2Ideal || 0) :
                                        (req.pgy3Ideal || 0));
        
        let placed = 0;
        for (let w = 0; w < 52 && placed < idealWeeks; w++) {
          if (cells[w].assignment === 'ELEC') {
            cells[w] = { assignment: findRotationForTag(req.tag.title) as any, locked: true };
            placed++;
          }
        }
      });

      historicalSchedules[y][r.id] = cells;
    }
  });

  const fullHistory: ScheduleHistory = JSON.parse(JSON.stringify(historicalSchedules));
  const sliced = sliceIntoYears(initialGrid, gridStartYear, 3);
  Object.assign(fullHistory, sliced);

  const totalWeeks = Object.values(initialGrid)[0]?.length || 52;
  const isUnified = Math.floor(totalWeeks / 52) === 3;

  const reqsDeficit = getRequirementsViolationsCount(residents, initialGrid, fullHistory, gridStartYear, isUnified, programData);
  const weeklyConstraints = getWeeklyViolations(residents, initialGrid, programData, gridStartYear).reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);
  const auditViolations = RequirementsEngine.getAuditViolations(residents, fullHistory, programData, gridStartYear);
  
  let healerReqs = 0;
  let healerAudits = 0;
  residents.forEach(r => {
    const v = RequirementsEngine.getResidentViolations(r, initialGrid, historicalSchedules, gridStartYear, programData, isUnified);
    v.forEach(viol => healerReqs += Math.max(0, viol.minWeeks - viol.actual));
    healerAudits += RequirementsEngine.getResidentAuditViolations(r, initialGrid, historicalSchedules, gridStartYear, programData, isUnified);
  });

  const initialUiPenalty = reqsDeficit + weeklyConstraints + auditViolations;
  console.log(`Initial UI Evaluation: Total = ${initialUiPenalty} (Reqs: ${reqsDeficit}, Staffing/PTO/Clinic: ${weeklyConstraints}, Audit: ${auditViolations})\n`);
  console.log(`Initial Healer Manual Evaluation: Reqs: ${healerReqs}, Audit: ${healerAudits}\n`);

  console.log("Starting Healer Solver...");
  let startHealerPenalty = -1;
  let endHealerPenalty = -1;
  let didHealerSaySuccess = false;

  const healedGrid = await healSchedule(
    initialGrid,
    residents,
    programData,
    gridStartYear,
    200000,
    historicalSchedules, // Pass the populated historical schedules!
    { [gridStartYear]: cohortMap },
    (step, maxSteps, penalty) => {
      if (step === 0) startHealerPenalty = penalty!;
      endHealerPenalty = penalty!;
      if (step % 10000 === 0) {
        console.log(`[Healer Step ${step}] Current Penalty: ${penalty}`);
      }
    }
  );

  console.log(`[Healer End] Final Healer Penalty: ${endHealerPenalty}\n`);

  const fullHistoryHealed: ScheduleHistory = JSON.parse(JSON.stringify(historicalSchedules));
  const slicedHealed = sliceIntoYears(healedGrid, gridStartYear, 3);
  Object.assign(fullHistoryHealed, slicedHealed);

  const newTotalWeeks = Object.values(healedGrid)[0]?.length || 52;
  const newIsUnified = Math.floor(newTotalWeeks / 52) === 3;

  const newReqsDeficit = getRequirementsViolationsCount(residents, healedGrid, fullHistoryHealed, gridStartYear, newIsUnified, programData);
  const newWeeklyConstraints = getWeeklyViolations(residents, healedGrid, programData, gridStartYear).reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);
  const newAuditViolations = RequirementsEngine.getAuditViolations(residents, fullHistoryHealed, programData, gridStartYear);
  const finalUiPenalty = newReqsDeficit + newWeeklyConstraints + newAuditViolations;

  console.log(`Final UI Evaluation: Total = ${finalUiPenalty} (Reqs: ${newReqsDeficit}, Staffing/PTO/Clinic: ${newWeeklyConstraints}, Audit: ${newAuditViolations})`);

  console.log("\n--- Remaining Requirement Violations ---");
  residents.forEach(r => {
    const v = RequirementsEngine.getResidentViolations(r, healedGrid, historicalSchedules, gridStartYear, programData, newIsUnified);
    v.forEach(viol => {
      const diff = viol.minWeeks - viol.actual;
      if (diff > 0) {
        console.log(`Resident ${r.name} (PGY-${RequirementsEngine.getPgyAtWeek(r, 0, gridStartYear)}): Deficit of ${diff} weeks of ${viol.type} (Required: ${viol.minWeeks}, Actual: ${viol.actual})`);
      }
    });
    const auditViols = RequirementsEngine.getResidentAuditViolations(r, healedGrid, historicalSchedules, gridStartYear, programData, newIsUnified);
    if (auditViols > 0) {
      console.log(`Resident ${r.name} (PGY-${RequirementsEngine.getPgyAtWeek(r, 0, gridStartYear)}): Audit Deficit of ${auditViols} weeks`);
    }
  });
  console.log("---------------------------------------\n");

  let healedHealerReqs = 0;
  let healedHealerAudits = 0;
  residents.forEach(r => {
    const v = RequirementsEngine.getResidentViolations(r, healedGrid, historicalSchedules, gridStartYear, programData, newIsUnified);
    v.forEach(viol => healedHealerReqs += Math.max(0, viol.minWeeks - viol.actual));
    healedHealerAudits += RequirementsEngine.getResidentAuditViolations(r, healedGrid, historicalSchedules, gridStartYear, programData, newIsUnified);
  });
  const finalHealerPenalty = healedHealerReqs + healedHealerAudits + newWeeklyConstraints;

  didHealerSaySuccess = finalHealerPenalty < startHealerPenalty;

  expect(startHealerPenalty).toBe(initialUiPenalty);
  expect(finalHealerPenalty).toBe(finalUiPenalty);

  if (didHealerSaySuccess) {
      expect(finalUiPenalty).toBeLessThan(initialUiPenalty);
      console.log(`✅ Healer successfully improved the schedule, UI penalty confirms.`);
  } else {
      expect(finalUiPenalty).toBe(initialUiPenalty);
      console.log(`✅ Healer reports STAGNATION, UI penalty confirms.`);
  }
  
  console.log("\nAll conditions passed successfully.");
}, 300000); // 5 minute timeout
