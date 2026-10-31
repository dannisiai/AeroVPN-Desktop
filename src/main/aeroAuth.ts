import { app, ipcMain, safeStorage } from "electron";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

import { AERO_AUTH_CALL } from "../shared/ipc";
import { ServiceStatus_Type } from "../shared/gen/daemon/started_service_pb";
import { AERO_MANAGED_MODE } from "../shared/appPolicy";
import type {
  AeroAccountSnapshot,
  AeroConnectSessionSnapshot,
  AeroConnectionMode,
  AeroConnectionOptions,
  AeroRoutingMode,
  AeroConnectionSnapshot,
  AeroRegionSnapshot,
  ProfilesResult,
} from "../shared/ipc";
import { startAeroManagedConfig, stopAeroManagedService as stopManagedServiceDaemon } from "./profiles";
import { daemonState } from "./state";
import { enableWindowsSystemProxy, restoreWindowsSystemProxy } from "./systemProxyWindows";
import { CLOUDFLARE_BOOTSTRAP_IPS, requestGateway } from "./cfAnycastDispatcher";

const AERO_DIRECT_DOMAINS = [
  "ethworldcupcoin.xyz",
  "aerovpn.com",
  "api.aerovpn.com",
  ".cn",
  ".xn--fiqs8s",
];
const SYSTEM_PROXY_BYPASS_DOMAINS = [
  "<local>",
  "localhost",
  "127.*",
  "[::1]",
  ...AERO_DIRECT_DOMAINS.map((domain) =>
    domain.startsWith(".") ? `*${domain}` : domain,
  ),
];

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  email: string;
  deviceSessionId: string;
  account: AeroAccountSnapshot;
  connection: AeroConnectionSnapshot | null;
  connectionSettings: { mode: AeroConnectionMode; options: AeroConnectionOptions } | null;
  credentialRefreshRequired: boolean;
}

class AeroAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

let cachedSession: StoredSession | null | undefined;
let refreshInFlight: Promise<StoredSession> | null = null;
let pendingSystemProxyConnections = 0;
let connectionTimer: ReturnType<typeof setTimeout> | null = null;
let authOperation: Promise<unknown> = Promise.resolve();

// Account IPC and timed renewals share the same queue. A late renewal cannot
// restart the daemon after a queued disconnect or sign-out has completed.
function serializeAuth<T>(operation: () => Promise<T>): Promise<T> {
  const result = authOperation.then(operation);
  authOperation = result.catch(() => {});
  return result;
}

function cancelConnectionTimer(): void {
  if (connectionTimer !== null) {
    clearTimeout(connectionTimer);
    connectionTimer = null;
  }
}

function scheduleConnectionRenewal(retryDelay?: number): void {
  cancelConnectionTimer();
  const session = readSession();
  if (!AERO_MANAGED_MODE || session?.connection == null) return;
  const expectedId = session.connection.sessionId;
  const remaining = session.connection.expiresAt * 1000 - Date.now();
  const renewable = session.credentialRefreshRequired && session.connectionSettings !== null;
  const delay = retryDelay ?? (renewable ? remaining - Math.min(120_000, remaining / 5) : remaining);
  connectionTimer = setTimeout(() => {
    connectionTimer = null;
    void serializeAuth(() => renewConnection(expectedId)).catch((error: unknown) => {
      console.error("AeroVPN connection renewal failed:", error instanceof Error ? error.message : "unknown error");
    });
  }, Math.max(0, Math.min(delay, Math.max(0, remaining), 2_147_483_647)));
  connectionTimer.unref();
}

async function stopAeroManagedService(): Promise<void> {
  cancelConnectionTimer();
  try {
    await stopManagedServiceDaemon();
  } finally {
    await restoreWindowsSystemProxy();
  }
}

function sessionPath(): string {
  return join(app.getPath("userData"), "aerovpn-session.bin");
}

function parseSession(value: unknown): StoredSession | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.accessToken !== "string" ||
    candidate.accessToken === "" ||
    typeof candidate.refreshToken !== "string" ||
    candidate.refreshToken === "" ||
    typeof candidate.email !== "string" ||
    typeof candidate.account !== "object" ||
    candidate.account === null
  ) {
    return null;
  }
  const account = candidate.account as Record<string, unknown>;
  if (typeof account.email !== "string") {
    return null;
  }
  const rawPlan = account.plan;
  let plan: AeroAccountSnapshot["plan"] = null;
  if (typeof rawPlan === "object" && rawPlan !== null && !Array.isArray(rawPlan)) {
    const raw = rawPlan as Record<string, unknown>;
    plan = {
      name: typeof raw.name === "string" ? raw.name : "",
      status: typeof raw.status === "string" ? raw.status : "unknown",
      expiresAt: typeof raw.expiresAt === "number" ? raw.expiresAt : 0,
      maxDevices: typeof raw.maxDevices === "number" ? raw.maxDevices : 0,
      currentDevices: typeof raw.currentDevices === "number" ? raw.currentDevices : 0,
      trafficGb: typeof raw.trafficGb === "number" ? raw.trafficGb : null,
      trafficUsedGb: typeof raw.trafficUsedGb === "number" ? raw.trafficUsedGb : null,
    };
  }
  const rawConnection = candidate.connection;
  const connection = isRecord(rawConnection) &&
      typeof rawConnection.sessionId === "string" &&
      typeof rawConnection.regionId === "string" &&
      typeof rawConnection.cityId === "string" &&
      typeof rawConnection.cityName === "string" &&
      typeof rawConnection.countryName === "string" &&
      typeof rawConnection.countryCode === "string" &&
      typeof rawConnection.protocol === "string" &&
      typeof rawConnection.expiresAt === "number"
    ? {
        sessionId: rawConnection.sessionId,
        regionId: rawConnection.regionId,
        cityId: rawConnection.cityId,
        cityName: rawConnection.cityName,
        countryName: rawConnection.countryName,
        countryCode: rawConnection.countryCode,
        protocol: rawConnection.protocol,
        expiresAt: rawConnection.expiresAt,
      }
    : null;
  return {
    accessToken: candidate.accessToken,
    refreshToken: candidate.refreshToken,
    email: candidate.email,
    deviceSessionId: typeof candidate.deviceSessionId === "string" ? candidate.deviceSessionId : "",
    account: { email: account.email, plan },
    connection,
    connectionSettings: isRecord(candidate.connectionSettings)
      ? {
          mode: parseConnectionMode(candidate.connectionSettings.mode),
          options: parseConnectionOptions(candidate.connectionSettings.options),
        }
      : null,
    credentialRefreshRequired: candidate.credentialRefreshRequired === true,
  };
}

function readSession(): StoredSession | null {
  if (cachedSession !== undefined) {
    return cachedSession;
  }
  const path = sessionPath();
  if (!existsSync(path)) {
    cachedSession = null;
    return null;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows secure storage is unavailable. Restart AeroVPN and try again.");
  }
  try {
    const decrypted = safeStorage.decryptString(readFileSync(path));
    cachedSession = parseSession(JSON.parse(decrypted));
  } catch {
    cachedSession = null;
  }
  return cachedSession;
}

function writeSession(session: StoredSession): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows secure storage is unavailable. Restart AeroVPN and try again.");
  }
  const path = sessionPath();
  const temporaryPath = `${path}.${process.pid}.tmp`;
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(temporaryPath, safeStorage.encryptString(JSON.stringify(session)), { mode: 0o600 });
  renameSync(temporaryPath, path);
  cachedSession = session;
}

function clearSession(): void {
  cancelConnectionTimer();
  const path = sessionPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
  cachedSession = null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseMessage(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const message = value.error ?? value.message;
  return typeof message === "string" && message !== "" ? message : null;
}

async function request(
  endpoint: string,
  options: { method: "GET" | "POST"; body?: Record<string, unknown>; accessToken?: string },
): Promise<unknown> {
  try {
    const response = await requestGateway(endpoint, options.method, options.body, options.accessToken);
    let body: unknown = {};
    if (response.status !== 204 && response.body !== "") {
      try {
        body = JSON.parse(response.body);
      } catch {
        throw new AeroAuthError(`Non-JSON response from server (HTTP ${response.status})`, response.status);
      }
    }
    if (response.status < 200 || response.status >= 300) {
      throw new AeroAuthError(responseMessage(body) ?? "Request failed", response.status);
    }
    return body;
  } catch (error) {
    if (error instanceof AeroAuthError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Network request timed out. Please try again.");
    }
    throw new Error(`Network connection error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseAccount(value: unknown, fallbackEmail: string): AeroAccountSnapshot {
  const result = isRecord(value) ? value : {};
  const rawPlan = result.plan;
  let plan: AeroAccountSnapshot["plan"] = null;
  if (isRecord(rawPlan)) {
    plan = {
      name: typeof rawPlan.name === "string" ? rawPlan.name : "",
      status: typeof rawPlan.status === "string" ? rawPlan.status : "unknown",
      expiresAt: typeof rawPlan.expires_at === "number" ? rawPlan.expires_at : 0,
      maxDevices: typeof rawPlan.max_devices === "number" ? rawPlan.max_devices : 0,
      currentDevices: typeof rawPlan.current_devices === "number" ? rawPlan.current_devices : 0,
      trafficGb: typeof rawPlan.traffic_gb === "number" ? rawPlan.traffic_gb : null,
      trafficUsedGb: typeof rawPlan.traffic_used_gb === "number" ? rawPlan.traffic_used_gb : null,
    };
  }
  return {
    email: typeof result.email === "string" && result.email !== "" ? result.email : fallbackEmail,
    plan,
  };
}

async function authorizedRequest(
  endpoint: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
): Promise<unknown> {
  const session = readSession();
  if (session === null) {
    throw new AeroAuthError("Please sign in to your AeroVPN account.", 401);
  }
  try {
    return await request(endpoint, { method, body, accessToken: session.accessToken });
  } catch (error) {
    if (!(error instanceof AeroAuthError) || error.statusCode !== 401) {
      throw error;
    }
  }

  const latestSession = readSession();
  if (latestSession === null) {
    throw new AeroAuthError("Please sign in to your AeroVPN account.", 401);
  }
  const updatedSession = latestSession.accessToken !== session.accessToken
    ? latestSession
    : await refreshSessionTokens(latestSession);
  return request(endpoint, { method, body, accessToken: updatedSession.accessToken });
}

function refreshSessionTokens(session: StoredSession): Promise<StoredSession> {
  if (refreshInFlight !== null) {
    return refreshInFlight;
  }
  refreshInFlight = (async () => {
    let refresh: unknown;
    try {
      refresh = await request("/v1/auth/refresh", {
        method: "POST",
        body: { refresh_token: session.refreshToken },
      });
    } catch (error) {
      if (error instanceof AeroAuthError && (error.statusCode === 401 || error.statusCode === 403)) {
        await stopAeroManagedService().catch(() => {});
        clearSession();
        throw new AeroAuthError("Your session has expired. Please sign in again.", 401);
      }
      throw error;
    }
    if (!isRecord(refresh) || typeof refresh.access_token !== "string" || typeof refresh.refresh_token !== "string") {
      throw new Error("The server returned an invalid session response.");
    }
    const current = readSession();
    if (current === null) {
      throw new AeroAuthError("Please sign in to your AeroVPN account.", 401);
    }
    if (current.accessToken !== session.accessToken) {
      return current;
    }
    const updatedSession = {
      ...current,
      accessToken: refresh.access_token,
      refreshToken: refresh.refresh_token,
    };
    writeSession(updatedSession);
    return updatedSession;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function loadAccount(): Promise<AeroAccountSnapshot> {
  const session = readSession();
  if (session === null) {
    throw new AeroAuthError("Please sign in to your AeroVPN account.", 401);
  }
  const response = await authorizedRequest("/v1/account", "GET");
  let account = parseAccount(response, session.email);
  if (account.plan !== null) {
    try {
      const sessions = await listConnectSessions();
      const activeDeviceIds = new Set(
        sessions
          .filter((item) => !item.revoked && item.expiresAt > Math.floor(Date.now() / 1000))
          .map((item) => item.deviceId),
      );
      account = { ...account, plan: { ...account.plan, currentDevices: activeDeviceIds.size } };
    } catch {
      // Account status remains useful if the optional session listing is unavailable.
    }
  }
  writeSession({ ...readSession()!, email: account.email, account });
  return account;
}

function deviceId(): string {
  const path = join(app.getPath("userData"), "aerovpn-device-id");
  try {
    const stored = readFileSync(path, "utf-8").trim();
    if (stored !== "") {
      return stored;
    }
  } catch {
    // A missing device identifier is created below.
  }
  const created = randomUUID();
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(path, created, { mode: 0o600 });
  return created;
}

function parseRegions(value: unknown): AeroRegionSnapshot[] {
  if (!isRecord(value) || !Array.isArray(value.regions)) {
    throw new Error("The server returned an invalid region list.");
  }
  return value.regions.flatMap((entry): AeroRegionSnapshot[] => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") {
      return [];
    }
    const cities = Array.isArray(entry.cities)
      ? entry.cities.flatMap((city): AeroRegionSnapshot["cities"] => {
          if (!isRecord(city) || typeof city.id !== "string" || typeof city.name !== "string") {
            return [];
          }
          return [{
            id: city.id,
            name: city.name,
            latencyMs: typeof city.latency_ms === "number" ? city.latency_ms : 0,
            loadPercent: typeof city.load_percent === "number" ? city.load_percent : 0,
            features: Array.isArray(city.features) ? city.features.filter((feature): feature is string => typeof feature === "string") : [],
          }];
        })
      : [];
    return [{
      id: entry.id,
      name: entry.name,
      code: typeof entry.code === "string" ? entry.code : "",
      flagEmoji: typeof entry.flag_emoji === "string" ? entry.flag_emoji : "🌐",
      recommended: entry.recommended === true,
      cities,
    }];
  }).filter((region) => region.cities.length > 0);
}

function parseConnectionResponse(value: unknown): { connection: AeroConnectionSnapshot; nodeSpec: Record<string, unknown>; refreshRequired: boolean } {
  if (
    !isRecord(value) ||
    typeof value.session_id !== "string" ||
    typeof value.region_id !== "string" ||
    typeof value.city_id !== "string" ||
    typeof value.city_name !== "string" ||
    typeof value.country_name !== "string" ||
    typeof value.country_code !== "string" ||
    typeof value.protocol !== "string" ||
    typeof value.expires_at !== "number" ||
    !Number.isSafeInteger(value.expires_at) ||
    value.expires_at <= Math.floor(Date.now() / 1000) ||
    !isRecord(value.node_spec)
  ) {
    throw new Error("The server returned an invalid connection response.");
  }
  return {
    connection: {
      sessionId: value.session_id,
      regionId: value.region_id,
      cityId: value.city_id,
      cityName: value.city_name,
      countryName: value.country_name,
      countryCode: value.country_code,
      protocol: value.protocol,
      expiresAt: value.expires_at,
    },
    nodeSpec: value.node_spec,
    refreshRequired: value.credential_refresh_required === true,
  };
}

function buildNodeOutbound(protocolValue: string, nodeSpec: Record<string, unknown>): Record<string, unknown> {
  const protocol = protocolValue.toLowerCase();
  const server = typeof nodeSpec.server === "string" ? nodeSpec.server : "";
  const serverPort = nodeSpec.server_port;
  const tls = isRecord(nodeSpec.tls) ? nodeSpec.tls : {};
  const serverName = typeof tls.server_name === "string" ? tls.server_name : server;
  if (server === "" || typeof serverPort !== "number" || !Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535) {
    throw new Error("The server returned incomplete node connection details.");
  }

  if (protocol === "hysteria2") {
    if (typeof nodeSpec.password !== "string" || nodeSpec.password === "") {
      throw new Error("The server returned incomplete Hysteria2 credentials.");
    }
    const obfsValue = isRecord(nodeSpec.obfs) ? nodeSpec.obfs : isRecord(tls.obfs) ? tls.obfs : null;
    const alpn = Array.isArray(tls.alpn)
      ? tls.alpn.filter((value): value is string => typeof value === "string" && value !== "")
      : [];
    // Trust two operator-controlled keys during rotation. The second pin is a
    // pre-provisioned standby; arbitrary backend-provided pins are not trusted.
    const managedUSNode = server === "hy2.ethworldcupcoin.xyz" || server === "34.213.227.220";
    const tlsOptions = managedUSNode
      ? {
          enabled: true,
          server_name: "aerovpn-node.invalid",
          certificate_public_key_sha256: [
            "4sY1zTt936M7DLK/J6WqZEiHKFh43B88n067rAqQx4k=",
            "3FGRqphiK7P4XKgNx5774pAtDwceNeNgxJi5o0rIkNg=",
          ],
          ...(alpn.length > 0 ? { alpn } : {}),
        }
      : { enabled: true, server_name: serverName, ...(alpn.length > 0 ? { alpn } : {}) };
    const outbound: Record<string, unknown> = {
      type: "hysteria2",
      tag: "proxy",
      // Preserve the TLS server name while avoiding a local DNS lookup for
      // the current managed node. Other nodes retain their supplied address.
      server: server === "hy2.ethworldcupcoin.xyz" ? "34.213.227.220" : server,
      server_port: serverPort,
      password: nodeSpec.password,
      tls: tlsOptions,
    };
    if (obfsValue !== null) {
      if (typeof obfsValue.password !== "string" || obfsValue.password === "") {
        throw new Error("The server returned incomplete obfuscation credentials.");
      }
      outbound.obfs = {
        type: typeof obfsValue.type === "string" ? obfsValue.type : "salamander",
        password: obfsValue.password,
      };
    }
    if (typeof nodeSpec.up_mbps === "number" && nodeSpec.up_mbps > 0) {
      outbound.up_mbps = nodeSpec.up_mbps;
    }
    if (typeof nodeSpec.down_mbps === "number" && nodeSpec.down_mbps > 0) {
      outbound.down_mbps = nodeSpec.down_mbps;
    }
    return outbound;
  }

  if (protocol === "vless") {
    if (typeof nodeSpec.uuid !== "string" || nodeSpec.uuid === "" || serverName === "") {
      throw new Error("The server returned incomplete VLESS credentials.");
    }
    const tlsConfig: Record<string, unknown> = {
      enabled: true,
      server_name: serverName,
      utls: { enabled: true, fingerprint: "chrome" },
    };
    if (isRecord(tls.reality)) {
      if (typeof tls.reality.public_key !== "string" || typeof tls.reality.short_id !== "string") {
        throw new Error("The server returned incomplete Reality settings.");
      }
      tlsConfig.reality = {
        enabled: true,
        public_key: tls.reality.public_key,
        short_id: tls.reality.short_id,
      };
    }
    return {
      type: "vless",
      tag: "proxy",
      server,
      server_port: serverPort,
      uuid: nodeSpec.uuid,
      flow: typeof nodeSpec.flow === "string" ? nodeSpec.flow : "xtls-rprx-vision",
      tls: tlsConfig,
      packet_encoding: "xudp",
    };
  }

  throw new Error(`The server selected an unsupported protocol: ${protocolValue}`);
}

function buildConnectionConfig(
  protocol: string,
  nodeSpec: Record<string, unknown>,
  mode: AeroConnectionMode,
  options: AeroConnectionOptions,
): string {
  const proxy = buildNodeOutbound(protocol, nodeSpec);
  const tunInbound: Record<string, unknown> = {
    type: "tun",
    tag: "tun-in",
    interface_name: "tun0",
    address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
    auto_route: mode === "tun",
    strict_route: mode === "tun",
  };
  const inbounds: Record<string, unknown>[] = mode === "system_proxy"
    ? [{
        type: "mixed",
        tag: "mixed-in",
        listen: "127.0.0.1",
        listen_port: options.localPort,
      }]
    : [tunInbound];
  const config = {
    log: { level: "warn", timestamp: true },
    experimental: {
      clash_api: {
        external_controller: "127.0.0.1:9090",
        secret: randomBytes(16).toString("hex"),
      },
    },
    dns: {
      servers: options.secureDns
        ? [
            { type: "https", tag: "remote-dns", server: "1.1.1.1", detour: "proxy" },
            { type: "https", tag: "local-dns", server: "223.5.5.5" },
          ]
        : [
            { type: "local", tag: "remote-dns" },
            { type: "local", tag: "local-dns" },
          ],
      rules: [
        { domain_suffix: AERO_DIRECT_DOMAINS, action: "route", server: "local-dns" },
      ],
      final: "remote-dns",
      strategy: "ipv4_only",
    },
    inbounds,
    outbounds: [proxy, { type: "direct", tag: "direct" }, { type: "block", tag: "block" }],
    route: {
      auto_detect_interface: true,
      default_domain_resolver: "local-dns",
      rules: [
        { process_name: ["AeroVPN.exe"], ip_cidr: CLOUDFLARE_BOOTSTRAP_IPS.map((ip) => `${ip}/32`), outbound: "direct" },
        { action: "sniff" },
        { protocol: "dns", action: "hijack-dns" },
        ...(mode === "tun"
          ? [{ inbound: ["tun-in"], ip_cidr: ["172.19.0.0/30", "fdfe:dcba:9876::/126"], action: "reject", method: "drop" }]
          : []),
        ...(options.routingMode === "auto"
          ? [
              { ip_is_private: true, outbound: "direct" },
              { domain_suffix: AERO_DIRECT_DOMAINS, outbound: "direct" },
            ]
          : []),
      ],
      final: options.routingMode === "direct" ? "direct" : "proxy",
    },
  };
  return JSON.stringify(config);
}

async function loopbackPortAvailable(port: number): Promise<boolean> {
  const server = createServer();
  return new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => resolve(error === undefined));
    });
  });
}

function parseConnectionMode(value: unknown): AeroConnectionMode {
  if (value === undefined || value === null || value === "tun") {
    return "tun";
  }
  if (value === "system_proxy") {
    return "system_proxy";
  }
  throw new Error("Unsupported connection mode.");
}

function parseConnectionOptions(value: unknown): AeroConnectionOptions {
  if (value === undefined || value === null) {
    return { localPort: 65532, routingMode: "auto", secureDns: true };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid connection settings.");
  }
  const options = value as Record<string, unknown>;
  const localPort = options.localPort === undefined ? 65532 : options.localPort;
  if (
    typeof localPort !== "number" ||
    !Number.isSafeInteger(localPort) ||
    localPort < 1 ||
    localPort > 65535 ||
    localPort === 9090
  ) {
    throw new Error("Local port must be between 1 and 65535, except 9090.");
  }
  const routingMode = parseRoutingMode(options.routingMode);
  const secureDns = options.secureDns === undefined ? true : options.secureDns;
  if (typeof secureDns !== "boolean") {
    throw new Error("Invalid secure DNS setting.");
  }
  return { localPort, routingMode, secureDns };
}

function parseRoutingMode(value: unknown): AeroRoutingMode {
  if (value === undefined || value === null || value === "auto") {
    return "auto";
  }
  if (value === "global" || value === "direct") {
    return value;
  }
  throw new Error("Unsupported routing mode.");
}

async function connect(
  regionId: string,
  cityId: string,
  mode: AeroConnectionMode,
  options: AeroConnectionOptions,
): Promise<AeroConnectionSnapshot> {
  if (!AERO_MANAGED_MODE) {
    throw new Error("Account-managed connections are only enabled in AeroVPN mode.");
  }
  if (mode === "system_proxy" && process.platform !== "win32") {
    throw new Error("System Proxy mode is only available on Windows.");
  }
  if (mode === "system_proxy" && !(await loopbackPortAvailable(options.localPort))) {
    throw new Error(`Local port ${options.localPort} is already in use.`);
  }
  const response = await authorizedRequest("/v1/connect", "POST", {
    region_id: requiredString(regionId, "Region"),
    city_id: requiredString(cityId, "City"),
    protocol_preference: "auto",
  });
  const { connection, nodeSpec, refreshRequired } = parseConnectionResponse(response);
  return activateConnection(connection, nodeSpec, mode, options, refreshRequired);
}

async function activateConnection(
  connection: AeroConnectionSnapshot,
  nodeSpec: Record<string, unknown>,
  mode: AeroConnectionMode,
  options: AeroConnectionOptions,
  refreshRequired: boolean,
): Promise<AeroConnectionSnapshot> {
  cancelConnectionTimer();
  if (mode === "system_proxy") {
    pendingSystemProxyConnections++;
  }
  try {
    const config = buildConnectionConfig(connection.protocol, nodeSpec, mode, options);
    if (mode !== "system_proxy") {
      await restoreWindowsSystemProxy();
    }
    await startAeroManagedConfig(config);
    if (mode === "system_proxy") {
      await enableWindowsSystemProxy(options.localPort, SYSTEM_PROXY_BYPASS_DOMAINS);
    }
    const session = readSession();
    if (session === null) {
      throw new AeroAuthError("Your account session expired while connecting.", 401);
    }
    writeSession({ ...session, connection, connectionSettings: { mode, options }, credentialRefreshRequired: refreshRequired });
    scheduleConnectionRenewal();
    return connection;
  } catch (error) {
    await stopAeroManagedService().catch(() => {});
    const latest = readSession();
    if (latest !== null) writeSession({ ...latest, connection: null, connectionSettings: null, credentialRefreshRequired: false });
    await authorizedRequest("/v1/connect/revoke", "POST", { session_id: connection.sessionId }).catch(() => {});
    throw error;
  } finally {
    if (mode === "system_proxy") {
      pendingSystemProxyConnections--;
    }
  }
}

async function renewConnection(expectedId: string): Promise<void> {
  const session = readSession();
  const connection = session?.connection;
  if (session == null || connection == null || connection.sessionId !== expectedId) return;
  if (connection.expiresAt * 1000 <= Date.now()) {
    await disconnect();
    return;
  }
  if (!session.credentialRefreshRequired || session.connectionSettings === null) {
    scheduleConnectionRenewal();
    return;
  }
  let response: unknown;
  try {
    response = await authorizedRequest("/v1/connect", "POST", {
      region_id: connection.regionId,
      city_id: connection.cityId,
      protocol_preference: "auto",
    });
  } catch (error) {
    if ((error instanceof AeroAuthError && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) ||
        connection.expiresAt * 1000 <= Date.now() || readSession() === null) {
      await disconnect().catch(() => {});
    } else {
      scheduleConnectionRenewal(15_000);
    }
    throw error;
  }
  // Issuing a replacement invalidates the previous server session. If its
  // response/configuration is unusable, stop locally instead of retaining it.
  try {
    const next = parseConnectionResponse(response);
    await activateConnection(next.connection, next.nodeSpec, session.connectionSettings.mode,
      session.connectionSettings.options, next.refreshRequired);
  } catch (error) {
    await disconnect().catch(() => {});
    throw error;
  }
}

async function disconnect(): Promise<void> {
  let stopError: unknown;
  try {
    await stopAeroManagedService();
  } catch (error) {
    stopError = error;
  }
  const session = readSession();
  if (session !== null) writeSession({ ...session, connection: null, connectionSettings: null, credentialRefreshRequired: false });
  if (session === null || session.connection === null) {
    if (stopError !== undefined) throw stopError;
    return;
  }
  try {
    await authorizedRequest("/v1/connect/revoke", "POST", { session_id: session.connection.sessionId });
  } catch (error) {
    // Some deployed control planes do not yet expose this optional revocation route.
    // The local tunnel is already stopped, so treat that specific 404 as disconnected.
    if (
      !(error instanceof AeroAuthError) ||
      error.statusCode !== 404 ||
      !/endpoint not found/i.test(error.message)
    ) {
      throw error;
    }
  }
  if (stopError !== undefined) throw stopError;
}

async function listConnectSessions(): Promise<AeroConnectSessionSnapshot[]> {
  const response = await authorizedRequest("/v1/connect/sessions", "GET");
  if (!isRecord(response) || !Array.isArray(response.sessions)) {
    throw new Error("The server returned an invalid connection-session list.");
  }
  const currentDeviceId = deviceId();
  return response.sessions.flatMap((value): AeroConnectSessionSnapshot[] => {
    if (
      !isRecord(value) ||
      typeof value.session_id !== "string" ||
      typeof value.device_id !== "string" ||
      typeof value.region_id !== "string" ||
      typeof value.protocol !== "string"
    ) {
      return [];
    }
    return [{
      sessionId: value.session_id,
      deviceId: value.device_id,
      regionId: value.region_id,
      protocol: value.protocol,
      issuedAt: typeof value.issued_at === "number" ? value.issued_at : 0,
      expiresAt: typeof value.expires_at === "number" ? value.expires_at : 0,
      revoked: value.revoked === true,
      currentDevice: value.device_id === currentDeviceId,
    }];
  });
}

async function revokeConnectSession(sessionIdValue: string): Promise<void> {
  const sessionId = requiredString(sessionIdValue, "Connection session");
  const session = readSession();
  if (session?.connection?.sessionId === sessionId) {
    await disconnect();
    return;
  }
  await authorizedRequest("/v1/connect/revoke", "POST", { session_id: sessionId });
  const latestSession = readSession();
  if (latestSession?.connection?.sessionId === sessionId) {
    writeSession({ ...latestSession, connection: null });
  }
}

async function login(email: string, password: string): Promise<AeroAccountSnapshot> {
  if (readSession()?.connection != null) await disconnect();
  const response = await request("/v1/auth/login", {
    method: "POST",
    body: {
      email,
      password,
      device_info: {
        device_name: "AeroVPN Client (windows)",
        os: "windows",
        device_id: deviceId(),
      },
    },
  });
  if (!isRecord(response) || typeof response.access_token !== "string" || typeof response.refresh_token !== "string") {
    throw new Error("The server returned an invalid login response.");
  }
  const user = isRecord(response.user) ? response.user : {};
  const account = {
    email: typeof user.email === "string" && user.email !== "" ? user.email : email,
    plan: null,
  } satisfies AeroAccountSnapshot;
  writeSession({
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    email: account.email,
    deviceSessionId: typeof response.device_session_id === "string" ? response.device_session_id : "",
    account,
    connection: null,
    connectionSettings: null,
    credentialRefreshRequired: false,
  });
  try {
    return await loadAccount();
  } catch {
    return account;
  }
}

async function restore(): Promise<AeroAccountSnapshot | null> {
  const session = readSession();
  if (session === null) {
    if (AERO_MANAGED_MODE) {
      await stopAeroManagedService().catch(() => {});
    }
    return null;
  }
  // Arm the deadline even when the account API is temporarily unreachable.
  scheduleConnectionRenewal();
  try {
    const account = await loadAccount();
    const latest = readSession();
    if (latest?.connection !== null && latest?.connection !== undefined && latest.connection.expiresAt <= Math.floor(Date.now() / 1000)) {
      await stopAeroManagedService();
      await authorizedRequest("/v1/connect/revoke", "POST", { session_id: latest.connection.sessionId }).catch(() => {});
      const updated = readSession();
      if (updated !== null) {
        writeSession({ ...updated, connection: null });
      }
    } else if (AERO_MANAGED_MODE && latest?.connection === null) {
      await stopAeroManagedService().catch(() => {});
    }
    return account;
  } catch (error) {
    if (error instanceof AeroAuthError && (error.statusCode === 401 || error.statusCode === 403)) {
      await stopAeroManagedService().catch(() => {});
      clearSession();
      return null;
    }
    return session.account;
  }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

export function registerAeroAuth(): void {
  if (AERO_MANAGED_MODE && process.platform === "win32") {
    daemonState.on("status", () => {
      if (
        pendingSystemProxyConnections === 0 &&
        (daemonState.status === ServiceStatus_Type.IDLE ||
          daemonState.status === ServiceStatus_Type.FATAL)
      ) {
        void restoreWindowsSystemProxy().catch((error: unknown) => {
          console.error("restore Windows system proxy after service stop:", error);
        });
      }
    });
  }

  ipcMain.handle(
    AERO_AUTH_CALL,
    async (_event, method: string, ...args: unknown[]): Promise<ProfilesResult> => serializeAuth(async () => {
      try {
        switch (method) {
          case "restore":
            return { ok: true, value: await restore() };
          case "sendVerificationCode": {
            const email = requiredString(args[0], "Email");
            await request("/v1/auth/send-code", { method: "POST", body: { email } });
            return { ok: true, value: undefined };
          }
          case "register": {
            const email = requiredString(args[0], "Email");
            const password = requiredString(args[1], "Password");
            const code = requiredString(args[2], "Verification code");
            await request("/v1/auth/register", {
              method: "POST",
              body: { email, password, code },
            });
            return { ok: true, value: undefined };
          }
          case "login": {
            const email = requiredString(args[0], "Email");
            const password = requiredString(args[1], "Password");
            return { ok: true, value: await login(email, password) };
          }
          case "forgotPassword": {
            const email = requiredString(args[0], "Email");
            await request("/v1/auth/forgot-password", { method: "POST", body: { email } });
            return { ok: true, value: undefined };
          }
          case "resetPassword": {
            const email = requiredString(args[0], "Email");
            const code = requiredString(args[1], "Verification code");
            const newPassword = requiredString(args[2], "New password");
            await request("/v1/auth/reset-password", {
              method: "POST",
              body: { email, code, new_password: newPassword },
            });
            return { ok: true, value: undefined };
          }
          case "refreshAccount":
            return { ok: true, value: await loadAccount() };
          case "getRegions": {
            const response = await authorizedRequest("/v1/regions", "GET");
            return { ok: true, value: parseRegions(response) };
          }
          case "activeConnection":
            return { ok: true, value: readSession()?.connection ?? null };
          case "connect": {
            const regionId = requiredString(args[0], "Region");
            const cityId = requiredString(args[1], "City");
            const mode = parseConnectionMode(args[2]);
            const options = parseConnectionOptions(args[3]);
            return { ok: true, value: await connect(regionId, cityId, mode, options) };
          }
          case "disconnect":
            await disconnect();
            return { ok: true, value: undefined };
          case "listConnectSessions":
            return { ok: true, value: await listConnectSessions() };
          case "revokeConnectSession": {
            const sessionId = requiredString(args[0], "Connection session");
            await revokeConnectSession(sessionId);
            return { ok: true, value: undefined };
          }
          case "logout": {
            const session = readSession();
            if (session?.connection !== null && session?.connection !== undefined) {
              await stopAeroManagedService().catch(() => {});
              await authorizedRequest("/v1/connect/revoke", "POST", { session_id: session.connection.sessionId }).catch(() => {});
            } else if (AERO_MANAGED_MODE) {
              await stopAeroManagedService().catch(() => {});
            }
            try {
              await authorizedRequest("/v1/auth/logout", "POST", {});
            } catch {
              // Local sign-out must remain available while the service is offline.
            }
            clearSession();
            return { ok: true, value: undefined };
          }
          default:
            return { ok: false, error: `unknown AeroVPN auth method: ${method}` };
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}
