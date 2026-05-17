import { 
  Resident, 
  ScheduleGrid, 
  ScheduleHistory, 
  RequirementViolation,
  WeeklyViolation
} from '../types';
import { ProgramData } from './api/client';

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

        programData.gradRequirements.forEach(req => {
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
   * Validates clinic site based on resident start year.
   */
  static isClinicSiteCorrect(resident: Resident, assigned: string): boolean {
    if (assigned !== 'CCIM' && assigned !== 'NIMA (Clinic)') return true;
    
    const isNima = resident.startYear === 2025;
    if (isNima) return assigned === 'NIMA (Clinic)';
    return assigned === 'CCIM';
  }
}
