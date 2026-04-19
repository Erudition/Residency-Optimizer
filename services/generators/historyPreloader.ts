
import { ScheduleHistory, ScheduleGrid, AssignmentType, Resident } from '../../types';
import { TOTAL_WEEKS } from '../../constants';
import subspecialtyData from '../../specification/resident_subspecialty_data.json';

const ROTATION_MAPPING: Record<string, AssignmentType> = {
    'IM ID': AssignmentType.ID,
    'IM NEPH': AssignmentType.NEPH,
    'EM-MHSA': AssignmentType.EM,
    'IM PULM': AssignmentType.PULM,
    'IM CARDS': AssignmentType.CARDS,
    'IM NEURO': AssignmentType.NEURO,
    'IM GI': AssignmentType.GI,
    'IM RHEUM': AssignmentType.RHEUM,
    'IM GERI': AssignmentType.GERI,
    'IM ONC': AssignmentType.ONC,
    'IM ENDO': AssignmentType.ENDO,
    'IM HPC': AssignmentType.PALLIATIVE,
};

export const preloadHistoricalData = (residents: Resident[]): ScheduleHistory => {
    const history: ScheduleHistory = {
        2024: {},
        2025: {}
    };

    // Helper to find resident ID by name
    const findId = (name: string) => residents.find(r => r.name === name)?.id;

    Object.entries(subspecialtyData).forEach(([name, data]) => {
        const id = findId(name);
        if (!id) return;

        const resident = residents.find(r => r.id === id);
        if (!resident) return;

        // Distribute progress into historical grids
        // For simplicity, we fill 2024 for PGY-3s and 2025 for PGY-2/3s.
        // We'll just distribute everything into 2025 for now, or 2024 if they are PGY-3.
        
        data.Completed.forEach((entry: string) => {
            const match = entry.match(/(.*) \((\d+)w\)/);
            if (!match) return;

            const [_, label, weeksStr] = match;
            const type = ROTATION_MAPPING[label.trim()];
            if (!type) return;

            const weeks = parseInt(weeksStr);
            
            // Choose year based on resident startYear
            // If started 2024 (PGY3 in 2026), distribute between 2024 and 2025
            // If started 2025 (PGY2 in 2026), distribute in 2025
            const yearsToFill = resident.startYear === 2024 ? [2024, 2025] : [2025];
            
            // For audit purposes, we just need the count to be correct.
            // We'll put them in the first available weeks of 2025 (or 2024).
            yearsToFill.forEach(year => {
                if (!history[year][id]) {
                    history[year][id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: true }));
                }
            });

            // Very simple distribution: find the first the first year that has space
            // (Note: This is just for audit "getCumulativeRequirementCount")
            let remaining = weeks;
            for (const year of yearsToFill) {
                if (remaining <= 0) break;
                const grid = history[year][id];
                for (let w = 0; w < TOTAL_WEEKS && remaining > 0; w++) {
                    if (grid[w].assignment === null) {
                        grid[w].assignment = type;
                        remaining--;
                    }
                }
            }
        });
    });

    return history;
};
