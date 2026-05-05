# Handling Special Circumstances

This document specifies how the scheduling engine should handle residents whose training path deviates from the standard 3-year PGY-1 → PGY-2 → PGY-3 progression at MHS. These cases affect whole-program requirement tracking and milestone calculations.

---

## 1. Repeating a PGY Year ("Being Held Back")

A resident may be required to repeat a PGY year due to academic remediation, exam failure, or other program-level decisions.

**Questions for Hunter:**
- How common is this? Has it happened at MHS?
      *Not common. No examples at MHS. I would guess it happens to one resident per 2-3 years at a established program.*
- When a resident repeats (say) PGY-1, do they redo the full PGY-1 curriculum, or is it a modified schedule?
      *Generally don't repeat a year. Just redo the rotations they missed or where their performance was not satisfactory. Often the program works hard for them to graduate on time (compresses other elements of their schedule and resident experience). If not, sometimes their graduation is pushed off by a month or six during which they continue to work as a resident. Sometimes, I have seen residents need so much leave that they lost a pgy year and restarted in sync with a future residency class, but such situations only occur when they were absent from a majority of required rotations. Wholesale repeats of years generally do not happen unless residents get fired and have to start over at another residency from scratch*
- Does the repeated year's rotations count toward whole-program limits (e.g., critical care maximum of 6 months)?
      *Only rotations in which they fulfilled requirements. As above, repeating years is an exceptional circumstance. It's not like getting held back in elementary school.*
- Does this extend their total residency to 4 years, or does it compress the remaining years?
      *Individual, but, as above, programs work hard for their residents to graduate and extend only if they need to. I have seen/heard of situations where residents whose circumstances required extended leave have sometimes skipped the rest of the year and just restarted with the next residency class. I think this would best be handled by our resident management system rather than by the scheduling engine.* 

---

## 2. Transfer Students (Mid-Residency Arrival from Another Program)

A resident transfers into MHS from another Internal Medicine residency program, typically entering at PGY-2 or PGY-3. Their prior program may have had a different curriculum structure, meaning they arrive with a non-standard set of completed rotations.

**Questions for Hunter:**
- How are incoming transfer credits evaluated? Is there a formal mapping from their prior rotations to MHS equivalents?
      *Completed ACGME requirements need not be repeated. The potential variables in rotation completeing inevitably require an individualized approach to their future schedules. A system where they could mark off what requirements they have completed would be ideal, but may not be a priority at the moment*
- What documentation arrives with the transfer (e.g., a list of completed rotations, weeks per rotation, ACGME milestone evaluations)?
      *a list of completed rotations, likely weeks completed, along with milestone evaluations. New programs generally have discretion about whether these transfer or whether residents must repeat. Caps regarding critical care time, night float would still apply. But if the MHS scheduling system required, for example, a PGY3 to complete more time in cardiology or pulmonology their PGY3 year and a resident had already met ACGME requirements for completing these rotations, the program would have discretion. They could schedule the resident in these rotations if the scheduling system required it, 'to work' (because of supervision requirements or whatever), or accept that they had already compeleted the requirement and use that time to make up rotations that they might have missed. The prerogative of graduating the resident on time, completeting ACGME core requirements should be the overriding concern.*
- If a transfer student is missing a rotation that MHS normally handles in an earlier PGY year (e.g., Neurology in PGY-2), is it simply added to their remaining schedule, or does it require program director approval?
      *I would say it should just get scheduled, even if that means bumping an younger resident from that experience so that they needed to complete it in a later year*
- Are there any rotations that MHS considers non-transferable (must be done at MHS regardless of prior experience)?
      *Not at this time. But probably, staffing/supervision concerns should be second to ACGME common core requirements in making schedules, respecting limits on experiences such as night float, crit care, etc...*

---

## 3. Post-Hoc Schedule Disruptions (Leave of Absence, Maternity/Parental Leave, Unplanned Absences)

After a schedule has been generated and partially executed, a resident may need extended time away due to parental leave, medical leave, or other unforeseen circumstances. This can invalidate previously-satisfied per-year requirements and create whole-program deficits.

**Questions for Hunter:**
- The MHS Curriculum already defines a "Competency Override" (3 of 4 weeks = sufficient for a 4-week block) and a "Minimum Threshold Flag" (1 of 2 weeks on a split block = must redo). Are there additional rules beyond these?
      *Just ACGME common program requirements, e.g. inpatient experience requirements (min 10 months or 40 weeks which are satisfied by any inpatient rotation--wards, ICU, or consults). Further policies are likely to be made as new/unforceseen situations arise.*
- When a resident returns from extended leave, who decides which elective blocks are converted to makeup rotations — the program director, the chief resident, or automated scheduling?
      *This is a good question. I would like to say that the engine should feel free to schedule make-up blocks; however, the stakes may be so high on this decision that it might be wise to have a human confirm AI choices.*
- Is there a maximum leave duration beyond which the resident is required to extend their training (adding a 4th year)?
      *I think we could calculate that based on ACGME common core requirements, but I am not sure exactly how. It probably depends on at what point they take their leave and what they have completed. The way to make up time would be to use elective time to fulfill ACGME requirements for graduation over resident self-directed time. Considering 8 weeks of elective time PGY2, 8 - 12 weeks PGY3, it seems likely that leave >16 weeks would require extension of training. Must be determined on a case-by-case basis.*
- How does leave interact with the ACGME critical care cap? (e.g., if leave wipes out an ICU block, the makeup adds to cumulative critical care — could this push someone near the 6-month max?)
      *Missed rotations, rotations in which residents did not meet expectations/milestones do not count toward these caps, these times.*
