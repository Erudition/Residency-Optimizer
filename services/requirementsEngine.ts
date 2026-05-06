import { 
  Resident, 
  ScheduleGrid, 
  ScheduleHistory, 
  AssignmentType, 
  RequirementViolation,
  WeeklyViolation
} from '../types';
import { 
  REQUIREMENTS, 
  ACGME_TYPES, 
  ROTATION_METADATA,
  ELECTIVE_TYPES
} from '../constants';

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
    type: AssignmentType,
    schedule: ScheduleGrid,
    historicalSchedules: ScheduleHistory = {},
    sessionStartYear: number,
    currentAcademicYear: number, // renamed from targetYear per engine.md
    isCumulative: boolean = false
  ): number {
    let total = 0;
    const numYears = Math.ceil((Object.values(schedule)[0]?.length || 52) / 52);

    // 1. Historical Years
    if (isCumulative) {
      Object.keys(historicalSchedules).forEach(yStr => {
        const y = parseInt(yStr);
        if (y < sessionStartYear) {
          const yearCells = historicalSchedules[y][resident.id] || [];
          total += yearCells.filter(c => this.fulfills(c.assignment, type)).length;
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
        total += cells.filter(c => this.fulfills(c.assignment, type)).length;
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
    activeYear: number
  ): RequirementViolation[] {
    const violations: RequirementViolation[] = [];
    const totalWeeks = Object.values(schedule)[0]?.length || 52;
    const numYears = Math.ceil(totalWeeks / 52);

    residents.forEach(r => {
      for (let yearIdx = 0; yearIdx < numYears; yearIdx++) {
        const currentYear = activeYear + yearIdx;
        const pgy = currentYear - r.startYear + 1;
        
        if (pgy < 1 || pgy > 3) continue;

        const pgyReqs = REQUIREMENTS[pgy] || [];
        pgyReqs.forEach(req => {
          const isACGME = ACGME_TYPES.includes(req.type);
          
          let minWeeks = req.minWeeks;
          let actual = 0;

          if (isACGME) {
            // ACGME cumulative logic
            minWeeks = 0;
            for (let l = 1; l <= pgy; l++) {
              const levelReqs = REQUIREMENTS[l] || [];
              const levelReq = levelReqs.find(rq => rq.type === req.type);
              minWeeks += levelReq ? levelReq.minWeeks : 0;
            }
            actual = this.getActualWeeks(r, req.type, schedule, historicalSchedules, activeYear, currentYear, true);
          } else {
            // MHS annual logic
            actual = this.getActualWeeks(r, req.type, schedule, historicalSchedules, activeYear, currentYear, false);
          }

          if (actual < minWeeks) {
            violations.push({
              residentId: r.id,
              type: req.type,
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
   * Handles category-based fulfillment (e.g. WARDS_RED fulfills category 'Wards').
   */
  static fulfills(assigned: AssignmentType | null, required: AssignmentType): boolean {
    if (!assigned) return false;
    if (assigned === required) return true;

    const assignedMeta = ROTATION_METADATA[assigned];
    const requiredMeta = ROTATION_METADATA[required];

    if (assignedMeta && requiredMeta && assignedMeta.category && requiredMeta.category) {
      return assignedMeta.category === requiredMeta.category;
    }

    return false;
  }

  /**
   * Shared logic for defining flexible (Jeopardy) blocks.
   */
  static isJeopardyBlock(type: AssignmentType): boolean {
    const flexibleAssigns = [...ELECTIVE_TYPES, AssignmentType.AMCS_CONSULTS];
    return flexibleAssigns.includes(type);
  }

  /**
   * Validates clinic site based on resident start year.
   */
  static isClinicSiteCorrect(resident: Resident, assigned: AssignmentType): boolean {
    if (assigned !== AssignmentType.CLINIC && assigned !== AssignmentType.NIMA_CLINIC) return true;
    
    const isNima = resident.startYear === 2025;
    if (isNima) return assigned === AssignmentType.NIMA_CLINIC;
    return assigned === AssignmentType.CLINIC;
  }
}
