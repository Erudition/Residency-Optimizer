import fs from 'fs';
import { getWeeklyViolations } from '../services/scheduler';
import { Resident, ScheduleGrid } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const activeYear = 2026;
const residentsList: Resident[] = data.residents;

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
         // Sanitize based on residency window
         const currentPgy = year - resident.startYear + 1;
         if (currentPgy < 1 || currentPgy > 3) return null;
      } else {
         // Unified mode check
         const globalYearIndex = Math.floor(index / 52);
         const yearOfBlock = startYear + globalYearIndex;
         const currentPgy = yearOfBlock - resident.startYear + 1;
         if (currentPgy < 1 || currentPgy > 3) return null;
      }
      return cell;
    });
  });
  return sanitized;
};

const grid = data.schedules['0'].data['2026'];
const sanitizedGrid = sanitizeScheduleGrid(grid, residentsList, 2026, 2026);

const constraints = getWeeklyViolations(residentsList, sanitizedGrid, 2026);
console.log('Sanitized grid constraints violations:', constraints.length);
const sum = constraints.reduce((s, v) => s + (v.instances !== undefined ? v.instances : 1), 0);
console.log('Instances sum:', sum);

