import { ProgramData } from '../../services/api/client';

export function buildLevelRequirements(programData: ProgramData, level: number): { type: string, label: string, minWeeks: number, source: string }[] {
    const reqs: { type: string, label: string, minWeeks: number, source: string }[] = [];
    
    // Convert gradRequirements into the shape generators expect
    programData.gradRequirements.forEach(r => {
        let ideal = 0;
        if (level === 1) ideal = r.pgy1Ideal || 0;
        else if (level === 2) ideal = r.pgy2Ideal || 0;
        else if (level === 3) ideal = r.pgy3Ideal || 0;
        
        // If ideal is specified per PGY level, use that. If not, if the source is MHS, use minimum for the year.
        if (ideal === 0 && r.source === 'MHS' && r.minimum > 0) {
           // MHS requirements without specific ideals apply annually, so we assign the minimum.
           ideal = r.minimum;
        }

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

