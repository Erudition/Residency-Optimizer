import { AssignmentType, CODENAMES, Resident, RotationConfig, ClinicalSetting } from './types';

export const TOTAL_WEEKS = 52;
export const COHORT_COUNT = 5;
export const ACTIVE_START_YEAR = 2026;

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
        return 15; // default size for future classes
    };

    const getTransferOutYear = (name: string): number | undefined => {
        if (name.includes("Mysore, Nishad Narain")) return 2024;
        if (name.includes("Cho, Kevin Wook Jin")) return 2025;
        return undefined;
    };

    let idCounter = 1;

    // Track backwards 2 years from activeYear to get the current PGY 1, 2, 3
    for (let startYear = activeYear - 2; startYear <= activeYear; startYear++) {
        const level = (activeYear - startYear + 1) as 1 | 2 | 3;
        const size = getClassSize(startYear);
        const names = getNamesForClass(startYear, size);

        for (let i = 0; i < size; i++) {
            const name = names[i] || `Resident ${idCounter}`;
            const transferOutYear = getTransferOutYear(name);
            const transferInYear = undefined; // Support can be added as needed

            // Filter out residents who have already transferred out before this active year
            if (transferOutYear !== undefined && transferOutYear < activeYear) {
                continue;
            }

            // Filter out residents who have not yet transferred in for this active year
            if (transferInYear !== undefined && transferInYear > activeYear) {
                continue;
            }

            residents.push({
                id: `c${startYear}-${i + 1}`,
                name,
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
            const name = names[i];
            let transferOutYear: number | undefined = undefined;
            if (name.includes("Mysore, Nishad Narain")) transferOutYear = 2024;
            if (name.includes("Cho, Kevin Wook Jin")) transferOutYear = 2025;

            allResidents.push({
                id: `c${startYear}-${i+1}`,
                name,
                level: 1, // Base level, will be shifted by activeYear
                startYear,
                avoidResidentIds: [],
                transferOutYear
            });
        }
    });

    return allResidents;
};

export const ASSIGNMENT_COLORS: Record<AssignmentType, string> = {
    ['RED']: 'bg-red/40 text-red-2-dark border-red-2',
    ['BLUE']: 'bg-light-blue text-navy-dark border-blue-2',
    ['MICU']: 'bg-light-purple text-purple-2-dark border-purple',
    ['NF']: 'bg-light-purple text-purple-2-dark border-purple',
    ['EM']: 'bg-creamsicle text-orange-dark border-orange',
    ['CCIM']: 'bg-light-yellow/30 text-light-yellow-dark border-light-yellow',
    ['ELECTIVE']: 'bg-lime-green/40 text-green-dark border-lime-green',
    ['VAC']: 'bg-light-2 text-muted border-light-5',
    ['METRO']: 'bg-teal-2/30 text-teal-2-dark border-teal-2',
    ['Cards']: 'bg-pink/60 text-pink-dark border-pink',
    ['ID']: 'bg-lime-green text-green-dark border-lime-green',
    ['Neph']: 'bg-light-yellow text-light-yellow-dark border-yellow',
    ['Pulm']: 'bg-sky-blue/50 text-sky-blue border-sky-blue',
    ['Onc']: 'bg-pink/60 text-pink-dark border-pink',
    ['Neuro']: 'bg-light-purple/80 text-purple-2-dark border-purple',
    ['Rheum']: 'bg-lime-green text-green-dark border-green-2',
    ['GI']: 'bg-light-yellow text-light-yellow-dark border-yellow',
    ['Add Med']: 'bg-light-4 text-black border-light-6',
    ['Endo']: 'bg-creamsicle/50 text-orange-dark border-creamsicle',
    ['Geri']: 'bg-light-4 text-black border-light-6',
    ['HPC']: 'bg-pale-blue text-pale-blue-dark border-pale-blue-dark',
    ['NIMA']: 'bg-light-yellow text-light-yellow-dark border-yellow',
    ['METRO_ICU']: 'bg-light-purple text-fuchsia-dark border-fuchsia',
    ['Research']: 'bg-light-3 text-black border-light-5',
    ['CCMA']: 'bg-light-purple/50 text-purple-2 border-purple',
    ['Heart Failure']: 'bg-red/20 text-red-2-dark border-red/40',
    ['AMCS_CONSULTS']: 'bg-pink/40 text-pink-dark border-pink',
    ['ENT']: 'bg-teal-2/50 text-teal-2-dark border-teal-2',
    ['PMNR']: 'bg-pale-blue text-pale-blue-dark border-pale-blue-dark',
    ['ANAESTHESIA']: 'bg-sky-blue/30 text-sky-blue-dark border-sky-blue',
    ['NIMA (Clinic)']: 'bg-light-yellow/30 text-light-yellow-dark border-light-yellow',
    ['Jr Hosp']: 'bg-light-purple/50 text-purple-2 border-light-purple',
};

export const ASSIGNMENT_HUES: Record<AssignmentType, number> = {
    ['MICU']: 28,
    ['METRO_ICU']: 335,
    ['RED']: 15,
    ['NF']: 282,
    ['BLUE']: 250,
    ['EM']: 45,
    ['METRO']: 155,
    ['AMCS_CONSULTS']: 345,
    ['CCMA']: 280,
    ['ANAESTHESIA']: 190,
    ['Jr Hosp']: 225,
    ['CCIM']: 65,
    ['NIMA (Clinic)']: 75,
    ['Cards']: 355,
    ['NIMA']: 95,
    ['PMNR']: 205,
    ['ID']: 140,
    ['Neph']: 50,
    ['Pulm']: 185,
    ['Onc']: 355,
    ['Neuro']: 270,
    ['Rheum']: 125,
    ['GI']: 70,
    ['Add Med']: 110,
    ['Endo']: 45,
    ['Geri']: 135,
    ['HPC']: 215,
    ['Heart Failure']: 15,
    ['ENT']: 170,
    ['Research']: 100,
    ['ELECTIVE']: 150,
    ['VAC']: 80,
};

const getIntensity = (type: AssignmentType): number => {
    switch (type) {
        case 'MICU':
        case 'METRO_ICU':
            return 5;
        case 'RED':
        case 'NF':
            return 4;
        case 'BLUE':
        case 'EM':
        case 'METRO':
        case 'AMCS_CONSULTS':
        case 'CCMA':
        case 'ANAESTHESIA':
        case 'Jr Hosp':
            return 3;
        case 'CCIM':
        case 'NIMA (Clinic)':
        case 'Cards':
        case 'NIMA':
        case 'PMNR':
            return 2;
        case 'VAC':
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

export const getHighChromaColor = (type: AssignmentType): string => {
    const hue = ASSIGNMENT_HUES[type] || 0;
    const intensity = getIntensity(type);
    const chroma = intensity === 0 ? 0.015 : 0.01 + intensity * 0.038;
    return oklchToHex(0.65, chroma * 1.5, hue);
};

export const ASSIGNMENT_HEX_COLORS: Record<AssignmentType, string> = {} as any;
Object.values(CODENAMES).forEach(type => {
    const hue = ASSIGNMENT_HUES[type] ?? 180;
    const intensity = getIntensity(type);
    const chroma = intensity === 0 ? 0.015 : 0.01 + intensity * 0.038;
    ASSIGNMENT_HEX_COLORS[type] = oklchToHex(0.84, chroma, hue);
});

export const getAssignmentColor = (assign: AssignmentType, isPast = false): string => {
    const hue = ASSIGNMENT_HUES[assign] ?? 180;
    const intensity = getIntensity(assign);
    const chroma = intensity === 0 ? 0.015 : 0.01 + intensity * 0.038;
    const lightness = isPast ? 0.62 : 0.84;
    return oklchToHex(lightness, chroma, hue);
};

export const ASSIGNMENT_LABELS: Record<AssignmentType, string> = {
    ['RED']: 'Wards',
    ['BLUE']: 'Wards Blue',
    ['MICU']: 'ICU',
    ['NF']: 'Night Float',
    ['EM']: 'Emergency',
    ['CCIM']: 'Clinic (CCIM)',
    ['ELECTIVE']: 'Elective',
    ['VAC']: 'Vacation',
    ['METRO']: 'Met Wards',
    ['Cards']: 'Cardiology',
    ['ID']: 'Infectious Disease',
    ['Neph']: 'Nephrology',
    ['Pulm']: 'Pulmonology',
    ['METRO_ICU']: 'Metro ICU',
    ['Onc']: 'Heme/Onc',
    ['Neuro']: 'Neurology',
    ['Rheum']: 'Rheumatology',
    ['GI']: 'Gastroenterology',
    ['Add Med']: 'Addiction Med',
    ['Endo']: 'Endocrinology',
    ['Geri']: 'Geriatrics',
    ['HPC']: 'Palliative (HPC)',
    ['NIMA']: 'NIMA',
    ['Research']: 'Research',
    ['CCMA']: 'CCMA',
    ['Heart Failure']: 'Heart Failure',
    ['AMCS_CONSULTS']: 'AMCS Consults',
    ['ENT']: 'Otolaryngology',
    ['PMNR']: 'Physical Medicine & Rehab',
    ['ANAESTHESIA']: 'Anaesthesia',
    ['NIMA (Clinic)']: 'NIMA (Clinic)',
    ['Jr Hosp']: 'Junior Hospitalist',
};
export const ASSIGNMENT_ABBREVIATIONS: Record<AssignmentType, string> = {
    ['RED']: 'W-RED',
    ['BLUE']: 'W-BLUE',
    ['MICU']: 'ICU',
    ['NF']: 'NF',
    ['EM']: 'EM',
    ['CCIM']: 'CCIM',
    ['ELECTIVE']: 'ELEC',
    ['VAC']: 'VAC',
    ['METRO']: 'MET',
    ['Cards']: 'CARDS',
    ['ID']: 'ID',
    ['Neph']: 'NEPH',
    ['Pulm']: 'PULM',
    ['METRO_ICU']: 'METRO',
    ['Onc']: 'ONC',
    ['Neuro']: 'NEURO',
    ['Rheum']: 'RHEUM',
    ['GI']: 'GI',
    ['Add Med']: 'ADDM',
    ['Endo']: 'ENDO',
    ['Geri']: 'GERI',
    ['HPC']: 'HPC',
    ['NIMA']: 'NIMA',
    ['Research']: 'RSCH',
    ['CCMA']: 'CCMA',
    ['Heart Failure']: 'HF',
    ['AMCS_CONSULTS']: 'AMCS',
    ['ENT']: 'ENT',
    ['PMNR']: 'PMNR',
    ['ANAESTHESIA']: 'ANES',
    ['NIMA (Clinic)']: 'NIMA',
    ['Jr Hosp']: 'JH',
};

// Configuration of each rotation's constraints and metadata
export const ROTATION_METADATA: Record<AssignmentType, RotationConfig> = {
    ['MICU']: {
        type: 'MICU', label: 'ICU', category: 'ICU',
        intensity: 5, setting: ClinicalSetting.CRITICAL_CARE, duration: 4,
        minInterns: 2, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
        minWeeksIntern: 8, minWeeksSenior: 4
    },
    ['RED']: {
        type: 'RED', label: 'Wards', category: 'Wards',
        intensity: 4, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 1, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
        minWeeksIntern: 16, minWeeksPGY2: 12, minWeeksPGY3: 8 // PGY1: 16w, PGY2: 12w, PGY3: 8w
    },
    ['BLUE']: {
        type: 'BLUE', label: 'Wards Blue', category: 'Wards',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 1, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
    },
    ['NF']: {
        type: 'NF', label: 'Night Float', category: 'Night Float',
        intensity: 4, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 1, maxInterns: 2, minSeniors: 1, maxSeniors: 2,
        minWeeksIntern: 4, minWeeksPGY2: 4, minWeeksPGY3: 4 // 4 weeks per year per proposal
    },
    ['EM']: {
        type: 'EM', label: 'Emergency', category: 'Emergency',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 1, maxSeniors: 2,
        minWeeksIntern: 0, minWeeksPGY2: 2, minWeeksPGY3: 2 // Restricted to PGY2/3 per proposal
    },
    ['CCIM']: {
        type: 'CCIM', label: 'Clinic', category: 'Clinic',
        intensity: 2, setting: ClinicalSetting.OUTPATIENT, duration: 1,
        minInterns: 0, maxInterns: 10, minSeniors: 0, maxSeniors: 10,
    },
    ['METRO']: {
        type: 'METRO', label: 'Metro Wards', category: 'Wards',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 1, maxInterns: 3, minSeniors: 1, maxSeniors: 2,
    },
    ['Cards']: {
        type: 'Cards', label: 'Cardiology', category: 'Cardiology',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 1, minSeniors: 0, maxSeniors: 1,
        minWeeksIntern: 2, minWeeksPGY3: 2
    },
    ['ID']: {
        type: 'ID', label: 'Infectious Disease', category: 'Infectious Disease',
        intensity: 2, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 1,
        minWeeksIntern: 2,
    },
    ['Neph']: {
        type: 'Neph', label: 'Nephrology', category: 'Nephrology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 1,
        minWeeksIntern: 2, minWeeksPGY2: 0
    },
    ['Pulm']: {
        type: 'Pulm', label: 'Pulmonology', category: 'Pulmonology',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
        minWeeksIntern: 2, minWeeksPGY2: 2
    },
    ['Onc']: {
        type: 'Onc', label: 'Heme/Onc', category: 'Heme/Onc',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        minWeeksPGY2: 0, minWeeksPGY3: 2 
    },
    ['Neuro']: {
        type: 'Neuro', label: 'Neurology', category: 'Neurology',
        intensity: 2, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 1,
        minWeeksPGY2: 2, // 2 weeks in PGY2
    },
    ['Rheum']: {
        type: 'Rheum', label: 'Rheumatology', category: 'Rheumatology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 1,
        minWeeksPGY2: 2, minWeeksPGY3: 0,
    },
    ['GI']: {
        type: 'GI', label: 'Gastroenterology', category: 'Gastroenterology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        minWeeksPGY2: 2, // 2 weeks in PGY2
    },
    ['Add Med']: {
        type: 'Add Med', label: 'Addiction Med', category: 'Addiction Medicine',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2, 
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        minWeeksPGY3: 2,
    },
    ['Endo']: {
        type: 'Endo', label: 'Endocrinology', category: 'Endocrinology',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2, 
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        minWeeksPGY2: 2,
    },
    ['Geri']: {
        type: 'Geri', label: 'Geriatrics', category: 'Geriatrics',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        minWeeksPGY3: 2,
    },
    ['HPC']: {
        type: 'HPC', label: 'Palliative Care', category: 'Palliative Care',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2, 
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        minWeeksPGY3: 2,
    },
    ['METRO_ICU']: {
        type: 'METRO_ICU', label: 'Metro ICU', category: 'ICU',
        intensity: 5, setting: ClinicalSetting.CRITICAL_CARE, duration: 4,
        minInterns: 0, maxInterns: 3, minSeniors: 0, maxSeniors: 3,
    },
    ['NIMA']: {
        type: 'NIMA', label: 'Primary Care', category: 'Senior Track',
        intensity: 2, setting: ClinicalSetting.OUTPATIENT, duration: 4,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        minWeeksPGY3: 4,
    },
    ['AMCS_CONSULTS']: {
        type: 'AMCS_CONSULTS', label: 'AMCS Consults',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
    },
    ['CCMA']: {
        type: 'CCMA', label: 'CCMA',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
    },
    ['Heart Failure']: {
        type: 'Heart Failure', label: 'Heart Failure',
        intensity: 2, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 2, minSeniors: 0, maxSeniors: 2,
    },
    ['ENT']: {
        type: 'ENT', label: 'ENT',
        intensity: 1, setting: ClinicalSetting.OUTPATIENT, duration: 2,
        minInterns: 0, maxInterns: 1, minSeniors: 0, maxSeniors: 1,
    },
    ['PMNR']: {
        type: 'PMNR', label: 'PMNR',
        intensity: 2, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 1, minSeniors: 0, maxSeniors: 1,
    },
    ['ANAESTHESIA']: {
        type: 'ANAESTHESIA', label: 'Anaesthesia',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 1, minSeniors: 0, maxSeniors: 1,
    },
    ['Research']: {
        type: 'Research', label: 'Research',
        intensity: 1, setting: ClinicalSetting.NON_CLINICAL, duration: 2,
        minInterns: 0, maxInterns: 10, minSeniors: 0, maxSeniors: 10,
    },
    ['ELECTIVE']: {
        type: 'ELECTIVE', label: 'Elective',
        intensity: 1, setting: ClinicalSetting.INPATIENT, duration: 2,
        minInterns: 0, maxInterns: 20, minSeniors: 0, maxSeniors: 20,
    },
    ['VAC']: {
        type: 'VAC', label: 'Vacation',
        intensity: 0, setting: ClinicalSetting.NON_CLINICAL, duration: 1,
        minInterns: 0, maxInterns: 20, minSeniors: 0, maxSeniors: 20,
    },
    ['Jr Hosp']: {
        type: 'Jr Hosp', label: 'Junior Hospitalist', category: 'Senior Track',
        intensity: 3, setting: ClinicalSetting.INPATIENT, duration: 4,
        minInterns: 0, maxInterns: 0, minSeniors: 0, maxSeniors: 2,
        minWeeksPGY3: 4
    },

    ['NIMA (Clinic)']: {
        type: 'NIMA (Clinic)', label: 'NIMA Clinic',
        intensity: 2, setting: ClinicalSetting.OUTPATIENT, duration: 1,
        minInterns: 0, maxInterns: 10, minSeniors: 0, maxSeniors: 10,
    },
};

export const ACGME_TYPES = [
    'RED',
    'MICU',
    'EM',
    'Cards',
    'ID',
    'Neph',
    'Pulm',
    'Onc',
    'Neuro',
    'Rheum',
    'GI',
    'Endo',
    'Geri'
];

export const MHS_TYPES = [
    'NF',
    'Add Med',
    'HPC',
    'NIMA',
    'Jr Hosp'
];

// Consistent order for requirement columns in UI
export const REQUIREMENT_ORDER = [
    ...ACGME_TYPES,
    ...MHS_TYPES
];

// DYNAMIC REQUIREMENTS GENERATION
// Single source of truth: ROTATION_METADATA
const generateRequirements = (level: number) => {
    const reqs: Record<string, { type: AssignmentType, label: string, minWeeks: number }> = {};
    
    Object.values(ROTATION_METADATA).forEach(m => {
        let minWeeks = 0;
        if (level === 1) minWeeks = m.minWeeksIntern || 0;
        else if (level === 2) minWeeks = m.minWeeksPGY2 || m.minWeeksSenior || 0;
        else if (level === 3) minWeeks = m.minWeeksPGY3 || m.minWeeksSenior || 0;
        
        if (minWeeks > 0) {
            const key = m.category || m.type;
            const label = m.category || m.label;
            
            // If we already have a requirement for this category, keep the one with the higher minWeeks
            // or keep the first one found if minWeeks are same.
            if (!reqs[key] || minWeeks > reqs[key].minWeeks) {
                reqs[key] = { type: m.type, label, minWeeks };
            }
        }
    });
    
    return Object.values(reqs);
};

export const REQUIREMENTS: Record<number, { type: AssignmentType, label: string, minWeeks: number }[]> = {
    1: generateRequirements(1),
    2: generateRequirements(2),
    3: generateRequirements(3),
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
    ['RED', 'BLUE', 'MICU', 'NF', 'EM', 'CCIM'].includes(k as AssignmentType)
) as AssignmentType[];

export const REQUIRED_TYPES = [
    'Cards', 'ID', 'Neph', 'Pulm',
    'Onc', 'Neuro', 'Rheum', 'GI',
    'Add Med', 'Endo', 'Geri', 'HPC',
    'NIMA'
];

export const ELECTIVE_TYPES = [
    'ELECTIVE', 'Research', 'Heart Failure', 'CCMA', 'ENT', 'PMNR'
];

export const VACATION_TYPE = 'VAC';
export const fulfillsRequirement = (assigned: AssignmentType | null, required: AssignmentType): boolean => {
    if (!assigned) return false;
    if (assigned === required) return true;

    const assignedMeta = ROTATION_METADATA[assigned];
    const requiredMeta = ROTATION_METADATA[required];

    if (assignedMeta && requiredMeta && assignedMeta.category && requiredMeta.category) {
        return assignedMeta.category === requiredMeta.category;
    }

    return false;
};
