
import { AssignmentType, Resident, RotationConfig, ClinicalSetting } from './types';

export const TOTAL_WEEKS = 52;
export const COHORT_COUNT = 5;

// Initial Data Generation Helpers
export const GENERATE_INITIAL_RESIDENTS = (): Resident[] => {
    const residents: Resident[] = [];

    // 15 PGY1 (Numbers 1-15)
    for (let i = 1; i <= 15; i++) {
        residents.push({
            id: `pgy1-${i}`,
            name: `Resident ${i}`,
            level: 1,
            cohort: (i - 1) % COHORT_COUNT,
            avoidResidentIds: [],
        });
    }

    // 15 PGY2 (Numbers 16-30)
    for (let i = 16; i <= 30; i++) {
        residents.push({
            id: `pgy2-${i}`,
            name: `Resident ${i}`,
            level: 2,
            cohort: (i - 1) % COHORT_COUNT,
            avoidResidentIds: [],
        });
    }

    // 15 PGY3 (Numbers 31-45)
    for (let i = 31; i <= 45; i++) {
        residents.push({
            id: `pgy3-${i}`,
            name: `Resident ${i}`,
            level: 3,
            cohort: (i - 1) % COHORT_COUNT,
            avoidResidentIds: [],
        });
    }

    return residents;
};

// Requirements Definition - Synchronized with rules.md
export const REQUIREMENTS: Record<number, { type: AssignmentType, label: string, target: number }[]> = {
    1: [
        { type: AssignmentType.WARDS_RED, label: 'Wards (Red/Blue)', target: 12 },
        { type: AssignmentType.ICU, label: 'ICU', target: 4 },
        { type: AssignmentType.NIGHT_FLOAT, label: 'Night Float', target: 4 },
        { type: AssignmentType.EM, label: 'Emergency Medicine', target: 4 },
        { type: AssignmentType.CARDS, label: 'Cardiology', target: 4 },
        { type: AssignmentType.ID, label: 'Infectious Disease', target: 2 },
        { type: AssignmentType.NEPH, label: 'Nephrology', target: 2 },
        { type: AssignmentType.PULM, label: 'Pulmonology', target: 2 },
    ],
    2: [
        { type: AssignmentType.WARDS_RED, label: 'Senior Wards', target: 8 },
        { type: AssignmentType.ICU, label: 'Senior ICU', target: 4 },
        { type: AssignmentType.NIGHT_FLOAT, label: 'Night Float', target: 4 },
        { type: AssignmentType.ONC, label: 'Onc', target: 4 },
        { type: AssignmentType.NEURO, label: 'Neuro', target: 4 },
        { type: AssignmentType.RHEUM, label: 'Rheum', target: 4 },
        { type: AssignmentType.GI, label: 'GI', target: 4 },
    ],
    3: [
        { type: AssignmentType.WARDS_RED, label: 'Senior Wards', target: 8 },
        { type: AssignmentType.ICU, label: 'Senior ICU', target: 4 },
        { type: AssignmentType.NIGHT_FLOAT, label: 'Night Float', target: 4 },
        { type: AssignmentType.ADD_MED, label: 'Add Med', target: 4 },
        { type: AssignmentType.ENDO, label: 'Endo', target: 4 },
        { type: AssignmentType.GERI, label: 'Geri', target: 4 },
        { type: AssignmentType.HPC, label: 'HPC', target: 4 },
    ]
};

export const ASSIGNMENT_COLORS: Record<AssignmentType, string> = {
    [AssignmentType.WARDS_RED]: 'bg-red-200 text-red-900 border-red-300',
    [AssignmentType.WARDS_BLUE]: 'bg-blue-200 text-blue-900 border-blue-300',
    [AssignmentType.ICU]: 'bg-purple-200 text-purple-900 border-purple-300',
    [AssignmentType.NIGHT_FLOAT]: 'bg-indigo-200 text-indigo-900 border-indigo-300',
    [AssignmentType.EM]: 'bg-orange-200 text-orange-900 border-orange-300',
    [AssignmentType.CLINIC]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [AssignmentType.ELECTIVE]: 'bg-green-100 text-green-800 border-green-200',
    [AssignmentType.VACATION]: 'bg-gray-100 text-gray-400 border-gray-200',
    [AssignmentType.MET_WARDS]: 'bg-teal-100 text-teal-800 border-teal-200',
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
    [AssignmentType.HPC]: 'bg-sky-200 text-sky-900 border-sky-300',
    [AssignmentType.METRO]: 'bg-fuchsia-200 text-fuchsia-900 border-fuchsia-300',
    [AssignmentType.RESEARCH]: 'bg-zinc-200 text-zinc-900 border-zinc-300',
    [AssignmentType.CCMA]: 'bg-purple-100 text-purple-800 border-purple-200',
    [AssignmentType.HF]: 'bg-red-100 text-red-800 border-red-200',
    [AssignmentType.CC_ICU]: 'bg-rose-200 text-rose-900 border-rose-300',
    [AssignmentType.ENT]: 'bg-teal-200 text-teal-900 border-teal-300',
};

export const ASSIGNMENT_HEX_COLORS: Record<AssignmentType, string> = {
    [AssignmentType.WARDS_RED]: '#fca5a5',
    [AssignmentType.WARDS_BLUE]: '#93c5fd',
    [AssignmentType.ICU]: '#d8b4fe',
    [AssignmentType.NIGHT_FLOAT]: '#a5b4fc',
    [AssignmentType.EM]: '#fdba74',
    [AssignmentType.CLINIC]: '#fde047',
    [AssignmentType.ELECTIVE]: '#86efac',
    [AssignmentType.VACATION]: '#e5e7eb',
    [AssignmentType.MET_WARDS]: '#5eead4',
    [AssignmentType.CARDS]: '#fda4af',
    [AssignmentType.ID]: '#bef264',
    [AssignmentType.NEPH]: '#fcd34d',
    [AssignmentType.PULM]: '#67e8f9',
    [AssignmentType.METRO]: '#e879f9',
    [AssignmentType.ONC]: '#f9a8d4',
    [AssignmentType.NEURO]: '#a78bfa',
    [AssignmentType.RHEUM]: '#6ee7b7',
    [AssignmentType.GI]: '#fbbf24',
    [AssignmentType.ADD_MED]: '#d6d3d1',
    [AssignmentType.ENDO]: '#ffedd5',
    [AssignmentType.GERI]: '#cbd5e1',
    [AssignmentType.HPC]: '#bae6fd',
    [AssignmentType.RESEARCH]: '#e2e8f0',
    [AssignmentType.CCMA]: '#fce7f3',
    [AssignmentType.HF]: '#fee2e2',
    [AssignmentType.CC_ICU]: '#fecdd3',
    [AssignmentType.ENT]: '#99f6e4',
};

export const ASSIGNMENT_LABELS: Record<AssignmentType, string> = {
    [AssignmentType.WARDS_RED]: 'Wards Red',
    [AssignmentType.WARDS_BLUE]: 'Wards Blue',
    [AssignmentType.ICU]: 'ICU',
    [AssignmentType.NIGHT_FLOAT]: 'Night Float',
    [AssignmentType.EM]: 'Emergency',
    [AssignmentType.CLINIC]: 'Clinic (CCIM)',
    [AssignmentType.ELECTIVE]: 'Elective',
    [AssignmentType.VACATION]: 'Vacation',
    [AssignmentType.MET_WARDS]: 'Met Wards',
    [AssignmentType.CARDS]: 'Cardiology',
    [AssignmentType.ID]: 'Infectious Disease',
    [AssignmentType.NEPH]: 'Nephrology',
    [AssignmentType.PULM]: 'Pulmonology',
    [AssignmentType.METRO]: 'Metro ICU',
    [AssignmentType.ONC]: 'Heme/Onc',
    [AssignmentType.NEURO]: 'Neurology',
    [AssignmentType.RHEUM]: 'Rheumatology',
    [AssignmentType.GI]: 'Gastroenterology',
    [AssignmentType.ADD_MED]: 'Addiction Med',
    [AssignmentType.ENDO]: 'Endocrinology',
    [AssignmentType.GERI]: 'Geriatrics',
    [AssignmentType.HPC]: 'Palliative (HPC)',
    [AssignmentType.RESEARCH]: 'Research',
    [AssignmentType.CCMA]: 'CCMA',
    [AssignmentType.HF]: 'Heart Failure',
    [AssignmentType.CC_ICU]: 'Cardiac ICU',
    [AssignmentType.ENT]: 'Otolaryngology',
};

export const ASSIGNMENT_ABBREVIATIONS: Record<AssignmentType, string> = {
    [AssignmentType.WARDS_RED]: 'W-RED',
    [AssignmentType.WARDS_BLUE]: 'W-BLUE',
    [AssignmentType.ICU]: 'ICU',
    [AssignmentType.NIGHT_FLOAT]: 'NF',
    [AssignmentType.EM]: 'EM',
    [AssignmentType.CLINIC]: 'CCIM',
    [AssignmentType.ELECTIVE]: 'ELEC',
    [AssignmentType.VACATION]: 'VAC',
    [AssignmentType.MET_WARDS]: 'MET',
    [AssignmentType.CARDS]: 'CARDS',
    [AssignmentType.ID]: 'ID',
    [AssignmentType.NEPH]: 'NEPH',
    [AssignmentType.PULM]: 'PULM',
    [AssignmentType.METRO]: 'METRO',
    [AssignmentType.ONC]: 'ONC',
    [AssignmentType.NEURO]: 'NEURO',
    [AssignmentType.RHEUM]: 'RHEUM',
    [AssignmentType.GI]: 'GI',
    [AssignmentType.ADD_MED]: 'ADDM',
    [AssignmentType.ENDO]: 'ENDO',
    [AssignmentType.GERI]: 'GERI',
    [AssignmentType.HPC]: 'HPC',
    [AssignmentType.RESEARCH]: 'RSCH',
    [AssignmentType.CCMA]: 'CCMA',
    [AssignmentType.HF]: 'HF',
    [AssignmentType.CC_ICU]: 'CC-ICU',
    [AssignmentType.ENT]: 'ENT',
};

// Configuration of each rotation's constraints and metadata
export const ROTATION_METADATA: Record<AssignmentType, RotationConfig> = {
    [AssignmentType.ICU]: {
        type: AssignmentType.ICU, label: 'ICU',
        intensity: 5, setting: ClinicalSetting.CRITICAL_CARE, duration: 4,
        minInterns: 2, maxInterns: 2, minSeniors: 2, maxSeniors: 2,
    },
    [AssignmentType.WARDS_RED]: {
        type: AssignmentType.WARDS_RED, label: 'Wards Red',
        intensity: 4, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 2, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
    },
    [AssignmentType.WARDS_BLUE]: {
        type: AssignmentType.WARDS_BLUE, label: 'Wards Blue',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 2, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
    },
    [AssignmentType.NIGHT_FLOAT]: {
        type: AssignmentType.NIGHT_FLOAT, label: 'Night Float',
        intensity: 4, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 1, maxInterns: 2, minSeniors: 1, maxSeniors: 3,
        targetIntern: 2, targetPGY2: 2, targetPGY3: 2,
    },
    [AssignmentType.EM]: {
        type: AssignmentType.EM, label: 'Emergency',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 1, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
        targetIntern: 4
    },
    [AssignmentType.CLINIC]: {
        type: AssignmentType.CLINIC, label: 'Clinic',
        intensity: 2, setting: ClinicalSetting.OUTPATIENT, duration: 1,
        minInterns: 0, maxInterns: 10, minSeniors: 0, maxSeniors: 10,
    },
    [AssignmentType.MET_WARDS]: {
        type: AssignmentType.MET_WARDS, label: 'Met Wards',
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
        minInterns: 0, maxInterns: 4, minSeniors: 0, maxSeniors: 0,
        targetIntern: 2,
    },
    [AssignmentType.NEPH]: {
        type: AssignmentType.NEPH, label: 'Nephrology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 4, minSeniors: 0, maxSeniors: 0,
        targetIntern: 2,
    },
    [AssignmentType.PULM]: {
        type: AssignmentType.PULM, label: 'Pulmonology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 4, minSeniors: 0, maxSeniors: 0,
        targetIntern: 2,
    },
    [AssignmentType.ONC]: {
        type: AssignmentType.ONC, label: 'Heme/Onc',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY2: 4, targetSenior: 4,
    },
    [AssignmentType.NEURO]: {
        type: AssignmentType.NEURO, label: 'Neurology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY2: 4, targetSenior: 4,
    },
    [AssignmentType.RHEUM]: {
        type: AssignmentType.RHEUM, label: 'Rheumatology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 4,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY2: 4, targetSenior: 4,
    },
    [AssignmentType.GI]: {
        type: AssignmentType.GI, label: 'Gastroenterology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 4,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY2: 4, targetSenior: 4,
    },
    [AssignmentType.ADD_MED]: {
        type: AssignmentType.ADD_MED, label: 'Addiction Med',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY3: 2, targetSenior: 2,
    },
    [AssignmentType.ENDO]: {
        type: AssignmentType.ENDO, label: 'Endocrinology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY3: 2, targetSenior: 2,
    },
    [AssignmentType.GERI]: {
        type: AssignmentType.GERI, label: 'Geriatrics',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY3: 2, targetSenior: 2,
    },
    [AssignmentType.HPC]: {
        type: AssignmentType.HPC, label: 'Palliative Care',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY3: 2, targetSenior: 2,
    },
    [AssignmentType.METRO]: {
        type: AssignmentType.METRO, label: 'Metro ICU',
        intensity: 5, setting: ClinicalSetting.CRITICAL_CARE, duration: 4,
        minInterns: 0, maxInterns: 3, minSeniors: 0, maxSeniors: 3,
    },
    [AssignmentType.CC_ICU]: {
        type: AssignmentType.CC_ICU, label: 'Cardiac ICU',
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
};

// Classification helpers
export const CORE_TYPES = Object.keys(ROTATION_METADATA).filter(k =>
    [AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE, AssignmentType.ICU, AssignmentType.NIGHT_FLOAT, AssignmentType.EM, AssignmentType.CLINIC].includes(k as AssignmentType)
) as AssignmentType[];

export const REQUIRED_TYPES = [
    AssignmentType.CARDS, AssignmentType.ID, AssignmentType.NEPH, AssignmentType.PULM,
    AssignmentType.ONC, AssignmentType.NEURO, AssignmentType.RHEUM, AssignmentType.GI,
    AssignmentType.ADD_MED, AssignmentType.ENDO, AssignmentType.GERI, AssignmentType.HPC
];

export const ELECTIVE_TYPES = [
    AssignmentType.ELECTIVE, AssignmentType.RESEARCH, AssignmentType.HF, AssignmentType.CCMA, AssignmentType.ENT
];

export const VACATION_TYPE = AssignmentType.VACATION;
