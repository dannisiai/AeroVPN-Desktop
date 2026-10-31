import type {
  AeroConnectionMode,
  AeroRoutingMode,
} from "../../../src/shared/ipc";

export interface AeroConnectionPreferences {
  mode: AeroConnectionMode;
  localPort: number;
  routingMode: Exclude<AeroRoutingMode, "direct">;
  secureDns: boolean;
}

type StoredAeroConnectionPreferences = Omit<AeroConnectionPreferences, "routingMode"> & {
  routingMode: AeroRoutingMode;
};

const AERO_CONNECTION_SETTINGS_KEY = "aerovpn.connection-settings";
const LEGACY_CONNECTION_MODE_KEY = "aerovpn.connection-mode";

const DEFAULT_SETTINGS: AeroConnectionPreferences = {
  mode: "system_proxy",
  localPort: 65532,
  routingMode: "auto",
  secureDns: true,
};

function isStoredConnectionPreferences(value: unknown): value is StoredAeroConnectionPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const settings = value as Record<string, unknown>;
  return (
    (settings.mode === "tun" || settings.mode === "system_proxy") &&
    typeof settings.localPort === "number" &&
    Number.isSafeInteger(settings.localPort) &&
    settings.localPort >= 1 &&
    settings.localPort <= 65535 &&
    settings.localPort !== 9090 &&
    (settings.routingMode === "auto" ||
      settings.routingMode === "global" ||
      settings.routingMode === "direct") &&
    typeof settings.secureDns === "boolean"
  );
}

export function loadAeroConnectionPreferences(): AeroConnectionPreferences {
  const stored = window.localStorage.getItem(AERO_CONNECTION_SETTINGS_KEY);
  if (stored !== null) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (isStoredConnectionPreferences(parsed)) {
        return {
          ...parsed,
          routingMode: parsed.routingMode === "global" ? "global" : "auto",
        };
      }
    } catch {
      // Use defaults if an earlier or malformed value cannot be read.
    }
  }
  const legacyMode = window.localStorage.getItem(LEGACY_CONNECTION_MODE_KEY);
  return {
    ...DEFAULT_SETTINGS,
    mode: legacyMode === "tun" ? "tun" : "system_proxy",
  };
}

export function saveAeroConnectionPreferences(
  settings: AeroConnectionPreferences,
): void {
  window.localStorage.setItem(
    AERO_CONNECTION_SETTINGS_KEY,
    JSON.stringify(settings),
  );
  window.localStorage.setItem(LEGACY_CONNECTION_MODE_KEY, settings.mode);
}

export function loadAeroConnectionMode(): AeroConnectionMode {
  return loadAeroConnectionPreferences().mode;
}

export function saveAeroConnectionMode(mode: AeroConnectionMode): void {
  saveAeroConnectionPreferences({
    ...loadAeroConnectionPreferences(),
    mode,
  });
}
