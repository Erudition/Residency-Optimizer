import os
import glob
import re

# 1. Fix scheduleFixture.ts
with open('tests/fixtures/scheduleFixture.ts', 'r') as f:
    fixture = f.read()
fixture = fixture.replace('fetchProgramData', 'loadProgramData')
fixture = fixture.replace('await loadProgramData()', 'await loadProgramData(2026)')
with open('tests/fixtures/scheduleFixture.ts', 'w') as f:
    f.write(fixture)

# 2. Fix compliance and diagnostic tests (import beforeAll)
for filepath in ['tests/compliance.test.ts', 'tests/diagnostic.test.ts', 'tests/perf_healer.test.ts', 'tests/stress.test.ts', 'services/scheduler.test.ts']:
    if not os.path.exists(filepath):
        continue
    with open(filepath, 'r') as f:
        content = f.read()
    
    if "const mockProgramData = getMockProgramData();" in content:
        content = content.replace("const mockProgramData = getMockProgramData();", "import { ProgramData } from '../services/api/client';\nlet mockProgramData: ProgramData;")
        content = re.sub(
            r"(describe\(['\"].*?['\"],\s*\(\)\s*=>\s*\{)",
            r"\1\n    beforeAll(async () => {\n        mockProgramData = await getMockProgramData();\n    });\n",
            content,
            count=1
        )
    
    # Add beforeAll import
    if "beforeAll" in content and "beforeAll" not in re.search(r'import\s+\{([^}]+)\}\s+from\s+[\'"]vitest[\'"]', content).group(1) if re.search(r'import\s+\{([^}]+)\}\s+from\s+[\'"]vitest[\'"]', content) else "":
        content = re.sub(r'import\s+\{([^}]+)\}\s+from\s+[\'"]vitest[\'"]', lambda m: f"import {{{m.group(1)}, beforeAll}} from 'vitest'", content)
    
    with open(filepath, 'w') as f:
        f.write(content)
