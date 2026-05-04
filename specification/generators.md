# Scheduling Generators

This document outlines the various scheduling algorithms used in the Residency Optimizer, their philosophies, and their implementation details.

## 1. Annealed Core Constraint Solver (ExactConstraintGenerator)

The **Annealed Core Constraint Solver** is the most advanced generator in the application. It uses a hybrid approach combining greedy initialization, simulated annealing, and deterministic heuristic repair to produce schedules with zero ACGME violations.

### Philosophy
- **Constraint Satisfaction first:** Prioritizes hospital staffing and ACGME requirement fulfillment as absolute "hard" constraints.
- **Incremental Optimization:** Uses incremental delta-tracking for penalties, allowing for extreme search depths (1M+ steps) within seconds.
- **Hybrid Strategy:** Uses a high-quality greedy baseline and refines it using stochastic and deterministic moves.

### Implementation Details
- **Multi-Seed Initialization:** Attempts 20-50 initial generations using the **Week-By-Week Generator** to find the most promising starting point.
- **Incremental Penalty Tracking:** Maintains O(1) state counters for weekly staffing levels and individual resident requirement fulfillment. This avoids full grid traversals during the annealing loop.
- **Move Set (Mutations):**
    - **1-Week Change:** Randomly reassigns one resident-week to a different valid rotation.
    - **2-Week Aligned Swap:** Swaps two 2-week blocks within a single resident's schedule, respecting the 4+1 clinic structure.
    - **Cross-Resident Swap:** Swaps a specific week's assignment between two residents of the same PGY level. This is "staffing-neutral" and helps satisfy individual educational targets without breaking hospital coverage.
- **Deterministic Fail-Safe (Staffing Sweep):** A final pass that identifies any remaining under-staffed or over-staffed rotations and deterministicly fixes them by reassigning flexible residents (those on Elective blocks).

### Penalty Weights
- **Staffing Violations:** 1,000,000,000 (Primary Priority)
- **Requirement Violations:** 1,000,000 (Secondary Priority)
- **Continuity Violations:** 10,000 (Tertiary Priority)

---

## 2. Week-By-Week Generator

A high-performance greedy algorithm that staffs the hospital sequentially, one week at a time.

### Philosophy
- **Staffing-Centric:** Ensures hospital minimums are met before addressing any other constraints.
- **Temporal Consistency:** Fills rotations in a "relay race" model, maintaining team stability across clinic transitions.

### Implementation Details
- **Sequential Placement:** Iterates from Week 0 to 51.
- **Critical Staffing First:** In each week, it fills mandatory inpatient rotations (MICU, Wards, NF, EM) before placing electives.
- **Requirement Awareness:** When multiple residents are available for a critical slot, it selects the one with the lowest cumulative count for that rotation type to ensure equitable requirement fulfillment.
- **Pre-calculation:** Pre-calculates historical requirement counts to optimize selection speed.

---

## 3. Education-First Generator

A stochastic generator that focuses on satisfying individual resident educational targets first, relying on residual capacity for hospital staffing.

### Philosophy
- **Resident-Centric:** Ensures every resident gets their mandatory subspecialty and core rotations before the pool is exhausted by hospital needs.

---

## 4. Stochastic Generator

A general-purpose generator that uses weighted randomness to explore valid slots.

### Philosophy
- **Exploration:** Good at finding non-obvious configurations by allowing the search to move through suboptimal states.
- **Balance:** Maintains a moderate performance across all metrics but often requires many attempts to reach zero violations.
