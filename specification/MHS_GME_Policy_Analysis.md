# MHS GME Policy Analysis (2025-2027)

This document extracts specific scheduling and operational constraints from the MHS GME Policy and Procedure documents (Progressive Autonomy and Time Away Request Form) that impact the residency scheduling engine.

## 1. Ambulatory Clinic Processing & Constraints (Progressive Autonomy Policy)

These constraints must be factored into clinic capacity modeling and "+1" continuity week throughput:

*   **Clinic Sessions:** A standard clinic day consists of two sessions. Each session represents a half-day (4 hours).
*   **Attending Ratios:** The maximum staffing ratio is **1 attending provider to 2–4 residents** per clinic session.
*   **PGY-Based Patient Caps:** Clinic scheduling blocks must respect scaling patient volumes:
    *   **PGY-1:** 2 to 3 visits per session for the first 6 months, scaling to 4 visits per session thereafter.
    *   **PGY-2:** 6 scheduled visits per session.
    *   **PGY-3:** 8 scheduled visits per session.
*   **Mentorship Meetings:** Interns require a dedicated senior resident and attending mentor. A scheduling mechanism must track or accommodate quarterly private meetings to ensure compliance.

## 2. Time Away & Vacation Mapping (Time Away Request Form)

These explicit rules dictate when and how residents can take PTO, most of which align with our 4+1 curriculum structure:

*   **Blackout Dates Engine Variable:** The system must hard-block any PTO approvals during these transition periods:
    *   **June 22 – July 10**
    *   **August 10 – August 31**
*   **Prohibited Rotations:** Block generation logic must flag an error if a resident is mapped for PTO while assigned to Wards, ICU, or their "+1" CCIM continuity clinic. PTO must strictly fall on flexible elective or consult blocks.
*   **Weekend Bridging:** Vacation must be taken on consecutive days attached to a weekend. Weekends are counted as standard days off, not PTO.
*   **Lead Time Protocol:** The system should implement a validation check requiring a minimum **60-day notice** for PTO requests.

## 3. Duty Hours
Any algorithms mapping shifts (especially for Night Float and ICU) must adhere to:
*   Maximum **80 hours** per week, averaged over a 4-week period.
*   Maximum **24 consecutive hours** of scheduled clinical assignments (plus up to 4 additional hours for care transition).
*   Residents must be provided at least **1 day off in 7**, averaged over a 4-week period.

