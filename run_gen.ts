import { generateSchedule } from './services/scheduler';
import { GENERATE_INITIAL_RESIDENTS, ACTIVE_START_YEAR } from './constants';
import { CompetitionParams, CompetitionPriority } from './types';
import * as fs from 'fs';

async function runGenerator() {
    const residents = GENERATE_INITIAL_RESIDENTS();
    const params: CompetitionParams = {
        tries: 1000,
        priority: CompetitionPriority.BEST_SCORE,
        algorithmIds: ['staffingFirst'],
        topN: 1,
        multiYear: true
    };

    console.log("Starting 5-minute generation...");
    const startTime = Date.now();
    const duration = 5 * 60 * 1000;
    
    const result = await generateSchedule(
        ACTIVE_START_YEAR,
        3,
        residents,
        {},
        { existing: {} }, null as any, params, ['staffingFirst'],
        () => (Date.now() - startTime) > duration,
        (iteration, scores) => {
            if (iteration % 10 === 0) console.log(`Iteration ${iteration}, Best Score: ${scores[0]}`);
        }
    );

    const winner = result.results[0];
    fs.writeFileSync('best_schedule_5min.json', JSON.stringify(winner, null, 2));
    console.log("Saved best schedule to best_schedule_5min.json");
}

runGenerator().catch(console.error);
