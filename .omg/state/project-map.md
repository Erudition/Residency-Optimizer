# Project Map
- **Entry**: `index.tsx` -> `App.tsx` -> `components/Dashboard.tsx`
- **Modules**:
  - `components/`: UI layer (React components)
  - `services/`: Logic layer (Schedulers, Generators, Backups)
  - `specification/`: Domain knowledge and policy constraints (Markdown/JSON)
  - `tests/`: Vitest test suites
- **Dependency Hotspots**: 
  - `specification/` is imported by `services/` logic.
  - `services/scheduler.ts` depends on all generator plugins.
