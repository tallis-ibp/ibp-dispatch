import type { CrewProfile } from '../types/index.js';

export const DEFAULT_SHEET_ID = '1516H1ZQImJ4arKe6wYeFMqFw6V_-697QM-HiBs7qOY8';
export const DEFAULT_YEAR = 2026;

/** Column descriptor for parsing the Google Sheet CSV layout. */
export interface DayColumnDescriptor {
  dayName: string;
  shortDay: string;
  dayIndex: number;
  /** 0-based CSV column index for the assignment cell */
  colIndex: number;
  /** 0-based CSV column index for the crew name cell */
  crewColIndex: number;
}

/** All seven day columns as they appear in the schedule CSV. */
export const DAY_COLUMN_LIST: DayColumnDescriptor[] = [
  { dayName: 'Monday',    shortDay: 'Mon', dayIndex: 0, colIndex: 1, crewColIndex: 0 },
  { dayName: 'Tuesday',   shortDay: 'Tue', dayIndex: 1, colIndex: 2, crewColIndex: 0 },
  { dayName: 'Wednesday', shortDay: 'Wed', dayIndex: 2, colIndex: 3, crewColIndex: 0 },
  { dayName: 'Thursday',  shortDay: 'Thu', dayIndex: 3, colIndex: 5, crewColIndex: 4 },
  { dayName: 'Friday',    shortDay: 'Fri', dayIndex: 4, colIndex: 6, crewColIndex: 4 },
  { dayName: 'Saturday',  shortDay: 'Sat', dayIndex: 5, colIndex: 7, crewColIndex: 4 },
  { dayName: 'Sunday',    shortDay: 'Sun', dayIndex: 6, colIndex: 8, crewColIndex: 4 },
];

export const CREW_PROFILES: Record<string, CrewProfile> = {
  santiago: {
    key: 'santiago',
    displayName: 'Santiago (Pavers)',
    telegramGroupId: null,
    language: 'es',
    reliability: 'high',
    strengths: ['pool builder decks', 'retail decks', 'coping', 'deck install', 'large jobs', 'gated communities'],
    cautions: [],
  },
  penna: {
    key: 'penna',
    displayName: 'Penna (Pavers, Detailed Jobs)',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'low',
    strengths: ['stepping stones', 'turf', 'retaining walls', 'coping', 'tri-level pool decks', 'pavers', 'detailed paver work', 'precision patterns'],
    cautions: ['High-quality work but unreliable; avoid putting him on critical-path work without backup.', 'do not assign large slab installs', 'no gooseneck jobs'],
  },
  waype: {
    key: 'waype',
    displayName: 'Waype (Pavers)',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['production builder work', 'decks', 'pavers', 'deck install', 'large jobs', 'gooseneck capable'],
    cautions: [],
  },
  ludwing_tarcizio: {
    key: 'ludwing_tarcizio',
    displayName: 'Ludwing / Tarcizio',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['sealers', 'warranty', 'customer service', 'billable repair work orders', 'painting'],
    cautions: [],
  },
  mario_wilcher: {
    key: 'mario_wilcher',
    displayName: 'Mario / Wilcher',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['repair work', 'sealers', 'small projects', 'small jobs'],
    cautions: [],
  },
  felipe_miliati: {
    key: 'felipe_miliati',
    displayName: 'Felipe Miliati',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['repair work', 'small work'],
    cautions: ['Works alone; bigger work needs helpers.'],
  },
  others: {
    key: 'others',
    displayName: 'Others',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'low',
    strengths: ['one-off work', 'temporary crews'],
    cautions: ['Needs a named owner before dispatch.'],
  },
  ysaias: {
    key: 'ysaias',
    displayName: 'Ysaias (Paver Detailed Jobs)',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['paver detail work', 'farther jobs when appropriate'],
    cautions: [],
  },
  wanderson: {
    key: 'wanderson',
    displayName: 'Wanderson (Paver Detailed Jobs)',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['paver detail work', 'detailed paver work'],
    cautions: [],
  },
  marcelao: {
    key: 'marcelao',
    displayName: 'Marcelao (Pavers Big Jobs)',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['big paver jobs', 'big slab jobs', 'gooseneck capable', 'large installs'],
    cautions: [],
  },
  fausto: {
    key: 'fausto',
    displayName: 'Fausto (Coping)',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'high',
    strengths: ['coping', 'pool edge work'],
    cautions: ['coping and tile only'],
  },
  toby: {
    key: 'toby',
    displayName: 'Toby (Coping and Tile)',
    telegramGroupId: null,
    language: 'en',
    reliability: 'high',
    strengths: ['coping', 'tile', 'shower', 'backsplash'],
    cautions: ['coping and tile only'],
  },
  bruno_pacheco: {
    key: 'bruno_pacheco',
    displayName: 'Bruno Pacheco',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['tile', 'service'],
    cautions: [],
  },
  mauro_tile: {
    key: 'mauro_tile',
    displayName: 'Mauro Tile Crew',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['tile'],
    cautions: [],
  },
  marcelo_master_care: {
    key: 'marcelo_master_care',
    displayName: 'Marcelo Master Care',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['service', 'repair'],
    cautions: [],
  },
  gervin_julio: {
    key: 'gervin_julio',
    displayName: 'Gervin / Julio',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['service', 'repair'],
    cautions: [],
  },
  gilberto: {
    key: 'gilberto',
    displayName: 'Gilberto',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['general paver work'],
    cautions: [],
  },
};

export const DAY_COLUMNS = {
  leftSection: ['Monday', 'Tuesday', 'Wednesday'],
  rightSection: ['Thursday', 'Friday', 'Saturday', 'Sunday'],
};

export const JOB_TYPE_KEYWORDS: Record<string, string[]> = {
  'sealer/wash': ['seal', 'sealer', 'lavar', 'pressure wash', 'wash'],
  'coping': ['coping'],
  'tile': ['tile', 'spa', 'backsplash'],
  'pavers/deck': ['deck', 'paver', 'pavers', 'driveway', 'walkway', 'front porch', 'sunck', 'sinking'],
  'turf': ['turf'],
  'wall': ['wall', 'retaining'],
  'concrete': ['concrete', 'footer', 'turndown', 'pump'],
  'repair/service': ['repair', 'replace', 'fix', 'warranty', 'service', 'loose', 'broken'],
};

export function inferJobTypes(text: string): string[] {
  const upper = normalizeName(text);
  const types = new Set<string>();

  if (/\bSEAL|SEALER|LAVAR|PRESSURE WASH|WASH\b/.test(upper)) types.add('sealer/wash');
  if (/\bCOPING\b/.test(upper)) types.add('coping');
  if (/\bTILE|SPA|BACKSPLASH\b/.test(upper)) types.add('tile');
  if (/\bDECK|PAVER|PAVERS|DRIVEWAY|WALKWAY|FRONT PORCH|SUNCK|SINKING\b/.test(upper)) types.add('pavers/deck');
  if (/\bTURF\b/.test(upper)) types.add('turf');
  if (/\bWALL|RETAINING\b/.test(upper)) types.add('wall');
  if (/\bCONCRETE|FOOTER|TURNDOWN|PUMP\b/.test(upper)) types.add('concrete');
  if (/\bREPAIR|REPLACE|FIX|WARRANTY|SERVICE|LOOSE|BROKEN\b/.test(upper)) types.add('repair/service');

  return [...types];
}

export function normalizeName(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export function inferClientTypeFromJobNumber(jobNumber: string | number | null | undefined): string {
  const number = String(jobNumber || '').replace(/\D/g, '');
  if (!number) return 'unknown';
  if (number.startsWith('17')) return 'retail or service client';
  if (number.startsWith('28')) return 'builder/project client';
  if (number.startsWith('30')) return 'pool builder or production client';
  if (number.startsWith('60')) return 'special/client type code 60';
  if (number.startsWith('80')) return 'internal/commercial/special code 80';
  if (number.startsWith('57')) return 'builder/project client';
  if (number.startsWith('27')) return 'retail or legacy client';
  return 'unknown';
}

export const WAREHOUSE_ADDRESS = '5224 Goddard Ave, Orlando FL 32822';

// ---------------------------------------------------------------------------
// Crew name → profile lookup (mirrors src/config.mjs getCrewProfile logic)
// ---------------------------------------------------------------------------

interface CrewNameEntry {
  key: string;
  names: string[];
  category: string;
}

const CREW_NAME_MAP: CrewNameEntry[] = [
  { key: 'santiago',         names: ['SANTIAGO (PAVERS)', 'SANTIAGO'],                                               category: 'deck crew' },
  { key: 'penna',            names: ['PENNA (PAVERS, DETAILED JOBS)', 'PENNA'],                                       category: 'multi-skill subcontractor' },
  { key: 'waype',            names: ['WAYPE (PAVERS)', 'WAYPE (PAVERS) (TRABAJOS PEQUENOS)', 'WAYPE'],               category: 'production deck crew' },
  { key: 'ludwing_tarcizio', names: ['LUDWING / TARCIZIO'],                                                           category: 'service, sealer, warranty' },
  { key: 'mario_wilcher',    names: ['MARIO / WILCHER'],                                                              category: 'repair and sealer team' },
  { key: 'felipe_miliati',   names: ['FELIPE MILIATI'],                                                               category: 'solo repair crew' },
  { key: 'others',           names: ['OTHERS'],                                                                       category: 'irregular crew' },
  { key: 'ysaias',           names: ['YSAIAS (PAVER DETAILED JOBS)', 'ISAÍAS', 'ISAIAS', 'YSAIAS'],                  category: 'paver detail crew' },
  { key: 'wanderson',        names: ['WANDERSON (PAVER DETAILED JOBS)', 'WANDERSON'],                                 category: 'paver detail crew' },
  { key: 'marcelao',         names: ['MARCELAO (PAVERS BIG JOBS)', 'MARCELAO'],                                       category: 'large paver crew' },
  { key: 'fausto',           names: ['FAUSTO (COPING)', 'FAUSTO'],                                                    category: 'coping crew' },
  { key: 'toby',             names: ['TOBY (COPING AND TILE)', 'TOBY'],                                               category: 'coping and tile crew' },
  { key: 'bruno_pacheco',    names: ['BRUNO PACHECO'],                                                                category: 'tile/service' },
  { key: 'mauro_tile',       names: ['MAURO TILE CREW (PER JOB OR DAY)', 'MAURO TILE CREW'],                         category: 'tile crew' },
  { key: 'marcelo_master_care', names: ['MARCELO MASTER CARE'],                                                       category: 'service/repair' },
  { key: 'gervin_julio',     names: ['GERVIN / JULIO'],                                                               category: 'service/repair' },
  { key: 'gilberto',         names: ['GILBERTO'],                                                                     category: 'other/specialty' },
];

const PROFILE_BY_NORMALIZED_NAME = new Map<string, CrewNameEntry>();
for (const entry of CREW_NAME_MAP) {
  for (const name of entry.names) {
    PROFILE_BY_NORMALIZED_NAME.set(normalizeName(name), entry);
  }
}

export interface ResolvedCrewProfile {
  key: string;
  category: string;
  reliability: 'high' | 'medium' | 'low';
}

export function getCrewProfile(crewName: string): ResolvedCrewProfile {
  const normalized = normalizeName(crewName);

  // Exact match
  const exact = PROFILE_BY_NORMALIZED_NAME.get(normalized);
  if (exact) {
    return {
      key: exact.key,
      category: exact.category,
      reliability: (CREW_PROFILES[exact.key]?.reliability ?? 'medium') as 'high' | 'medium' | 'low',
    };
  }

  // Partial match
  for (const entry of CREW_NAME_MAP) {
    if (
      entry.names.some(
        (n) => normalized.includes(normalizeName(n)) || normalizeName(n).includes(normalized),
      )
    ) {
      return {
        key: entry.key,
        category: entry.category,
        reliability: (CREW_PROFILES[entry.key]?.reliability ?? 'medium') as 'high' | 'medium' | 'low',
      };
    }
  }

  return {
    key: 'unknown',
    category: 'unknown',
    reliability: 'medium',
  };
}
