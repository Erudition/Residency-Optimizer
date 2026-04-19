
import { AssignmentType, Resident, RotationConfig, ClinicalSetting } from './types';

export const TOTAL_WEEKS = 52;
export const COHORT_COUNT = 5;

export const GENERATE_RESIDENTS_FOR_YEAR = (activeYear: number): Resident[] => {
    const residents: Resident[] = [];

    const R1_CLASS_2025 = ["Baset, Nawsin","Cho, Kevin Wook Jin","De La Cruz, Aaron Daniel","Deen, Nafis M","Liu, Gongkai","Masud, Saad","Min, Shao-Ting","Thanedar, Sarita","Yu, Tommy","Alvarado, Ramona Davina","Dawood, Umar Asif","Delano, Victoria Remilekun","Echegaray, Sebastian Alexander","Hill, Brittany Marie","Jentz, Austin Lee","Letson, Mia Kang","Millan, Cassandra Marie","Nazeer, Usman Imran","Ndze, Lila Linda","Orden, Martin Basobas","Rendon, Arthur Isaac","Sanderson, Jacob Nakolo","Shah, Vidur Hemant"];
    const R2_CLASS_2024 = ["Melo, Sebastian","Wright, Andrew Hunter"];

    const getNamesForClass = (startYear: number, size: number) => {
        if (startYear === 2024) return R2_CLASS_2024;
        if (startYear === 2025) return R1_CLASS_2025;
        return Array.from({ length: size }, (_, i) => `Intern ${activeYear % 100}-${i + 1}`);
    };

    const getClassSize = (startYear: number) => {
        if (startYear === 2024) return 2;
        if (startYear === 2025) return 23;
        return 15; // 2026 incoming class
    };

    let idCounter = 1;
    
    for (let startYear = activeYear - 2; startYear <= activeYear; startYear++) {
        const level = (activeYear - startYear + 1) as 1 | 2 | 3;
        const size = getClassSize(startYear);
        const names = getNamesForClass(startYear, size);
        
        for (let i = 0; i < size; i++) {
            residents.push({
                id: `c${startYear+3}-${i+1}`, 
                name: names[i] || `Resident ${idCounter}`,
                level,
                startYear,
                cohort: (idCounter - 1) % COHORT_COUNT,
                avoidResidentIds: [],
            });
            idCounter++;
        }
    }

    return residents;
};

// Fallback baseline for tests
export const GENERATE_INITIAL_RESIDENTS = () => GENERATE_RESIDENTS_FOR_YEAR(2026);

export const ASSIGNMENT_COLORS: Record<AssignmentType, string> = {
    [AssignmentType.WARDS_RED]: 'bg-red-200 text-red-900 border-red-300',
    [AssignmentType.WARDS_BLUE]: 'bg-blue-200 text-blue-900 border-blue-300',
    [AssignmentType.MICU]: 'bg-purple-200 text-purple-900 border-purple-300',
    [AssignmentType.NIGHT_FLOAT]: 'bg-indigo-200 text-indigo-900 border-indigo-300',
    [AssignmentType.EM]: 'bg-orange-200 text-orange-900 border-orange-300',
    [AssignmentType.CLINIC]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [AssignmentType.ELECTIVE]: 'bg-green-100 text-green-800 border-green-200',
    [AssignmentType.VACATION]: 'bg-gray-100 text-gray-400 border-gray-200',
    [AssignmentType.WARDS_METRO]: 'bg-teal-100 text-teal-800 border-teal-200',
    [AssignmentType.CARDS]: 'bg-rose-300 text-rose-900 border-rose-400',
    [AssignmentType.ID]: 'bg-lime-200 text-lime-900 border-lime-300',
    [AssignmentType.NEPH]: 'bg-amber-200 text-amber-900 border-amber-300',
    [AssignmentType.PULM]: 'bg-cyan-200 text-cyan-900 border-cyan-300',
    [AssignmentType.ONC]: 'bg-pink-300 text-pink-900 border-pink-400',
    [AssignmentType.NEURO]: 'bg-violet-300 text-violet-900 border-violet-400',
    [AssignmentType.RHEUM]: 'bg-emerald-200 text-emerald-900 border-emerald-300',
    [AssignmentType.GI]: 'bg-amber-300 text-amber-900 border-amber-400',
    [AssignmentType.ADD_MED]: 'bg-stone-300 text-stone-900 border-stone-400',
    [AssignmentType.ENDO]: 'bg-orange-100 text-orange-800 border-orange-200',
    [AssignmentType.GERI]: 'bg-slate-300 text-slate-900 border-slate-400',
    [AssignmentType.PALLIATIVE]: 'bg-sky-200 text-sky-900 border-sky-300',
    [AssignmentType.NIMA_BLOCK]: 'bg-yellow-200 text-yellow-900 border-yellow-300',
    [AssignmentType.METRO_ICU]: 'bg-fuchsia-200 text-fuchsia-900 border-fuchsia-300',
    [AssignmentType.RESEARCH]: 'bg-zinc-200 text-zinc-900 border-zinc-300',
    [AssignmentType.CCMA]: 'bg-purple-100 text-purple-800 border-purple-200',
    [AssignmentType.HF]: 'bg-red-100 text-red-800 border-red-200',
    [AssignmentType.CVICU]: 'bg-rose-200 text-rose-900 border-rose-300',
    [AssignmentType.ENT]: 'bg-teal-200 text-teal-900 border-teal-300',
    [AssignmentType.NIMA_CLINIC]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [AssignmentType.JR_HOSPITALIST]: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

export const ASSIGNMENT_HEX_COLORS: Record<AssignmentType, string> = {
    [AssignmentType.WARDS_RED]: '#fca5a5',
    [AssignmentType.WARDS_BLUE]: '#93c5fd',
    [AssignmentType.MICU]: '#d8b4fe',
    [AssignmentType.NIGHT_FLOAT]: '#a5b4fc',
    [AssignmentType.EM]: '#fdba74',
    [AssignmentType.CLINIC]: '#fde047',
    [AssignmentType.ELECTIVE]: '#86efac',
    [AssignmentType.VACATION]: '#e5e7eb',
    [AssignmentType.WARDS_METRO]: '#5eead4',
    [AssignmentType.CARDS]: '#fda4af',
    [AssignmentType.ID]: '#bef264',
    [AssignmentType.NEPH]: '#fcd34d',
    [AssignmentType.PULM]: '#67e8f9',
    [AssignmentType.METRO_ICU]: '#e879f9',
    [AssignmentType.ONC]: '#f9a8d4',
    [AssignmentType.NEURO]: '#a78bfa',
    [AssignmentType.RHEUM]: '#6ee7b7',
    [AssignmentType.GI]: '#fbbf24',
    [AssignmentType.ADD_MED]: '#d6d3d1',
    [AssignmentType.ENDO]: '#ffedd5',
    [AssignmentType.GERI]: '#cbd5e1',
    [AssignmentType.PALLIATIVE]: '#bae6fd',
    [AssignmentType.NIMA_BLOCK]: '#fef08a',
    [AssignmentType.RESEARCH]: '#e2e8f0',
    [AssignmentType.CCMA]: '#fce7f3',
    [AssignmentType.HF]: '#fee2e2',
    [AssignmentType.CVICU]: '#fecdd3',
    [AssignmentType.ENT]: '#99f6e4',
    [AssignmentType.NIMA_CLINIC]: '#fde047',
    [AssignmentType.JR_HOSPITALIST]: '#c7d2fe',
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
        type: AssignmentType.WARDS_RED, label: 'Wards Red',
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
        type: AssignmentType.WARDS_METRO, label: 'Met Wards',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 1, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
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
        minInterns: 0, maxInterns: 4, minSeniors: 0, maxSeniors: 4,
        targetIntern: 0, targetPGY2: 2
    },
    [AssignmentType.PULM]: {
        type: AssignmentType.PULM, label: 'Pulmonology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 4, minSeniors: 0, maxSeniors: 4,
        targetIntern: 0, targetPGY2: 2
    },
    [AssignmentType.ONC]: {
        type: AssignmentType.ONC, label: 'Heme/Onc',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
        targetPGY2: 0, targetPGY3: 0 // Individualized choice in proposal
    },
    [AssignmentType.NEURO]: {
        type: AssignmentType.NEURO, label: 'Neurology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
        targetPGY2: 2, // 2 weeks in PGY2
    },
    [AssignmentType.RHEUM]: {
        type: AssignmentType.RHEUM, label: 'Rheumatology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 4,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
        targetPGY2: 0,
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
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY3: 4,
    },
    [AssignmentType.ENDO]: {
        type: AssignmentType.ENDO, label: 'Endocrinology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 4, // Corrected to 4
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY3: 4,
    },
    [AssignmentType.GERI]: {
        type: AssignmentType.GERI, label: 'Geriatrics',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 4,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY2: 4,
    },
    [AssignmentType.PALLIATIVE]: {
        type: AssignmentType.PALLIATIVE, label: 'Palliative Care',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 4, // Corrected to 4
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
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
