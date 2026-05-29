import { ProgramData } from '../../services/api/client';

/**
 * Legacy requirement builder for generators that treat all requirements uniformly.
 * Maps pgy*Ideal values to minWeeks — the generators aim for ideals as if they
 * were hard minimums because they have no concept of soft vs hard goals.
 */
export function buildLevelRequirements(programData: ProgramData, level: number): { type: string, label: string, minWeeks: number, source: string }[] {
    const reqs: { type: string, label: string, minWeeks: number, source: string }[] = [];
    
    // Convert requirements into the shape generators expect
    programData.requirements.forEach(r => {
        let ideal = 0;
        if (level === 1) ideal = r.pgy1Ideal || 0;
        else if (level === 2) ideal = r.pgy2Ideal || 0;
        else if (level === 3) ideal = r.pgy3Ideal || 0;
        

        if (ideal > 0) {
            // Find a rotation codename that matches this tag so the generator has a concrete type to assign
            // If the tag is exactly a codename, use it directly.
            let type = r.tag.title;
            if (!programData.rotations.has(type)) {
                // Find a rotation that has this tag
                for (const [codename, tags] of programData.rotationTags.entries()) {
                    if (tags.includes(r.tag.title)) {
                        type = codename;
                        break;
                    }
                }
            }
            reqs.push({
                type,
                label: r.tag.title,
                minWeeks: ideal,
                source: r.source
            });
        }
    });

    return reqs;
}

/** A requirement with the hard/soft distinction preserved. */
export interface EnrichedRequirement {
    /** Rotation codename or tag title that fulfills this requirement */
    type: string;
    /** Human-readable tag title */
    label: string;
    /** Per-PGY-year ideal (soft goal): what the schedule should aim for */
    idealWeeks: number;
    /** Per-PGY-year hard minimum: failing to meet this is a genuine violation.
     *  Pro-rated from the graduation minimum using ideal distribution weights.
     *  0 if no graduation minimum is defined. */
    hardMinWeeks: number;
    /** Total graduation minimum across all 3 years (from backend `minimum` field).
     *  null if not defined. */
    graduationMin: number | null;
    /** Requirement source (ACGME, MHS, Program) */
    source: string;
}

/**
 * Enriched requirement builder that preserves the hard/soft distinction.
 * - `idealWeeks`: per-PGY-year ideal (soft goal) — what to aim for.
 * - `hardMinWeeks`: per-PGY-year hard floor — pro-rated from the graduation
 *    minimum using the ideal distribution as weights. Failing this is a real violation.
 * - `graduationMin`: total graduation minimum across all years.
 *
 * For generators that can distinguish (e.g. CSP): use hardMinWeeks for constraint
 * enforcement and idealWeeks for optimization heuristics.
 */
export function buildEnrichedLevelRequirements(programData: ProgramData, level: number): EnrichedRequirement[] {
    const reqs: EnrichedRequirement[] = [];

    programData.requirements.forEach(r => {
        let ideal = 0;
        if (level === 1) ideal = r.pgy1Ideal || 0;
        else if (level === 2) ideal = r.pgy2Ideal || 0;
        else if (level === 3) ideal = r.pgy3Ideal || 0;

        if (ideal > 0) {
            let type = r.tag.title;
            if (!programData.rotations.has(type)) {
                for (const [codename, tags] of programData.rotationTags.entries()) {
                    if (tags.includes(r.tag.title)) {
                        type = codename;
                        break;
                    }
                }
            }

            // Pro-rate the graduation minimum across PGY years using ideal weights.
            // E.g. if graduation min = 40, and ideals are 12/16/12 (sum 40),
            // then PGY-1 hard min = 40 * (12/40) = 12.
            const gradMin = r.minimum ?? null;
            let hardMin = 0;
            if (gradMin != null && gradMin > 0) {
                const idealSum = (r.pgy1Ideal || 0) + (r.pgy2Ideal || 0) + (r.pgy3Ideal || 0);
                if (idealSum > 0) {
                    hardMin = Math.floor(gradMin * (ideal / idealSum));
                } else {
                    // No per-PGY ideals but a graduation min exists — distribute evenly
                    hardMin = Math.floor(gradMin / 3);
                }
            }

            reqs.push({
                type,
                label: r.tag.title,
                idealWeeks: ideal,
                hardMinWeeks: hardMin,
                graduationMin: gradMin,
                source: r.source,
            });
        }
    });

    return reqs;
}
