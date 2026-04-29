import { ScheduleHistory, AssignmentType, Resident } from '../../types';
import { ACTIVE_START_YEAR } from '../../constants';
import historicalGridData from '../../specification/historical_schedules_grid_v2.json';
import { z } from 'zod';

// Zod schema for historical data validation
const AssignmentTypeSchema = z.nativeEnum(AssignmentType).or(z.null()).or(z.string());

const HistoricalYearSchema = z.record(z.string(), z.array(AssignmentTypeSchema));
const HistoricalDataSchema = z.record(z.string(), HistoricalYearSchema);

// Legacy mappings for historical data
const LEGACY_MAPPING: Record<string, AssignmentType> = {
    'CVICU': AssignmentType.AMCS_CONSULTS,
    'CCIM': AssignmentType.CLINIC,
    'HPC': AssignmentType.PALLIATIVE,
    'Wards-R': AssignmentType.WARDS_RED,
    'Wards-B': AssignmentType.WARDS_BLUE,
    'Met Wards': AssignmentType.WARDS_METRO,
    'MICU 1': AssignmentType.MICU,
    'MICU Metro': AssignmentType.METRO_ICU,
    'Add Med': AssignmentType.ADD_MED,
    'Jr Hosp': AssignmentType.JR_HOSPITALIST,
};

const HISTORICAL_COHORTS: Record<number, Record<string, number>> = {
    2024: {
        "Baset, Nawsin": 5,
        "Cho, Kevin Wook Jin": 5,
        "De La Cruz, Aaron Daniel": 5,
        "Deen, Nafis M": 4,
        "Liu, Gongkai": 4,
        "Masud, Saad": 4,
        "Min, Shao-Ting": 3,
        "Mysore, Nishad Narain": 3,
        "Thanedar, Sarita": 2,
        "Yu, Tommy": 2,
        "Melo, Sebastian": 3,
        "Wright, Andrew Hunter": 2
    },
    2025: {
        "Alvarado, Ramona Davina": 5,
        "Dawood, Umar Asif": 5,
        "Delano, Victoria Remilekun": 5,
        "Echegaray, Sebastian Alexander": 5,
        "Hill, Brittany Marie": 4,
        "Jentz, Austin Lee": 4,
        "Letson, Mia Kang": 4,
        "Millan, Cassandra Marie": 4,
        "Nazeer, Usman Imran": 3,
        "Ndze, Lila Linda": 3,
        "Orden, Martin Basobas": 3,
        "Rendon, Arthur Isaac": 3,
        "Sanderson, Jacob Nakolo": 2,
        "Shah, Vidur Hemant": 2,
        "Baset, Nawsin": 3,
        "Cho, Kevin Wook Jin": 5,
        "De La Cruz, Aaron Daniel": 3,
        "Deen, Nafis M": 4,
        "Liu, Gongkai": 2,
        "Masud, Saad": 2,
        "Melo, Sebastian": 1,
        "Min, Shao-Ting": 1,
        "Thanedar, Sarita": 4,
        "Wright, Andrew Hunter": 1,
        "Yu, Tommy": 5
    }
};

export interface PreloadedHistory {
    history: ScheduleHistory;
    cohortAssignments: Record<number, Record<string, number>>;
}

/**
 * Maps a raw string from historical data to a valid AssignmentType.
 * Handles legacy names and null values safely.
 */
function mapAssignmentType(raw: string | null): AssignmentType {
    if (raw === null) return AssignmentType.ELECTIVE;
    
    // Check if it's already a valid enum value
    const validValues = Object.values(AssignmentType) as string[];
    if (validValues.includes(raw)) {
        return raw as AssignmentType;
    }

    // Check legacy mapping
    if (LEGACY_MAPPING[raw]) {
        return LEGACY_MAPPING[raw];
    }

    console.warn(`[HistoryPreloader] Unknown assignment type "${raw}", defaulting to ELECTIVE`);
    return AssignmentType.ELECTIVE;
}

export const preloadHistoricalData = (residents: Resident[]): PreloadedHistory => {
    const history: ScheduleHistory = {};
    const cohortAssignments: Record<number, Record<string, number>> = {};

    // Validate incoming JSON data
    const validationResult = HistoricalDataSchema.safeParse(historicalGridData);
    if (!validationResult.success) {
        console.error('[HistoryPreloader] Historical data validation failed:', validationResult.error.format());
    }

    const findId = (name: string) => residents.find(r => r.name === name)?.id;

    const years = Object.keys(historicalGridData).map(Number).filter(y => y < ACTIVE_START_YEAR);

    years.forEach(year => {
        history[year] = {};
        cohortAssignments[year] = {};
        const yearData = (historicalGridData as any)[year];
        if (!yearData) return;

        const isFullyCompleted = year < ACTIVE_START_YEAR - 1;

        Object.entries(yearData).forEach(([name, assignments]) => {
            const id = findId(name);
            if (!id) {
                console.warn(`[HistoryPreloader] Resident "${name}" from historical data (Year ${year}) not found in master list. Skipping.`);
                return;
            }

            history[year][id] = (assignments as (string | null)[]).map(type => ({
                assignment: mapAssignmentType(type),
                locked: isFullyCompleted
            }));

            // Map cohort if available, fallback to 0
            const cohort = HISTORICAL_COHORTS[year]?.[name] ?? 0;
            cohortAssignments[year][id] = cohort;
        });
    });

    return { history, cohortAssignments };
};
