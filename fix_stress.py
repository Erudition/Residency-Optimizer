import os
import glob
import re

for filepath in glob.glob('tests/*.test.ts') + ['services/scheduler.test.ts']:
    if not os.path.exists(filepath):
        continue
    with open(filepath, 'r') as f:
        content = f.read()

    # Replace '{} as any' with 'mockProgramData' in getRequirementViolations and getWeeklyViolations and generate calls
    content = content.replace("{} as any", "mockProgramData")
    
    # Also in gen.generate(yearResidents, {}, 0, priorCounts, cohortAssignments) -> we need the 6th arg to be mockProgramData
    content = re.sub(
        r'gen\.generate\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)',
        r'gen.generate(\1, \2, \3, \4, \5, mockProgramData)',
        content
    )
    
    with open(filepath, 'w') as f:
        f.write(content)

