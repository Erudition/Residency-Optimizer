import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AssignmentType } from '../types.js';

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const historicalDataPath = path.join(__dirname, '../specification/historical_schedules_grid_v2.json');
const historicalData = JSON.parse(fs.readFileSync(historicalDataPath, 'utf8'));

const VALID_ASSIGNMENTS = Object.values(CODENAMES) as string[];

// Legacy mappings that we expect and handle in historyPreloader.ts
const LEGACY_MAPPING: Record<string, string> = {
    'CVICU': 'AMCS_CONSULTS',
    'CCIM': 'CLINIC',
    'HPC': 'PALLIATIVE',
    'Wards-R': 'WARDS_RED',
    'Wards-B': 'WARDS_BLUE',
    'Met Wards': 'WARDS_METRO',
    'MICU 1': 'MICU',
    'MICU Metro': 'METRO_ICU',
    'Add Med': 'ADD_MED',
    'Jr Hosp': 'JR_HOSPITALIST',
};

function validate() {
    console.log('\x1b[36m%s\x1b[0m', '--- Historical Data Validation ---');
    let errorCount = 0;
    let warningCount = 0;

    const years = Object.keys(historicalData);
    console.log(`Found years: ${years.join(', ')}`);

    years.forEach(year => {
        const residents = historicalData[year];
        const residentNames = Object.keys(residents);
        
        console.log(`\nYear ${year}: ${residentNames.length} residents`);

        residentNames.forEach(name => {
            const assignments = residents[name];
            if (!Array.isArray(assignments)) {
                console.error(`\x1b[31m[ERROR]\x1b[0m Year ${year}, Resident ${name}: Assignments is not an array`);
                errorCount++;
                return;
            }

            if (assignments.length !== 52) {
                console.warn(`\x1b[33m[WARN]\x1b[0m Year ${year}, Resident ${name}: Expected 52 assignments, found ${assignments.length}`);
                warningCount++;
            }

            assignments.forEach((assignment, weekIndex) => {
                if (assignment === null) return;
                
                if (!VALID_ASSIGNMENTS.includes(assignment)) {
                    if (LEGACY_MAPPING[assignment]) {
                        // This is a known legacy value we handle
                    } else {
                        console.error(`\x1b[31m[ERROR]\x1b[0m Year ${year}, Resident ${name}, Week ${weekIndex + 1}: Unknown assignment type "${assignment}"`);
                        errorCount++;
                    }
                }
            });
        });
    });

    console.log('\n--- Summary ---');
    if (errorCount === 0) {
        console.log('\x1b[32m%s\x1b[0m', `Success! Found 0 errors, ${warningCount} warnings.`);
    } else {
        console.log('\x1b[31m%s\x1b[0m', `Validation failed with ${errorCount} errors and ${warningCount} warnings.`);
    }

    if (errorCount > 0) {
        process.exit(1);
    }
}

validate();
