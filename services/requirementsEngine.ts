import { 
  Resident, 
  ScheduleGrid, 
  ScheduleHistory, 
  RequirementViolation,
  WeeklyViolation,
  ClinicalSetting,
  AssignmentType,
  ScheduleCell
} from '../types';
import { ProgramData } from './api/client';
import { isClinicRotation, deriveLatestHistoricalYear } from './programDataUtils';
import { getStandardCohortMap } from './generators/utils';

/**
 * Single source of truth for all requirement and constraint validations.
 * Used by the Scheduler (generation), Healer (optimization), and UI (reporting).
 */
export class RequirementsEngine {
  
  /**
   * Calculates the actual weeks assigned for a specific resident and requirement type.
   * Handles year-bound (MHS) vs. cumulative (ACGME) logic correctly.
   */
  static getActualWeeks(
    resident: Resident,
    requirementType: string,
    schedule: ScheduleGrid,
    historicalSchedules: ScheduleHistory = {},
    sessionStartYear: number,
    currentAcademicYear: number, // renamed from targetYear per engine.md
    isCumulative: boolean = false,
    programData: ProgramData
  ): number {
    let total = 0;
    const numYears = Math.ceil((Object.values(schedule)[0]?.length || 52) / 52);

    // 1. Historical Years
    if (isCumulative) {
      Object.keys(historicalSchedules).forEach(yStr => {
        const y = parseInt(yStr);
        if (y < sessionStartYear) {
          const yearCells = historicalSchedules[y][resident.id] || [];
          total += yearCells.filter(c => this.fulfills(c.assignment, requirementType, programData)).length;
        }
      });
    }

    // 2. Active Session Years (e.g. 2026, 2027, 2028)
    for (let yearIdx = 0; yearIdx < numYears; yearIdx++) {
      const year = sessionStartYear + yearIdx;
      
      // If cumulative, we count everything up to the current academic year
      // If annual, we only count if this is the current academic year
      if ((isCumulative && year <= currentAcademicYear) || (!isCumulative && year === currentAcademicYear)) {
        const yearStart = yearIdx * 52;
        const yearEnd = (yearIdx + 1) * 52;
        const cells = (schedule[resident.id] || []).slice(yearStart, yearEnd);
        total += cells.filter(c => this.fulfills(c.assignment, requirementType, programData)).length;
      }
    }

    return total;
  }

  static getResidentViolations(
    r: Resident,
    schedule: ScheduleGrid,
    historicalSchedules: ScheduleHistory = {},
    gridStartYear: number,
    programData: ProgramData,
    isUnified: boolean = false
  ): RequirementViolation[] {
    const numYears = Object.values(schedule)[0]?.length 
      ? Math.ceil(Object.values(schedule)[0].length / 52) 
      : (Object.keys(historicalSchedules || {}).length || (isUnified ? 3 : 1));
    let isActive = false;
    for (let offset = 0; offset < numYears; offset++) {
      const pgy = (gridStartYear + offset) - r.startYear + 1;
      if (pgy >= 1 && pgy <= 3) {
        isActive = true;
        break;
      }
    }
    if (!isActive) return [];

    const violations: RequirementViolation[] = [];

    if (isUnified) {
      // Unified 3-year logic: evaluates total graduation minimum (req.minimum) scaled by PGY ideals for future resident classes
      (programData.requirements || []).forEach(req => {
        const lastActiveYear = Math.min(r.startYear + 2, gridStartYear + 2);
        const lastLevel = lastActiveYear - r.startYear + 1;
        const minWeeks = lastLevel >= 3 
          ? (req.minimum || 0) 
          : (req.pgy1Ideal || 0) + (lastLevel >= 2 ? (req.pgy2Ideal || 0) : 0);

        const actual = this.getActualWeeks(
          r,
          req.tag.title,
          schedule,
          historicalSchedules,
          gridStartYear,
          lastActiveYear,
          true,
          programData
        );

        if (minWeeks > 0 && actual < minWeeks) {
          violations.push({
            residentId: r.id,
            type: req.tag.title,
            minWeeks,
            actual,
            year: gridStartYear
          });
        }
      });
    } else {
      // Annual/cumulative 1-year logic
      const totalWeeks = Object.values(schedule)[0]?.length || 52;
      const numYears = Math.ceil(totalWeeks / 52);

      for (let yearIdx = 0; yearIdx < numYears; yearIdx++) {
        const currentYear = gridStartYear + yearIdx;
        const pgy = currentYear - r.startYear + 1;
        
        if (pgy < 1 || pgy > 3) continue;

        (programData.requirements || []).forEach(req => {
          const isCumulative = req.isCumulative;
          
          let minWeeks = 0;
          let actual = 0;

          if (isCumulative) {
            // Cumulative graduation minimum logic
            minWeeks = (pgy >= 1 ? (req.pgy1Ideal || 0) : 0) + 
                       (pgy >= 2 ? (req.pgy2Ideal || 0) : 0) + 
                       (pgy >= 3 ? (req.pgy3Ideal || 0) : 0);
            
            actual = this.getActualWeeks(r, req.tag.title, schedule, historicalSchedules, gridStartYear, currentYear, true, programData);
          } else {
            // Operational annual logic
            minWeeks = pgy === 1 ? (req.pgy1Ideal || 0) : 
                      (pgy === 2 ? (req.pgy2Ideal || 0) : 
                                   (req.pgy3Ideal || 0));
            actual = this.getActualWeeks(r, req.tag.title, schedule, historicalSchedules, gridStartYear, currentYear, false, programData);
          }

          if (minWeeks > 0 && actual < minWeeks) {
            violations.push({
              residentId: r.id,
              type: req.tag.title,
              minWeeks,
              actual,
              year: currentYear
            });
          }
        });
      }
    }

    return violations;
  }

  /**
   * Returns all requirement violations for a set of residents across all years in the schedule.
   */
  static getViolations(
    residents: Resident[],
    schedule: ScheduleGrid,
    historicalSchedules: ScheduleHistory = {},
    gridStartYear: number,
    programData: ProgramData,
    isUnified: boolean = false
  ): RequirementViolation[] {
    const violations: RequirementViolation[] = [];
    residents.forEach(r => {
      violations.push(...this.getResidentViolations(r, schedule, historicalSchedules, gridStartYear, programData, isUnified));
    });
    return violations;
  }

  /**
   * Centralized check for whether an assignment fulfills a requirement.
   * Handles tag-based fulfillment and codename fulfillment.
   */
  static fulfills(assigned: string | null, required: string, programData: ProgramData): boolean {
    if (!assigned) return false;
    if (assigned === required) return true;

    // Check if the requirement is a tag (e.g. 'Wards', 'Critical Care')
    // and the assigned rotation has that tag.
    const tags = programData.rotationTags.get(assigned);
    if (tags && tags.includes(required)) {
      return true;
    }

    return false;
  }

  /**
   * Shared logic for defining flexible (Jeopardy) blocks.
   */
  static isJeopardyBlock(type: string, programData: ProgramData): boolean {
    return programData.flexibleCodenames.has(type);
  }

  /**
   * Derives a resident's PGY level for a given week dynamically based on the gridStartYear
   * and the resident's startYear, handling the 52-week year transition correctly.
   */
  static getPgyAtWeek(resident: Resident, week: number, gridStartYear: number): number {
    const startYear = resident.startYear > 0 ? resident.startYear : gridStartYear - Number(resident.level) + 1;
    return gridStartYear - startYear + 1 + Math.floor(week / 52);
  }

  /**
   * Counts interns (PGY-1) and seniors (PGY-2+) among a set of residents at a given week.
   * Shared primitive used by both getStaffingViolation and the scoring engine.
   */
  static getStaffingCounts(
    assignees: Resident[],
    weekIdx: number,
    gridStartYear: number
  ): { interns: number; seniors: number } {
    const interns = assignees.filter(r => this.getPgyAtWeek(r, weekIdx, gridStartYear) === 1).length;
    const seniors = assignees.filter(r => this.getPgyAtWeek(r, weekIdx, gridStartYear) > 1).length;
    return { interns, seniors };
  }

  /**
   * Returns precise numeric deficits for staffing rules. Used by both the UI and Healer Solver.
   */
  static getStaffingDeficits(
    type: string,
    interns: number,
    seniors: number,
    programData: ProgramData
  ): { internMin: number; internMax: number; seniorMin: number; seniorMax: number } | null {
    const meta = programData.rotations.get(type);
    if (!meta) return null;
    return {
      internMin: meta.minInterns > 0 ? Math.max(0, meta.minInterns - interns) : 0,
      internMax: meta.maxInterns < 10 ? Math.max(0, interns - meta.maxInterns) : 0,
      seniorMin: meta.minSeniors > 0 ? Math.max(0, meta.minSeniors - seniors) : 0,
      seniorMax: meta.maxSeniors < 10 ? Math.max(0, seniors - meta.maxSeniors) : 0
    };
  }

  /**
   * Validates weekly staffing levels (intern/senior min/max) for a single rotation.
   * Returns a string violation description if unmet, otherwise null.
   *
   * Note: Defensively filters assignees by active-week range, so callers that
   * pre-filter (e.g. getWeeklyViolations) incur a harmless redundant pass.
   */
  static getStaffingViolation(
    type: string,
    assignees: Resident[],
    weekIdx: number,
    gridStartYear: number,
    programData: ProgramData
  ): string | null {
    const meta = programData.rotations.get(type);
    if (!meta) return null;

    // Defensive active-week filter — idempotent if caller already filtered
    const activeAssignees = assignees.filter(r => {
      const start = r.activeWeekStart ?? 0;
      const end = r.activeWeekEnd ?? 9999;
      return weekIdx >= start && weekIdx < end;
    });

    const { interns, seniors } = this.getStaffingCounts(activeAssignees, weekIdx, gridStartYear);
    const deficits = this.getStaffingDeficits(type, interns, seniors, programData);
    if (!deficits) return null;

    if (deficits.internMin > 0) return `Min Interns (${meta.minInterns}) unmet: ${interns}`;
    if (deficits.internMax > 0) return `Max Interns (${meta.maxInterns}) exceeded: ${interns}`;
    if (deficits.seniorMin > 0) return `Min Seniors (${meta.minSeniors}) unmet: ${seniors}`;
    if (deficits.seniorMax > 0) return `Max Seniors (${meta.maxSeniors}) exceeded: ${seniors}`;
    return null;
  }  /**
   * Evaluates all weekly constraints (staffing, clinic, jeopardy, PTO) for a single week.
   * Centralized helper used by both the UI telemetry and the background heuristic solver.
   */
  static getViolationsForWeek(
    week: number,
    globalWeek: number,
    totalWeeks: number,
    safeGrid: ScheduleGrid,
    residents: Resident[],
    activeResidentsAtWeek: Resident[],
    programData: ProgramData,
    currentYear: number,
    validGridStartYear: number,
    cohortMap: Record<string, number>,
    precomputedCounts?: { interns: Record<string, number>; seniors: Record<string, number> }
  ): WeeklyViolation[] {
    const violations: WeeklyViolation[] = [];
    const { Y, Z, X } = programData.cycleConfig;

    const assignments = activeResidentsAtWeek.map(r => safeGrid[r.id]?.[week]?.assignment);
    const clinicCount = assignments.filter(a => a && isClinicRotation(programData, a)).length;
    if (clinicCount === 0 && activeResidentsAtWeek.length > 0) {
      violations.push({ 
        week, 
        type: 'CCIM' as AssignmentType, 
        issue: `No residents in clinic in week ${week + 1}`, 
        year: Math.floor(week / 52) + currentYear, 
        instances: 1 
      });
    }

    Array.from(programData.rotations.keys())?.forEach(type => {
      let interns = 0;
      let seniors = 0;
      
      if (precomputedCounts) {
        interns = precomputedCounts.interns[type] || 0;
        seniors = precomputedCounts.seniors[type] || 0;
      } else {
        const assignees = activeResidentsAtWeek.filter(r => safeGrid[r.id]?.[week]?.assignment === type);
        interns = assignees.filter(r => this.getPgyAtWeek(r, globalWeek, validGridStartYear) === 1).length;
        seniors = assignees.filter(r => this.getPgyAtWeek(r, globalWeek, validGridStartYear) > 1).length;
      }
      
      const deficits = this.getStaffingDeficits(type, interns, seniors, programData);
      if (deficits) {
        const meta = programData.rotations.get(type)!;
        const pushViolation = (issue: string, instances: number) => {
          violations.push({
            week,
            type: type as AssignmentType,
            issue,
            year: Math.floor(week / 52) + currentYear,
            instances
          });
        };

        if (deficits.internMin > 0) pushViolation(`Min Interns (${meta.minInterns}) unmet: ${interns}`, deficits.internMin);
        if (deficits.internMax > 0) pushViolation(`Max Interns (${meta.maxInterns}) exceeded: ${interns}`, deficits.internMax);
        if (deficits.seniorMin > 0) pushViolation(`Min Seniors (${meta.minSeniors}) unmet: ${seniors}`, deficits.seniorMin);
        if (deficits.seniorMax > 0) pushViolation(`Max Seniors (${meta.maxSeniors}) exceeded: ${seniors}`, deficits.seniorMax);
      }
    });

    // T6.2: Jeopardy Pool Monitoring
    const jeopardyPgy2 = activeResidentsAtWeek.filter(r => {
      const pgy = this.getPgyAtWeek(r, globalWeek, validGridStartYear);
      const assign = safeGrid[r.id]?.[week]?.assignment;
      return pgy === 2 && assign && this.isJeopardyBlock(assign, programData);
    }).length;

    const jeopardyPgy3 = activeResidentsAtWeek.filter(r => {
      const pgy = this.getPgyAtWeek(r, globalWeek, validGridStartYear);
      const assign = safeGrid[r.id]?.[week]?.assignment;
      return pgy === 3 && assign && this.isJeopardyBlock(assign, programData);
    }).length;

    if (jeopardyPgy2 < 1 && activeResidentsAtWeek.some(r => this.getPgyAtWeek(r, globalWeek, validGridStartYear) === 2)) {
      violations.push({ week, type: 'ELEC' as AssignmentType, issue: `Jeopardy Gap: Minimum 1 PGY-2 on flexible block unmet`, year: Math.floor(week / 52) + currentYear, instances: 1 });
    }

    if (jeopardyPgy3 < 1 && activeResidentsAtWeek.some(r => this.getPgyAtWeek(r, globalWeek, validGridStartYear) === 3)) {
      violations.push({ week, type: 'ELEC' as AssignmentType, issue: `Jeopardy Gap: Minimum 1 PGY-3 on flexible block unmet`, year: Math.floor(week / 52) + currentYear, instances: 1 });
    }

    const seniorFlexibleCount = activeResidentsAtWeek.filter(r => {
      const pgy = this.getPgyAtWeek(r, globalWeek, validGridStartYear);
      const assign = safeGrid[r.id]?.[week]?.assignment;
      return pgy > 1 && assign && this.isJeopardyBlock(assign, programData);
    }).length;

    const seniorCount = activeResidentsAtWeek.filter(r => this.getPgyAtWeek(r, globalWeek, validGridStartYear) > 1).length;
    if (seniorFlexibleCount === 0 && seniorCount > 0) {
      violations.push({ week, type: 'ELEC' as AssignmentType, issue: `Jeopardy Gap: No senior residents available on flexible time`, year: Math.floor(week / 52) + currentYear, instances: 1 });
    }

    // T6.4: PTO Policy Validator
    activeResidentsAtWeek.forEach(r => {
      const assign = safeGrid[r.id]?.[week]?.assignment;
      if (assign === 'VAC') {
        const cohort = cohortMap[r.id] ?? 0;
        
        // Prevent vacation on +1 clinic weeks
        if (Math.floor((week % Z) / Y) === cohort) {
          violations.push({
            week,
            type: 'VAC' as AssignmentType,
            issue: `Vacation Policy: Vacation prohibited during +1 clinic week for ${r.name}`,
            year: Math.floor(week / 52) + currentYear,
            instances: 1
          });
        }

        // Prevent vacation during blackout weeks [0, 5, 6, 7, 8, 9, 50, 51]
        const blackoutWeeks = [0, 5, 6, 7, 8, 9, 50, 51];
        if (blackoutWeeks.includes(week % 52)) {
          violations.push({
            week,
            type: 'VAC' as AssignmentType,
            issue: `Vacation Policy: Vacation prohibited during blackout week ${week % 52 + 1} for ${r.name}`,
            year: Math.floor(week / 52) + currentYear,
            instances: 1
          });
        }

        // Prevent vacation inside core Wards/ICU blocks
        const blockStartOffset = (cohort * Y + Y) % Z;
        const offsetInCycle = (week - blockStartOffset) % Z;
        const normalizedOffset = offsetInCycle < 0 ? offsetInCycle + Z : offsetInCycle;
        
        if (normalizedOffset < X) {
          const cycleStart = week - normalizedOffset;
          const blockWeeks = Array.from({ length: X }, (_, i) => cycleStart + i);
          
          const hasCore = blockWeeks.some(w => {
            const a = safeGrid[r.id]?.[w]?.assignment;
            if (!a) return false;
            const rotMeta = programData.rotations.get(a);
            return rotMeta && rotMeta.intensity >= 4;
          });
          
          if (hasCore) {
            violations.push({
              week,
              type: 'VAC' as AssignmentType,
              issue: `Vacation Policy: Vacation prohibited inside core Wards/ICU block for ${r.name}`,
              year: Math.floor(week / 52) + currentYear,
              instances: 1
            });
          }
        }
      }
    });

    return violations;
  }

  /**
   * Scans a full schedule grid week-by-week and resident-by-resident, returns all weekly violations.
   * Centralizes all staffing, jeopardy pool, vacation, and clinic presence rules.
   */
  static getWeeklyViolations(
    residents: Resident[],
    schedule: ScheduleGrid,
    programData: ProgramData,
    gridStartYear?: number
  ): WeeklyViolation[] {
    const violations: WeeklyViolation[] = [];
    const safeGrid = schedule || {};
    const firstRes = residents?.find(res => res.startYear && res.startYear > 0);
    const fallbackYear = firstRes ? (firstRes.startYear + Number(firstRes.level) - 1) : deriveLatestHistoricalYear();
    const currentYear = gridStartYear || fallbackYear;
    const totalWeeks = Object.values(safeGrid)[0]?.length || 52;
    const { cohortCount, Y, Z, X, cohortCount: totalCohorts } = programData.cycleConfig;
    
    const cohortMap = getStandardCohortMap(residents, programData);

    const earliestMatriculationYear = Math.min(...residents.filter(r => r.startYear > 0).map(r => r.startYear));
    const validGridStartYear = isFinite(earliestMatriculationYear) ? earliestMatriculationYear : currentYear;
    const offsetWeeks = Math.max(0, (currentYear - validGridStartYear)) * 52;

    for (let week = 0; week < totalWeeks; week++) {
      const globalWeek = week + offsetWeeks;

      // Filter residents who are actually active during this specific week
      const activeResidentsAtWeek = residents.filter(r => {
        const start = r.activeWeekStart ?? 0;
        const end = r.activeWeekEnd ?? 9999;
        return globalWeek >= start && globalWeek < end;
      });

      const weeklyViolations = this.getViolationsForWeek(
        week, globalWeek, totalWeeks, safeGrid, residents, activeResidentsAtWeek, programData, currentYear, validGridStartYear, cohortMap
      );
      violations.push(...weeklyViolations);
    }





    return violations;
  }

  /**
   * Evaluates ACGME multi-year aggregate limits for a single resident.
   */
  static getResidentAuditViolations(
    r: Resident,
    currentGrid: ScheduleGrid,
    historicalGrids: ScheduleHistory,
    gridStartYear: number,
    programData: ProgramData,
    isMultiYearGrid: boolean = false
  ): number {
    const numYears = Object.values(currentGrid)[0]?.length 
      ? Math.ceil(Object.values(currentGrid)[0].length / 52) 
      : (Object.keys(historicalGrids || {}).length || (isMultiYearGrid ? 3 : 1));
    let isActive = false;
    for (let offset = 0; offset < numYears; offset++) {
      const pgy = (gridStartYear + offset) - r.startYear + 1;
      if (pgy >= 1 && pgy <= 3) {
        isActive = true;
        break;
      }
    }
    if (!isActive) return 0;

    let outpatient = 0;
    let inpatient = 0;
    let totalCriticalCare = 0;
    let criticalCareCore = 0;
    let nightFloat = 0;
    let violationCount = 0;

    let maxPgy = 0;
    const evaluateWeeks = (weeks: ScheduleCell[], year: number) => {
      const pgy = year - r.startYear + 1;
      if (pgy < 1 || pgy > 3) return;
      if (!weeks || weeks.length === 0) return;
      maxPgy = Math.max(maxPgy, pgy);
      weeks.forEach(c => {
        if (!c || !c.assignment) return;

        const meta = programData.rotations.get(c.assignment as any);
        if (!meta) return;

        if (meta.setting === ClinicalSetting.OUTPATIENT) outpatient++;
        if (meta.setting === ClinicalSetting.INPATIENT) inpatient++;
        if (meta.setting === ClinicalSetting.CRITICAL_CARE) {
          totalCriticalCare++;
          if (c.assignment !== 'AMCS') {
            criticalCareCore++;
          }
        }
        if (c.assignment === 'NF') nightFloat++;
      });
    };

    // 1. Evaluate historical
    Object.entries(historicalGrids || {})?.forEach(([yStr, grid]) => {
      evaluateWeeks(grid[r.id] || [], parseInt(yStr));
    });

    // 2. Evaluate current active grid
    if (isMultiYearGrid) {
      const totalWeeks = (currentGrid[r.id]?.length || 0);
      for (let offset = 0; offset < 3; offset++) {
        const y = gridStartYear + offset;
        const startWeek = offset * 52;
        const endWeek = Math.min(startWeek + 52, totalWeeks);
        evaluateWeeks(currentGrid[r.id]?.slice(startWeek, endWeek) || [], y);
      }
    } else {
      evaluateWeeks(currentGrid[r.id] || [], gridStartYear);
    }

    if (maxPgy === 0) return 0;

    let targetOutpatient = 44;
    let targetInpatient = 48;
    let targetNightFloat = 6;

    if (maxPgy === 1) {
      targetOutpatient = 14;
      targetInpatient = 16;
      targetNightFloat = 2;
    } else if (maxPgy === 2) {
      targetOutpatient = 29;
      targetInpatient = 32;
      targetNightFloat = 4;
    }

    if (outpatient < targetOutpatient) violationCount += (targetOutpatient - outpatient);
    if (inpatient + totalCriticalCare < targetInpatient) violationCount += (targetInpatient - (inpatient + totalCriticalCare));
    if (criticalCareCore > 24) violationCount += (criticalCareCore - 24);
    if (nightFloat < targetNightFloat) violationCount += (targetNightFloat - nightFloat);

    return violationCount;
  }

  /**
   * Centralized implementation of ACGME multi-year audit limits.
   */
  static getAuditViolations(
    residents: Resident[],
    history: ScheduleHistory,
    programData: ProgramData,
    gridStartYear?: number
  ): number {
    let violationCount = 0;
    const currentYear = gridStartYear || (deriveLatestHistoricalYear() + 1);

    residents?.forEach(r => {
      // Since history includes the merged current grid when called from the UI,
      // we pass it as historicalGrids and pass an empty currentGrid.
      violationCount += this.getResidentAuditViolations(r, {}, history, currentYear, programData, false);
    });

    return violationCount;
  }

  /**
   * Centralized check for block-aware optimization validation.
   */
  static hasStaffingViolationInWindow(
    schedule: ScheduleGrid,
    residents: Resident[],
    startWeek: number,
    duration: number,
    gridStartYear: number,
    programData: ProgramData
  ): boolean {
    for (let w = startWeek; w < startWeek + duration; w++) {
      const activeResidentsAtWeek = residents.filter(r => {
        const start = r.activeWeekStart ?? 0;
        const end = r.activeWeekEnd ?? 9999;
        return w >= start && w < end;
      });

      const violated = Array.from(programData.rotations.keys()).some(type => {
        const assignees = activeResidentsAtWeek.filter(r => schedule[r.id]?.[w]?.assignment === type);
        return this.getStaffingViolation(type, assignees, w, gridStartYear, programData) !== null;
      });
      if (violated) return true;
    }
    return false;
  }
}
