import markdown
import os

with open("specification/MHS Curriculum Proposal.md", "r", encoding="utf-8") as f:
    text = f.read()

html_body = markdown.markdown(text, extensions=['tables'])

css = """
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1000px; margin: 0 auto; padding: 20px; }
h1, h2, h3 { color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 0.3em; margin-top: 1.5em; }
table { border-collapse: collapse; width: 100%; margin-bottom: 2em; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
th, td { border: 1px solid #e1e4e8; padding: 12px; text-align: left; }
th { background-color: #f6f8fa; font-weight: 600; }
tr:nth-child(even) { background-color: #fdfdfd; }
code { background-color: #f1f1f1; padding: 2px 4px; border-radius: 4px; font-family: monospace; }
</style>
"""

html_page = f"<!DOCTYPE html>\n<html>\n<head>\n<meta charset='utf-8'>\n<title>MHS Curriculum Proposal</title>\n{css}</head>\n<body>\n{html_body}\n</body>\n</html>"

with open("Docs/MHS_Curriculum_Proposal.html", "w", encoding="utf-8") as f:
    f.write(html_page)

print("HTML generated successfully.")
