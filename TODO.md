merge all upstream changes cleanly

take note of the new theme



...Wait, did you just change the code so that the "Wards Red" label says "Wards (All)", without actually making sure that what it's counting refers to all? Wards red should not be named Wards all. If this was definitely the way to do it, then change the label to just Wards for that particular column.

Change the historic/current year tabs to have the "AY" prefix. Add " (-2y)" after the tab title of the tab 2 years back, " (-1y)" after the tab title for the tab 1 year back, and " (Current)" to the title for the current academic year.

Make sure the Schedule/Workload/Assignments/etc tab row is not visible on the "New" Tab, it doesn't apply there. Also, let's rename that "New" tab to "Generate".

When generating schedules, the loading screen appears for a while, and the progress moves a certain percentage, but long before it's done, the tab exits and goes to a single new schedule tab, which is blank. The loading progress is then totally invisible. Eventually, it must have finished, because a schedule appears in that tab, but there is no reason it should be switching away from that loading screen when it's in the middle of generating.

Even when it does generate a future schedule though, there is only the upcoming academic year. When toggled to the year after, or the third one after that, they're just blank. Is there a supposed to be a way to generate them on demand, or is the data just not showing?

Also, make sure that these years that are further in the future, do not list residents who have already graduated by that year.

Move the settings cog tab to the top right corner rather than the top left, putting it last in the tab row, just past the Generate tab.

Move the Residents Settings screen to be its own tab in the top bar, furhtest right where the settings cog was. It should just be an icon tab, a people group or doctor icon.  Rather than having them all in one list, make separate vertical columns (like swim lanes) across the width of the page for each graduating class, and scrolling sideways if needed.  Eliminate the Cohort data and selector, since that is year-specific information that will now go in the year tabs.

Instead, "Cohorts" should be its own sub tab in the year tabs, first in line, to the left of "Schedule". This should have 5 swim lanes, with cards representing each resident, like a kanban board. Each cohort column should have a different background hue, and the resident card should show PGY status, start year, grad year.