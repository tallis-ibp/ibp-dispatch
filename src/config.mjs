export const DEFAULT_SHEET_ID = "1516H1ZQImJ4arKe6wYeFMqFw6V_-697QM-HiBs7qOY8";
export const DEFAULT_YEAR = 2026;

export const DAY_COLUMNS = [
  { dayName: "Monday", shortDay: "Mon", dayIndex: 0, colIndex: 1, crewColIndex: 0 },
  { dayName: "Tuesday", shortDay: "Tue", dayIndex: 1, colIndex: 2, crewColIndex: 0 },
  { dayName: "Wednesday", shortDay: "Wed", dayIndex: 2, colIndex: 3, crewColIndex: 0 },
  { dayName: "Thursday", shortDay: "Thu", dayIndex: 3, colIndex: 5, crewColIndex: 4 },
  { dayName: "Friday", shortDay: "Fri", dayIndex: 4, colIndex: 6, crewColIndex: 4 },
  { dayName: "Saturday", shortDay: "Sat", dayIndex: 5, colIndex: 7, crewColIndex: 4 },
  { dayName: "Sunday", shortDay: "Sun", dayIndex: 6, colIndex: 8, crewColIndex: 4 }
];

export const CREW_PROFILES = [
  {
    key: "santiago",
    names: ["SANTIAGO (PAVERS)", "SANTIAGO"],
    displayName: "Santiago",
    category: "deck crew",
    typicalSize: 3,
    reliability: "high",
    strengths: ["pool builder decks", "retail decks", "coping"],
    cautions: [],
    schedulingNotes: "One of the strongest crews: efficient, good quality, on time."
  },
  {
    key: "penna",
    names: ["PENNA (PAVERS, DETAILED JOBS)", "PENNA"],
    displayName: "Penna",
    category: "multi-skill subcontractor",
    typicalSize: 2,
    reliability: "low",
    strengths: ["stepping stones", "turf", "retaining walls", "coping", "tri-level pool decks", "pavers"],
    cautions: ["High-quality work but unreliable; avoid putting him on critical-path work without backup."],
    schedulingNotes: "Flexible and high quality, but dependability is the risk."
  },
  {
    key: "waype",
    names: ["WAYPE (PAVERS)", "WAYPE (PAVERS) (TRABAJOS PEQUENOS)", "WAYPE"],
    displayName: "Waype",
    category: "production deck crew",
    typicalSize: null,
    reliability: "normal",
    strengths: ["production builder work", "decks", "pavers"],
    cautions: [],
    schedulingNotes: "Better fit for production builder work."
  },
  {
    key: "ludwing_tarcizio",
    names: ["LUDWING / TARCIZIO"],
    displayName: "Ludwing / Tarcizio",
    category: "service, sealer, warranty",
    typicalSize: 2,
    reliability: "normal",
    strengths: ["sealers", "warranty", "customer service", "billable repair work orders", "painting"],
    cautions: [],
    schedulingNotes: "Tarcizio can also paint."
  },
  {
    key: "mario_wilcher",
    names: ["MARIO / WILCHER"],
    displayName: "Mario / Wilcher",
    category: "repair and sealer team",
    typicalSize: 2,
    reliability: "normal",
    strengths: ["repair work", "sealers", "small projects", "small jobs"],
    cautions: [],
    schedulingNotes: "Talented and flexible."
  },
  {
    key: "felipe_miliati",
    names: ["FELIPE MILIATI"],
    displayName: "Felipe Miliati",
    category: "solo repair crew",
    typicalSize: 1,
    reliability: "normal",
    strengths: ["repair work", "small work"],
    cautions: ["Works alone; bigger work needs helpers."],
    schedulingNotes: "Can do some work, but needs helpers for larger jobs."
  },
  {
    key: "others",
    names: ["OTHERS"],
    displayName: "Others",
    category: "irregular crew",
    typicalSize: null,
    reliability: "unknown",
    strengths: ["one-off work", "temporary crews"],
    cautions: ["Needs a named owner before dispatch."],
    schedulingNotes: "Used for crews that do not usually work week-to-week."
  },
  {
    key: "ysaias",
    names: ["YSAIAS (PAVER DETAILED JOBS)", "ISAÍAS", "ISAIAS", "YSAIAS"],
    displayName: "Ysaias",
    category: "paver detail crew",
    typicalSize: null,
    reliability: "normal",
    strengths: ["paver detail work", "farther jobs when appropriate"],
    cautions: [],
    schedulingNotes: "Needs more detail from scheduling team."
  },
  {
    key: "wanderson",
    names: ["WANDERSON (PAVER DETAILED JOBS)", "WANDERSON"],
    displayName: "Wanderson",
    category: "paver detail crew",
    typicalSize: null,
    reliability: "normal",
    strengths: ["paver detail work"],
    cautions: [],
    schedulingNotes: "Needs more detail from scheduling team."
  },
  {
    key: "marcelao",
    names: ["MARCELAO (PAVERS BIG JOBS)", "MARCELAO"],
    displayName: "Marcelao",
    category: "large paver crew",
    typicalSize: null,
    reliability: "normal",
    strengths: ["big paver jobs"],
    cautions: [],
    schedulingNotes: "Needs more detail from scheduling team."
  },
  {
    key: "fausto",
    names: ["FAUSTO (COPING)", "FAUSTO"],
    displayName: "Fausto",
    category: "coping crew",
    typicalSize: null,
    reliability: "normal",
    strengths: ["coping"],
    cautions: [],
    schedulingNotes: "Coping specialist."
  },
  {
    key: "toby",
    names: ["TOBY (COPING AND TILE)", "TOBY"],
    displayName: "Toby",
    category: "coping and tile crew",
    typicalSize: null,
    reliability: "normal",
    strengths: ["coping", "tile"],
    cautions: [],
    schedulingNotes: "Coping and tile."
  },
  {
    key: "bruno_pacheco",
    names: ["BRUNO PACHECO"],
    displayName: "Bruno Pacheco",
    category: "tile/service",
    typicalSize: null,
    reliability: "normal",
    strengths: ["tile", "service"],
    cautions: [],
    schedulingNotes: "Needs more detail from scheduling team."
  },
  {
    key: "mauro_tile",
    names: ["MAURO TILE CREW (PER JOB OR DAY)", "MAURO TILE CREW"],
    displayName: "Mauro Tile Crew",
    category: "tile crew",
    typicalSize: null,
    reliability: "normal",
    strengths: ["tile"],
    cautions: [],
    schedulingNotes: "Per job or day."
  },
  {
    key: "marcelo_master_care",
    names: ["MARCELO MASTER CARE"],
    displayName: "Marcelo Master Care",
    category: "service/repair",
    typicalSize: null,
    reliability: "normal",
    strengths: ["service", "repair"],
    cautions: [],
    schedulingNotes: "Needs more detail from scheduling team."
  },
  {
    key: "gervin_julio",
    names: ["GERVIN / JULIO"],
    displayName: "Gervin / Julio",
    category: "service/repair",
    typicalSize: 2,
    reliability: "normal",
    strengths: ["service", "repair"],
    cautions: [],
    schedulingNotes: "Needs more detail from scheduling team."
  },
  {
    key: "gilberto",
    names: ["GILBERTO"],
    displayName: "Gilberto",
    category: "other/specialty",
    typicalSize: null,
    reliability: "normal",
    strengths: [],
    cautions: [],
    schedulingNotes: "Needs more detail from scheduling team."
  }
];

const PROFILE_BY_NAME = new Map();
for (const profile of CREW_PROFILES) {
  for (const name of profile.names) {
    PROFILE_BY_NAME.set(normalizeName(name), profile);
  }
}

export function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function getCrewProfile(crewName) {
  const normalized = normalizeName(crewName);
  if (PROFILE_BY_NAME.has(normalized)) return PROFILE_BY_NAME.get(normalized);

  for (const profile of CREW_PROFILES) {
    if (profile.names.some((name) => normalized.includes(normalizeName(name)) || normalizeName(name).includes(normalized))) {
      return profile;
    }
  }

  return {
    key: "unknown",
    displayName: crewName || "Unknown crew",
    category: "unknown",
    typicalSize: null,
    reliability: "unknown",
    strengths: [],
    cautions: ["Crew is not in the known profile list."],
    schedulingNotes: "Add this crew to src/config.mjs when you know how they should be scheduled."
  };
}

export function inferJobTypes(text) {
  const upper = normalizeName(text);
  const types = new Set();

  if (/\bSEAL|SEALER|LAVAR|PRESSURE WASH|WASH\b/.test(upper)) types.add("sealer/wash");
  if (/\bCOPING\b/.test(upper)) types.add("coping");
  if (/\bTILE|SPA|BACKSPLASH\b/.test(upper)) types.add("tile");
  if (/\bDECK|PAVER|PAVERS|DRIVEWAY|WALKWAY|FRONT PORCH|SUNCK|SINKING\b/.test(upper)) types.add("pavers/deck");
  if (/\bTURF\b/.test(upper)) types.add("turf");
  if (/\bWALL|RETAINING\b/.test(upper)) types.add("wall");
  if (/\bCONCRETE|FOOTER|TURNDOWN|PUMP\b/.test(upper)) types.add("concrete");
  if (/\bREPAIR|REPLACE|FIX|WARRANTY|SERVICE|LOOSE|BROKEN\b/.test(upper)) types.add("repair/service");

  return [...types];
}

export function inferClientTypeFromJobNumber(jobNumber) {
  const number = String(jobNumber || "").replace(/\D/g, "");
  if (!number) return "unknown";
  if (number.startsWith("17")) return "retail or service client";
  if (number.startsWith("28")) return "builder/project client";
  if (number.startsWith("30")) return "pool builder or production client";
  if (number.startsWith("60")) return "special/client type code 60";
  if (number.startsWith("80")) return "internal/commercial/special code 80";
  if (number.startsWith("57")) return "builder/project client";
  if (number.startsWith("27")) return "retail or legacy client";
  return "unknown";
}
