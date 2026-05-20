interface FeatureFlags {
  enableAIChat: boolean
  enableECM3Warning: boolean
  enableAutoUpdater: boolean
  enableSentry: boolean
  enableNewRemapBuilder: boolean
}

const DEFAULT_FLAGS: FeatureFlags = {
  enableAIChat: true,
  enableECM3Warning: true,
  enableAutoUpdater: true,
  enableSentry: false, // disabled until DSN configured
  enableNewRemapBuilder: false,
}

let remoteFlags: Partial<FeatureFlags> = {}

export async function loadFeatureFlags(): Promise<FeatureFlags> {
  try {
    // Try to fetch from Supabase or local config
    const stored = localStorage.getItem('dctuning_feature_flags')
    if (stored) {
      remoteFlags = JSON.parse(stored)
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_FLAGS, ...remoteFlags }
}

export function getFeatureFlags(): FeatureFlags {
  return { ...DEFAULT_FLAGS, ...remoteFlags }
}

export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return getFeatureFlags()[flag]
}
