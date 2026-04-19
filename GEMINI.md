# Additional ACGME & Scheduling Constraints

The core curriculum proposal outlines *what* blocks the residents must take, but there are several critical operational and ACGME scheduling constraints discussed during our conversation that must be factored into the underlying logic of the `Residency-Optimizer` application. 

Here are the rules that must govern the schedule generation:

## 1. 4+1 Cohort Division Logic
To seamlessly execute a 4+1 block schedule while keeping both the inpatient services and the outpatient clinics staffed properly year-round:
*   The residency class must be divided into **5 equal cohorts** (e.g., Cohorts A, B, C, D, and E).
*   Each week, exactly one cohort will be rotating through their `+1` ambulatory continuity clinic, while the other four are on their 4-week core inpatient assignments. 

## 2. Inpatient Patient Census Caps (Wards)
When your program generates daily team assignments and accepts admissions, ACGME enforces strict patient volume limits based on PGY level:

**PGY-1 (Interns):**
*   **Admissions:** Maximum 5 new patients assigned per admitting day (plus up to 2 in-house transfers).
*   **Short-term cap:** Maximum 8 new patients in any 48-hour period.
*   **Ongoing scale:** Maximum 10 total patients for ongoing care at any given time.

**PGY-2 or PGY-3 (Residents) Supervising PGY-1s:**
*   *If supervising ONE intern:* Maximum 14 total patients for ongoing care.
*   *If supervising MULTIPLE interns:* 
    *   Maximum 10 new patients (+4 transfers) per admitting day.
    *   Maximum 16 new patients in any 48-hour period.
    *   Maximum 20 total patients for ongoing care.

## 3. Clinic Faculty Ratios
During outpatient staffing, specific ratios must be maintained:
*   Standard precepting: **1 faculty member to 4 learners**.
*   If the faculty member is concurrently managing their own patient panel: **1 faculty member to 2 learners**.

## 4. Duty Hours
Any algorithms mapping shifts (especially for Night Float and ICU) must adhere to:
*   Maximum **80 hours** per week, averaged over a 4-week period.
*   Maximum **24 consecutive hours** of scheduled clinical assignments (plus up to 4 additional hours for care transition).
*   Residents must be provided at least **1 day off in 7**, averaged over a 4-week period.

## 5. Subspecialty Auditing List
While the curriculum leaves space for "Subspecialties", the ACGME requires that the program offers and successfully rotates residents through experiences covering all nine ABIM internal medicine subspecialties. Your app should ensure the availability/tracking of:
1.  Cardiology
2.  Endocrinology
3.  Gastroenterology
4.  Hematology 
5.  Medical Oncology (Usually paired as Heme-Onc)
6.  Infectious Disease
7.  Nephrology
8.  Pulmonology
9.  Rheumatology

## 6. Rotation Month Minimums & Maximums
Based on ACGME Program Requirements (Section 4):
*   **Total Clinical Experiences:** Minimum of 30 months overall.
*   **Inpatient and Critical Care Elements:** Minimum of 10 months.
*   **Critical Care Specifics:** Minimum of 2 months and a Maximum of 6 months. Must not occur solely in PGY-1.
*   **Outpatient/Ambulatory:** Minimum of 10 months foundational experiences.
*   **Individualized Experiences:** At least 6 months directed to future practice.

## 7. Mandatory Multidisciplinary Clinical Experiences
The program rules require that your application include routing logic ensuring that every single resident accomplishes dedicated clinical experiences in:
*   Geriatric Medicine
*   Hospice and Palliative Medicine
*   Addiction Medicine
*   Emergency Medicine
*   Neurology
