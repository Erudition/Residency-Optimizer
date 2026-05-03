
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
    const classesToInclude = [2023, 2024, 2025, 2026];
    
    classesToInclude.forEach(startYear => {
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
        const actualSize = names.length;
        
        for (let i = 0; i < actualSize; i++) {
            allResidents.push({
                id: `c${startYear}-${i+1}`,
                name: names[i],
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
    [AssignmentType.AMCS_CONSULTS]: 'bg-pink/40 text-pink-dark border-pink',
    [AssignmentType.ENT]: 'bg-teal-2/50 text-teal-2-dark border-teal-2',
    [AssignmentType.PMNR]: 'bg-pale-blue text-pale-blue-dark border-pale-blue-dark',
    [AssignmentType.ANAESTHESIA]: 'bg-sky-blue/30 text-sky-blue-dark border-sky-blue',
    [AssignmentType.NIMA_CLINIC]: 'bg-light-yellow/30 text-light-yellow-dark border-light-yellow',
    [AssignmentType.JR_HOSPITALIST]: 'bg-light-purple/50 text-purple-2 border-light-purple',
};
export const ASSIGNMENT_HUES: Record<AssignmentType, number> = {
    [AssignmentType.MICU]: 28,
    [AssignmentType.METRO_ICU]: 335,
    [AssignmentType.WARDS_RED]: 15,
    [AssignmentType.NIGHT_FLOAT]: 282,
    [AssignmentType.WARDS_BLUE]: 210,
    [AssignmentType.EM]: 45,
    [AssignmentType.WARDS_METRO]: 155,
    [AssignmentType.AMCS_CONSULTS]: 345,
    [AssignmentType.CCMA]: 280,
    [AssignmentType.ANAESTHESIA]: 190,
    [AssignmentType.JR_HOSPITALIST]: 235,
    [AssignmentType.CLINIC]: 65,
    [AssignmentType.NIMA_CLINIC]: 75,
    [AssignmentType.CARDS]: 355,
    [AssignmentType.NIMA_BLOCK]: 95,
    [AssignmentType.PMNR]: 205,
    [AssignmentType.ID]: 140,
    [AssignmentType.NEPH]: 50,
    [AssignmentType.PULM]: 185,
    [AssignmentType.ONC]: 355,
    [AssignmentType.NEURO]: 270,
    [AssignmentType.RHEUM]: 125,
    [AssignmentType.GI]: 70,
    [AssignmentType.ADD_MED]: 110,
    [AssignmentType.ENDO]: 45,
    [AssignmentType.GERI]: 135,
    [AssignmentType.PALLIATIVE]: 215,
    [AssignmentType.HF]: 15,
    [AssignmentType.ENT]: 170,
    [AssignmentType.RESEARCH]: 100,
    [AssignmentType.ELECTIVE]: 150,
    [AssignmentType.VACATION]: 80,
};

const getIntensity = (type: AssignmentType): number => {
    switch (type) {
        case AssignmentType.MICU:
        case AssignmentType.METRO_ICU:
            return 5;
        case AssignmentType.WARDS_RED:
        case AssignmentType.NIGHT_FLOAT:
            return 4;
        case AssignmentType.WARDS_BLUE:
        case AssignmentType.EM:
        case AssignmentType.WARDS_METRO:
        case AssignmentType.AMCS_CONSULTS:
        case AssignmentType.CCMA:
        case AssignmentType.ANAESTHESIA:
        case AssignmentType.JR_HOSPITALIST:
            return 3;
        case AssignmentType.CLINIC:
        case AssignmentType.NIMA_CLINIC:
        case AssignmentType.CARDS:
        case AssignmentType.NIMA_BLOCK:
        case AssignmentType.PMNR:
            return 2;
        case AssignmentType.VACATION:
            return 0;
        default:
            return 1;
    }
};

export const oklchToHex = (L: number, C: number, H: number): string => {
    const a = C * Math.cos(H * Math.PI / 180);
    const b = C * Math.sin(H * Math.PI / 180);

    const l_ = (L + 0.3963377774 * a + 0.2158037573 * b);
    const m_ = (L - 0.1055613458 * a - 0.0638541728 * b);
    const s_ = (L - 0.0894841775 * a - 1.2914855378 * b);

    const l = Math.pow(Math.max(0, l_), 3);
    const m = Math.pow(Math.max(0, m_), 3);
    const s = Math.pow(Math.max(0, s_), 3);

    const r_linear = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g_linear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const b_linear = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

    const r_val = r_linear <= 0.0031308 ? 12.92 * r_linear : 1.055 * Math.pow(r_linear, 1 / 2.4) - 0.055;
    const g_val = g_linear <= 0.0031308 ? 12.92 * g_linear : 1.055 * Math.pow(g_linear, 1 / 2.4) - 0.055;
    const b_val = b_linear <= 0.0031308 ? 12.92 * b_linear : 1.055 * Math.pow(b_linear, 1 / 2.4) - 0.055;

    const toHex = (c: number) => {
        const value = Math.max(0, Math.min(255, Math.round(c * 255)));
        return value.toString(16).padStart(2, '0').toUpperCase();
    };

    return `#${toHex(r_val)}${toHex(g_val)}${toHex(b_val)}`;
};

export const getAssignmentColor = (assign: AssignmentType, isPast = false): string => {
    const hue = ASSIGNMENT_HUES[assign] ?? 180;
    const intensity = getIntensity(assign);
    const chroma = intensity === 0 ? 0.02 : 0.04 + intensity * 0.025;
    const lightness = isPast ? 0.62 : 0.84;
    return `oklch(${lightness} ${chroma} ${hue})`;
};

export const ASSIGNMENT_HEX_COLORS: Record<AssignmentType, string> = {} as any;
Object.values(AssignmentType).forEach(type => {
    const hue = ASSIGNMENT_HUES[type] ?? 180;
    const intensity = getIntensity(type);
    const chroma = intensity === 0 ? 0.02 : 0.04 + intensity * 0.025;
    ASSIGNMENT_HEX_COLORS[type] = oklchToHex(0.84, chroma, hue);
});
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
    [AssignmentType.AMCS_CONSULTS]: 'AMCS Consults',
    [AssignmentType.ENT]: 'Otolaryngology',
    [AssignmentType.PMNR]: 'Physical Medicine & Rehab',
    [AssignmentType.ANAESTHESIA]: 'Anaesthesia',
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
    [AssignmentType.AMCS_CONSULTS]: 'AMCS',
    [AssignmentType.ENT]: 'ENT',
    [AssignmentType.PMNR]: 'PMNR',
    [AssignmentType.ANAESTHESIA]: 'ANES',
    [AssignmentType.NIMA_CLINIC]: 'NIMA',
    [AssignmentType.JR_HOSPITALIST]: 'JH',
};
// Configuration of each rotation's constraints and metadata
export const ROTATION_METADATA: Record<AssignmentType, RotationConfig> = {
    [AssignmentType.MICU]: {
        type: AssignmentType.MICU, label: 'ICU',
        intensity: 5, setting: ClinicalSetting.CRITICAL_CARE, duration: 4,
        minInterns: 2, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
        targetIntern: 8, targetSenior: 4
    },
    [AssignmentType.WARDS_RED]: {
        type: AssignmentType.WARDS_RED, label: 'Wards',
        intensity: 4, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 1, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
        targetIntern: 12, targetSenior: 8 // PGY1: 3 blocks (12w), Seniors: 2 blocks (8w)
    },
    [AssignmentType.WARDS_BLUE]: {
        type: AssignmentType.WARDS_BLUE, label: 'Wards Blue',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 1, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
    },
    [AssignmentType.NIGHT_FLOAT]: {
        type: AssignmentType.NIGHT_FLOAT, label: 'Night Float',
        intensity: 4, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
        targetIntern: 2, targetSenior: 2 // 2 weeks per year per proposal
    },
    [AssignmentType.EM]: {
        type: AssignmentType.EM, label: 'Emergency',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 1, maxSeniors: 2,
        targetIntern: 0, targetPGY2: 2, targetPGY3: 2 // Restricted to PGY2/3 per proposal
    },
    [AssignmentType.CLINIC]: {
        type: AssignmentType.CLINIC, label: 'Clinic',
        intensity: 2, setting: ClinicalSetting.OUTPATIENT, duration: 1,
        minInterns: 0, maxInterns: 10, minSeniors: 0, maxSeniors: 10,
    },
    [AssignmentType.WARDS_METRO]: {
        type: AssignmentType.WARDS_METRO, label: 'Metro Wards',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 1, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
    },
    [AssignmentType.CARDS]: {
        type: AssignmentType.CARDS, label: 'Cardiology',
        intensity: 2, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 1, minSeniors: 0, maxSeniors: 1,
        targetIntern: 2, targetPGY3: 2
    },
    [AssignmentType.ID]: {
        type: AssignmentType.ID, label: 'Infectious Disease',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 1,
        targetIntern: 2,
    },
    [AssignmentType.NEPH]: {
        type: AssignmentType.NEPH, label: 'Nephrology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 1,
        targetIntern: 2, targetPGY2: 0
    },
    [AssignmentType.PULM]: {
        type: AssignmentType.PULM, label: 'Pulmonology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
        targetIntern: 2, targetPGY2: 2
    },
    [AssignmentType.ONC]: {
        type: AssignmentType.ONC, label: 'Heme/Onc',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY2: 0, targetPGY3: 2 
    },
    [AssignmentType.NEURO]: {
        type: AssignmentType.NEURO, label: 'Neurology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 1,
        targetPGY2: 2, // 2 weeks in PGY2
    },
    [AssignmentType.RHEUM]: {
        type: AssignmentType.RHEUM, label: 'Rheumatology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 1,
        targetPGY2: 2, targetPGY3: 0,
    },
    [AssignmentType.GI]: {
        type: AssignmentType.GI, label: 'Gastroenterology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
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
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2, 
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY3: 2,
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
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY3: 4,
    },
    [AssignmentType.AMCS_CONSULTS]: {
        type: AssignmentType.AMCS_CONSULTS, label: 'AMCS Consults',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 2,
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
    [AssignmentType.PMNR]: {
        type: AssignmentType.PMNR, label: 'PMNR',
        intensity: 2, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 1, minSeniors: 0, maxSeniors: 1,
    },
    [AssignmentType.ANAESTHESIA]: {
        type: AssignmentType.ANAESTHESIA, label: 'Anaesthesia',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 2,
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
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        targetPGY3: 4
    },

    [AssignmentType.NIMA_CLINIC]: {
        type: AssignmentType.NIMA_CLINIC, label: 'NIMA Clinic',
        intensity: 2, setting: ClinicalSetting.OUTPATIENT, duration: 1,
        minInterns: 0, maxInterns: 10, minSeniors: 0, maxSeniors: 10,
    },
};

export const ACGME_TYPES = [
    AssignmentType.WARDS_RED,
    AssignmentType.MICU,
    AssignmentType.EM,
    AssignmentType.CARDS,
    AssignmentType.ID,
    AssignmentType.NEPH,
    AssignmentType.PULM,
    AssignmentType.ONC,
    AssignmentType.NEURO,
    AssignmentType.RHEUM,
    AssignmentType.GI,
    AssignmentType.ENDO,
    AssignmentType.GERI
];

export const MHS_TYPES = [
    AssignmentType.NIGHT_FLOAT,
    AssignmentType.ADD_MED,
    AssignmentType.PALLIATIVE,
    AssignmentType.NIMA_BLOCK,
    AssignmentType.JR_HOSPITALIST
];

// Consistent order for requirement columns in UI
export const REQUIREMENT_ORDER = [
    ...ACGME_TYPES,
    ...MHS_TYPES
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
    AssignmentType.ELECTIVE, AssignmentType.RESEARCH, AssignmentType.HF, AssignmentType.CCMA, AssignmentType.ENT, AssignmentType.PMNR
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
        return assigned === AssignmentType.MICU || assigned === AssignmentType.METRO_ICU;
    }

    return false;
};
