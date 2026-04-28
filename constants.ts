
import { AssignmentType, Resident, RotationConfig, ClinicalSetting } from './types';

export const TOTAL_WEEKS = 52;
export const COHORT_COUNT = 5;
export const ACTIVE_START_YEAR = 2026;

export const GENERATE_RESIDENTS_FOR_YEAR = (activeYear: number): Resident[] => {
    const residents: Resident[] = [];

    const CLASS_2023 = ["Wright, Andrew Hunter","Melo, Sebastian"];
    const CLASS_2024 = ["Baset, Nawsin","Cho, Kevin Wook Jin","De La Cruz, Aaron Daniel","Deen, Nafis M","Liu, Gongkai","Masud, Saad","Min, Shao-Ting","Mysore, Nishad Narain","Thanedar, Sarita","Yu, Tommy"];
    const CLASS_2025 = ["Alvarado, Ramona Davina","Dawood, Umar Asif","Delano, Victoria Remilekun","Echegaray, Sebastian Alexander","Hill, Brittany Marie","Jentz, Austin Lee","Letson, Mia Kang","Millan, Cassandra Marie","Nazeer, Usman Imran","Ndze, Lila Linda","Orden, Martin Basobas","Rendon, Arthur Isaac","Sanderson, Jacob Nakolo","Shah, Vidur Hemant"];
    const CLASS_2026 = ["Alhaddadein, Yara","Chen, Chang-Rong","DeVolder, Mitchell","Gurram, Neha","Hamadneh, Yazan","Joseph, Rachel","King, Matthew","Mukherjee, Lipilekha","Omokaro, Precious","Paripati, Laxmi Mahita Reddy","Quillin, Travis","Rakaba, Michelle","Suresh, Sneha","Thupili, Sasanka","Yekini, Stephen"];

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
        return 15; // default size for future classes
    };

    let idCounter = 1;
    
    // Track backwards 2 years from activeYear to get the current PGY 1, 2, 3
    for (let startYear = activeYear - 2; startYear <= activeYear; startYear++) {
        const level = (activeYear - startYear + 1) as 1 | 2 | 3;
        const size = getClassSize(startYear);
        const names = getNamesForClass(startYear, size);
        
        for (let i = 0; i < size; i++) {
            residents.push({
                id: `c${startYear}-${i+1}`, 
                name: names[i] || `Resident ${idCounter}`,
                level,
                startYear,
                avoidResidentIds: [],
            });
            idCounter++;
        }
    }

    return residents;
};

// Fallback baseline for tests
export const GENERATE_INITIAL_RESIDENTS = (): Resident[] => {
    const allResidents: Resident[] = [];
    const classesToInclude = [2023, 2024, 2025, 2026, 2027, 2028];
    
    classesToInclude.forEach(startYear => {
        const size = 15; // Max potential size, or use getClassSize(startYear)
        // We call GENERATE_RESIDENTS_FOR_YEAR but we need to prevent duplicates if we were to merge.
        // Actually, let's just create a unique set of all residents for these years.
        
        // Simpler: Just generate the classes directly
        const CLASS_2023 = ["Wright, Andrew Hunter","Melo, Sebastian"];
        const CLASS_2024 = ["Baset, Nawsin","Cho, Kevin Wook Jin","De La Cruz, Aaron Daniel","Deen, Nafis M","Liu, Gongkai","Masud, Saad","Min, Shao-Ting","Mysore, Nishad Narain","Thanedar, Sarita","Yu, Tommy"];
        const CLASS_2025 = ["Alvarado, Ramona Davina","Dawood, Umar Asif","Delano, Victoria Remilekun","Echegaray, Sebastian Alexander","Hill, Brittany Marie","Jentz, Austin Lee","Letson, Mia Kang","Millan, Cassandra Marie","Nazeer, Usman Imran","Ndze, Lila Linda","Orden, Martin Basobas","Rendon, Arthur Isaac","Sanderson, Jacob Nakolo","Shah, Vidur Hemant"];
        const CLASS_2026 = ["Alhaddadein, Yara","Chen, Chang-Rong","DeVolder, Mitchell","Gurram, Neha","Hamadneh, Yazan","Joseph, Rachel","King, Matthew","Mukherjee, Lipilekha","Omokaro, Precious","Paripati, Laxmi Mahita Reddy","Quillin, Travis","Rakaba, Michelle","Suresh, Sneha","Thupili, Sasanka","Yekini, Stephen"];

        const getNames = (year: number) => {
            if (year === 2023) return CLASS_2023;
            if (year === 2024) return CLASS_2024;
            if (year === 2025) return CLASS_2025;
            if (year === 2026) return CLASS_2026;
            return [];
        };

        const names = getNames(startYear);
        const actualSize = names.length || 15;
        
        for (let i = 0; i < actualSize; i++) {
            allResidents.push({
                id: `c${startYear}-${i+1}`,
                name: names[i] || `Intern ${startYear % 100}-${i + 1}`,
                level: 1, // Base level, will be shifted by activeYear
                startYear,
                avoidResidentIds: [],
            });
        }
    });

    return allResidents;
};

export const ASSIGNMENT_COLORS: Record<AssignmentType, string> = {
    [AssignmentType.WARDS_RED]: 'bg-red/40 text-red-2-dark border-red-2',
    [AssignmentType.WARDS_BLUE]: 'bg-light-blue text-navy-dark border-blue-2',
    [AssignmentType.MICU]: 'bg-light-purple text-purple-2-dark border-purple',
    [AssignmentType.NIGHT_FLOAT]: 'bg-light-purple text-purple-2-dark border-purple',
    [AssignmentType.EM]: 'bg-creamsicle text-orange-dark border-orange',
    [AssignmentType.CLINIC]: 'bg-light-yellow/30 text-light-yellow-dark border-light-yellow',
    [AssignmentType.ELECTIVE]: 'bg-lime-green/40 text-green-dark border-lime-green',
    [AssignmentType.VACATION]: 'bg-light-2 text-muted border-light-5',
    [AssignmentType.WARDS_METRO]: 'bg-teal-2/30 text-teal-2-dark border-teal-2',
    [AssignmentType.CARDS]: 'bg-pink/60 text-pink-dark border-pink',
    [AssignmentType.ID]: 'bg-lime-green text-green-dark border-lime-green',
    [AssignmentType.NEPH]: 'bg-light-yellow text-light-yellow-dark border-yellow',
    [AssignmentType.PULM]: 'bg-sky-blue/50 text-sky-blue border-sky-blue',
    [AssignmentType.ONC]: 'bg-pink/60 text-pink-dark border-pink',
    [AssignmentType.NEURO]: 'bg-light-purple/80 text-purple-2-dark border-purple',
    [AssignmentType.RHEUM]: 'bg-lime-green text-green-dark border-green-2',
    [AssignmentType.GI]: 'bg-light-yellow text-light-yellow-dark border-yellow',
    [AssignmentType.ADD_MED]: 'bg-light-4 text-black border-light-6',
    [AssignmentType.ENDO]: 'bg-creamsicle/50 text-orange-dark border-creamsicle',
    [AssignmentType.GERI]: 'bg-light-4 text-black border-light-6',
    [AssignmentType.PALLIATIVE]: 'bg-pale-blue text-pale-blue-dark border-pale-blue-dark',
    [AssignmentType.NIMA_BLOCK]: 'bg-light-yellow text-light-yellow-dark border-yellow',
    [AssignmentType.METRO_ICU]: 'bg-light-purple text-fuchsia-dark border-fuchsia',
    [AssignmentType.RESEARCH]: 'bg-light-3 text-black border-light-5',
    [AssignmentType.CCMA]: 'bg-light-purple/50 text-purple-2 border-purple',
    [AssignmentType.HF]: 'bg-red/20 text-red-2-dark border-red/40',
    [AssignmentType.CVICU]: 'bg-pink/40 text-pink-dark border-pink',
    [AssignmentType.ENT]: 'bg-teal-2/50 text-teal-2-dark border-teal-2',
    [AssignmentType.NIMA_CLINIC]: 'bg-light-yellow/30 text-light-yellow-dark border-light-yellow',
    [AssignmentType.JR_HOSPITALIST]: 'bg-light-purple/50 text-purple-2 border-light-purple',
};

export const ASSIGNMENT_HEX_COLORS: Record<AssignmentType, string> = {
    [AssignmentType.WARDS_RED]: '#DF6133',
    [AssignmentType.WARDS_BLUE]: '#2F80FA',
    [AssignmentType.MICU]: '#B62AD9',
    [AssignmentType.NIGHT_FLOAT]: '#8567FF',
    [AssignmentType.EM]: '#EB9D2A',
    [AssignmentType.CLINIC]: '#F7A501',
    [AssignmentType.ELECTIVE]: '#6AA84F',
    [AssignmentType.VACATION]: '#D2D3CC',
    [AssignmentType.WARDS_METRO]: '#29DBBB',
    [AssignmentType.CARDS]: '#E34C6F',
    [AssignmentType.ID]: '#96E5B6',
    [AssignmentType.NEPH]: '#FFBA53',
    [AssignmentType.PULM]: '#30ABC6',
    [AssignmentType.METRO_ICU]: '#A621C8',
    [AssignmentType.ONC]: '#E34C6F',
    [AssignmentType.NEURO]: '#8567FF',
    [AssignmentType.RHEUM]: '#36C46F',
    [AssignmentType.GI]: '#EB9D2A',
    [AssignmentType.ADD_MED]: '#BFC1B7',
    [AssignmentType.ENDO]: '#FFD699',
    [AssignmentType.GERI]: '#BFC1B7',
    [AssignmentType.PALLIATIVE]: '#9FC4FF',
    [AssignmentType.NIMA_BLOCK]: '#FFCE5C',
    [AssignmentType.RESEARCH]: '#D2D3CC',
    [AssignmentType.CCMA]: '#E2D6FF',
    [AssignmentType.HF]: '#F87A4C',
    [AssignmentType.CVICU]: '#E34C6F',
    [AssignmentType.ENT]: '#6BC0B3',
    [AssignmentType.NIMA_CLINIC]: '#F7A501',
    [AssignmentType.JR_HOSPITALIST]: '#9FC4FF',
};

export const ASSIGNMENT_LABELS: Record<AssignmentType, string> = {
    [AssignmentType.WARDS_RED]: 'Wards Red',
    [AssignmentType.WARDS_BLUE]: 'Wards Blue',
    [AssignmentType.MICU]: 'ICU',
    [AssignmentType.NIGHT_FLOAT]: 'Night Float',
    [AssignmentType.EM]: 'Emergency',
    [AssignmentType.CLINIC]: 'Clinic (CCIM)',
    [AssignmentType.ELECTIVE]: 'Elective',
    [AssignmentType.VACATION]: 'Vacation',
    [AssignmentType.WARDS_METRO]: 'Met Wards',
    [AssignmentType.CARDS]: 'Cardiology',
    [AssignmentType.ID]: 'Infectious Disease',
    [AssignmentType.NEPH]: 'Nephrology',
    [AssignmentType.PULM]: 'Pulmonology',
    [AssignmentType.METRO_ICU]: 'Metro ICU',
    [AssignmentType.ONC]: 'Heme/Onc',
    [AssignmentType.NEURO]: 'Neurology',
    [AssignmentType.RHEUM]: 'Rheumatology',
    [AssignmentType.GI]: 'Gastroenterology',
    [AssignmentType.ADD_MED]: 'Addiction Med',
    [AssignmentType.ENDO]: 'Endocrinology',
    [AssignmentType.GERI]: 'Geriatrics',
    [AssignmentType.PALLIATIVE]: 'Palliative (HPC)',
    [AssignmentType.NIMA_BLOCK]: 'NIMA',
    [AssignmentType.RESEARCH]: 'Research',
    [AssignmentType.CCMA]: 'CCMA',
    [AssignmentType.HF]: 'Heart Failure',
    [AssignmentType.CVICU]: 'Cardiac ICU',
    [AssignmentType.ENT]: 'Otolaryngology',
    [AssignmentType.NIMA_CLINIC]: 'NIMA (Clinic)',
    [AssignmentType.JR_HOSPITALIST]: 'Junior Hospitalist',
};

export const ASSIGNMENT_ABBREVIATIONS: Record<AssignmentType, string> = {
    [AssignmentType.WARDS_RED]: 'W-RED',
    [AssignmentType.WARDS_BLUE]: 'W-BLUE',
    [AssignmentType.MICU]: 'ICU',
    [AssignmentType.NIGHT_FLOAT]: 'NF',
    [AssignmentType.EM]: 'EM',
    [AssignmentType.CLINIC]: 'CCIM',
    [AssignmentType.ELECTIVE]: 'ELEC',
    [AssignmentType.VACATION]: 'VAC',
    [AssignmentType.WARDS_METRO]: 'MET',
    [AssignmentType.CARDS]: 'CARDS',
    [AssignmentType.ID]: 'ID',
    [AssignmentType.NEPH]: 'NEPH',
    [AssignmentType.PULM]: 'PULM',
    [AssignmentType.METRO_ICU]: 'METRO',
    [AssignmentType.ONC]: 'ONC',
    [AssignmentType.NEURO]: 'NEURO',
    [AssignmentType.RHEUM]: 'RHEUM',
    [AssignmentType.GI]: 'GI',
    [AssignmentType.ADD_MED]: 'ADDM',
    [AssignmentType.ENDO]: 'ENDO',
    [AssignmentType.GERI]: 'GERI',
    [AssignmentType.PALLIATIVE]: 'HPC',
    [AssignmentType.NIMA_BLOCK]: 'NIMA',
    [AssignmentType.RESEARCH]: 'RSCH',
    [AssignmentType.CCMA]: 'CCMA',
    [AssignmentType.HF]: 'HF',
    [AssignmentType.CVICU]: 'CC-ICU',
    [AssignmentType.ENT]: 'ENT',
    [AssignmentType.NIMA_CLINIC]: 'NIMA',
    [AssignmentType.JR_HOSPITALIST]: 'JH',
};

// Configuration of each rotation's constraints and metadata
export const ROTATION_METADATA: Record<AssignmentType, RotationConfig> = {
    [AssignmentType.MICU]: {
        type: AssignmentType.MICU, label: 'ICU',
        intensity: 5, setting: ClinicalSetting.CRITICAL_CARE, duration: 4,
        minInterns: 2, maxInterns: 3, minSeniors: 2, maxSeniors: 2,
        targetIntern: 4, targetSenior: 4
    },
    [AssignmentType.WARDS_RED]: {
        type: AssignmentType.WARDS_RED, label: 'Wards',
        intensity: 4, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 2, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
        targetIntern: 16, targetSenior: 12, targetPGY3: 4 // PGY1: 4 blocks (16w), PGY2: 3 blocks (12w), PGY3: 1 block (4w)
    },
    [AssignmentType.WARDS_BLUE]: {
        type: AssignmentType.WARDS_BLUE, label: 'Wards Blue',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 2, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
    },
    [AssignmentType.NIGHT_FLOAT]: {
        type: AssignmentType.NIGHT_FLOAT, label: 'Night Float',
        intensity: 4, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 1, maxInterns: 2, minSeniors: 1, maxSeniors: 3,
        targetIntern: 2, targetSenior: 2 // 2 weeks per year per proposal
    },
    [AssignmentType.EM]: {
        type: AssignmentType.EM, label: 'Emergency',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 1, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
        targetIntern: 0, targetPGY2: 4 // Restricted to PGY2/3 per proposal
    },
    [AssignmentType.CLINIC]: {
        type: AssignmentType.CLINIC, label: 'Clinic',
        intensity: 2, setting: ClinicalSetting.OUTPATIENT, duration: 1,
        minInterns: 0, maxInterns: 10, minSeniors: 0, maxSeniors: 10,
    },
    [AssignmentType.WARDS_METRO]: {
        type: AssignmentType.WARDS_METRO, label: 'Metro Wards',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 0, maxInterns: 3, minSeniors: 0, maxSeniors: 2,
    },
    [AssignmentType.CARDS]: {
        type: AssignmentType.CARDS, label: 'Cardiology',
        intensity: 2, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 0, maxInterns: 4, minSeniors: 0, maxSeniors: 0,
        targetIntern: 4,
    },
    [AssignmentType.ID]: {
        type: AssignmentType.ID, label: 'Infectious Disease',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 4, minSeniors: 0, maxSeniors: 4,
        targetIntern: 2,
    },
    [AssignmentType.NEPH]: {
        type: AssignmentType.NEPH, label: 'Nephrology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
        targetIntern: 2, targetPGY2: 0
    },
    [AssignmentType.PULM]: {
        type: AssignmentType.PULM, label: 'Pulmonology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 4, minSeniors: 0, maxSeniors: 4,
        targetIntern: 0, targetPGY2: 2
    },
    [AssignmentType.ONC]: {
        type: AssignmentType.ONC, label: 'Heme/Onc',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
        targetPGY2: 0, targetPGY3: 2 
    },
    [AssignmentType.NEURO]: {
        type: AssignmentType.NEURO, label: 'Neurology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
        targetPGY2: 2, // 2 weeks in PGY2
    },
    [AssignmentType.RHEUM]: {
        type: AssignmentType.RHEUM, label: 'Rheumatology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
        targetPGY2: 0, targetPGY3: 2,
    },
    [AssignmentType.GI]: {
        type: AssignmentType.GI, label: 'Gastroenterology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 4,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 1,
        targetPGY2: 2, // 2 weeks in PGY2
    },
    [AssignmentType.ADD_MED]: {
        type: AssignmentType.ADD_MED, label: 'Addiction Med',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 4, 
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 4,
        targetPGY3: 4,
    },
    [AssignmentType.ENDO]: {
        type: AssignmentType.ENDO, label: 'Endocrinology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2, 
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 4,
        targetPGY3: 2,
    },
    [AssignmentType.GERI]: {
        type: AssignmentType.GERI, label: 'Geriatrics',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 4,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 4,
        targetPGY2: 4,
    },
    [AssignmentType.PALLIATIVE]: {
        type: AssignmentType.PALLIATIVE, label: 'Palliative Care',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 4, // Corrected to 4
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 4,
        targetPGY3: 4,
    },
    [AssignmentType.METRO_ICU]: {
        type: AssignmentType.METRO_ICU, label: 'Metro ICU',
        intensity: 5, setting: ClinicalSetting.CRITICAL_CARE, duration: 4,
        minInterns: 0, maxInterns: 3, minSeniors: 0, maxSeniors: 3,
    },
    [AssignmentType.NIMA_BLOCK]: {
        type: AssignmentType.NIMA_BLOCK, label: 'Primary Care',
        intensity: 2, setting: ClinicalSetting.OUTPATIENT, duration: 4,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 4,
        targetPGY3: 4,
    },
    [AssignmentType.CVICU]: {
        type: AssignmentType.CVICU, label: 'Cardiac ICU',
        intensity: 3, setting: ClinicalSetting.CRITICAL_CARE, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
    },
    [AssignmentType.CCMA]: {
        type: AssignmentType.CCMA, label: 'CCMA',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
    },
    [AssignmentType.HF]: {
        type: AssignmentType.HF, label: 'Heart Failure',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
    },
    [AssignmentType.ENT]: {
        type: AssignmentType.ENT, label: 'ENT',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2,
        minInterns: 0, maxInterns: 1, minSeniors: 0, maxSeniors: 1,
    },
    [AssignmentType.RESEARCH]: {
        type: AssignmentType.RESEARCH, label: 'Research',
        intensity: 1, setting: ClinicalSetting.NON_CLINICAL, duration: 2,
        minInterns: 0, maxInterns: 10, minSeniors: 0, maxSeniors: 10,
    },
    [AssignmentType.ELECTIVE]: {
        type: AssignmentType.ELECTIVE, label: 'Elective',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 20, minSeniors: 0, maxSeniors: 20,
    },
    [AssignmentType.VACATION]: {
        type: AssignmentType.VACATION, label: 'Vacation',
        intensity: 0, setting: ClinicalSetting.NON_CLINICAL, duration: 1,
        minInterns: 0, maxInterns: 20, minSeniors: 0, maxSeniors: 20,
    },
    [AssignmentType.JR_HOSPITALIST]: {
        type: AssignmentType.JR_HOSPITALIST, label: 'Junior Hospitalist',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 0, maxInterns: 0, minSeniors: 1, maxSeniors: 2,
        targetPGY3: 4
    },

    [AssignmentType.NIMA_CLINIC]: {
        type: AssignmentType.NIMA_CLINIC, label: 'NIMA Clinic',
        intensity: 2, setting: ClinicalSetting.OUTPATIENT, duration: 1,
        minInterns: 0, maxInterns: 10, minSeniors: 0, maxSeniors: 10,
    },
};

// Consistent order for requirement columns in UI
export const REQUIREMENT_ORDER = [
    AssignmentType.WARDS_RED,
    AssignmentType.MICU,
    AssignmentType.NIGHT_FLOAT,
    AssignmentType.EM,
    AssignmentType.CARDS,
    AssignmentType.ID,
    AssignmentType.NEPH,
    AssignmentType.PULM,
    AssignmentType.ONC,
    AssignmentType.NEURO,
    AssignmentType.RHEUM,
    AssignmentType.GI,
    AssignmentType.ADD_MED,
    AssignmentType.ENDO,
    AssignmentType.GERI,
    AssignmentType.PALLIATIVE,
    AssignmentType.NIMA_BLOCK
];

// DYNAMIC REQUIREMENTS GENERATION
// Single source of truth: ROTATION_METADATA
export const REQUIREMENTS: Record<number, { type: AssignmentType, label: string, target: number }[]> = {
    1: Object.values(ROTATION_METADATA)
        .filter(m => (m.targetIntern !== undefined && m.targetIntern > 0))
        .map(m => ({ type: m.type, label: m.label, target: m.targetIntern! })),

    2: Object.values(ROTATION_METADATA)
        .filter(m => (m.targetPGY2 !== undefined && m.targetPGY2 > 0) || (m.targetSenior !== undefined && m.targetSenior > 0))
        .map(m => ({
            type: m.type,
            label: m.label,
            target: m.targetPGY2 || m.targetSenior!
        })),

    3: Object.values(ROTATION_METADATA)
        .filter(m => (m.targetPGY3 !== undefined && m.targetPGY3 > 0) || (m.targetSenior !== undefined && m.targetSenior > 0))
        .map(m => ({
            type: m.type,
            label: m.label,
            target: m.targetPGY3 || m.targetSenior!
        })),
};

// Sort requirements consistently for UI display
[1, 2, 3].forEach(level => {
    REQUIREMENTS[level].sort((a, b) => {
        const indexA = REQUIREMENT_ORDER.indexOf(a.type);
        const indexB = REQUIREMENT_ORDER.indexOf(b.type);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
});

// Classification helpers
export const CORE_TYPES = Object.keys(ROTATION_METADATA).filter(k =>
    [AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE, AssignmentType.MICU, AssignmentType.NIGHT_FLOAT, AssignmentType.EM, AssignmentType.CLINIC].includes(k as AssignmentType)
) as AssignmentType[];

export const REQUIRED_TYPES = [
    AssignmentType.CARDS, AssignmentType.ID, AssignmentType.NEPH, AssignmentType.PULM,
    AssignmentType.ONC, AssignmentType.NEURO, AssignmentType.RHEUM, AssignmentType.GI,
    AssignmentType.ADD_MED, AssignmentType.ENDO, AssignmentType.GERI, AssignmentType.PALLIATIVE,
    AssignmentType.NIMA_BLOCK
];

export const ELECTIVE_TYPES = [
    AssignmentType.ELECTIVE, AssignmentType.RESEARCH, AssignmentType.HF, AssignmentType.CCMA, AssignmentType.ENT
];

export const VACATION_TYPE = AssignmentType.VACATION;
export const fulfillsRequirement = (assigned: AssignmentType | null, required: AssignmentType): boolean => {
    if (!assigned) return false;
    if (assigned === required) return true;

    // Ward Aggregation logic (Single Source of Truth)
    if (required === AssignmentType.WARDS_RED) {
        return assigned === AssignmentType.WARDS_RED || 
               assigned === AssignmentType.WARDS_BLUE || 
               assigned === AssignmentType.WARDS_METRO || 
               assigned === AssignmentType.JR_HOSPITALIST;
    }

    // ICU Aggregation logc
    if (required === AssignmentType.MICU) {
        return assigned === AssignmentType.MICU || assigned === AssignmentType.METRO_ICU || assigned === AssignmentType.CVICU;
    }

    return false;
};
