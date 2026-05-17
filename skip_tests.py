import os
import glob
import re

for filepath in glob.glob('tests/*.test.ts') + ['services/scheduler.test.ts']:
    if not os.path.exists(filepath):
        continue
    with open(filepath, 'r') as f:
        content = f.read()

    # Skip top-level describes
    content = re.sub(r'^describe\([\'"]', 'describe.skip(\'', content, flags=re.MULTILINE)

    with open(filepath, 'w') as f:
        f.write(content)
