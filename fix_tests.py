import os
import glob
import re

for filepath in glob.glob('tests/*.test.ts'):
    with open(filepath, 'r') as f:
        content = f.read()

    if "const mockProgramData = getMockProgramData();" in content:
        # replace the global definition with let mockProgramData: any;
        content = content.replace("const mockProgramData = getMockProgramData();", "import { ProgramData } from '../services/api/client';\nlet mockProgramData: ProgramData;")
        
        # Add beforeAll at the beginning of the top-level describe
        # or just before the first test
        # We can just insert it after the first describe('...', () => {
        content = re.sub(
            r"(describe\(['\"].*?['\"],\s*\(\)\s*=>\s*\{)",
            r"\1\n    beforeAll(async () => {\n        mockProgramData = await getMockProgramData();\n    });\n",
            content,
            count=1
        )
        
    with open(filepath, 'w') as f:
        f.write(content)
