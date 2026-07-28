const STORAGE_KEY = 'fleet_inspection_records_v2';

const GOOGLE_SHEETS_SYNC_CONFIG = {
  apiKey: 'AIzaSyCbwWuijHsYZbe7xObLhZdZrN5y215w1mk',
  clientId: '798228996956-klknfdqcehur1i4utmdvuug4pnesf1rh.apps.googleusercontent.com',
  spreadsheetId: '1NQjYtL1Q-fZbqwcCv3CNkG8t9wqHhET3LmIK-9yTFyk',
  targetSheetTitle: 'Inspection Records',
  discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  scope: 'https://www.googleapis.com/auth/spreadsheets'
};

let googleClientReady = false;
let tokenClient = null;
let accessToken = null;
let targetSheetTitleCache = '';

const CHECKPOINT_STATUS_OPTIONS = [
  'Pass',
  'Needs Attention',
  'Fail',
  'Not Checked',
  'N/A'
];

const BASE_SECTION_WEIGHTS = {
  entry_system: 5,
  exterior_body: 10,
  paint_finish: 12,
  engine_bay_fluids: 11,
  engine_running: 10,
  transmission_clutch: 10,
  road_test: 11,
  electrical: 8,
  tires_wheels_brakes: 12,
  steering_suspension: 10,
  underbody_frame: 11,
  interior_controls: 6,
  paperwork: 4
};

const SCORING_PROFILES = {
  concours: {
    label: 'Concours (Strict)',
    sectionWeightMultipliers: {
      paint_finish: 1.25,
      exterior_body: 1.2,
      underbody_frame: 1.15,
      interior_controls: 1.15,
      paperwork: 0.9
    },
    tierThresholds: {
      concours: 97,
      excellent: 92,
      good: 84,
      fair: 70,
      rough: 52
    },
    completionCaps: {
      fairCap: 70,
      goodCap: 82,
      excellentCap: 92
    },
    hardFailWeightedThreshold: 52,
    paintFailThreshold: 45,
    exteriorFailThreshold: 45,
    attentionStatusThreshold: 80
  },
  dealer: {
    label: 'Dealer (Balanced)',
    sectionWeightMultipliers: {
      paint_finish: 1.1,
      exterior_body: 1.05,
      tires_wheels_brakes: 1.1,
      steering_suspension: 1.05,
      underbody_frame: 1.05
    },
    tierThresholds: {
      concours: 95,
      excellent: 88,
      good: 76,
      fair: 62,
      rough: 45
    },
    completionCaps: {
      fairCap: 60,
      goodCap: 75,
      excellentCap: 90
    },
    hardFailWeightedThreshold: 40,
    paintFailThreshold: 35,
    exteriorFailThreshold: 40,
    attentionStatusThreshold: 72
  },
  driver: {
    label: 'Driver (Practical)',
    sectionWeightMultipliers: {
      paint_finish: 0.75,
      exterior_body: 0.8,
      tires_wheels_brakes: 1.2,
      steering_suspension: 1.15,
      engine_running: 1.1,
      transmission_clutch: 1.1,
      underbody_frame: 1.1
    },
    tierThresholds: {
      concours: 94,
      excellent: 86,
      good: 72,
      fair: 58,
      rough: 40
    },
    completionCaps: {
      fairCap: 55,
      goodCap: 70,
      excellentCap: 88
    },
    hardFailWeightedThreshold: 34,
    paintFailThreshold: 28,
    exteriorFailThreshold: 32,
    attentionStatusThreshold: 66
  }
};

const CHECKPOINT_SECTIONS = [
  {
    key: 'entry_system',
    title: 'Entry System',
    items: [
      { key: 'door_handles_present', label: 'Are door handles present?' },
      { key: 'door_locks_work', label: 'Do door locks work with keys?' },
      { key: 'door_actuators_work', label: 'Do electronic actuators release correctly?' },
      { key: 'central_locking', label: 'Is central locking present and operational?' },
      { key: 'windows_operate', label: 'Do windows operate correctly?' },
      { key: 'hood_trunk_open', label: 'Do hood and trunk open/close correctly?' }
    ]
  },
  {
    key: 'exterior_body',
    title: 'Exterior & Body',
    items: [
      { key: 'body_panel_alignment', label: 'Body panel alignment and gaps acceptable?' },
      { key: 'visible_rust', label: 'Any visible rust or corrosion on body?' },
      { key: 'body_filler_signs', label: 'Any signs of body filler or repaired ripples?' },
      { key: 'accident_signs', label: 'Any signs of previous collision damage?' },
      { key: 'exterior_trim_condition', label: 'Exterior trim/chrome condition acceptable?' },
      { key: 'glass_condition', label: 'Glass free from major chips/cracks?' },
      { key: 'weatherstrip_condition', label: 'Weather-stripping and gaskets in good condition?' },
      { key: 'convertible_top_condition', label: 'Convertible top or roof sealing condition acceptable?' }
    ]
  },
  {
    key: 'paint_finish',
    title: 'Paint & Finish',
    items: [
      { key: 'paint_consistency', label: 'Paint finish consistent across panels?' },
      { key: 'overspray_tape_lines', label: 'Any overspray or tape lines observed?' },
      { key: 'paint_chips_scratches', label: 'Paint chips/scratches at acceptable level?' },
      { key: 'orange_peel', label: 'Orange peel or poor prep visible?' },
      { key: 'repaint_evidence', label: 'Evidence of partial/full repaint?' },
      { key: 'clearcoat_condition', label: 'Clearcoat and gloss condition acceptable?' }
    ]
  },
  {
    key: 'engine_bay_fluids',
    title: 'Engine Bay & Fluids',
    items: [
      { key: 'engine_bay_cleanliness', label: 'Engine bay cleanliness acceptable?' },
      { key: 'oil_level', label: 'Engine oil level correct?' },
      { key: 'oil_condition', label: 'Engine oil condition acceptable?' },
      { key: 'trans_fluid_condition', label: 'Transmission fluid condition acceptable?' },
      { key: 'coolant_level', label: 'Coolant level correct?' },
      { key: 'brake_fluid_condition', label: 'Brake fluid level and clarity acceptable?' },
      { key: 'visible_leaks_engine', label: 'Any active oil/coolant/trans leaks present?' },
      { key: 'hoses_belts_condition', label: 'Hoses and belts condition acceptable?' },
      { key: 'wiring_condition', label: 'Wiring/cables secure and in good condition?' }
    ]
  },
  {
    key: 'engine_running',
    title: 'Engine Running Check',
    items: [
      { key: 'cold_start', label: 'Cold start behavior acceptable?' },
      { key: 'idle_quality', label: 'Idle quality smooth and stable?' },
      { key: 'unusual_noises', label: 'Any unusual knocks/rattles/growls?' },
      { key: 'exhaust_smoke', label: 'Exhaust smoke within normal limits?' },
      { key: 'oil_pressure_reading', label: 'Oil pressure reading acceptable?' },
      { key: 'operating_temp', label: 'Operating temperature in normal range?' }
    ]
  },
  {
    key: 'transmission_clutch',
    title: 'Transmission & Clutch',
    items: [
      { key: 'gear_engagement', label: 'Gears engage/disengage smoothly?' },
      { key: 'harsh_shift', label: 'Any harsh shift or clunking?' },
      { key: 'slippage', label: 'Any clutch/transmission slippage?' },
      { key: 'reverse_engagement', label: 'Reverse engagement normal?' },
      { key: 'driveline_noise', label: 'Driveline noise under load acceptable?' },
      { key: 'parking_brake_hold', label: 'Parking brake holds vehicle correctly?' }
    ]
  },
  {
    key: 'road_test',
    title: 'Road Test',
    items: [
      { key: 'road_test_performed', label: 'Road test performed?' },
      { key: 'brake_pull', label: 'Vehicle tracks straight under braking?' },
      { key: 'steering_tracking', label: 'Vehicle tracks straight with hands-off check?' },
      { key: 'acceleration_response', label: 'Acceleration response normal?' },
      { key: 'vibration', label: 'Any abnormal vibration felt?' },
      { key: 'cornering_noise', label: 'Any unusual noise during turns/figure eights?' },
      { key: 'highway_behavior', label: 'High-speed behavior acceptable?' },
      { key: 'overall_driveability', label: 'Overall driveability acceptable?' }
    ]
  },
  {
    key: 'electrical',
    title: 'Electrical & Lighting',
    items: [
      { key: 'headlights_hi_low', label: 'Headlights high/low beams operational?' },
      { key: 'turn_signals', label: 'Turn signals operational?' },
      { key: 'brake_lights', label: 'Brake and tail lights operational?' },
      { key: 'interior_lights', label: 'Interior and instrument lights operational?' },
      { key: 'horn', label: 'Horn operational?' },
      { key: 'wipers', label: 'Wipers and washers operational?' },
      { key: 'gauges', label: 'Dashboard gauges and warning lights functional?' },
      { key: 'battery_charging', label: 'Battery/charging system condition acceptable?' }
    ]
  },
  {
    key: 'tires_wheels_brakes',
    title: 'Tires, Wheels & Brakes',
    items: [
      { key: 'tire_tread_depth', label: 'Tire tread depth acceptable?' },
      { key: 'tire_wear_pattern', label: 'Tire wear pattern even?' },
      { key: 'wheel_damage', label: 'Wheels free from major damage?' },
      { key: 'brake_pad_life', label: 'Brake pad/shoe life acceptable?' },
      { key: 'rotor_drum_condition', label: 'Rotor/drum condition acceptable?' },
      { key: 'parking_brake_operation', label: 'Parking brake operation acceptable?' },
      { key: 'brake_pedal_feel', label: 'Brake pedal feel firm and consistent?' }
    ]
  },
  {
    key: 'steering_suspension',
    title: 'Steering & Suspension',
    items: [
      { key: 'vehicle_sits_level', label: 'Vehicle sits level side-to-side/front-to-rear?' },
      { key: 'shock_strut_condition', label: 'Shocks/struts free of leaks/damage?' },
      { key: 'spring_condition', label: 'Springs condition acceptable?' },
      { key: 'steering_play', label: 'Excessive steering play present?' },
      { key: 'suspension_noise', label: 'Suspension noise over bumps acceptable?' },
      { key: 'bounce_test', label: 'Bounce test result acceptable?' }
    ]
  },
  {
    key: 'underbody_frame',
    title: 'Underbody & Frame',
    items: [
      { key: 'frame_damage', label: 'Frame/chassis damage signs present?' },
      { key: 'underbody_rust', label: 'Underbody rust level acceptable?' },
      { key: 'weld_quality', label: 'Frame/patch weld quality acceptable?' },
      { key: 'bottom_out_damage', label: 'Any bottom-out or scrape damage visible?' },
      { key: 'undercoating_condition', label: 'Undercoating condition acceptable?' },
      { key: 'underside_leaks', label: 'Fluid leaks observed underneath?' },
      { key: 'mount_points', label: 'Mount points/structure look sound?' },
      { key: 'exhaust_underbody', label: 'Exhaust underbody routing/condition acceptable?' }
    ]
  },
  {
    key: 'interior_controls',
    title: 'Interior & Controls',
    items: [
      { key: 'seat_condition', label: 'Seat condition and operation acceptable?' },
      { key: 'seatbelts', label: 'Seatbelts present and functional?' },
      { key: 'dashboard_condition', label: 'Dashboard/interior trim condition acceptable?' },
      { key: 'hvac_operation', label: 'HVAC operation acceptable?' },
      { key: 'odometer_operation', label: 'Odometer/speedometer functioning?' },
      { key: 'warning_lights', label: 'Any persistent warning lights present?' }
    ]
  },
  {
    key: 'paperwork',
    title: 'Paperwork & Verification',
    items: [
      { key: 'vin_matches_docs', label: 'VIN matches title/registration?' },
      { key: 'title_present', label: 'Title documentation present?' },
      { key: 'service_records_present', label: 'Service records/receipts reviewed?' },
      { key: 'ownership_confirmed', label: 'Ownership authenticity confirmed?' },
      { key: 'lien_disclosed', label: 'Any lien or legal issue disclosed?' },
      { key: 'build_docs_present', label: 'Build/modification docs available if applicable?' }
    ]
  }
];

const els = {
  form: document.getElementById('inspectionForm'),
  editingId: document.getElementById('editingId'),
  vehicle: document.getElementById('vehicle'),
  vin: document.getElementById('vin'),
  stockNumber: document.getElementById('stockNumber'),
  mileage: document.getElementById('mileage'),
  inspectionDate: document.getElementById('inspectionDate'),
  inspector: document.getElementById('inspector'),
  overallStatus: document.getElementById('overallStatus'),
  scoringProfile: document.getElementById('scoringProfile'),
  year: document.getElementById('year'),
  make: document.getElementById('make'),
  model: document.getElementById('model'),
  trim: document.getElementById('trim'),
  paintColor: document.getElementById('paintColor'),
  originalPaintColor: document.getElementById('originalPaintColor'),
  paintOriginality: document.getElementById('paintOriginality'),
  interiorColor: document.getElementById('interiorColor'),
  originalInteriorColor: document.getElementById('originalInteriorColor'),
  interiorOriginality: document.getElementById('interiorOriginality'),
  engineType: document.getElementById('engineType'),
  originalEngineType: document.getElementById('originalEngineType'),
  engineOriginality: document.getElementById('engineOriginality'),
  transmissionType: document.getElementById('transmissionType'),
  originalTransmissionType: document.getElementById('originalTransmissionType'),
  transmissionOriginality: document.getElementById('transmissionOriginality'),
  numbersMatchClaim: document.getElementById('numbersMatchClaim'),
  blockStampNumber: document.getElementById('blockStampNumber'),
  originalBlockStampNumber: document.getElementById('originalBlockStampNumber'),
  headsStampNumber: document.getElementById('headsStampNumber'),
  originalHeadsStampNumber: document.getElementById('originalHeadsStampNumber'),
  transStampNumber: document.getElementById('transStampNumber'),
  originalTransStampNumber: document.getElementById('originalTransStampNumber'),
  drivetrain: document.getElementById('drivetrain'),
  inspectionLocation: document.getElementById('inspectionLocation'),
  weather: document.getElementById('weather'),
  titleStatus: document.getElementById('titleStatus'),
  sellerName: document.getElementById('sellerName'),
  sellerContact: document.getElementById('sellerContact'),
  drivenBy: document.getElementById('drivenBy'),
  testMiles: document.getElementById('testMiles'),
  docsAvailable: document.getElementById('docsAvailable'),
  immediateSafety: document.getElementById('immediateSafety'),
  repairEstimate: document.getElementById('repairEstimate'),
  nextServiceDate: document.getElementById('nextServiceDate'),
  summaryNotes: document.getElementById('summaryNotes'),
  photoLinks: document.getElementById('photoLinks'),
  checkpointsContainer: document.getElementById('checkpointsContainer'),
  suggestedStatusBadge: document.getElementById('suggestedStatusBadge'),
  numbersMatchingResult: document.getElementById('numbersMatchingResult'),
  autoStatusToggle: document.getElementById('autoStatusToggle'),
  statusRuleText: document.getElementById('statusRuleText'),
  statusMismatchNote: document.getElementById('statusMismatchNote'),
  scorePassCount: document.getElementById('scorePassCount'),
  scoreAttentionCount: document.getElementById('scoreAttentionCount'),
  scoreFailCount: document.getElementById('scoreFailCount'),
  scoreNotCheckedCount: document.getElementById('scoreNotCheckedCount'),
  scoreCompletionCount: document.getElementById('scoreCompletionCount'),
  scoreQualityScore: document.getElementById('scoreQualityScore'),
  scoreQualityTier: document.getElementById('scoreQualityTier'),
  sectionScoreTableBody: document.getElementById('sectionScoreTableBody'),
  clearVehicleDetailsBtn: document.getElementById('clearVehicleDetailsBtn'),
  clearCheckpointsBtn: document.getElementById('clearCheckpointsBtn'),
  clearNotesBtn: document.getElementById('clearNotesBtn'),
  clearAllFormBtn: document.getElementById('clearAllFormBtn'),
  searchInput: document.getElementById('searchInput'),
  statusFilter: document.getElementById('statusFilter'),
  recordsTableBody: document.getElementById('recordsTableBody'),
  totalReports: document.getElementById('totalReports'),
  passedReports: document.getElementById('passedReports'),
  attentionReports: document.getElementById('attentionReports'),
  failedReports: document.getElementById('failedReports'),
  resetFormBtn: document.getElementById('resetFormBtn'),
  printCurrentBtn: document.getElementById('printCurrentBtn'),
  createSheetTabBtn: document.getElementById('createSheetTabBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  importJsonInput: document.getElementById('importJsonInput'),
  clearAllBtn: document.getElementById('clearAllBtn')
};

let records = [];

function escapeHtml(value) {
  return (value || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeHttpUrl(value) {
  const url = (value || '').toString().trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

function normalizeText(value) {
  return (value || '').toString().trim().toLowerCase();
}

function composeVehicleFromParts(year, make, model) {
  return [year, make, model]
    .map(part => (part || '').toString().trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function syncVehicleFromParts() {
  const composed = composeVehicleFromParts(els.year.value, els.make.value, els.model.value);
  els.vehicle.value = composed;
}

function statusClass(status) {
  if (status === 'Pass') return 'status-pass';
  if (status === 'Needs Attention') return 'status-attn';
  return 'status-fail';
}

function normalizeMatchingValue(value) {
  const v = (value || '').toString().trim().toLowerCase();
  if (!v) return '';
  if (v.includes('yes') || v === 'original') return 'Yes';
  if (v.includes('partial')) return 'Partial';
  if (v.includes('not original') || v.includes('no')) return 'No';
  return '';
}

function deriveNumbersMatchingResult() {
  const explicit = normalizeMatchingValue(els.numbersMatchClaim?.value || '');
  if (explicit) return explicit;

  const values = [
    normalizeMatchingValue(els.engineOriginality?.value || ''),
    normalizeMatchingValue(els.transmissionOriginality?.value || ''),
    normalizeMatchingValue(els.paintOriginality?.value || ''),
    normalizeMatchingValue(els.interiorOriginality?.value || '')
  ].filter(Boolean);

  if (!values.length) return 'Unknown';
  if (values.every(v => v === 'Yes')) return 'Yes';
  if (values.some(v => v === 'No')) return 'No';
  return 'Partial';
}

function matchingResultClass(result) {
  if (result === 'Yes') return 'suggested-pass';
  if (result === 'No') return 'suggested-fail';
  return 'suggested-attn';
}

function checkpointStatusId(sectionKey, itemKey) {
  return `cp_${sectionKey}_${itemKey}_status`;
}

function checkpointNotesId(sectionKey, itemKey) {
  return `cp_${sectionKey}_${itemKey}_notes`;
}

function readRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse records from storage:', error);
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function getSpreadsheetHeaders() {
  return [
    'Record ID',
    'Saved At',
    'Inspection Date',
    'Vehicle',
    'VIN',
    'Stock Number',
    'Inspector',
    'Overall Status',
    'Suggested Status',
    'Scoring Profile',
    'Weighted Quality %',
    'Quality Tier',
    'Numbers Matching Result',
    'Numbers Matching Verification',
    'Year',
    'Make',
    'Model',
    'Trim',
    'Current Paint',
    'Original Paint',
    'Paint Originality',
    'Current Interior',
    'Original Interior',
    'Interior Originality',
    'Current Engine',
    'Original Engine',
    'Engine Originality',
    'Current Transmission',
    'Original Transmission',
    'Transmission Originality',
    'Observed Block Stamp/Casting #',
    'Original Block Stamp/Casting #',
    'Observed Heads Stamp/Casting #',
    'Original Heads Stamp/Casting #',
    'Observed Transmission Stamp/Casting #',
    'Original Transmission Stamp/Casting #',
    'Drivetrain',
    'Mileage',
    'Inspection Location',
    'Weather',
    'Title Status',
    'Seller Name',
    'Seller Contact',
    'Road Test Driven By',
    'Road Test Miles',
    'Docs Available',
    'Immediate Safety Concern',
    'Repair Estimate',
    'Next Service Date',
    'Summary Notes',
    'Photo Links'
  ];
}

function toSpreadsheetRow(record) {
  const d = record.details || {};
  const s = record.scoreSnapshot || {};

  return [
    record.id || '',
    record.updatedAt || new Date().toISOString(),
    record.inspectionDate || '',
    record.vehicle || '',
    record.vin || '',
    record.stockNumber || '',
    record.inspector || '',
    record.overallStatus || '',
    s.suggestedStatus || '',
    s.profileLabel || '',
    Math.round(Number(s.weightedQualityPct || 0)),
    s.qualityTier || '',
    d.numbersMatchingResult || s.numbersMatchingResult || '',
    d.numbersMatchClaim || '',
    d.year || '',
    d.make || '',
    d.model || '',
    d.trim || '',
    d.paintColor || '',
    d.originalPaintColor || '',
    d.paintOriginality || '',
    d.interiorColor || '',
    d.originalInteriorColor || '',
    d.interiorOriginality || '',
    d.engineType || '',
    d.originalEngineType || '',
    d.engineOriginality || '',
    d.transmissionType || '',
    d.originalTransmissionType || '',
    d.transmissionOriginality || '',
    d.blockStampNumber || '',
    d.originalBlockStampNumber || '',
    d.headsStampNumber || '',
    d.originalHeadsStampNumber || '',
    d.transStampNumber || '',
    d.originalTransStampNumber || '',
    d.drivetrain || '',
    record.mileage || '',
    d.inspectionLocation || '',
    d.weather || '',
    d.titleStatus || '',
    d.sellerName || '',
    d.sellerContact || '',
    d.drivenBy || '',
    d.testMiles || '',
    d.docsAvailable || '',
    d.immediateSafety || '',
    d.repairEstimate || '',
    d.nextServiceDate || '',
    record.summaryNotes || '',
    (record.photoLinks || []).join(' | ')
  ];
}

async function initGoogleClientIfNeeded() {
  if (googleClientReady) return;

  if (typeof gapi === 'undefined' || typeof google === 'undefined' || !google.accounts?.oauth2) {
    throw new Error('Google API scripts are not loaded on this page.');
  }

  await new Promise((resolve, reject) => {
    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          apiKey: GOOGLE_SHEETS_SYNC_CONFIG.apiKey,
          discoveryDocs: GOOGLE_SHEETS_SYNC_CONFIG.discoveryDocs
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_SHEETS_SYNC_CONFIG.clientId,
    scope: GOOGLE_SHEETS_SYNC_CONFIG.scope,
    callback: () => {}
  });

  const storedToken = localStorage.getItem('google_access_token');
  const tokenExpiry = Number(localStorage.getItem('google_token_expiry') || 0);
  if (storedToken && tokenExpiry && Date.now() < tokenExpiry) {
    accessToken = storedToken;
    gapi.client.setToken({ access_token: accessToken });
  }

  googleClientReady = true;
}

async function ensureAccessToken() {
  await initGoogleClientIfNeeded();

  if (accessToken) return accessToken;

  if (!tokenClient) {
    throw new Error('Google token client is not initialized.');
  }

  accessToken = await new Promise((resolve, reject) => {
    tokenClient.callback = response => {
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      if (!response?.access_token) {
        reject(new Error('No access token returned by Google.'));
        return;
      }

      const token = response.access_token;
      resolve(token);
    };

    tokenClient.requestAccessToken({ prompt: 'consent' });
  });

  const expiryTime = Date.now() + (8 * 3600 * 1000);
  localStorage.setItem('google_access_token', accessToken);
  localStorage.setItem('google_token_expiry', String(expiryTime));
  gapi.client.setToken({ access_token: accessToken });

  return accessToken;
}

async function getTargetSheetTitle() {
  if (targetSheetTitleCache) return targetSheetTitleCache;

  await ensureAccessToken();

  const response = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: GOOGLE_SHEETS_SYNC_CONFIG.spreadsheetId,
    fields: 'sheets(properties(sheetId,title))'
  });

  const sheets = response.result?.sheets || [];
  const target = sheets.find(s => (s?.properties?.title || '').trim() === GOOGLE_SHEETS_SYNC_CONFIG.targetSheetTitle);

  if (target) {
    targetSheetTitleCache = target.properties.title;
    return targetSheetTitleCache;
  }

  await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: GOOGLE_SHEETS_SYNC_CONFIG.spreadsheetId,
    resource: {
      requests: [
        {
          addSheet: {
            properties: {
              title: GOOGLE_SHEETS_SYNC_CONFIG.targetSheetTitle,
              gridProperties: {
                frozenRowCount: 1
              }
            }
          }
        }
      ]
    }
  });

  targetSheetTitleCache = GOOGLE_SHEETS_SYNC_CONFIG.targetSheetTitle;
  return targetSheetTitleCache;
}

async function createOrVerifySpreadsheetTab() {
  const sheetTitle = await getTargetSheetTitle();
  await ensureSpreadsheetHeader(sheetTitle);
  return sheetTitle;
}

async function ensureSpreadsheetHeader(sheetTitle) {
  const headerRange = `${sheetTitle}!1:1`;
  const existing = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEETS_SYNC_CONFIG.spreadsheetId,
    range: headerRange
  });

  const existingHeader = existing.result?.values?.[0] || [];
  const expectedHeader = getSpreadsheetHeaders();

  if (existingHeader.length === expectedHeader.length && expectedHeader.every((h, i) => h === (existingHeader[i] || ''))) {
    return;
  }

  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEETS_SYNC_CONFIG.spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'RAW',
    resource: {
      values: [expectedHeader]
    }
  });
}

async function appendRecordToSpreadsheet(record) {
  await ensureAccessToken();
  const sheetTitle = await createOrVerifySpreadsheetTab();

  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEETS_SYNC_CONFIG.spreadsheetId,
    range: `${sheetTitle}!A:AZ`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [toSpreadsheetRow(record)]
    }
  });
}

function getActiveProfileKey() {
  return els.scoringProfile?.value || 'dealer';
}

function getProfileConfig(profileKey) {
  return SCORING_PROFILES[profileKey] || SCORING_PROFILES.dealer;
}

function getActiveProfileConfig() {
  return getProfileConfig(getActiveProfileKey());
}

function getSectionWeight(sectionKey, profileConfig) {
  const baseWeight = BASE_SECTION_WEIGHTS[sectionKey] || 5;
  const multiplier = profileConfig.sectionWeightMultipliers?.[sectionKey] || 1;
  return Math.max(1, Math.round(baseWeight * multiplier));
}

function toPercent(value) {
  return `${Math.round(value)}%`;
}

function calculateScorecard(checkpoints, profileConfig) {
  const overall = {
    pass: 0,
    attention: 0,
    fail: 0,
    notChecked: 0,
    na: 0,
    total: 0,
    applicable: 0,
    checked: 0,
    completionPct: 0,
    qualityPct: 0,
    weightedQualityPct: 0,
    weightedEarned: 0,
    weightedMax: 0,
    qualityTier: 'Unverified'
  };

  const sections = [];

  CHECKPOINT_SECTIONS.forEach(section => {
    const sectionTotals = {
      key: section.key,
      title: section.title,
      pass: 0,
      attention: 0,
      fail: 0,
      notChecked: 0,
      na: 0,
      total: section.items.length,
      applicable: 0,
      checked: 0,
      completionPct: 0,
      qualityPct: 0
    };

    const sectionWeight = getSectionWeight(section.key, profileConfig);
    sectionTotals.weight = sectionWeight;
    sectionTotals.weightedEarned = 0;
    sectionTotals.weightedMax = 0;

    section.items.forEach(item => {
      const state = checkpoints?.[section.key]?.[item.key]?.status || 'Not Checked';

      sectionTotals.total += 0;
      overall.total += 1;

      if (state === 'N/A') {
        sectionTotals.na += 1;
        overall.na += 1;
        return;
      }

      sectionTotals.applicable += 1;
      overall.applicable += 1;
      sectionTotals.weightedMax += sectionWeight;
      overall.weightedMax += sectionWeight;

      let qualityFactor = 0.3;

      if (state === 'Pass') {
        sectionTotals.pass += 1;
        sectionTotals.checked += 1;
        overall.pass += 1;
        overall.checked += 1;
        qualityFactor = 1;
      } else if (state === 'Needs Attention') {
        sectionTotals.attention += 1;
        sectionTotals.checked += 1;
        overall.attention += 1;
        overall.checked += 1;
        qualityFactor = 0.55;
      } else if (state === 'Fail') {
        sectionTotals.fail += 1;
        sectionTotals.checked += 1;
        overall.fail += 1;
        overall.checked += 1;
        qualityFactor = 0;
      } else {
        sectionTotals.notChecked += 1;
        overall.notChecked += 1;
        qualityFactor = 0.3;
      }

      sectionTotals.weightedEarned += sectionWeight * qualityFactor;
      overall.weightedEarned += sectionWeight * qualityFactor;
    });

    sectionTotals.completionPct = sectionTotals.applicable > 0
      ? (sectionTotals.checked / sectionTotals.applicable) * 100
      : 0;

    sectionTotals.qualityPct = sectionTotals.weightedMax > 0
      ? (sectionTotals.weightedEarned / sectionTotals.weightedMax) * 100
      : 0;

    sections.push(sectionTotals);
  });

  overall.completionPct = overall.applicable > 0
    ? (overall.checked / overall.applicable) * 100
    : 0;

  overall.qualityPct = overall.checked > 0
    ? ((overall.pass + (overall.attention * 0.5)) / overall.checked) * 100
    : 0;

  overall.weightedQualityPct = overall.weightedMax > 0
    ? (overall.weightedEarned / overall.weightedMax) * 100
    : 0;

  overall.qualityTier = qualityTierFromScore(overall.weightedQualityPct, overall.completionPct, profileConfig);

  return { overall, sections };
}

function qualityTierFromScore(weightedScore, completionPct, profileConfig) {
  const thresholds = profileConfig.tierThresholds;
  const caps = profileConfig.completionCaps;

  if (completionPct < 35) return 'Unverified';

  let tier = 'Project';
  if (weightedScore >= thresholds.concours) tier = 'Concours';
  else if (weightedScore >= thresholds.excellent) tier = 'Excellent';
  else if (weightedScore >= thresholds.good) tier = 'Good';
  else if (weightedScore >= thresholds.fair) tier = 'Fair';
  else if (weightedScore >= thresholds.rough) tier = 'Rough';
  else tier = 'Project';

  // Confidence cap: incomplete inspections cannot claim top tiers.
  if (completionPct < caps.fairCap && (tier === 'Concours' || tier === 'Excellent' || tier === 'Good')) tier = 'Fair';
  if (completionPct < caps.goodCap && (tier === 'Concours' || tier === 'Excellent')) tier = 'Good';
  if (completionPct < caps.excellentCap && tier === 'Concours') tier = 'Excellent';

  return tier;
}

function suggestOverallStatus(scorecard, profileConfig) {
  const paintSection = scorecard.sections.find(s => s.key === 'paint_finish');
  const exteriorSection = scorecard.sections.find(s => s.key === 'exterior_body');

  if (scorecard.overall.fail > 0) {
    return {
      status: 'Not Ready',
      rule: 'One or more checkpoint failures were found.'
    };
  }

  // Quality-based fail path: very poor body/paint can force Not Ready.
  if (paintSection && exteriorSection && paintSection.qualityPct < profileConfig.paintFailThreshold && exteriorSection.qualityPct < profileConfig.exteriorFailThreshold) {
    return {
      status: 'Not Ready',
      rule: 'Body/Paint quality is severely poor based on weighted inspection checkpoints.'
    };
  }

  if (scorecard.overall.weightedQualityPct < profileConfig.hardFailWeightedThreshold) {
    return {
      status: 'Not Ready',
      rule: 'Overall weighted quality score is too low for pass.'
    };
  }

  if (scorecard.overall.attention > 0 || scorecard.overall.weightedQualityPct < profileConfig.attentionStatusThreshold || (scorecard.overall.pass === 0 && scorecard.overall.notChecked > 0)) {
    return {
      status: 'Needs Attention',
      rule: 'No failures, but there are attention items or incomplete checks.'
    };
  }

  return {
    status: 'Pass',
    rule: 'All checked items passed with no failures.'
  };
}

function suggestedClass(status) {
  if (status === 'Pass') return 'suggested-pass';
  if (status === 'Needs Attention') return 'suggested-attn';
  return 'suggested-fail';
}

function qualityTierClass(tier) {
  if (tier === 'Concours') return 'tier-concours';
  if (tier === 'Excellent') return 'tier-excellent';
  if (tier === 'Good') return 'tier-good';
  if (tier === 'Fair') return 'tier-fair';
  if (tier === 'Rough') return 'tier-rough';
  if (tier === 'Project') return 'tier-project';
  return 'tier-unverified';
}

function renderSectionScoreTable(sections) {
  const rows = sections.map(section => `
    <tr>
      <td>${escapeHtml(section.title)}</td>
      <td>${section.weight}</td>
      <td>${section.pass}</td>
      <td>${section.attention}</td>
      <td>${section.fail}</td>
      <td>${section.notChecked}</td>
      <td>${toPercent(section.completionPct)}</td>
      <td>${toPercent(section.qualityPct)}</td>
    </tr>
  `).join('');

  els.sectionScoreTableBody.innerHTML = rows;
}

function renderScorecardFromForm() {
  const profileKey = getActiveProfileKey();
  const profileConfig = getActiveProfileConfig();
  const checkpoints = collectCheckpointsFromForm();
  const scorecard = calculateScorecard(checkpoints, profileConfig);
  const suggested = suggestOverallStatus(scorecard, profileConfig);

  els.scorePassCount.textContent = scorecard.overall.pass;
  els.scoreAttentionCount.textContent = scorecard.overall.attention;
  els.scoreFailCount.textContent = scorecard.overall.fail;
  els.scoreNotCheckedCount.textContent = scorecard.overall.notChecked;
  els.scoreCompletionCount.textContent = toPercent(scorecard.overall.completionPct);
  els.scoreQualityScore.textContent = toPercent(scorecard.overall.weightedQualityPct);
  els.scoreQualityTier.textContent = scorecard.overall.qualityTier;
  els.scoreQualityTier.className = `quality-tier ${qualityTierClass(scorecard.overall.qualityTier)}`;

  els.suggestedStatusBadge.textContent = suggested.status;
  els.suggestedStatusBadge.className = `suggested-badge ${suggestedClass(suggested.status)}`;
  const matchingResult = deriveNumbersMatchingResult();
  if (els.numbersMatchingResult) {
    els.numbersMatchingResult.textContent = matchingResult;
    els.numbersMatchingResult.className = `suggested-badge ${matchingResultClass(matchingResult)}`;
  }
  els.statusRuleText.textContent = `${profileConfig.label}: ${suggested.rule}`;

  if (els.autoStatusToggle.checked) {
    els.overallStatus.value = suggested.status;
    els.statusMismatchNote.style.display = 'none';
    els.statusMismatchNote.textContent = '';
  } else if (els.overallStatus.value && els.overallStatus.value !== suggested.status) {
    els.statusMismatchNote.style.display = 'block';
    els.statusMismatchNote.textContent = `Manual status differs from suggested: ${suggested.status}.`;
  } else {
    els.statusMismatchNote.style.display = 'none';
    els.statusMismatchNote.textContent = '';
  }

  renderSectionScoreTable(scorecard.sections);

  return {
    scorecard,
    suggestedStatus: suggested.status,
    suggestedRule: suggested.rule,
    profileKey,
    numbersMatchingResult: deriveNumbersMatchingResult()
  };
}

function renderCheckpoints() {
  const sectionsHtml = CHECKPOINT_SECTIONS.map(section => {
    const rows = section.items.map(item => {
      const statusId = checkpointStatusId(section.key, item.key);
      const notesId = checkpointNotesId(section.key, item.key);
      const options = CHECKPOINT_STATUS_OPTIONS
        .map(opt => `<option value="${escapeHtml(opt)}" ${opt === 'Not Checked' ? 'selected' : ''}>${escapeHtml(opt)}</option>`)
        .join('');

      return `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td style="min-width:150px;"><select id="${statusId}">${options}</select></td>
          <td style="min-width:220px;"><input id="${notesId}" placeholder="Optional notes"></td>
        </tr>
      `;
    }).join('');

    return `
      <div class="checkpoint-section">
        <h3>${escapeHtml(section.title)}</h3>
        <table class="checkpoint-table">
          <thead>
            <tr>
              <th>Checkpoint</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join('');

  els.checkpointsContainer.innerHTML = sectionsHtml;
}

function collectCheckpointsFromForm() {
  const checkpointData = {};

  CHECKPOINT_SECTIONS.forEach(section => {
    const sectionData = {};

    section.items.forEach(item => {
      const statusEl = document.getElementById(checkpointStatusId(section.key, item.key));
      const notesEl = document.getElementById(checkpointNotesId(section.key, item.key));

      sectionData[item.key] = {
        label: item.label,
        status: statusEl ? statusEl.value : 'Not Checked',
        notes: notesEl ? notesEl.value.trim() : ''
      };
    });

    checkpointData[section.key] = sectionData;
  });

  return checkpointData;
}

function buildRecordFromForm() {
  const rawStock = (els.stockNumber.value || '').replace(/\D/g, '').slice(0, 5);
  syncVehicleFromParts();
  const profileKey = getActiveProfileKey();
  const profileConfig = getProfileConfig(profileKey);

  const checkpoints = collectCheckpointsFromForm();
  const scorecard = calculateScorecard(checkpoints, profileConfig);
  const suggested = suggestOverallStatus(scorecard, profileConfig);
  const numbersMatchingResult = deriveNumbersMatchingResult();

  return {
    id: els.editingId.value || `insp_${Date.now()}`,
    vehicle: els.vehicle.value.trim(),
    vin: els.vin.value.trim(),
    stockNumber: rawStock,
    mileage: els.mileage.value.trim(),
    inspectionDate: els.inspectionDate.value,
    inspector: els.inspector.value.trim(),
    overallStatus: els.overallStatus.value,
    scoringProfile: profileKey,
    details: {
      year: els.year.value.trim(),
      make: els.make.value.trim(),
      model: els.model.value.trim(),
      trim: els.trim.value.trim(),
      paintColor: els.paintColor.value.trim(),
      originalPaintColor: els.originalPaintColor.value.trim(),
      paintOriginality: els.paintOriginality.value,
      interiorColor: els.interiorColor.value.trim(),
      originalInteriorColor: els.originalInteriorColor.value.trim(),
      interiorOriginality: els.interiorOriginality.value,
      engineType: els.engineType.value.trim(),
      originalEngineType: els.originalEngineType.value.trim(),
      engineOriginality: els.engineOriginality.value,
      transmissionType: els.transmissionType.value.trim(),
      originalTransmissionType: els.originalTransmissionType.value.trim(),
      transmissionOriginality: els.transmissionOriginality.value,
      numbersMatchClaim: els.numbersMatchClaim.value,
      blockStampNumber: els.blockStampNumber.value.trim(),
      originalBlockStampNumber: els.originalBlockStampNumber.value.trim(),
      headsStampNumber: els.headsStampNumber.value.trim(),
      originalHeadsStampNumber: els.originalHeadsStampNumber.value.trim(),
      transStampNumber: els.transStampNumber.value.trim(),
      originalTransStampNumber: els.originalTransStampNumber.value.trim(),
      numbersMatchingResult,
      drivetrain: els.drivetrain.value.trim(),
      inspectionLocation: els.inspectionLocation.value.trim(),
      weather: els.weather.value.trim(),
      titleStatus: els.titleStatus.value,
      sellerName: els.sellerName.value.trim(),
      sellerContact: els.sellerContact.value.trim(),
      drivenBy: els.drivenBy.value,
      testMiles: els.testMiles.value.trim(),
      docsAvailable: els.docsAvailable.value,
      immediateSafety: els.immediateSafety.value,
      repairEstimate: els.repairEstimate.value.trim(),
      nextServiceDate: els.nextServiceDate.value
    },
    checkpoints,
    autoStatusEnabled: Boolean(els.autoStatusToggle.checked),
    scoreSnapshot: {
      profileKey,
      profileLabel: profileConfig.label,
      suggestedStatus: suggested.status,
      suggestedRule: suggested.rule,
      numbersMatchingResult,
      completionPct: scorecard.overall.completionPct,
      qualityPct: scorecard.overall.qualityPct,
      weightedQualityPct: scorecard.overall.weightedQualityPct,
      qualityTier: scorecard.overall.qualityTier,
      pass: scorecard.overall.pass,
      attention: scorecard.overall.attention,
      fail: scorecard.overall.fail,
      notChecked: scorecard.overall.notChecked
    },
    summaryNotes: els.summaryNotes.value.trim(),
    photoLinks: els.photoLinks.value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean),
    updatedAt: new Date().toISOString()
  };
}

function fillCheckpointValues(record) {
  CHECKPOINT_SECTIONS.forEach(section => {
    section.items.forEach(item => {
      const statusEl = document.getElementById(checkpointStatusId(section.key, item.key));
      const notesEl = document.getElementById(checkpointNotesId(section.key, item.key));
      const saved = record.checkpoints?.[section.key]?.[item.key];

      if (statusEl) {
        statusEl.value = saved?.status || 'Not Checked';
      }

      if (notesEl) {
        notesEl.value = saved?.notes || '';
      }
    });
  });
}

function resetCheckpointValues() {
  CHECKPOINT_SECTIONS.forEach(section => {
    section.items.forEach(item => {
      const statusEl = document.getElementById(checkpointStatusId(section.key, item.key));
      const notesEl = document.getElementById(checkpointNotesId(section.key, item.key));

      if (statusEl) statusEl.value = 'Not Checked';
      if (notesEl) notesEl.value = '';
    });
  });
}

function fillForm(record) {
  els.editingId.value = record.id;
  els.scoringProfile.value = record.scoringProfile || 'dealer';
  els.vin.value = record.vin || '';
  els.stockNumber.value = record.stockNumber || '';
  els.mileage.value = record.mileage || '';
  els.inspectionDate.value = record.inspectionDate || '';
  els.inspector.value = record.inspector || '';
  els.overallStatus.value = record.overallStatus || '';

  els.year.value = record.details?.year || '';
  els.make.value = record.details?.make || '';
  els.model.value = record.details?.model || '';
  els.trim.value = record.details?.trim || '';
  els.paintColor.value = record.details?.paintColor || '';
  els.originalPaintColor.value = record.details?.originalPaintColor || '';
  els.paintOriginality.value = record.details?.paintOriginality || '';
  els.interiorColor.value = record.details?.interiorColor || '';
  els.originalInteriorColor.value = record.details?.originalInteriorColor || '';
  els.interiorOriginality.value = record.details?.interiorOriginality || '';
  els.engineType.value = record.details?.engineType || '';
  els.originalEngineType.value = record.details?.originalEngineType || '';
  els.engineOriginality.value = record.details?.engineOriginality || '';
  els.transmissionType.value = record.details?.transmissionType || '';
  els.originalTransmissionType.value = record.details?.originalTransmissionType || '';
  els.transmissionOriginality.value = record.details?.transmissionOriginality || '';
  els.numbersMatchClaim.value = record.details?.numbersMatchClaim || '';
  els.blockStampNumber.value = record.details?.blockStampNumber || '';
  els.originalBlockStampNumber.value = record.details?.originalBlockStampNumber || '';
  els.headsStampNumber.value = record.details?.headsStampNumber || '';
  els.originalHeadsStampNumber.value = record.details?.originalHeadsStampNumber || '';
  els.transStampNumber.value = record.details?.transStampNumber || '';
  els.originalTransStampNumber.value = record.details?.originalTransStampNumber || '';
  els.drivetrain.value = record.details?.drivetrain || '';
  els.inspectionLocation.value = record.details?.inspectionLocation || '';
  els.weather.value = record.details?.weather || '';
  els.titleStatus.value = record.details?.titleStatus || '';
  els.sellerName.value = record.details?.sellerName || '';
  els.sellerContact.value = record.details?.sellerContact || '';
  els.drivenBy.value = record.details?.drivenBy || '';
  els.testMiles.value = record.details?.testMiles || '';
  els.docsAvailable.value = record.details?.docsAvailable || '';
  els.immediateSafety.value = record.details?.immediateSafety || '';
  els.repairEstimate.value = record.details?.repairEstimate || '';
  els.nextServiceDate.value = record.details?.nextServiceDate || '';

  // Vehicle name is derived from Year + Make + Model for consistency.
  syncVehicleFromParts();
  if (!els.vehicle.value) {
    els.vehicle.value = record.vehicle || '';
  }
  els.autoStatusToggle.checked = record.autoStatusEnabled !== false;

  fillCheckpointValues(record);

  els.summaryNotes.value = record.summaryNotes || '';
  els.photoLinks.value = (record.photoLinks || []).join('\n');
  renderScorecardFromForm();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  els.form.reset();
  els.editingId.value = '';
  els.inspectionDate.valueAsDate = new Date();
  els.autoStatusToggle.checked = true;
  els.vehicle.value = '';
  resetCheckpointValues();
  renderScorecardFromForm();
}

function csvEscape(value) {
  const text = (value ?? '').toString();
  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function toRepairRequestRow(record) {
  const d = record.details || {};
  const snapshot = record.scoreSnapshot || {};

  return {
    'Vehicle ID': record.vehicle || '',
    'Service Type': 'Inspection',
    'Date': record.inspectionDate || '',
    'Cost (USD)': record.details?.repairEstimate || '',
    'Cause': record.overallStatus || '',
    'Notes': record.summaryNotes || '',
    'VIN': record.vin || '',
    'Stock Number': record.stockNumber || '',
    'Inspector': record.inspector || '',
    'Scoring Profile': snapshot.profileLabel || getProfileConfig(record.scoringProfile || 'dealer').label,
    'Suggested Status': snapshot.suggestedStatus || '',
    'Numbers Matching Result': d.numbersMatchingResult || snapshot.numbersMatchingResult || '',
    'Numbers Matching Verification': d.numbersMatchClaim || '',
    'Current Paint': d.paintColor || '',
    'Original Paint': d.originalPaintColor || '',
    'Paint Originality': d.paintOriginality || '',
    'Current Interior': d.interiorColor || '',
    'Original Interior': d.originalInteriorColor || '',
    'Interior Originality': d.interiorOriginality || '',
    'Current Engine': d.engineType || '',
    'Original Engine': d.originalEngineType || '',
    'Engine Originality': d.engineOriginality || '',
    'Current Transmission': d.transmissionType || '',
    'Original Transmission': d.originalTransmissionType || '',
    'Transmission Originality': d.transmissionOriginality || '',
    'Observed Block Stamp/Casting #': d.blockStampNumber || '',
    'Original Block Stamp/Casting #': d.originalBlockStampNumber || '',
    'Observed Heads Stamp/Casting #': d.headsStampNumber || '',
    'Original Heads Stamp/Casting #': d.originalHeadsStampNumber || '',
    'Observed Transmission Stamp/Casting #': d.transStampNumber || '',
    'Original Transmission Stamp/Casting #': d.originalTransStampNumber || ''
  };
}

function clearVehicleAndHeaderFields() {
  const ids = [
    'vehicle', 'vin', 'stockNumber', 'mileage', 'inspectionDate', 'inspector', 'overallStatus',
    'year', 'make', 'model', 'trim', 'paintColor', 'originalPaintColor', 'paintOriginality',
    'interiorColor', 'originalInteriorColor', 'interiorOriginality',
    'engineType', 'originalEngineType', 'engineOriginality',
    'transmissionType', 'originalTransmissionType', 'transmissionOriginality',
    'numbersMatchClaim', 'blockStampNumber', 'originalBlockStampNumber',
    'headsStampNumber', 'originalHeadsStampNumber',
    'transStampNumber', 'originalTransStampNumber',
    'drivetrain', 'inspectionLocation', 'weather', 'titleStatus', 'sellerName', 'sellerContact',
    'drivenBy', 'testMiles', 'docsAvailable', 'immediateSafety', 'repairEstimate', 'nextServiceDate'
  ];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'SELECT') {
      el.selectedIndex = 0;
    } else {
      el.value = '';
    }
  });

  els.inspectionDate.valueAsDate = new Date();
  syncVehicleFromParts();
  renderScorecardFromForm();
}

function clearCheckpointsOnly() {
  resetCheckpointValues();
  renderScorecardFromForm();
}

function clearSummaryAndPhotos() {
  els.summaryNotes.value = '';
  els.photoLinks.value = '';
}

function checkpointSearchBlob(record) {
  if (!record.checkpoints) return '';

  const parts = [];
  CHECKPOINT_SECTIONS.forEach(section => {
    const sectionValues = record.checkpoints[section.key] || {};
    section.items.forEach(item => {
      const val = sectionValues[item.key] || {};
      parts.push(item.label);
      parts.push(val.status || '');
      parts.push(val.notes || '');
    });
  });

  return parts.join(' ');
}

function filteredRecords() {
  const search = normalizeText(els.searchInput.value);
  const status = els.statusFilter.value;

  return records
    .filter(record => {
      if (status && record.overallStatus !== status) return false;

      if (!search) return true;
      const haystack = [
        record.vehicle,
        record.vin,
        record.stockNumber,
        record.inspector,
        record.summaryNotes,
        record.details?.year,
        record.details?.make,
        record.details?.model,
        record.details?.trim,
        record.details?.engineType,
        record.details?.originalEngineType,
        record.details?.transmissionType,
        record.details?.originalTransmissionType,
        record.details?.numbersMatchClaim,
        record.details?.blockStampNumber,
        record.details?.originalBlockStampNumber,
        record.details?.headsStampNumber,
        record.details?.originalHeadsStampNumber,
        record.details?.transStampNumber,
        record.details?.originalTransStampNumber,
        record.details?.paintColor,
        record.details?.originalPaintColor,
        record.details?.paintOriginality,
        record.details?.interiorColor,
        record.details?.originalInteriorColor,
        record.details?.interiorOriginality,
        record.details?.sellerName,
        record.details?.sellerContact,
        record.details?.inspectionLocation,
        checkpointSearchBlob(record)
      ].join(' ').toLowerCase();

      return haystack.includes(search);
    })
    .sort((a, b) => (b.inspectionDate || '').localeCompare(a.inspectionDate || ''));
}

function renderCheckpointPrintSections(record) {
  if (!record.checkpoints) return '';

  return CHECKPOINT_SECTIONS.map(section => {
    const rows = section.items.map(item => {
      const value = record.checkpoints?.[section.key]?.[item.key] || {};
      return `
        <tr>
          <td>${escapeHtml(item.label)}</td>
          <td>${escapeHtml(value.status || 'Not Checked')}</td>
          <td>${escapeHtml(value.notes || '')}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="section">
        <div class="title">${escapeHtml(section.title)}</div>
        <table class="subtable">
          <thead><tr><th>Checkpoint</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }).join('');
}

function printRecord(record) {
  const popup = window.open('', '_blank');
  if (!popup) return;

  const photos = (record.photoLinks || [])
    .map(rawUrl => {
      const safeUrl = normalizeHttpUrl(rawUrl);
      if (!safeUrl) {
        return `<li>${escapeHtml(rawUrl)}</li>`;
      }
      const escaped = escapeHtml(safeUrl);
      return `<li><a href="${escaped}" target="_blank" rel="noopener">${escaped}</a></li>`;
    })
    .join('');

  const d = record.details || {};
  const checkpointMarkup = renderCheckpointPrintSections(record);
  const recordProfileKey = record.scoringProfile || record.scoreSnapshot?.profileKey || 'dealer';
  const recordProfileConfig = getProfileConfig(recordProfileKey);
  const derivedScore = calculateScorecard(record.checkpoints || {}, recordProfileConfig).overall;
  const score = record.scoreSnapshot || {
    suggestedStatus: suggestOverallStatus({ overall: derivedScore, sections: [] }, recordProfileConfig).status,
    profileLabel: recordProfileConfig.label,
    completionPct: derivedScore.completionPct,
    qualityPct: derivedScore.qualityPct,
    weightedQualityPct: derivedScore.weightedQualityPct,
    qualityTier: derivedScore.qualityTier,
    pass: derivedScore.pass,
    attention: derivedScore.attention,
    fail: derivedScore.fail,
    notChecked: derivedScore.notChecked
  };

  popup.document.write(`
    <html>
      <head>
        <title>Inspection Report - ${escapeHtml(record.vehicle)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 18px; color: #111827; }
          h1 { margin-bottom: 6px; }
          .meta { margin-bottom: 14px; color: #374151; line-height: 1.5; }
          .meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; }
          .section { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
          .title { font-weight: 700; margin-bottom: 6px; }
          .notes { white-space: pre-wrap; }
          .subtable { width: 100%; border-collapse: collapse; }
          .subtable th, .subtable td { border-bottom: 1px solid #e5e7eb; padding: 6px; text-align: left; font-size: 12px; vertical-align: top; }
          .subtable th { background: #f3f4f6; }
        </style>
      </head>
      <body>
        <h1>Inspection Report</h1>
        <div class="meta">
          <div><strong>Vehicle:</strong> ${escapeHtml(record.vehicle)}</div>
          <div><strong>VIN:</strong> ${escapeHtml(record.vin)}</div>
          <div><strong>Stock Number:</strong> ${escapeHtml(record.stockNumber)}</div>
          <div><strong>Mileage:</strong> ${escapeHtml(record.mileage)}</div>
          <div><strong>Date:</strong> ${escapeHtml(record.inspectionDate)}</div>
          <div><strong>Inspector:</strong> ${escapeHtml(record.inspector)}</div>
          <div><strong>Overall Status:</strong> ${escapeHtml(record.overallStatus)}</div>
        </div>

        <div class="section">
          <div class="title">Vehicle & Inspection Details</div>
          <div class="meta-grid">
            <div><strong>Year:</strong> ${escapeHtml(d.year)}</div>
            <div><strong>Make:</strong> ${escapeHtml(d.make)}</div>
            <div><strong>Model:</strong> ${escapeHtml(d.model)}</div>
            <div><strong>Trim:</strong> ${escapeHtml(d.trim)}</div>
            <div><strong>Current Paint:</strong> ${escapeHtml(d.paintColor)}</div>
            <div><strong>Original Paint:</strong> ${escapeHtml(d.originalPaintColor)}</div>
            <div><strong>Paint Originality:</strong> ${escapeHtml(d.paintOriginality)}</div>
            <div><strong>Current Interior:</strong> ${escapeHtml(d.interiorColor)}</div>
            <div><strong>Original Interior:</strong> ${escapeHtml(d.originalInteriorColor)}</div>
            <div><strong>Interior Originality:</strong> ${escapeHtml(d.interiorOriginality)}</div>
            <div><strong>Current Engine:</strong> ${escapeHtml(d.engineType)}</div>
            <div><strong>Original Engine:</strong> ${escapeHtml(d.originalEngineType)}</div>
            <div><strong>Engine Originality:</strong> ${escapeHtml(d.engineOriginality)}</div>
            <div><strong>Current Transmission:</strong> ${escapeHtml(d.transmissionType)}</div>
            <div><strong>Original Transmission:</strong> ${escapeHtml(d.originalTransmissionType)}</div>
            <div><strong>Transmission Originality:</strong> ${escapeHtml(d.transmissionOriginality)}</div>
            <div><strong>Numbers Matching:</strong> ${escapeHtml(d.numbersMatchClaim)}</div>
            <div><strong>Observed Block Stamp/Casting #:</strong> ${escapeHtml(d.blockStampNumber)}</div>
            <div><strong>Original Block Stamp/Casting #:</strong> ${escapeHtml(d.originalBlockStampNumber)}</div>
            <div><strong>Observed Heads Stamp/Casting #:</strong> ${escapeHtml(d.headsStampNumber)}</div>
            <div><strong>Original Heads Stamp/Casting #:</strong> ${escapeHtml(d.originalHeadsStampNumber)}</div>
            <div><strong>Observed Transmission Stamp/Casting #:</strong> ${escapeHtml(d.transStampNumber)}</div>
            <div><strong>Original Transmission Stamp/Casting #:</strong> ${escapeHtml(d.originalTransStampNumber)}</div>
            <div><strong>Drivetrain:</strong> ${escapeHtml(d.drivetrain)}</div>
            <div><strong>Location:</strong> ${escapeHtml(d.inspectionLocation)}</div>
            <div><strong>Weather:</strong> ${escapeHtml(d.weather)}</div>
            <div><strong>Title:</strong> ${escapeHtml(d.titleStatus)}</div>
            <div><strong>Seller:</strong> ${escapeHtml(d.sellerName)}</div>
            <div><strong>Seller Contact:</strong> ${escapeHtml(d.sellerContact)}</div>
            <div><strong>Driven By:</strong> ${escapeHtml(d.drivenBy)}</div>
            <div><strong>Road Test Miles:</strong> ${escapeHtml(d.testMiles)}</div>
            <div><strong>Docs Available:</strong> ${escapeHtml(d.docsAvailable)}</div>
            <div><strong>Immediate Safety Concern:</strong> ${escapeHtml(d.immediateSafety)}</div>
            <div><strong>Repair Estimate:</strong> ${escapeHtml(d.repairEstimate)}</div>
            <div><strong>Next Service Date:</strong> ${escapeHtml(d.nextServiceDate)}</div>
          </div>
        </div>

        <div class="section">
          <div class="title">Score Summary</div>
          <div class="meta-grid">
            <div><strong>Scoring Profile:</strong> ${escapeHtml(score.profileLabel || recordProfileConfig.label)}</div>
            <div><strong>Suggested Status:</strong> ${escapeHtml(score.suggestedStatus)}</div>
            <div><strong>Completion:</strong> ${toPercent(score.completionPct || 0)}</div>
            <div><strong>Weighted Quality:</strong> ${toPercent(score.weightedQualityPct || score.qualityPct || 0)}</div>
            <div><strong>Quality Tier:</strong> ${escapeHtml(score.qualityTier || 'Unverified')}</div>
            <div><strong>Pass:</strong> ${escapeHtml(score.pass)}</div>
            <div><strong>Needs Attention:</strong> ${escapeHtml(score.attention)}</div>
            <div><strong>Fail:</strong> ${escapeHtml(score.fail)}</div>
            <div><strong>Not Checked:</strong> ${escapeHtml(score.notChecked)}</div>
          </div>
        </div>

        ${checkpointMarkup}

        <div class="section"><div class="title">Summary</div><div class="notes">${escapeHtml(record.summaryNotes)}</div></div>
        <div class="section"><div class="title">Photo Links</div><ul>${photos || '<li>None</li>'}</ul></div>
      </body>
    </html>
  `);

  popup.document.close();
  popup.focus();
  popup.print();
}

function renderStats() {
  const total = records.length;
  const passed = records.filter(r => r.overallStatus === 'Pass').length;
  const attention = records.filter(r => r.overallStatus === 'Needs Attention').length;
  const failed = records.filter(r => r.overallStatus === 'Not Ready').length;

  els.totalReports.textContent = total;
  els.passedReports.textContent = passed;
  els.attentionReports.textContent = attention;
  els.failedReports.textContent = failed;
}

function renderTable() {
  const list = filteredRecords();

  if (list.length === 0) {
    els.recordsTableBody.innerHTML = '<tr><td colspan="6" class="tiny">No matching records.</td></tr>';
    renderStats();
    return;
  }

  els.recordsTableBody.innerHTML = '';

  list.forEach(record => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(record.inspectionDate)}</td>
      <td>${escapeHtml(record.vehicle)}</td>
      <td>${escapeHtml(record.vin)}</td>
      <td>${escapeHtml(record.inspector)}</td>
      <td><span class="status-badge ${statusClass(record.overallStatus)}">${escapeHtml(record.overallStatus || 'Unknown')}</span></td>
      <td class="row-actions">
        <button type="button" data-action="edit" data-id="${record.id}">Edit</button>
        <button type="button" data-action="print" data-id="${record.id}">Print</button>
        <button type="button" data-action="delete" data-id="${record.id}">Delete</button>
      </td>
    `;

    els.recordsTableBody.appendChild(row);
  });

  renderStats();
}

function exportJson() {
  const rows = records.map(toRepairRequestRow);
  if (!rows.length) {
    alert('No records to export.');
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map(row => headers.map(h => csvEscape(row[h])).join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `repair-request-data-dump-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importJsonFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsedRows = parseCsv((reader.result || '').toString());
      if (parsedRows.length < 2) throw new Error('CSV file has no data rows.');

      const headers = parsedRows[0].map(h => normalizeText(h));
      const dataRows = parsedRows.slice(1);

      const mergedById = new Map(records.map(r => [r.id, r]));
      dataRows.forEach((row, idx) => {
        if (!row || !row.length) return;

        const get = name => {
          const i = headers.indexOf(normalizeText(name));
          return i >= 0 ? (row[i] || '').toString().trim() : '';
        };

        const vehicle = get('Vehicle ID');
        const inspectionDate = get('Date');
        const vin = get('VIN');
        const stockNumber = get('Stock Number').replace(/\D/g, '').slice(0, 5);
        const inspector = get('Inspector');
        const overallStatus = get('Cause') || 'Needs Attention';
        const repairEstimate = get('Cost (USD)');
        const summaryNotes = get('Notes');

        const id = `insp_csv_${Date.now()}_${idx}`;
        const record = {
          id,
          vehicle,
          vin,
          stockNumber,
          mileage: '',
          inspectionDate,
          inspector,
          overallStatus,
          scoringProfile: 'dealer',
          details: {
            year: '',
            make: '',
            model: '',
            trim: '',
            paintColor: get('Current Paint'),
            originalPaintColor: get('Original Paint'),
            paintOriginality: get('Paint Originality'),
            interiorColor: get('Current Interior'),
            originalInteriorColor: get('Original Interior'),
            interiorOriginality: get('Interior Originality'),
            engineType: get('Current Engine'),
            originalEngineType: get('Original Engine'),
            engineOriginality: get('Engine Originality'),
            transmissionType: get('Current Transmission'),
            originalTransmissionType: get('Original Transmission'),
            transmissionOriginality: get('Transmission Originality'),
            numbersMatchClaim: get('Numbers Matching Verification'),
            blockStampNumber: get('Observed Block Stamp/Casting #'),
            originalBlockStampNumber: get('Original Block Stamp/Casting #'),
            headsStampNumber: get('Observed Heads Stamp/Casting #'),
            originalHeadsStampNumber: get('Original Heads Stamp/Casting #'),
            transStampNumber: get('Observed Transmission Stamp/Casting #'),
            originalTransStampNumber: get('Original Transmission Stamp/Casting #'),
            numbersMatchingResult: get('Numbers Matching Result'),
            drivetrain: '',
            inspectionLocation: '',
            weather: '',
            titleStatus: '',
            sellerName: '',
            sellerContact: '',
            drivenBy: '',
            testMiles: '',
            docsAvailable: '',
            immediateSafety: '',
            repairEstimate,
            nextServiceDate: ''
          },
          checkpoints: collectCheckpointsFromForm(),
          autoStatusEnabled: true,
          scoreSnapshot: {
            profileKey: 'dealer',
            profileLabel: getProfileConfig('dealer').label,
            suggestedStatus: get('Suggested Status') || overallStatus,
            suggestedRule: 'Imported from repair-request CSV',
            numbersMatchingResult: get('Numbers Matching Result'),
            completionPct: 0,
            qualityPct: 0,
            weightedQualityPct: 0,
            qualityTier: 'Unverified',
            pass: 0,
            attention: 0,
            fail: 0,
            notChecked: 0
          },
          summaryNotes,
          photoLinks: [],
          updatedAt: new Date().toISOString()
        };

        mergedById.set(record.id, record);
      });

      records = Array.from(mergedById.values());
      saveRecords();
      renderTable();
      alert(`Imported ${dataRows.length} record(s) from spreadsheet CSV.`);
    } catch (error) {
      console.error(error);
      alert('Could not import CSV. Please check spreadsheet format and headers.');
    }
  };

  reader.readAsText(file);
  els.importJsonInput.value = '';
}

function handleTableAction(event) {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;

  const { action, id } = btn.dataset;
  const record = records.find(r => r.id === id);
  if (!record) return;

  if (action === 'edit') {
    fillForm(record);
    return;
  }

  if (action === 'print') {
    printRecord(record);
    return;
  }

  if (action === 'delete') {
    if (!confirm(`Delete inspection for ${record.vehicle}?`)) return;
    records = records.filter(r => r.id !== id);
    saveRecords();
    renderTable();
  }
}

function handleSubmit(event) {
  event.preventDefault();

  // Only save on explicit Save button click; ignore implicit form submits.
  if (event.submitter && event.submitter.id !== 'saveRecordBtn') {
    return;
  }

  const stockValue = (els.stockNumber.value || '').replace(/\D/g, '').slice(0, 5);
  els.stockNumber.value = stockValue;

  if (!/^\d{3,5}$/.test(stockValue)) {
    alert('Stock Number must be numeric and between 3 and 5 digits.');
    els.stockNumber.focus();
    return;
  }

  renderScorecardFromForm();
  const record = buildRecordFromForm();
  const existingIndex = records.findIndex(r => r.id === record.id);
  const isNewRecord = existingIndex < 0;

  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.push(record);
  }

  // Keep working on the same record instead of clearing everything.
  els.editingId.value = record.id;

  saveRecords();
  renderTable();

  if (isNewRecord) {
    appendRecordToSpreadsheet(record)
      .then(() => {
        const rowIndex = records.findIndex(r => r.id === record.id);
        if (rowIndex >= 0) {
          records[rowIndex].sheetSyncedAt = new Date().toISOString();
          saveRecords();
        }
        alert('Record saved and appended to your Google Sheet tab as a new row.');
      })
      .catch(error => {
        console.error('Spreadsheet append failed:', error);
        alert('Record saved locally, but Google Sheet append failed. Sign in when prompted and try Save again for this inspection.');
      });
    return;
  }

  alert('Record updated. Existing spreadsheet rows are not overwritten.');
}

function wireEvents() {
  els.form.addEventListener('submit', handleSubmit);

  ['year', 'make', 'model'].forEach(field => {
    els[field].addEventListener('input', syncVehicleFromParts);
  });

  els.stockNumber.addEventListener('input', () => {
    els.stockNumber.value = (els.stockNumber.value || '').replace(/\D/g, '').slice(0, 5);
  });
  els.resetFormBtn.addEventListener('click', resetForm);
  els.clearVehicleDetailsBtn.addEventListener('click', clearVehicleAndHeaderFields);
  els.clearCheckpointsBtn.addEventListener('click', clearCheckpointsOnly);
  els.clearNotesBtn.addEventListener('click', clearSummaryAndPhotos);
  els.clearAllFormBtn.addEventListener('click', () => {
    if (!confirm('Clear the entire form? Unsaved changes will be lost.')) return;
    resetForm();
  });
  els.printCurrentBtn.addEventListener('click', () => {
    if (!els.vehicle.value.trim() || !els.inspectionDate.value) {
      alert('Enter at least vehicle and inspection date before printing.');
      return;
    }
    printRecord(buildRecordFromForm());
  });

  els.searchInput.addEventListener('input', renderTable);
  els.statusFilter.addEventListener('change', renderTable);

  els.recordsTableBody.addEventListener('click', handleTableAction);

  // Keep scorecard and suggested status current as checkpoints are filled out.
  els.checkpointsContainer.addEventListener('input', renderScorecardFromForm);
  els.checkpointsContainer.addEventListener('change', renderScorecardFromForm);
  els.scoringProfile.addEventListener('change', renderScorecardFromForm);
  els.autoStatusToggle.addEventListener('change', renderScorecardFromForm);
  els.overallStatus.addEventListener('change', renderScorecardFromForm);

  if (els.createSheetTabBtn) {
    els.createSheetTabBtn.addEventListener('click', async () => {
      try {
        const sheetTitle = await createOrVerifySpreadsheetTab();
        alert(`Spreadsheet tab ready: ${sheetTitle}. New inspections will append as new rows in this single tab.`);
      } catch (error) {
        console.error('Create/verify spreadsheet tab failed:', error);
        alert('Could not create/verify spreadsheet tab. Please sign in with Google and try again.');
      }
    });
  }

  els.exportJsonBtn.addEventListener('click', exportJson);
  els.importJsonInput.addEventListener('change', e => importJsonFile(e.target.files[0]));

  els.clearAllBtn.addEventListener('click', () => {
    if (!records.length) return;
    if (!confirm('Delete all inspection records? This cannot be undone.')) return;

    records = [];
    saveRecords();
    renderTable();
    resetForm();
  });
}

function init() {
  renderCheckpoints();
  records = readRecords();
  wireEvents();
  resetForm();
  renderTable();
}

init();
