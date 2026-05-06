import fs from 'fs';
import { getWeeklyViolations } from '../services/scheduler';
import { Resident, ScheduleGrid } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const activeYear = 2026;
const residents: Resident[] = data.residents;
const activeSchedule = data.schedules['0'];

const getResidentsForYear = (year: number) => {
    return residents.filter(r => {
        const pgy = year - r.startYear + 1;
        return pgy >= 1 && pgy <= 3;
    });
};

const activeResidents = getResidentsForYear(activeYear);
console.log('Active residents count:', activeResidents.length);

const sanitizeScheduleGrid = (
  grid: ScheduleGrid,
  residentsList: Resident[],
  year?: number,
  startYear: number = 2026
): ScheduleGrid => {
  if (!grid || typeof grid !== 'object') return grid;

  const residentsMap = new Map<string, Resident>();
  if (Array.isArray(residentsList)) {
    residentsList.forEach(r => {
      residentsMap.set(r.id, r);
      residentsMap.set(r.name, r);
    });
  }

  const sanitized: ScheduleGrid = {};
  Object.entries(grid).forEach(([residentId, weeks]) => {
    let resident = residentsMap.get(residentId);
    if (!resident) return;

    if (!Array.isArray(weeks)) return;

    sanitized[resident.id] = weeks.map((cell, index) => {
      if (!cell) return null;
      if (year) {
         const currentPgy = year - resident.startYear + 1;
         if (currentPgy < 1 || currentPgy > 3) return null;
      }
      return cell;
    });
  });
  return sanitized;
};

// This is how displayGrid is sanitized during import:
const sanitizedGrid = sanitizeScheduleGrid(activeSchedule.data['2026'], residents, 2026, 2026);

// This is how getWeeklyViolations is called in App.tsx (L716):
// getWeeklyViolations(activeResidents, currentGrid)
const constraints = getWeeklyViolations(activeResidents, sanitizedGrid, 2026);
console.log('Constraints violations:', constraints.length);
const sum = constraints.reduce((s, v) => s + (v.instances !== undefined ? v.instances : 1), 0);
console.log('Instances sum:', sum);
