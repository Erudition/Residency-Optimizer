import os
import glob

for filepath in glob.glob('services/**/*.ts', recursive=True):
    with open(filepath, 'r') as f:
        content = f.read()
    if "\\'" in content:
        content = content.replace("\\'", "'")
        with open(filepath, 'w') as f:
            f.write(content)
