import { Resident, AssignmentType } from './types';

export const TOTAL_WEEKS = 52;
/** The most recent academic year with a finalized/canonical schedule (AY 2025-26 → 2025). */
export const LATEST_HISTORICAL_YEAR = 2025;
/** The first academic year in the candidate generation window (AY 2026-27 → 2026). */
export const CANDIDATE_START_YEAR = LATEST_HISTORICAL_YEAR + 1;
export const COHORT_COUNT = 5;

export const GENERATE_RESIDENTS_FOR_YEAR = (activeYear: number): Resident[] => {
    const residents: Resident[] = [];

    const CLASS_2023 = ["Wright, Andrew Hunter", "Melo, Sebastian"];
    const CLASS_2024 = ["Baset, Nawsin", "Cho, Kevin Wook Jin", "De La Cruz, Aaron Daniel", "Deen, Nafis M", "Liu, Gongkai", "Masud, Saad", "Min, Shao-Ting", "Mysore, Nishad Narain", "Thanedar, Sarita", "Yu, Tommy"];
    const CLASS_2025 = ["Alvarado, Ramona Davina", "Dawood, Umar Asif", "Delano, Victoria Remilekun", "Echegaray, Sebastian Alexander", "Hill, Brittany Marie", "Jentz, Austin Lee", "Letson, Mia Kang", "Millan, Cassandra Marie", "Nazeer, Usman Imran", "Ndze, Lila Linda", "Orden, Martin Basobas", "Rendon, Arthur Isaac", "Sanderson, Jacob Nakolo", "Shah, Vidur Hemant"];
    const CLASS_2026 = ["Alhaddadein, Yara", "Chen, Chang-Rong", "DeVolder, Mitchell", "Gurram, Neha", "Hamadneh, Yazan", "Joseph, Rachel", "King, Matthew", "Mukherjee, Lipilekha", "Omokaro, Precious", "Paripati, Laxmi Mahita Reddy", "Quillin, Travis", "Rakaba, Michelle", "Suresh, Sneha", "Thupili, Sasanka", "Yekini, Stephen"];

    const getNamesForClass = (startYear: number, size: number) => {
        if (startYear === 2023) return CLASS_2023;
        if (startYear === 2024) return CLASS_2024;
        if (startYear === 2025) return CLASS_2025;
        if (startYear === 2026) return CLASS_2026;
        return Array.from({ length: size }, (_, i) => `Intern ${startYear % 100}-${i + 1}`);
    };

    const getClassSize = (startYear: number) => {
        if (startYear === 2023) return 2;
        if (startYear === 2024) return 10;
        if (startYear === 2025) return 14;
        if (startYear === 2026) return 15;
        return 15;
    };

    const getTransferOutYear = (name: string): number | undefined => {
        if (name.includes("Mysore, Nishad Narain")) return 2024;
        if (name.includes("Cho, Kevin Wook Jin")) return 2025;
        return undefined;
    };

    let idCounter = 1;

    for (let startYear = activeYear - 2; startYear <= activeYear; startYear++) {
        const level = (activeYear - startYear + 1) as 1 | 2 | 3;
        const size = getClassSize(startYear);
        const names = getNamesForClass(startYear, size);

        for (let i = 0; i < size; i++) {
            const name = names[i] || `Resident ${idCounter}`;
            const transferOutYear = getTransferOutYear(name);
            const transferInYear = undefined;

            if (transferOutYear !== undefined && transferOutYear < activeYear) continue;
            if (transferInYear !== undefined && transferInYear > activeYear) continue;

            const commaIdx = name.indexOf(',');
            const firstName = commaIdx > 0 ? name.substring(commaIdx + 1).trim() : name;
            const lastName = commaIdx > 0 ? name.substring(0, commaIdx).trim() : '';

            residents.push({
                id: `c${startYear}-${i + 1}`,
                name,
                firstName,
                lastName,
                level,
                startYear,
                avoidResidentIds: [],
                transferOutYear,
                transferInYear
            });
            idCounter++;
        }
    }
    return residents;
};

export const GENERATE_INITIAL_RESIDENTS = (): Resident[] => {
    return GENERATE_RESIDENTS_FOR_YEAR(LATEST_HISTORICAL_YEAR);
};

export const CORE_TYPES: AssignmentType[] = ['W-RED', 'W-BLUE', 'ICU', 'NF', 'EM', 'CCIM'];
export const REQUIRED_TYPES: AssignmentType[] = ['CARDS', 'ID', 'NEPH', 'PULM', 'ONC', 'NEURO', 'RHEUM', 'GI', 'ADDM', 'ENDO', 'GERI', 'HPC', 'PC-NIMA'];
export const ELECTIVE_TYPES: AssignmentType[] = ['ELEC', 'RSCH', 'HF', 'CCMA', 'ENT', 'PMNR'];
export const VACATION_TYPE: AssignmentType = 'VAC';
export const ACGME_TYPES: AssignmentType[] = ['W-RED', 'ICU', 'EM', 'CARDS', 'ID', 'NEPH', 'PULM', 'ONC', 'NEURO', 'RHEUM', 'GI', 'ENDO', 'GERI'];
