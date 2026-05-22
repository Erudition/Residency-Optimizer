import { Resident, ScheduleGrid, AssignmentType, CODENAMES, AdaptationParams, ScheduleCell } from '../types';
import { TOTAL_WEEKS } from '../constants';
import type { ProgramData } from './api/client';
import { buildLevelRequirements } from './generators/reqBuilder';

// Helper to check if a cell is modifiable based on settings
const isModifiable = (cell: ScheduleCell, params: AdaptationParams): boolean => {
    if (cell.locked) return false;
    if (cell.assignment === null) return true;
    if (cell.assignment === 'ELEC') return true;
    if (params.allowResearchOverride && cell.assignment === 'Research') return true;
    if (params.allowVacationOverride && cell.assignment === 'VAC') return true;
    return false;
};

// Helper to check capacity for a specific assignment at a specific week
const hasCapacity = (
    schedule: ScheduleGrid, 
    residents: Resident[], 
    type: AssignmentType, 
    week: number, 
    level: number,
    programData: ProgramData
): boolean => {
    const meta = programData.rotations.get(type);
    if (!meta) return true;

    const assigned = residents.filter(r => schedule[r.id]?.[week]?.assignment === type);
    const count = assigned.filter(r => r.level === (level === 1 ? 1 : r.level)).length; 
    
    const limit = level === 1 ? (meta.maxInterns ?? 99) : (meta.maxSeniors ?? 99);
    return count < limit;
};

export const adaptSchedule = (
    residents: Resident[], 
    currentSchedule: ScheduleGrid, 
    params: AdaptationParams,
    programData: ProgramData
): { newSchedule: ScheduleGrid, changesMade: number, failureReasons: string[], plannedChanges: string[] } => {
    
    // Deep copy to modify
    const schedule: ScheduleGrid = JSON.parse(JSON.stringify(currentSchedule));
    let changes = 0;
    const failureReasons: string[] = [];
    const plannedChanges: string[] = [];

    const totalWeeks = Object.values(currentSchedule)[0]?.length || TOTAL_WEEKS;
    // 1. FIX MISSING REQUIREMENTS
    // Strategy: Look for modifiable weeks (Electives).
    // Preference: Later in the year (Week 51 -> 0)
    if (params.fillMissingReqs) {
        residents.forEach(r => {
            const reqs = buildLevelRequirements(programData, r.level) || [];
            reqs.forEach(req => {
                const currentCount = schedule[r.id]?.filter(c => c.assignment === req.type).length || 0;
                let missing = req.minWeeks - currentCount;
                
                if (missing > 0) {
                    let allocatedForReq = 0;
                    // Iterate backwards for "least disruptive/later" preference
                    for (let w = totalWeeks - 1; w >= 0 && missing > 0; w--) {
                        const cell = schedule[r.id]?.[w];
                        if (cell && isModifiable(cell, params)) {
                            // Check if target rotation has capacity this week
                            if (hasCapacity(schedule, residents, req.type, w, r.level, programData)) {
                                schedule[r.id][w] = { assignment: req.type, locked: false };
                                plannedChanges.push(`Filled ${req.type} req for ${r.name} (W${w+1})`);
                                missing--;
                                changes++;
                                allocatedForReq++;
                            }
                        }
                    }
                    if (missing > 0) {
                        failureReasons.push(`${r.name}: Could not find enough open slots for ${req.type} (Need ${missing} more).`);
                    }
                }
            });
        });
    }

    // 2. FIX UNDERSTAFFING (Min Constraints)
    // Strategy: Identify weeks where a core service is under min. 
    // Find unlocked residents on Elective this week and move them to the service.
    // Preference: Lower level residents first (PGY1 > PGY2 > PGY3)
    if (params.fixUnderstaffing) {
        for (let w = 0; w < totalWeeks; w++) {
            const types = Array.from(programData.rotations.keys());
            for (const type of types) {
                const meta = programData.rotations.get(type);
                if (!meta) continue;

                // Check Interns
                const assignedResidents = residents.filter(r => schedule[r.id]?.[w]?.assignment === type);
                const internCount = assignedResidents.filter(r => r.level === 1).length;
                
                if (internCount < (meta.minInterns ?? 0)) {
                    let needed = (meta.minInterns ?? 0) - internCount;
                    // Find candidates: Level 1, modifiable cell
                    // Sort candidates by level (though here all are level 1)
                    const candidates = residents.filter(r => 
                        r.level === 1 && 
                        schedule[r.id]?.[w] && 
                        isModifiable(schedule[r.id][w], params)
                    );
                    
                    for (const cand of candidates) {
                        if (needed <= 0) break;
                        schedule[cand.id][w] = { assignment: type, locked: false };
                        plannedChanges.push(`Moved ${cand.name} to ${meta.label} (W${w+1})`);
                        needed--;
                        changes++;
                    }
                    if (needed > 0) {
                        failureReasons.push(`W${w+1} ${meta.label}: Need ${needed} more Interns. No available candidates found.`);
                    }
                }

                // Check Seniors
                const seniorCount = assignedResidents.filter(r => r.level > 1).length;
                if (seniorCount < (meta.minSeniors ?? 0)) {
                    let needed = (meta.minSeniors ?? 0) - seniorCount;
                    const candidates = residents.filter(r => 
                        r.level > 1 && 
                        schedule[r.id]?.[w] && 
                        isModifiable(schedule[r.id][w], params)
                    )
                    // Sort by Level Ascending (2 then 3)
                    .sort((a,b) => a.level - b.level);

                    for (const cand of candidates) {
                        if (needed <= 0) break;
                        schedule[cand.id][w] = { assignment: type, locked: false };
                        plannedChanges.push(`Moved ${cand.name} to ${meta.label} (W${w+1})`);
                        needed--;
                        changes++;
                    }
                    if (needed > 0) {
                        failureReasons.push(`W${w+1} ${meta.label}: Need ${needed} more Seniors. No available candidates found.`);
                    }
                }
            }
        }
    }

    // 3. FIX OVERSTAFFING (Max Constraints)
    // Strategy: Identify weeks where a service is over max.
    // Find unlocked residents on this service and move them to ELEC.
    // Preference: Lower level residents first.
    if (params.fixOverstaffing) {
        for (let w = 0; w < totalWeeks; w++) {
            const types = Array.from(programData.rotations.keys());
            for (const type of types) {
                const meta = programData.rotations.get(type);
                if (!meta) continue;

                // Check Interns
                const assignedResidents = residents.filter(r => schedule[r.id]?.[w]?.assignment === type);
                const interns = assignedResidents.filter(r => r.level === 1);
                
                if (interns.length > (meta.maxInterns ?? 99)) {
                    let excess = interns.length - (meta.maxInterns ?? 99);
                    // Find candidates to kick off service: unlocked only
                    const candidates = interns.filter(r => !schedule[r.id]?.[w]?.locked);
                    
                    for (const cand of candidates) {
                        if (excess <= 0) break;
                        schedule[cand.id][w] = { assignment: 'ELEC', locked: false };
                        plannedChanges.push(`Moved ${cand.name} from ${meta.label} to Elective (W${w+1})`);
                        excess--;
                        changes++;
                    }
                    if (excess > 0) {
                         failureReasons.push(`W${w+1} ${meta.label}: Overstaffed by ${excess} Interns. All assigned are locked.`);
                    }
                }

                // Check Seniors
                const seniors = assignedResidents.filter(r => r.level > 1);
                if (seniors.length > (meta.maxSeniors ?? 99)) {
                    let excess = seniors.length - (meta.maxSeniors ?? 99);
                    const candidates = seniors.filter(r => !schedule[r.id]?.[w]?.locked)
                        .sort((a,b) => a.level - b.level);
                    
                    for (const cand of candidates) {
                        if (excess <= 0) break;
                        schedule[cand.id][w] = { assignment: 'ELEC', locked: false };
                        plannedChanges.push(`Moved ${cand.name} from ${meta.label} to Elective (W${w+1})`);
                        excess--;
                        changes++;
                    }
                    if (excess > 0) {
                        failureReasons.push(`W${w+1} ${meta.label}: Overstaffed by ${excess} Seniors. All assigned are locked.`);
                   }
                }
            }
        }
    }

    return { newSchedule: schedule, changesMade: changes, failureReasons, plannedChanges };
};