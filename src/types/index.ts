import type { IncomingMessage } from 'http';

export type Role = 'scheduler' | 'viewer';

export interface CrewProfile {
  key: string;
  displayName: string;
  telegramGroupId: string | null;
  language: 'en' | 'es' | 'pt';
  reliability: 'high' | 'medium' | 'low';
  strengths: string[];
  cautions: string[];
}

export interface Job {
  id: string;
  jobNumber: string;
  itemName: string;
  customerName: string | null;
  address: string | null;
  city: string | null;
  clientType: string | null;
  jobType: string | null;
  status: string | null;
  materialStatus: string | null;
  materialReady: boolean | null;
  equipmentNeeded: string[];
  trailerNeeded: string[];
  driverNeeded: boolean;
  logisticsStatus: string | null;
  promisedDate: string | null;
  notes: string | null;
  syncedAt: string;
}

export interface BriefJob {
  id: string;
  briefDate: string;
  crewKey: string;
  jobNumber: string | null;
  jobName: string;
  address: string | null;
  gateCode: string | null;
  supervisor: string | null;
  trailerType: string | null;
  tasks: string[];
  materials: Array<{ item: string; quantity: string }>;
  nextStop: string | null;
  riskFlags: string[];
  dispatchText: string;
  checkInStatus: string | null;
  lastCheckIn: string | null;
  approved: boolean;
  sentAt: string | null;
  annotations: string | null;
}

export interface Brief {
  date: string;
  generatedAt: string;
  approved: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
}

export interface ScheduleProposal {
  id: string;
  date: string;
  generatedAt: string;
  crewKey: string;
  jobNumber: string | null;
  jobName: string | null;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'rejected';
}

export interface Session {
  token: string;
  role: Role;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revoked: boolean;
}

export interface ScheduleRecord {
  weekName: string;
  gid: string;
  section: string;
  date: string;
  dayName: string;
  shortDay: string;
  dayIndex: number;
  crew: string;
  crewKey: string;
  crewCategory: string;
  reliability: 'high' | 'medium' | 'low';
  rowNumber: number;
  columnNumber: number;
  rawAssignment: string;
  assignment: string;
  status: 'assigned' | 'blank' | 'off' | 'placeholder';
  jobNumbers: string[];
  clientTypes: string[];
  inferredJobTypes: string[];
}

export interface AuthenticatedRequest extends IncomingMessage {
  role: Role;
  sessionToken: string;
}
