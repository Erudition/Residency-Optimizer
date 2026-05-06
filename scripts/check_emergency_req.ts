import { AssignmentType } from "../types";
import { RequirementsEngine } from '../services/requirementsEngine';
import fs from 'fs';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);
const grid = data.schedules['0'].data['2026'];

const emergencyReq = RequirementsEngine.getViolations([], {}, {}, 2026).find(v => v.type === AssignmentType.EM);
console.log('Emergency Req Definition:', emergencyReq);
