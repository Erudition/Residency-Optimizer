import { 
  Resident, 
  ScheduleGrid, 
  ScheduleHistory, 
  RequirementViolation,
  WeeklyViolation,
  ClinicalSetting,
  AssignmentType
} from '../types';
import { ProgramData } from './api/client';
import { isClinicRotation, deriveActiveStartYear } from './programDataUtils';
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

  /**
   * Returns all requirement violations for a set of residents across all years in the schedule.
   */
  static getViolations(
    residents: Resident[],
    schedule: ScheduleGrid,
    historicalSchedules: ScheduleHistory = {},
    activeYear: number,
    programData: ProgramData
  ): RequirementViolation[] {
    const violations: RequirementViolation[] = [];
    const totalWeeks = Object.values(schedule)[0]?.length || 52;
    const numYears = Math.ceil(totalWeeks / 52);

    residents.forEach(r => {
      for (let yearIdx = 0; yearIdx < numYears; yearIdx++) {
        const currentYear = activeYear + yearIdx;
        const pgy = currentYear - r.startYear + 1;
        
        if (pgy < 1 || pgy > 3) continue;

        (programData.gradRequirements || []).forEach(req => {
          const isACGME = req.source === 'acgme';
          
          let minWeeks = 0;
          let actual = 0;

          if (isACGME) {
            // ACGME cumulative logic
            minWeeks = (pgy >= 1 ? (req.pgy1Ideal || 0) : 0) + 
                       (pgy >= 2 ? (req.pgy2Ideal || 0) : 0) + 
                       (pgy >= 3 ? (req.pgy3Ideal || 0) : 0);
            
            actual = this.getActualWeeks(r, req.tag.title, schedule, historicalSchedules, activeYear, currentYear, true, programData);
          } else {
            // MHS annual logic
            minWeeks = pgy === 1 ? (req.pgy1Ideal || 0) : 
                      (pgy === 2 ? (req.pgy2Ideal || 0) : 
                                   (req.pgy3Ideal || 0));
            actual = this.getActualWeeks(r, req.tag.title, schedule, historicalSchedules, activeYear, currentYear, false, programData);
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

    if (interns < meta.minInterns) return `Min Interns (${meta.minInterns}) unmet: ${interns}`;
    if (interns > meta.maxInterns) return `Max Interns (${meta.maxInterns}) exceeded: ${interns}`;
    if (seniors < meta.minSeniors) return `Min Seniors (${meta.minSeniors}) unmet: ${seniors}`;
    if (seniors > meta.maxSeniors) return `Max Seniors (${meta.maxSeniors}) exceeded: ${seniors}`;
    return null;
  }

  /**
   * Scans a full schedule grid week-by-week and resident-by-resident, returns all weekly violations.
   * Centralizes all staffing, jeopardy pool, vacation, and clinic presence rules.
   */
  static getWeeklyViolations(
    residents: Resident[],
    schedule: ScheduleGrid,
    programData: ProgramData,
    activeYear?: number
  ): WeeklyViolation[] {
    const violations: WeeklyViolation[] = [];
    const safeGrid = schedule || {};
    const firstRes = residents?.find(res => res.startYear && res.startYear > 0);
    const fallbackYear = firstRes ? (firstRes.startYear + Number(firstRes.level) - 1) : deriveActiveStartYear();
    const currentYear = activeYear || fallbackYear;
    const totalWeeks = Object.values(safeGrid)[0]?.length || 52;
    const { cohortCount, Y, Z, X, cohortCount: totalCohorts } = programData.cycleConfig;
    
    const cohortMap = getStandardCohortMap(residents, programData);

    for (let week = 0; week < totalWeeks; week++) {
      // Filter residents who are actually active during this specific week
      const activeResidentsAtWeek = residents.filter(r => {
        const start = r.activeWeekStart ?? 0;
        const end = r.activeWeekEnd ?? totalWeeks;
        return week >= start && week < end;
      });

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
        const assignees = activeResidentsAtWeek.filter(r => safeGrid[r.id]?.[week]?.assignment === type);
        const error = this.getStaffingViolation(type, assignees, week, currentYear, programData);
        if (error) {
          const meta = programData.rotations.get(type);
          if (meta) {
            const interns = assignees.filter(r => this.getPgyAtWeek(r, week, currentYear) === 1).length;
            const seniors = assignees.filter(r => this.getPgyAtWeek(r, week, currentYear) > 1).length;
            let instances = 1;
            if (error.includes('Min Interns')) instances = meta.minInterns - interns;
            else if (error.includes('Max Interns')) instances = interns - meta.maxInterns;
            else if (error.includes('Min Seniors')) instances = meta.minSeniors - seniors;
            else if (error.includes('Max Seniors')) instances = seniors - meta.maxSeniors;

            violations.push({
              week,
              type: type as AssignmentType,
              issue: error,
              year: Math.floor(week / 52) + currentYear,
              instances
            });
          }
        }
      });

      // T6.2: Jeopardy Pool Monitoring
      const jeopardyPgy2 = activeResidentsAtWeek.filter(r => {
        const pgy = this.getPgyAtWeek(r, week, currentYear);
        const assign = safeGrid[r.id]?.[week]?.assignment;
        return pgy === 2 && assign && this.isJeopardyBlock(assign, programData);
      }).length;

      const jeopardyPgy3 = activeResidentsAtWeek.filter(r => {
        const pgy = this.getPgyAtWeek(r, week, currentYear);
        const assign = safeGrid[r.id]?.[week]?.assignment;
        return pgy === 3 && assign && this.isJeopardyBlock(assign, programData);
      }).length;

      if (jeopardyPgy2 < 1 && activeResidentsAtWeek.some(r => this.getPgyAtWeek(r, week, currentYear) === 2)) {
        violations.push({ week, type: 'ELEC' as AssignmentType, issue: `Jeopardy Gap: Minimum 1 PGY-2 on flexible block unmet`, year: Math.floor(week / 52) + currentYear, instances: 1 });
      }
      if (jeopardyPgy3 < 1 && activeResidentsAtWeek.some(r => this.getPgyAtWeek(r, week, currentYear) === 3)) {
        violations.push({ week, type: 'ELEC' as AssignmentType, issue: `Jeopardy Gap: Minimum 1 PGY-3 on flexible block unmet`, year: Math.floor(week / 52) + currentYear, instances: 1 });
      }
    }

    // PTO Policy, Clinic Site validations, and Jeopardy Pool Monitoring
    residents?.forEach(r => {
      const cohort = cohortMap[r.id] ?? 0;
      const blockStartOffset = (cohort * Y + Y) % Z;
      const start = r.activeWeekStart ?? 0;
      const end = r.activeWeekEnd ?? totalWeeks;

      for (let week = start; week < end; week++) {
        const cell = safeGrid[r.id]?.[week];
        if (!cell || !cell.assignment) continue;

        const assign = cell.assignment;

        // T6.4: PTO Policy Validator
        if (assign === 'VAC') {
          // Prevent vacation on +1 clinic weeks
          if (Math.floor((week % Z) / Y) === cohort) {
            violations.push({
              week,
              type: 'VAC' as AssignmentType,
              issue: `Vacation Policy: Vacation prohibited during +1 clinic week for ${r.name}`,
              year: Math.floor(week / 52) + currentYear
            });
          }

          // Prevent vacation during blackout weeks [0, 5, 6, 7, 8, 9, 50, 51]
          const blackoutWeeks = [0, 5, 6, 7, 8, 9, 50, 51];
          if (blackoutWeeks.includes(week % 52)) {
            violations.push({
              week,
              type: 'VAC' as AssignmentType,
              issue: `Vacation Policy: Vacation prohibited during blackout week ${week % 52 + 1} for ${r.name}`,
              year: Math.floor(week / 52) + currentYear
            });
          }
        }
      }

      // Prevent vacation inside core Wards/ICU blocks
      for (let cycle = 0; cycle < Math.floor(totalWeeks / Z); cycle++) {
        const cycleStart = cycle * Z + blockStartOffset;
        if (cycleStart + X > totalWeeks) continue;
        if (cycleStart + (X - 1) < start || cycleStart >= end) continue;

        const blockWeeks = Array.from({ length: X }, (_, i) => cycleStart + i);
        const assignmentsInBlock = blockWeeks.map(w => safeGrid[r.id]?.[w]?.assignment);

        const hasVacation = assignmentsInBlock.includes('VAC');
        const hasCore = assignmentsInBlock.some(a => a && [
          'W-RED',
          'W-BLUE',
          'METRO',
          'ICU'
        ].includes(a));

        if (hasVacation && hasCore) {
          const vacWeekIndex = blockWeeks.find(w => safeGrid[r.id]?.[w]?.assignment === 'VAC');
          const weekNum = vacWeekIndex !== undefined ? vacWeekIndex : cycleStart;
          violations.push({
            week: weekNum,
            type: 'VAC' as AssignmentType,
            issue: `Vacation Policy: Vacation prohibited inside core Wards/ICU block for ${r.name}`,
            year: Math.floor(weekNum / 52) + currentYear
          });
        }
      }
    });

    // Jeopardy Pool Monitoring: Monitor senior residents available on flexible blocks
    for (let week = 0; week < totalWeeks; week++) {
      const activeResidentsAtWeek = residents.filter(r => {
        const start = r.activeWeekStart ?? 0;
        const end = r.activeWeekEnd ?? totalWeeks;
        return week >= start && week < end;
      });

      let seniorFlexibleCount = 0;
      activeResidentsAtWeek?.forEach(r => {
        const pgy = this.getPgyAtWeek(r, week, currentYear);
        if (pgy > 1) { // Senior resident
          const cell = safeGrid[r.id]?.[week];
          if (cell && cell.assignment) {
            const assign = cell.assignment;
            const isFlexible = this.isJeopardyBlock(assign, programData);
            if (isFlexible) {
              seniorFlexibleCount++;
            }
          }
        }
      });

      const seniorCount = activeResidentsAtWeek.filter(r => this.getPgyAtWeek(r, week, currentYear) > 1).length;
      if (seniorFlexibleCount === 0 && seniorCount > 0) {
        violations.push({
          week,
          type: 'ELEC' as AssignmentType,
          issue: `Jeopardy Gap: No senior residents available on flexible time`,
          year: Math.floor(week / 52) + currentYear
        });
      }
    }

    return violations;
  }

  /**
   * Centralized implementation of ACGME multi-year audit limits.
   */
  static getAuditViolations(
    residents: Resident[],
    history: ScheduleHistory,
    programData: ProgramData,
    activeYear?: number
  ): number {
    let violationCount = 0;
    const currentYear = activeYear || 2026;

    residents?.forEach(r => {
      let outpatient = 0;
      let inpatient = 0;
      let totalCriticalCare = 0;
      let criticalCareCore = 0;
      let nightFloat = 0;

      Object.entries(history)?.forEach(([yStr, grid]) => {
        const year = parseInt(yStr);
        const pgy = year - r.startYear + 1;
        if (pgy < 1 || pgy > 3) return;

        const weeks = grid[r.id] || [];
        weeks?.forEach(c => {
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
      });

      if (outpatient < 44) violationCount += (44 - outpatient);
      if (inpatient + totalCriticalCare < 48) violationCount += (48 - (inpatient + totalCriticalCare));
      if (criticalCareCore > 24) violationCount += (criticalCareCore - 24);
      if (nightFloat < 6) violationCount += (6 - nightFloat);
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
