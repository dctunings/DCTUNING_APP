export interface VINResult {
  vin: string
  make: string
  model: string
  year: string
  engineDisplacement: string
  fuelType: string
  bodyClass: string
  driveType: string
  transmissionStyle: string
  engineCylinders: string
  plantCountry: string
  errorCode: string
  errorText: string
  isEuropean: boolean
  wmi: string
}

// VIN position 10 year encoding — full two-cycle table (1980-2039)
// Letters skip I, O, Q, U, Z; digits skip 0
const VIN_YEAR_MAP: Record<string, number> = {
  // First cycle 1980–2009
  'A': 1980, 'B': 1981, 'C': 1982, 'D': 1983, 'E': 1984, 'F': 1985,
  'G': 1986, 'H': 1987, 'J': 1988, 'K': 1989, 'L': 1990, 'M': 1991,
  'N': 1992, 'P': 1993, 'R': 1994, 'S': 1995, 'T': 1996, 'V': 1997,
  'W': 1998, 'X': 1999, 'Y': 2000,
  '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005, '6': 2006,
  '7': 2007, '8': 2008, '9': 2009,
}

// Fix the 30-year cycle: A=1980 OR A=2010 — pick the correct one
function decodeVINYear(vin: string, fallback: string): string {
  const currentYear = new Date().getFullYear()

  // Try position 10 (index 9) first — standard model year position
  for (const idx of [9, 10]) {
    const yearChar = vin[idx]?.toUpperCase()
    if (!yearChar) continue
    const baseYear = VIN_YEAR_MAP[yearChar]
    if (!baseYear) continue

    // For letters (first cycle 1980-2000): prefer +30 year if it's plausible
    if (baseYear <= 2000) {
      const laterYear = baseYear + 30
      if (laterYear <= currentYear + 2) return String(laterYear)
    }
    // For digits (2001-2009): prefer +20 year if it's plausible
    if (baseYear >= 2001 && baseYear <= 2009) {
      const laterYear = baseYear + 20
      if (laterYear <= currentYear + 2) return String(laterYear)
    }
    return String(baseYear)
  }

  return fallback
}

// EU WMI first-character prefixes — VINs starting with these are European and must NOT call NHTSA
const EU_WMI_PREFIXES = new Set(['W', 'S', 'V', 'T', 'Y', 'Z', 'X', 'U', 'N'])

// European WMI (World Manufacturer Identifier) — first 3 chars of VIN
// Covers the main brands you'd see in Ireland
const EUROPEAN_WMI: Record<string, { make: string; country: string }> = {
  // Germany
  'WVW': { make: 'Volkswagen',    country: 'Germany' },
  'WV1': { make: 'Volkswagen',    country: 'Germany' },
  'WV2': { make: 'Volkswagen',    country: 'Germany' },
  'WAU': { make: 'Audi',          country: 'Germany' },
  'WA1': { make: 'Audi',          country: 'Germany' },
  'WBA': { make: 'BMW',           country: 'Germany' },
  'WBS': { make: 'BMW',           country: 'Germany' },
  'WBX': { make: 'BMW',           country: 'Germany' },
  'WDB': { make: 'Mercedes-Benz', country: 'Germany' },
  'WDC': { make: 'Mercedes-Benz', country: 'Germany' },
  'WDD': { make: 'Mercedes-Benz', country: 'Germany' },
  'WDF': { make: 'Mercedes-Benz', country: 'Germany' },
  'W0L': { make: 'Opel',          country: 'Germany' },
  'WF0': { make: 'Ford',          country: 'Germany' },
  'WP0': { make: 'Porsche',       country: 'Germany' },
  'WP1': { make: 'Porsche',       country: 'Germany' },
  'WMW': { make: 'MINI',          country: 'Germany' },
  'WME': { make: 'Smart',         country: 'Germany' },
  'WKK': { make: 'Volkswagen',    country: 'Germany' },
  'W1K': { make: 'Mercedes-Benz', country: 'Germany' },
  'WMX': { make: 'Mercedes-Benz', country: 'Germany' },
  'WMA': { make: 'Mercedes-Benz', country: 'Germany' },
  'WAP': { make: 'Porsche',       country: 'Germany' },
  'W1V': { make: 'Mercedes-Benz', country: 'Germany' },
  // Spain
  'VSS': { make: 'SEAT',          country: 'Spain' },
  'VSK': { make: 'SEAT',          country: 'Spain' },
  'VSA': { make: 'SEAT',          country: 'Spain' },
  'VS6': { make: 'Ford',          country: 'Spain' },
  'VS7': { make: 'Ford',          country: 'Spain' },
  // Czech Republic
  'TMB': { make: 'Skoda',         country: 'Czech Republic' },
  'TM9': { make: 'Skoda',         country: 'Czech Republic' },
  // UK
  'SAJ': { make: 'Jaguar',        country: 'United Kingdom' },
  'SAL': { make: 'Land Rover',    country: 'United Kingdom' },
  'SCC': { make: 'Lotus',         country: 'United Kingdom' },
  'SCB': { make: 'Bentley',       country: 'United Kingdom' },
  'SCA': { make: 'Rolls-Royce',   country: 'United Kingdom' },
  'SUF': { make: 'Ford',          country: 'United Kingdom' },
  'SHH': { make: 'Honda',         country: 'United Kingdom' },
  'NM0': { make: 'Ford',          country: 'United Kingdom' },
  'SFD': { make: 'Ford',          country: 'United Kingdom' },
  'SAA': { make: 'Aston Martin',  country: 'United Kingdom' },
  'SBM': { make: 'McLaren',       country: 'United Kingdom' },
  'SUP': { make: 'Ford',          country: 'United Kingdom' },
  // France
  'VF1': { make: 'Renault',       country: 'France' },
  'VF3': { make: 'Peugeot',       country: 'France' },
  'VF7': { make: 'Citroën',       country: 'France' },
  'VF6': { make: 'Citroën',       country: 'France' },
  'VN1': { make: 'Renault',       country: 'France' },
  'VF0': { make: 'Renault',       country: 'France' },
  'VF2': { make: 'Renault',       country: 'France' },
  'VF8': { make: 'Renault',       country: 'France' },
  'VR1': { make: 'Renault',       country: 'France' },
  'VG5': { make: 'Renault',       country: 'France' },
  'VNE': { make: 'Renault',       country: 'France' },
  'VF4': { make: 'Peugeot',       country: 'France' },
  'VF9': { make: 'Peugeot',       country: 'France' },
  'VNK': { make: 'Toyota',        country: 'France' },
  'VNV': { make: 'Nissan',        country: 'France' },
  // Italy
  'ZFA': { make: 'Fiat',          country: 'Italy' },
  'ZFB': { make: 'Fiat',          country: 'Italy' },
  'ZFF': { make: 'Ferrari',       country: 'Italy' },
  'ZHW': { make: 'Lamborghini',   country: 'Italy' },
  'ZAR': { make: 'Alfa Romeo',    country: 'Italy' },
  'ZBB': { make: 'Alfa Romeo',    country: 'Italy' },
  'ZCF': { make: 'Iveco',         country: 'Italy' },
  'ZLA': { make: 'Alfa Romeo',    country: 'Italy' },
  'ZAM': { make: 'Maserati',      country: 'Italy' },
  // Sweden
  'YV1': { make: 'Volvo',         country: 'Sweden' },
  'YV4': { make: 'Volvo',         country: 'Sweden' },
  'YS2': { make: 'Scania',        country: 'Sweden' },
  'XLR': { make: 'DAF',           country: 'Netherlands' },
  // Romania
  'UU1': { make: 'Dacia',         country: 'Romania' },
  'UU3': { make: 'Dacia',         country: 'Romania' },
  // Russia
  'XTA': { make: 'Lada',          country: 'Russia' },
  // Hungary
  'TRU': { make: 'Audi',          country: 'Hungary' },
  // Slovakia
  'TYA': { make: 'Volkswagen',    country: 'Slovakia' },
  // Korea (common in Ireland)
  'KNA': { make: 'Kia',           country: 'South Korea' },
  'KNB': { make: 'Kia',           country: 'South Korea' },
  'KNC': { make: 'Kia',           country: 'South Korea' },
  'KMH': { make: 'Hyundai',       country: 'South Korea' },
  'KMF': { make: 'Hyundai',       country: 'South Korea' },
  // Japan
  'JHM': { make: 'Honda',         country: 'Japan' },
  'JN1': { make: 'Nissan',        country: 'Japan' },
  'JN3': { make: 'Nissan',        country: 'Japan' },
  'JT2': { make: 'Toyota',        country: 'Japan' },
  'JT3': { make: 'Toyota',        country: 'Japan' },
  'JMB': { make: 'Mitsubishi',    country: 'Japan' },
  'JS3': { make: 'Suzuki',        country: 'Japan' },
}

// ─── VW VDS — positions 7-8 (index 6-7) ───────────────────────────────────
const VW_MODEL_CODES: Record<string, string> = {
  '1H': 'Golf (Mk3)', '1J': 'Golf (Mk4)', '1K': 'Golf (Mk5/6)',
  'AU': 'Golf (Mk7)', 'BW': 'Golf (Mk8)',
  '9N': 'Polo (Mk4)', '6R': 'Polo (Mk5)', 'AW': 'Polo (Mk6)',
  '6C': 'Polo (Mk5)', '6N': 'Polo (Mk3)',
  '3B': 'Passat (B5)', '3C': 'Passat (B6/B7)', '3G': 'Passat (B8)',
  '1T': 'Touran', '1P': 'Touran (Mk2)',
  '7L': 'Touareg (1st)', '7P': 'Touareg (2nd)', 'CR': 'Touareg (3rd)',
  '5N': 'Tiguan (1st)', 'AD': 'Tiguan (2nd)',
  '7N': 'Sharan', '1Z': 'Caddy', '2E': 'Crafter',
  'SG': 'T5 Transporter', 'SH': 'T6 Transporter', 'SZ': 'T7 Transporter',
  '9M': 'Jetta', '1B': 'Corrado',
  'MZ': 'ID.3', 'MH': 'ID.4', 'EZ': 'ID.5',
}

// ─── Audi VDS — positions 7-8 ───────────────────────────────────────────────
const AUDI_MODEL_CODES: Record<string, string> = {
  '8L': 'A3 (8L)', '8P': 'A3 (8P)', '8V': 'A3 (8V)', '8Y': 'A3 (8Y)',
  '8D': 'A4 (B5)', '8E': 'A4 (B6/B7)', '8K': 'A4 (B8)', '8W': 'A4 (B9)',
  '4B': 'A6 (C5)', '4F': 'A6 (C6)', '4G': 'A6 (C7)', '4K': 'A6 (C8)',
  '4D': 'A8 (D2)', '4E': 'A8 (D3)', '4H': 'A8 (D4)', 'F8': 'A8 (D5)',
  '8N': 'TT (Mk1)', '8J': 'TT (Mk2)', 'FV': 'Q3', '8U': 'Q3 (1st)',
  '4L': 'Q7 (1st)', '4M': 'Q7 (2nd)', '8R': 'Q5 (1st)', 'FY': 'Q5 (2nd)',
  'GE': 'Q4 e-tron', 'GB': 'e-tron',
  '8S': 'TT RS / TTRS', '4T': 'RS5',
}

// ─── BMW VDS — from position 4 (index 3) ────────────────────────────────────
// BMW encodes series in char 4, NOT in a 3-char platform string like E46/F30.
// Those body codes exist internally but are NOT present in the VIN string.
interface BmwDecode {
  model: string
  bodyClass: string
  engineDisplacement: string
  engineCylinders: string
}

function decodeBMW(vin: string, wmi: string): BmwDecode {
  const char4  = vin[3]?.toUpperCase() || ''
  const chars56 = vin.substring(4, 6).toUpperCase()
  const char7  = vin[6] || ''

  // WBX = X-SUV range; WBS = M GmbH; WBY = i-series; WBA = standard sedan/touring
  let model    = ''
  let bodyClass = 'Saloon'

  if (wmi === 'WBX') {
    const xMap: Record<string, string> = {
      '1':'X1','2':'X2','3':'X3','4':'X4','5':'X5','6':'X6','7':'X7',
    }
    model = xMap[char4] || 'X Series'
    bodyClass = 'SUV'
  } else if (wmi === 'WBS') {
    const mMap: Record<string, string> = {
      '2':'M2','3':'M3','4':'M4','5':'M5','6':'M6','8':'M8',
    }
    model = mMap[char4] || 'M Series'
    bodyClass = 'Saloon'
  } else if (wmi === 'WBY') {
    model = char4 === '3' ? 'i3' : char4 === '8' ? 'i8' : 'i Series'
    bodyClass = char4 === '8' ? 'Coupé' : 'Hatchback'
  } else {
    // WBA — standard passenger car; char 4 = series number
    const seriesMap: Record<string, string> = {
      '1':'1 Series','2':'2 Series','3':'3 Series','4':'4 Series',
      '5':'5 Series','6':'6 Series','7':'7 Series','8':'8 Series',
    }
    model = seriesMap[char4] || ''

    // Refine body class from chars 5-6
    if (char4 === '4') {
      // 4 Series: E_=Gran Coupé, C_/U_=Coupé, 3_/D_=Cabriolet
      if (chars56[0] === 'E') bodyClass = 'Gran Coupé'
      else if (chars56[0] === 'C' || chars56[0] === 'U') bodyClass = 'Coupé'
      else if (chars56[0] === '3' || chars56[0] === 'D') bodyClass = 'Cabriolet'
      else bodyClass = 'Coupé'
    } else if (char4 === '3') {
      if (chars56[0] === 'H' || chars56[0] === 'G') bodyClass = 'Touring'
      else if (chars56[0] === 'F') bodyClass = 'Gran Turismo'
      else bodyClass = 'Saloon'
    } else if (char4 === '5') {
      if (chars56[0] === 'H') bodyClass = 'Touring'
      else bodyClass = 'Saloon'
    } else if (char4 === '2') {
      if (chars56[0] === 'F' || chars56[0] === 'U') bodyClass = 'Active Tourer'
      else bodyClass = 'Coupé'
    } else if (char4 === '1') {
      bodyClass = 'Hatchback'
    }
  }

  // Engine displacement: char 7 is a rough engine indicator in BMW VDS
  const dispMap: Record<string, string> = {
    '2':'2.0','3':'3.0','4':'4.4','5':'5.0','6':'6.0',
  }
  const engineDisplacement = dispMap[char7] || ''

  // Cylinders inferred from displacement
  let engineCylinders = ''
  if (engineDisplacement === '2.0') engineCylinders = '4'
  else if (engineDisplacement === '3.0') engineCylinders = '6'
  else if (['4.4','4.0','5.0','6.0'].includes(engineDisplacement)) engineCylinders = '8'

  return { model, bodyClass, engineDisplacement, engineCylinders }
}

// ─── Mercedes-Benz VDS ────────────────────────────────────────────────────────
function decodeMercedes(vin: string, wmi: string): { model: string; bodyClass: string } {
  const char4 = vin[3]?.toUpperCase() || ''

  if (wmi === 'WDF') return { model: 'Sprinter', bodyClass: 'Van' }
  if (wmi === 'WME') return { model: 'Smart', bodyClass: 'Microcar' }

  // WDC = SUV/SAV range
  if (wmi === 'WDC') {
    const sucMap: Record<string, string> = {
      '1':'GLK-Class','2':'GLC','3':'GLC','4':'GLE / ML-Class',
      '6':'GLS / GL-Class','9':'G-Class','G':'GLA','H':'GLB',
    }
    return { model: sucMap[char4] || 'SUV', bodyClass: 'SUV' }
  }

  // WDB / WDD / W1K — passenger cars
  const classMap: Record<string, string> = {
    '1':'A-Class','2':'B-Class / CLA','4':'C-Class',
    '5':'CLS-Class','6':'E-Class','7':'S-Class',
    '8':'E-Class','9':'S-Class','A':'A-Class',
    'B':'B-Class','C':'C-Class','E':'E-Class','S':'S-Class',
    'G':'G-Class','V':'V-Class','X':'X-Class',
  }
  const bodyMap: Record<string, string> = {
    'V':'MPV', 'X':'Pickup', 'G':'SUV',
  }
  return {
    model:     classMap[char4] || '',
    bodyClass: bodyMap[char4] || 'Saloon',
  }
}

// ─── Opel/Vauxhall VDS ────────────────────────────────────────────────────────
const OPEL_MODEL_CODES: Record<string, string> = {
  'AG': 'Astra G', 'AH': 'Astra H', 'AJ': 'Astra J', 'AK': 'Astra K', 'AL': 'Astra L',
  'CR': 'Corsa C', 'DR': 'Corsa D', 'ER': 'Corsa E', 'FR': 'Corsa F',
  'ZC': 'Zafira A', 'ZB': 'Zafira B', 'M9': 'Mokka', 'MK': 'Mokka X',
  'IN': 'Insignia A', 'B8': 'Insignia B', 'X15': 'Crossland',
  'GJ': 'Grandland', 'ME': 'Meriva', 'AN': 'Antara',
  'VX': 'Vectra C', 'ZF': 'Zafira C',
}

// ─── Skoda VDS ────────────────────────────────────────────────────────────────
const SKODA_MODEL_CODES: Record<string, string> = {
  '1U': 'Octavia (Mk1)', '1Z': 'Octavia (Mk2)', '5E': 'Octavia (Mk3)', 'NX': 'Octavia (Mk4)',
  '9N': 'Fabia (Mk1)', '5J': 'Fabia (Mk2)', '6C': 'Fabia (Mk3)', 'PJ': 'Fabia (Mk4)',
  '1T': 'Superb (B5)', '3T': 'Superb (B6)', 'NG': 'Superb (B8)',
  '5L': 'Rapid', 'NH': 'Karoq', 'NS': 'Kodiaq', 'MK': 'Kamiq', 'JA': 'Scala',
}

// ─── SEAT VDS ────────────────────────────────────────────────────────────────
const SEAT_MODEL_CODES: Record<string, string> = {
  '1M': 'Toledo (Mk2)', '1P': 'Ibiza (Mk3)', '6J': 'Ibiza (Mk4)', '6F': 'Ibiza (Mk5)',
  '1K': 'Leon (Mk2)', '5F': 'Leon (Mk3)', 'KL': 'Leon (Mk4)',
  '6L': 'Ibiza', '6K': 'Ibiza (Mk2)',
  'KH': 'Ateca', 'KM': 'Tarraco', 'KJ': 'Arona',
}

// ─── Renault VDS ─────────────────────────────────────────────────────────────
const RENAULT_MODEL_CODES: Record<string, string> = {
  'BB': 'Clio (Mk2)', 'CB': 'Clio (Mk3)', 'SB': 'Clio (Mk4)', 'BH': 'Clio (Mk5)',
  'BM': 'Mégane I', 'CM': 'Mégane II', 'DZ': 'Mégane III', 'BF': 'Mégane IV',
  'BK': 'Scénic I', 'JM': 'Scénic II', 'JZ': 'Scénic III',
  'FH': 'Laguna I', 'BG': 'Laguna II', 'DT': 'Laguna III',
  'BB0': 'Twingo', 'BJ': 'Captur', 'BN': 'Kadjar', 'BH0': 'Arkana',
  'AH': 'Kangoo', 'FC': 'Trafic',
}

// ─── Peugeot VDS ─────────────────────────────────────────────────────────────
const PEUGEOT_MODEL_CODES: Record<string, string> = {
  '1A': '206', '1C': '207', '9A': '208', 'HB': '208 (Mk2)',
  '3C': '307', '3D': '308 (Mk1)', 'T9': '308 (Mk2)', 'P5': '308 (Mk3)',
  'TA': '3008 (Mk2)', '0U': '2008', 'P4': '2008 (Mk2)',
  '3G': '407', '4D': '508 (Mk1)', 'R8': '508 (Mk2)',
  '7C': 'Partner', '9H': 'Expert', '4E': '5008',
}

// ─── Citroën VDS ──────────────────────────────────────────────────────────────
const CITROEN_MODEL_CODES: Record<string, string> = {
  'BB': 'C2', 'CB': 'C3 (Mk1)', 'SB': 'C3 (Mk2)', 'MC': 'C3 (Mk3)',
  'TD': 'C4 (Mk1)', 'LA': 'C4 (Mk2)', 'BD': 'C4 Cactus', 'NC': 'C4 (Mk3)',
  'BX': 'C5 (Mk1)', 'RD': 'C5 (Mk2)', 'X7': 'C5 Aircross',
  'MH': 'Berlingo', 'GJ': 'Dispatch', 'AU': 'C-Crosser',
}

// ─── Fiat VDS ────────────────────────────────────────────────────────────────
const FIAT_MODEL_CODES: Record<string, string> = {
  '18': '500', '31': 'Punto (Mk2)', '18X': '500X', '19': 'Bravo',
  '3S': 'Stilo', '1H': 'Panda (Mk2)', '3P': 'Punto (Mk3)',
  '1L': 'Doblo', '1B': 'Ducato', 'CR': 'Tipo',
}

// ─── Alfa Romeo VDS ──────────────────────────────────────────────────────────
const ALFA_MODEL_CODES: Record<string, string> = {
  '93': '147', '94': '156', '95': '166', '93A': '147 GTA',
  '97': '159', '1B': 'Giulia', '1C': 'Stelvio',
  'CU': 'Giulietta', '18': 'MiTo',
}

// ─── Volvo VDS ───────────────────────────────────────────────────────────────
const VOLVO_MODEL_CODES: Record<string, string> = {
  'BW': 'V40', 'FW': 'V60', 'FZ': 'V60 CC', 'PW': 'V90',
  'DZ': 'XC60', 'LZ': 'XC90', 'MW': 'XC40',
  'BH': 'C30', 'BF': 'C70', 'FS': 'S60', 'PA': 'S90',
}

// ─── Kia / Hyundai VDS ────────────────────────────────────────────────────────
const KIA_MODEL_CODES: Record<string, string> = {
  'CF': 'Ceed', 'DF': 'Ceed', 'CD': 'ProCeed',
  'HA': 'Sportage (Mk4)', 'QL': 'Sportage (Mk3)',
  'XCW': 'Stonic', 'SP2': 'Niro',
}
const HYUNDAI_MODEL_CODES: Record<string, string> = {
  'FD': 'i30', 'GD': 'i30 (Mk2)', 'PD': 'i30 (Mk3)',
  'PB': 'i20 (Mk1)', 'GB': 'i20 (Mk2)',
  'IA': 'i10', 'TL': 'Tucson (Mk3)', 'JM': 'Tucson',
  'DM': 'Santa Fe (Mk2)', 'CM': 'Santa Fe',
}

// ─── Toyota/Honda/Nissan/Mazda (Japan) VDS ───────────────────────────────────
const TOYOTA_MODEL_CODES: Record<string, string> = {
  'CE1': 'Corolla', 'ZE1': 'Corolla Hybrid', 'HB1': 'Yaris',
  'ZP1': 'GR Yaris', 'RAV4': 'RAV4', 'KC1': 'C-HR',
}
const HONDA_MODEL_CODES: Record<string, string> = {
  'FK1': 'Civic (Mk9)', 'FK7': 'Civic (Mk10)', 'FL4': 'Civic (Mk11)',
  'RU1': 'CR-V', 'YK1': 'Jazz', 'GR': 'HR-V',
}

// ─── Master model/body decode — called for all European + Asian VINs ─────────
function decodeLocalVDS(vin: string, make: string, wmi: string): {
  model: string; bodyClass: string; engineDisplacement: string; engineCylinders: string; fuelType: string
} {
  const chars67 = vin.substring(6, 8).toUpperCase()     // positions 7-8
  const chars45 = vin.substring(3, 5).toUpperCase()     // positions 4-5
  const chars56 = vin.substring(4, 6).toUpperCase()     // positions 5-6
  const chars45_noZ = chars45.replace(/Z/g, '')
  const lm = make.toLowerCase()

  let model = ''
  let bodyClass = ''
  let engineDisplacement = ''
  let engineCylinders = ''
  let fuelType = ''

  if (lm === 'bmw' || lm === 'mini') {
    if (lm === 'mini') {
      // MINI WMW — char 4 gives body type
      const miniMap: Record<string, string> = {
        'A': 'Mini Hatch (3-door)', 'B': 'Mini Hatch (5-door)',
        'C': 'Mini Convertible', 'D': 'Mini Clubman',
        'E': 'Mini Countryman', 'F': 'Mini Coupé', 'G': 'Mini Roadster',
        'H': 'Mini Paceman', 'J': 'Mini Coupe',
      }
      model = miniMap[vin[3]?.toUpperCase() || ''] || 'MINI'
      bodyClass = model.includes('Countryman') || model.includes('Paceman') ? 'SUV' : 'Hatchback'
    } else {
      const bmw = decodeBMW(vin, wmi)
      model = bmw.model
      bodyClass = bmw.bodyClass
      engineDisplacement = bmw.engineDisplacement
      engineCylinders = bmw.engineCylinders
    }
  } else if (lm === 'mercedes-benz' || lm === 'smart') {
    const merc = decodeMercedes(vin, wmi)
    model = merc.model
    bodyClass = merc.bodyClass
  } else if (lm === 'volkswagen') {
    model = VW_MODEL_CODES[chars67] || VW_MODEL_CODES[chars56] || VW_MODEL_CODES[chars45_noZ] || ''
    if (model.includes('Transporter') || model.includes('Crafter') || model.includes('Caddy')) bodyClass = 'Van'
    else if (model.includes('Touareg') || model.includes('Tiguan') || model.includes('T-Roc') || model.includes('ID.4')) bodyClass = 'SUV'
    else if (model.includes('Golf') || model.includes('Polo')) bodyClass = 'Hatchback'
    else bodyClass = 'Saloon'
  } else if (lm === 'audi') {
    model = AUDI_MODEL_CODES[chars67] || AUDI_MODEL_CODES[chars56] || AUDI_MODEL_CODES[chars45_noZ] || ''
    if (model.includes('Q')) bodyClass = 'SUV'
    else if (model.includes('TT')) bodyClass = 'Coupé'
    else bodyClass = 'Saloon'
  } else if (lm === 'skoda') {
    model = SKODA_MODEL_CODES[chars67] || SKODA_MODEL_CODES[chars56] || ''
    if (model.includes('Karoq') || model.includes('Kodiaq') || model.includes('Kamiq')) bodyClass = 'SUV'
    else if (model.includes('Superb') || model.includes('Octavia')) bodyClass = 'Saloon / Estate'
    else bodyClass = 'Hatchback'
  } else if (lm === 'seat') {
    model = SEAT_MODEL_CODES[chars67] || SEAT_MODEL_CODES[chars56] || ''
    if (model.includes('Ateca') || model.includes('Tarraco') || model.includes('Arona')) bodyClass = 'SUV'
    else bodyClass = 'Hatchback'
  } else if (lm === 'opel' || lm === 'vauxhall') {
    model = OPEL_MODEL_CODES[chars67] || OPEL_MODEL_CODES[chars56] || ''
    if (model.includes('Mokka') || model.includes('Grandland') || model.includes('Crossland') || model.includes('Antara')) bodyClass = 'SUV'
    else if (model.includes('Astra')) bodyClass = 'Hatchback'
    else bodyClass = 'Saloon'
  } else if (lm === 'renault') {
    model = RENAULT_MODEL_CODES[chars67] || RENAULT_MODEL_CODES[chars56] || ''
    if (model.includes('Captur') || model.includes('Kadjar') || model.includes('Arkana')) bodyClass = 'SUV'
    else if (model.includes('Kangoo') || model.includes('Trafic')) bodyClass = 'Van'
    else bodyClass = 'Hatchback'
  } else if (lm === 'peugeot') {
    model = PEUGEOT_MODEL_CODES[chars67] || PEUGEOT_MODEL_CODES[chars56] || ''
    if (model.includes('3008') || model.includes('2008') || model.includes('5008')) bodyClass = 'SUV'
    else if (model.includes('Partner') || model.includes('Expert')) bodyClass = 'Van'
    else bodyClass = 'Hatchback'
  } else if (lm === 'citroën' || lm === 'citroen') {
    model = CITROEN_MODEL_CODES[chars67] || CITROEN_MODEL_CODES[chars56] || ''
    if (model.includes('C5 Air') || model.includes('C4 Cac') || model.includes('C-Cross')) bodyClass = 'SUV'
    else if (model.includes('Berlingo') || model.includes('Dispatch')) bodyClass = 'Van'
    else bodyClass = 'Hatchback'
  } else if (lm === 'fiat') {
    model = FIAT_MODEL_CODES[chars67] || FIAT_MODEL_CODES[chars56] || ''
    if (model.includes('500X') || model.includes('Doblo')) bodyClass = 'SUV'
    else bodyClass = 'Hatchback'
  } else if (lm === 'alfa romeo') {
    model = ALFA_MODEL_CODES[chars67] || ALFA_MODEL_CODES[chars56] || ''
    if (model.includes('Stelvio')) bodyClass = 'SUV'
    else bodyClass = 'Saloon'
  } else if (lm === 'volvo') {
    model = VOLVO_MODEL_CODES[chars67] || VOLVO_MODEL_CODES[chars56] || ''
    if (model.startsWith('X')) bodyClass = 'SUV'
    else if (model.startsWith('V')) bodyClass = 'Estate'
    else if (model.startsWith('S')) bodyClass = 'Saloon'
    else bodyClass = 'Saloon'
  } else if (lm === 'land rover') {
    const lrMap: Record<string, string> = {
      'AA': 'Defender', 'BA': 'Discovery Sport', 'CA': 'Range Rover Sport',
      'DA': 'Range Rover', 'FA': 'Freelander', 'LA': 'Discovery',
      'SA': 'Range Rover Evoque', 'KA': 'Velar',
    }
    model = lrMap[chars67] || lrMap[chars56] || ''
    bodyClass = 'SUV'
  } else if (lm === 'jaguar') {
    const jagMap: Record<string, string> = {
      'AJ': 'XJ', 'CA': 'XF', 'DA': 'XE', 'TA': 'F-Pace',
      'KA': 'E-Pace', 'LA': 'I-Pace', 'FA': 'F-Type',
    }
    model = jagMap[chars67] || jagMap[chars56] || ''
    bodyClass = model.includes('Pace') ? 'SUV' : (model === 'F-Type' ? 'Coupé/Roadster' : 'Saloon')
  } else if (lm === 'kia') {
    model = KIA_MODEL_CODES[chars67] || KIA_MODEL_CODES[chars56] || ''
    if (model.includes('Sportage') || model.includes('Stonic') || model.includes('Niro')) bodyClass = 'SUV'
    else bodyClass = 'Hatchback'
  } else if (lm === 'hyundai') {
    model = HYUNDAI_MODEL_CODES[chars67] || HYUNDAI_MODEL_CODES[chars56] || ''
    if (model.includes('Tucson') || model.includes('Santa')) bodyClass = 'SUV'
    else bodyClass = 'Hatchback'
  } else if (lm === 'toyota') {
    model = TOYOTA_MODEL_CODES[chars67] || TOYOTA_MODEL_CODES[chars56] || ''
    bodyClass = model.includes('RAV') || model.includes('C-HR') ? 'SUV' : 'Hatchback'
  } else if (lm === 'honda') {
    model = HONDA_MODEL_CODES[chars67] || HONDA_MODEL_CODES[chars56] || ''
    bodyClass = model.includes('CR-V') || model.includes('HR-V') ? 'SUV' : 'Hatchback'
  }

  return { model, bodyClass, engineDisplacement, engineCylinders, fuelType }
}

// kept for backwards compat
function getEuropeanModel(vin: string, make: string): string {
  return decodeLocalVDS(vin, make, vin.substring(0, 3).toUpperCase()).model
}

/** Returns true if this VIN should be decoded locally (no NHTSA fetch). */
function isEuropeanVIN(vin: string): boolean {
  const firstChar = vin[0]?.toUpperCase()
  if (!firstChar) return false
  return EU_WMI_PREFIXES.has(firstChar)
}

/** Build a VINResult from local tables only — offline fallback. */
function decodeEuropeanVIN(vin: string): VINResult {
  const wmi = vin.substring(0, 3).toUpperCase()
  const europeanInfo = EUROPEAN_WMI[wmi] ?? { make: 'Unknown', country: 'Europe' }
  const make = europeanInfo.make
  const year = decodeVINYear(vin, '')
  const local = decodeLocalVDS(vin, make, wmi)

  return {
    vin,
    make,
    model:             local.model,
    year,
    engineDisplacement: local.engineDisplacement,
    fuelType:           local.fuelType,
    bodyClass:          local.bodyClass,
    driveType: '',
    transmissionStyle: '',
    engineCylinders:    local.engineCylinders,
    plantCountry: europeanInfo.country,
    errorCode: '',
    errorText: '',
    isEuropean: true,
    wmi,
  }
}

export async function decodeVIN(vin: string): Promise<VINResult | null> {
  try {
    const wmi = vin.substring(0, 3).toUpperCase()
    const europeanInfo = EUROPEAN_WMI[wmi]
    const isEuropean = isEuropeanVIN(vin) || !!europeanInfo

    // Always call NHTSA — it has data for BMW, VW, Audi, Mercedes, Renault, etc.
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`
    const res = await fetch(url)
    const json = await res.json()
    const results: { Variable: string; Value: string }[] = json.Results || []

    const get = (variable: string) => {
      const val = results.find((r) => r.Variable === variable)?.Value || ''
      // NHTSA returns "Not Applicable" / "null" as literal strings
      if (val === 'Not Applicable' || val === 'null' || val === '0') return ''
      return val
    }

    // Make: prefer our local WMI table (more accurate casing + branding)
    let make = europeanInfo?.make || ''
    if (!make) {
      const nhtsaMake = results.find((r) => r.Variable === 'Make')?.Value || ''
      if (nhtsaMake && nhtsaMake !== 'Not Applicable') {
        make = nhtsaMake.charAt(0).toUpperCase() + nhtsaMake.slice(1).toLowerCase()
      }
    }

    // Local VDS decode — used to fill any gaps NHTSA leaves blank
    const local = decodeLocalVDS(vin, make, wmi)

    // Model: NHTSA first, then local VDS lookup
    const model = get('Model') || local.model

    // Year: NHTSA first, then VIN position parse
    const nhtsaYear = get('Model Year')
    const correctedYear = decodeVINYear(vin, nhtsaYear)

    // Plant country: local WMI table first, then NHTSA
    const plantCountry = europeanInfo?.country || get('Plant Country') || get('Plant State') || ''

    // Engine displacement: NHTSA first, local estimate as fallback
    const engineDisplacement = get('Displacement (L)') || local.engineDisplacement

    // Cylinders
    const engineCylinders = get('Engine Number of Cylinders') || local.engineCylinders

    // Body class
    const bodyClass = get('Body Class') || local.bodyClass

    // Clean up NHTSA fuel type
    let fuelType = get('Fuel Type - Primary') || local.fuelType
    if (fuelType.toLowerCase().includes('gasoline')) fuelType = 'Petrol'
    if (fuelType.toLowerCase().includes('diesel')) fuelType = 'Diesel'

    // If NHTSA returned nothing useful and this is a known EU WMI, fall back to local
    if (!make && isEuropean) {
      return decodeEuropeanVIN(vin)
    }

    return {
      vin,
      make,
      model,
      year: correctedYear,
      engineDisplacement,
      fuelType,
      bodyClass,
      driveType: get('Drive Type'),
      transmissionStyle: get('Transmission Style'),
      engineCylinders,
      plantCountry,
      errorCode: get('Error Code'),
      errorText: get('Error Text'),
      isEuropean,
      wmi,
    }
  } catch {
    // Network failure — fall back to local decode for European VINs
    if (isEuropeanVIN(vin)) {
      return decodeEuropeanVIN(vin)
    }
    return null
  }
}
