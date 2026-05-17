import os
import glob
import re

# 1. Restore scheduleFixture.ts
with open('tests/fixtures/scheduleFixture.ts', 'r') as f:
    fixture = f.read()

fixture = re.sub(
    r'import \{ ProgramData, fetchProgramData \} from \'\.\./\.\./services/api/client\';.*?\}',
    '',
    fixture,
    flags=re.DOTALL
)
fixture = re.sub(
    r'import \{ ProgramData, loadProgramData \} from \'\.\./\.\./services/api/client\';.*?\}',
    '',
    fixture,
    flags=re.DOTALL
)

fixture += '''
import { ProgramData } from '../../services/api/client';
export const getMockProgramData = (): ProgramData => {
  const mockRotations = new Map<string, any>();
  const originalGet = mockRotations.get.bind(mockRotations);
  mockRotations.get = (key: string) => {
    return originalGet(key) || { codename: key, intensity: 1, duration: 4, setting: 'INPATIENT', requirementTags: [] };
  };
  return {
    rotations: mockRotations as any,
    cycleConfig: { cohortCount: 5, X: 4, Y: 1, Z: 5, assignments: {} },
    residents: [],
    gradRequirements: [],
    avoidanceRules: [],
    tags: [],
    hueMap: new Map(),
    rotationTags: new Map(),
    placeholderCodenames: new Set(),
    flexibleCodenames: new Set()
  };
};
'''
with open('tests/fixtures/scheduleFixture.ts', 'w') as f:
    f.write(fixture)

# 2. Revert tests to synchronous
for filepath in glob.glob('tests/*.test.ts') + ['services/scheduler.test.ts']:
    if not os.path.exists(filepath):
        continue
    with open(filepath, 'r') as f:
        content = f.read()

    # Revert 'let mockProgramData...' and beforeAll
    content = re.sub(r'import \{ ProgramData \} from \'\.\./services/api/client\';\nlet mockProgramData: ProgramData;\n', '', content)
    content = re.sub(r'import \{ ProgramData \} from \'\.\./\.\./services/api/client\';\nlet mockProgramData: ProgramData;\n', '', content)
    content = re.sub(r'\s*beforeAll\(async \(\) => \{\s*mockProgramData = await getMockProgramData\(\);\s*\}\);\s*', '\n', content)
    
    # Restore the global const
    if "const mockProgramData = getMockProgramData();" not in content and "mockProgramData" in content:
        # insert at the top
        content = content.replace("import { getMockProgramData } from './fixtures/scheduleFixture';", "import { getMockProgramData } from './fixtures/scheduleFixture';\nconst mockProgramData = getMockProgramData();\n")
        content = content.replace("import { getMockProgramData } from '../tests/fixtures/scheduleFixture';", "import { getMockProgramData } from '../tests/fixtures/scheduleFixture';\nconst mockProgramData = getMockProgramData();\n")

    # If it was a file that didn't have the import (e.g. stress.test.ts), we need to add the import and definition
    if 'stress.test.ts' in filepath or 'perf_healer.test.ts' in filepath:
        if 'getMockProgramData' not in content:
            content = "import { getMockProgramData } from './fixtures/scheduleFixture';\nconst mockProgramData = getMockProgramData();\n" + content

    with open(filepath, 'w') as f:
        f.write(content)
