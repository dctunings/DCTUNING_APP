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

// VIN position 10 year encoding — cycles every 30 years
const VIN_YEAR_MAP: Record<string, number> = {
  'A': 1980, 'B': 1981, 'C': 1982, 'D': 1983, 'E': 1984, 'F': 1985,
  'G': 1986, 'H': 1987, 'J': 1988, 'K': 1989, 'L': 1990, 'M': 1991,
  'N': 1992, 'P': 1993, 'R': 1994, 'S': 1995, 'T': 1996, 'V': 1997,
  'W': 1998, 'X': 1999, 'Y': 2000,
  '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005, '6': 2006,
  '7': 2007, '8': 2008, '9': 2009,
}

// Fix the 30-year cycle: A=1980 OR A=2010 — pick the correct one
function decodeVINYear(vin: string, nthsaYear: string): string {
  const yearChar = vin[9]?.toUpperCase()
  if (!yearChar) return nthsaYear

  const baseYear = VIN_YEAR_MAP[yearChar]
  if (!baseYear) return nthsaYear

  const currentYear = new Date().getFullYear()

  // Letters A-Y cover 1980-2000, but also repeat for 2010-2030
  // If baseYear is in the "old" cycle (1980-2009) and baseYear+30 <= currentYear+1, prefer the newer year
  if (baseYear <= 2009) {
    const laterYear = baseYear + 30
    if (laterYear <= currentYear + 1) {
      return String(laterYear)
    }
  }

  return String(baseYear)
}

// European WMI (World Manufacturer Identifier) — first 3 chars of VIN
// Covers the main brands you'd see in Ireland
const EUROPEAN_WMI: Record<string, { make: string; country: string }> = {
  // Germany
  'WVW': { make: 'Volkswagen', country: 'Germany' },
  'WV1': { make: 'Volkswagen', country: 'Germany' },
  'WV2': { make: 'Volkswagen', country: 'Germany' },
  'WAU': { make: 'Audi',       country: 'Germany' },
  'WA1': { make: 'Audi',       country: 'Germany' },
  'WBA': { make: 'BMW',        country: 'Germany' },
  'WBS': { make: 'BMW',        country: 'Germany' },
  'WBX': { make: 'BMW',        country: 'Germany' },
  'WDB': { make: 'Mercedes-Benz', country: 'Germany' },
  'WDC': { make: 'Mercedes-Benz', country: 'Germany' },
  'WDD': { make: 'Mercedes-Benz', country: 'Germany' },
  'WDF': { make: 'Mercedes-Benz', country: 'Germany' },
  'W0L': { make: 'Opel',       country: 'Germany' },
  'WF0': { make: 'Ford',       country: 'Germany' },
  'WP0': { make: 'Porsche',    country: 'Germany' },
  'WP1': { make: 'Porsche',    country: 'Germany' },
  'VSS': { make: 'SEAT',       country: 'Spain' },
  'VSK': { make: 'SEAT',       country: 'Spain' },
  'TMB': { make: 'Skoda',      country: 'Czech Republic' },
  'TM9': { make: 'Skoda',      country: 'Czech Republic' },
  // UK
  'SAJ': { make: 'Jaguar',     country: 'United Kingdom' },
  'SAL': { make: 'Land Rover', country: 'United Kingdom' },
  'SCC': { make: 'Lotus',      country: 'United Kingdom' },
  'SCB': { make: 'Bentley',    country: 'United Kingdom' },
  'SCA': { make: 'Rolls-Royce',country: 'United Kingdom' },
  'SUF': { make: 'Ford',       country: 'United Kingdom' },
  'SHH': { make: 'Honda',      country: 'United Kingdom' },
  'NM0': { make: 'Ford',       country: 'United Kingdom' },
  // France
  'VF1': { make: 'Renault',    country: 'France' },
  'VF3': { make: 'Peugeot',    country: 'France' },
  'VF7': { make: 'Citroën',    country: 'France' },
  'VF6': { make: 'Citroën',    country: 'France' },
  'VN1': { make: 'Renault',    country: 'France' },
  // Italy
  'ZFA': { make: 'Fiat',       country: 'Italy' },
  'ZFB': { make: 'Fiat',       country: 'Italy' },
  'ZFF': { make: 'Ferrari',    country: 'Italy' },
  'ZHW': { make: 'Lamborghini',country: 'Italy' },
  'ZAR': { make: 'Alfa Romeo', country: 'Italy' },
  'ZBB': { make: 'Alfa Romeo', country: 'Italy' },
  'ZCF': { make: 'Iveco',      country: 'Italy' },
  // Sweden
  'YV1': { make: 'Volvo',      country: 'Sweden' },
  'YV4': { make: 'Volvo',      country: 'Sweden' },
  'YS2': { make: 'Scania',     country: 'Sweden' },
  'XLR': { make: 'DAF',        country: 'Netherlands' },
  // Korea (common in Ireland)
  'KNA': { make: 'Kia',        country: 'South Korea' },
  'KNB': { make: 'Kia',        country: 'South Korea' },
  'KNC': { make: 'Kia',        country: 'South Korea' },
  'KMH': { make: 'Hyundai',    country: 'South Korea' },
  'KMF': { make: 'Hyundai',    country: 'South Korea' },
  // Japan
  'JHM': { make: 'Honda',      country: 'Japan' },
  'JN1': { make: 'Nissan',     country: 'Japan' },
  'JN3': { make: 'Nissan',     country: 'Japan' },
  'JT2': { make: 'Toyota',     country: 'Japan' },
  'JT3': { make: 'Toyota',     country: 'Japan' },
  'JMB': { make: 'Mitsubishi', country: 'Japan' },
  'JS3': { make: 'Suzuki',     country: 'Japan' },
}

// European VIN model codes (chars 4-8 after stripping ZZZ filler)
const VW_MODEL_CODES: Record<string, string> = {
  '1H': 'Golf (Mk3)',
  '1J': 'Golf (Mk4)',
  '1K': 'Golf (Mk5/6)',
  'AU': 'Golf (Mk7)',
  'BW': 'Golf (Mk8)',
  '9N': 'Polo (Mk4)',
  '6R': 'Polo (Mk5)',
  'AW': 'Polo (Mk6)',
  '3B': 'Passat (B5)',
  '3C': 'Passat (B6/B7)',
  '3G': 'Passat (B8)',
  '1T': 'Touran',
  '7L': 'Touareg (1st)',
  '7P': 'Touareg (2nd)',
  'CR': 'Touareg (3rd)',
  '5N': 'Tiguan (1st)',
  'AD': 'Tiguan (2nd)',
  '7N': 'Sharan',
  '1Z': 'Caddy',
  '2E': 'Crafter',
  'SG': 'T5 Transporter',
  'SH': 'T6 Transporter',
}

const AUDI_MODEL_CODES: Record<string, string> = {
  '8L': 'A3 (8L)',
  '8P': 'A3 (8P)',
  '8V': 'A3 (8V)',
  '8Y': 'A3 (8Y)',
  '8D': 'A4 (B5)',
  '8E': 'A4 (B6/B7)',
  '8K': 'A4 (B8)',
  '8W': 'A4 (B9)',
  '4B': 'A6 (C5)',
  '4F': 'A6 (C6)',
  '4G': 'A6 (C7)',
  '4K': 'A6 (C8)',
  '8N': 'TT (Mk1)',
  '8J': 'TT (Mk2)',
  'FV': 'Q3',
  '8U': 'Q3 (1st)',
  '4L': 'Q7 (1st)',
  '4M': 'Q7 (2nd)',
  '8R': 'Q5 (1st)',
  'FY': 'Q5 (2nd)',
}

function getEuropeanModel(vin: string, make: string): string {
  // European VINs often have ZZZ in positions 4-6 (indices 3-5)
  // The actual model code is in positions 7-8 (indices 6-7)
  const chars45 = vin.substring(3, 5)  // Positions 4-5
  const chars67 = vin.substring(6, 8)  // Positions 7-8
  const chars45_stripped = chars45.replace(/Z/g, '')

  const lowerMake = make.toLowerCase()

  if (lowerMake === 'volkswagen') {
    return VW_MODEL_CODES[chars67] || VW_MODEL_CODES[chars45_stripped] || ''
  }
  if (lowerMake === 'audi') {
    return AUDI_MODEL_CODES[chars67] || AUDI_MODEL_CODES[chars45_stripped] || ''
  }

  return ''
}

export async function decodeVIN(vin: string): Promise<VINResult | null> {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`
    const res = await fetch(url)
    const json = await res.json()
    const results: { Variable: string; Value: string }[] = json.Results || []

    const get = (variable: string) =>
      results.find((r) => r.Variable === variable)?.Value || ''

    const wmi = vin.substring(0, 3).toUpperCase()
    const europeanInfo = EUROPEAN_WMI[wmi]
    const isEuropean = !!europeanInfo

    // Get make — prefer our WMI lookup for European cars (NHTSA sometimes returns ALL CAPS)
    let make = get('Make')
    if (europeanInfo) {
      make = europeanInfo.make
    } else if (make) {
      // Normalise casing: "VOLKSWAGEN" → "Volkswagen"
      make = make.charAt(0).toUpperCase() + make.slice(1).toLowerCase()
    }

    // Get model — NHTSA is blind to European ZZZ-format VINs, use our own lookup
    let model = get('Model')
    if (!model && isEuropean) {
      model = getEuropeanModel(vin, make)
    }

    // Fix the year cycle (1980/2010 ambiguity etc.)
    const nthsaYear = get('Model Year')
    const correctedYear = decodeVINYear(vin, nthsaYear)

    // Country of manufacture
    const plantCountry = isEuropean
      ? europeanInfo.country
      : get('Plant Country')

    return {
      vin,
      make,
      model,
      year: correctedYear,
      engineDisplacement: get('Displacement (L)'),
      fuelType: get('Fuel Type - Primary'),
      bodyClass: get('Body Class'),
      driveType: get('Drive Type'),
      transmissionStyle: get('Transmission Style'),
      engineCylinders: get('Engine Number of Cylinders'),
      plantCountry,
      errorCode: get('Error Code'),
      errorText: get('Error Text'),
      isEuropean,
      wmi,
    }
  } catch {
    return null
  }
}
