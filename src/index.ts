export type InternetCheckReason =
  | "fast"
  | "latency"
  | "downlink"
  | "download"
  | "timeout"
  | "unreachable"
  | "aborted";

export interface IsFastInternetInfo {
  /** Round-trip time in ms of the winning probe, or null if none responded. */
  latency: number | null;
  /** Estimated downlink in Mbps from the Network Information API. */
  downlinkMbps: number | null;
  /** Measured Mbps while fully downloading the capped test payload. */
  downloadMbps: number | null;
  /** Bytes received by the capped download test, or null when it did not finish. */
  downloadedBytes: number | null;
  /** e.g. "4g", "3g", "2g", "slow-2g". */
  effectiveType: string | null;
  /** The probe which responded first, or null when none did. */
  probeUrl: string | null;
  /** Number of probes started for this check. */
  attemptedProbes: number;
  /** Number of probes which had failed when the check completed. */
  failedProbes: number;
  /** Total wall-clock duration of the check in milliseconds. */
  duration: number;
  /** Machine-readable explanation for the result. */
  reason: InternetCheckReason;
  /**
   * Per-endpoint diagnostics, available from the Promise-based `checkInternet`
   * API. The callback API returns as soon as a probe wins and does not collect
   * every response.
   */
  probeResults?: ProbeResult[];
  /** A compact Markdown table of `probeResults`, available from `checkInternet`. */
  markdownSummary?: string;
}

export interface InternetCheckResult extends IsFastInternetInfo {
  isFast: boolean;
  /** A result for every configured probe, in the order it was configured. */
  probeResults: ProbeResult[];
  /** A compact Markdown table summarising every configured probe. */
  markdownSummary: string;
}

export type ProbeState = "responded" | "failed" | "timeout" | "aborted";

/**
 * The response data that the browser made available for one probe.
 *
 * Cross-origin `no-cors` responses are opaque: browsers intentionally hide
 * their status, headers, and body. In that case `readable` is false and the
 * unavailable fields are null. `checkInternet` also attempts a CORS read for
 * opaque responses, so endpoints that opt into CORS can still expose details.
 */
export interface ProbeResponseData {
  /** Fetch mode used for this response read. */
  mode: "no-cors" | "cors";
  /** Whether the browser exposed headers and a response body. */
  readable: boolean;
  /** Fetch response type, such as "basic", "cors", or "opaque". */
  type: ResponseType | null;
  /** Final response URL when the browser exposes it. */
  url: string | null;
  /** Whether the response was redirected when the browser exposes it. */
  redirected: boolean | null;
  /** HTTP status when the browser exposes it. */
  status: number | null;
  /** HTTP status text when the browser exposes it. */
  statusText: string | null;
  /** HTTP success flag when the browser exposes it. */
  ok: boolean | null;
  /** Every response header exposed by the browser, keyed by lower-case name. */
  headers: Record<string, string> | null;
  /** Complete response text when it is readable. */
  body: string | null;
  /** Parsed JSON when the readable response declares a JSON content type. */
  json: unknown | null;
  /** UTF-8 byte length of `body` when it is readable. */
  bodyBytes: number | null;
  /** Why the body could not be read or parsed, if applicable. */
  bodyError: string | null;
}

/** Location fields recognized in a probe response body. */
export interface ProbeLocationInsights {
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
}

/** Network-identity fields recognized in a probe response body. */
export interface ProbeNetworkInsights {
  asn: string | null;
  organization: string | null;
  isp: string | null;
}

/** CDN, proxy, and transport headers recognized on a probe response. */
export interface ProbeEdgeInsights {
  provider: string | null;
  colo: string | null;
  requestId: string | null;
  server: string | null;
  via: string | null;
  serverTiming: string | null;
  altSvc: string | null;
}

/** Cache-related response headers recognized on a probe response. */
export interface ProbeCacheInsights {
  status: string | null;
  control: string | null;
  age: string | null;
}

/** CORS headers and visibility state for a probe response. */
export interface ProbeCorsInsights {
  readable: boolean;
  allowedOrigin: string | null;
  exposedHeaders: string | null;
}

/** Rate-limit headers recognized on a probe response. */
export interface ProbeRateLimitInsights {
  limit: string | null;
  remaining: string | null;
  reset: string | null;
  retryAfter: string | null;
}

/**
 * Normalized signals extracted from the readable response headers and body.
 * `summary` is deliberately concise and excludes raw IP addresses, request
 * headers, and other values that may be sensitive; those remain in the
 * dedicated fields and in `response`.
 */
export interface ProbeInsights {
  publicIp: string | null;
  location: ProbeLocationInsights;
  network: ProbeNetworkInsights;
  tlsVersion: string | null;
  httpVersion: string | null;
  vpnExit: boolean | null;
  edge: ProbeEdgeInsights;
  cache: ProbeCacheInsights;
  cors: ProbeCorsInsights;
  rateLimit: ProbeRateLimitInsights;
  /** Request headers echoed by endpoints such as httpbin, when present. */
  requestHeaders: Record<string, string> | null;
  /** Human-readable, privacy-conscious highlights used by `markdownSummary`. */
  summary: string[];
}

/** Detailed outcome for one configured probe. */
export interface ProbeResult {
  /** Configured probe URL, without the cache-busting parameter. */
  url: string;
  /** URL actually requested, including the cache-busting parameter. */
  requestUrl: string | null;
  /** Final state for this endpoint. */
  state: ProbeState;
  /** Round-trip latency of the connectivity request in milliseconds. */
  latency: number | null;
  /** Readable response metadata and body, if the browser allowed access. */
  response: ProbeResponseData | null;
  /** Normalized signals extracted from `response`, or null if no response arrived. */
  insights: ProbeInsights | null;
  /** Transport or CORS diagnostic error, if one occurred. */
  error: string | null;
}

/** Receives one finalized probe result from the Promise-based API. */
export type ProbeResultListener = (probe: ProbeResult) => void;

export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface IsFastInternetOptions {
  /** Latency in ms considered "fast". Default: 589. */
  threshold?: number;
  /** Single probe URL (overrides the default geo-diverse set). */
  image?: string;
  /** Custom probe URLs; all start in parallel and replace the defaults. */
  images?: string[];
  /** Derive an overall deadline of threshold * 3 ms when timeout is unset. Default: true. */
  allowEarlyExit?: boolean;
  /** Explicit timeout in ms. Overrides the threshold-derived early-exit timeout. */
  timeout?: number;
  /** Only include region probes matching the browser timezone. Default: true. */
  autoRegion?: boolean;
  /** Also require this downlink speed when the browser reports one. */
  minDownlinkMbps?: number;
  /** Fully download this many bytes to measure throughput. Default: 65536; set to 0 to disable. */
  downloadBytes?: number;
  /** Endpoint used for the capped download test. It must allow CORS. */
  downloadUrl?: string;
  /** Also require this measured download speed when the capped test completes. */
  minDownloadMbps?: number;
  /** Cancel the check without throwing; the result reason will be "aborted". */
  signal?: AbortSignal;
  /** Custom fetch implementation, useful for controlled environments and tests. */
  fetch?: FetchImplementation;
  /** Receives finalized per-probe diagnostics as `checkInternet()` collects them. */
  onProbeResult?: ProbeResultListener;
}

export type DefaultProbeRegion = "China" | "Russia / CIS" | "Iran" | "Turkmenistan";

export interface DefaultProbe {
  /** Probe URL, without the per-request cache-busting parameter. */
  url: string;
  /** Region that normally gates this probe, or null for global probes. */
  region: DefaultProbeRegion | null;
}

interface RegionProbeGroup {
  region: DefaultProbeRegion;
  probes: string[];
  timezones: string[];
}

interface NetworkInformation {
  downlink?: number;
  effectiveType?: string;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

const GLOBAL_PROBES = [
  "https://yandex.com/favicon.ico",
  "https://api.cloudflare.com/cdn-cgi/trace",
  "https://1.1.1.1/cdn-cgi/trace",
  "https://whatismyip.akamai.com/advanced?debug",
  "https://checkip.global.api.aws/",
  "https://checkip.amazonaws.com/",
  "https://detectportal.firefox.com/canonical.html",
  "https://edge.microsoft.com/captiveportal/generate_204",
  "https://am.i.mullvad.net/json",
  "https://tls.peet.ws/api/clean",
  "https://test.nextdns.io/",
  "https://www.howsmyssl.com/a/check",
  "https://httpbin.org/headers",
  "https://api.ipify.org?format=json",
  "https://ifconfig.co/json",
  "https://ifconfig.io",
  "https://captive.apple.com/hotspot-detect.html",
  "https://get.geojs.io/v1/ip/geo.json",
] as const;

const DEFAULT_DOWNLOAD_BYTES = 64 * 1024;
const DEFAULT_DOWNLOAD_URL = "https://speed.cloudflare.com/__down";

const REGION_PROBES: RegionProbeGroup[] = [
  {
    region: "China",
    probes: [
      "https://www.baidu.com/favicon.ico",
      "https://www.alibaba.com/favicon.ico",
    ],
    timezones: ["Asia/Shanghai", "Asia/Urumqi", "Asia/Hong_Kong", "Asia/Macau"]
  },
  {
    region: "Russia / CIS",
    probes: ["https://vk.com/favicon.ico", "https://dzen.ru/favicon.ico"],
    timezones: [
      "Europe/Moscow", "Europe/Kaliningrad", "Europe/Samara", "Europe/Volgograd",
      "Europe/Saratov", "Europe/Kirov", "Europe/Ulyanovsk", "Europe/Astrakhan",
      "Europe/Simferopol", "Asia/Yekaterinburg", "Asia/Omsk", "Asia/Novosibirsk",
      "Asia/Barnaul", "Asia/Tomsk", "Asia/Novokuznetsk", "Asia/Krasnoyarsk",
      "Asia/Irkutsk", "Asia/Chita", "Asia/Yakutsk", "Asia/Khandyga",
      "Asia/Vladivostok", "Asia/Ust-Nera", "Asia/Magadan", "Asia/Sakhalin",
      "Asia/Srednekolymsk", "Asia/Kamchatka", "Asia/Anadyr"
    ]
  },
  {
    region: "Iran",
    probes: ["https://www.aparat.com/favicon.ico"],
    timezones: ["Asia/Tehran"]
  },
  {
    region: "Turkmenistan",
    probes: ["https://turkmenportal.com/favicon.ico"],
    timezones: ["Asia/Ashgabat"]
  }
];

function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/**
 * Return the default probes active for this browser, including their normal
 * region gate. Pass `{ autoRegion: false }` to list every default probe.
 */
export function getDefaultProbes(
  { autoRegion = true }: Pick<IsFastInternetOptions, "autoRegion"> = {}
): DefaultProbe[] {
  const probes: DefaultProbe[] = GLOBAL_PROBES.map((url) => ({ url, region: null }));
  const timezone = autoRegion ? detectTimeZone() : null;

  for (const region of REGION_PROBES) {
    if (timezone === null || region.timezones.includes(timezone)) {
      probes.push(...region.probes.map((url) => ({ url, region: region.region })));
    }
  }

  return probes;
}

function buildDefaultProbes(autoRegion: boolean): string[] {
  return getDefaultProbes({ autoRegion }).map(({ url }) => url);
}

interface ConnectionInfo {
  downlinkMbps: number;
  effectiveType: string | null;
}

function getConnectionInfo(): ConnectionInfo | null {
  const nav = typeof navigator !== "undefined" ? (navigator as NavigatorWithConnection) : null;
  const connection = nav && (nav.connection || nav.mozConnection || nav.webkitConnection);

  if (connection && typeof connection.downlink === "number") {
    return {
      downlinkMbps: connection.downlink,
      effectiveType: connection.effectiveType || null
    };
  }

  return null;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function addCacheBuster(url: string, value: string): string {
  const hashIndex = url.indexOf("#");
  const base = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : url.slice(hashIndex);
  return `${base}${base.includes("?") ? "&" : "?"}isFastInternet=${value}${hash}`;
}

function buildDownloadUrl(url: string, bytes: number): string {
  if (url !== DEFAULT_DOWNLOAD_URL) return url;
  return `${url}?bytes=${bytes}`;
}

function finiteNonNegative(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number`);
  }
  return resolved;
}

type ResultCallback = (isFast: boolean, info: IsFastInternetInfo) => void;

type DetailedResultCallback = (
  isFast: boolean,
  info: IsFastInternetInfo & {
    probeResults: ProbeResult[];
    markdownSummary: string;
  }
) => void;

interface ResponseLike {
  type?: unknown;
  url?: unknown;
  redirected?: unknown;
  status?: unknown;
  statusText?: unknown;
  ok?: unknown;
  headers?: {
    forEach?: (callback: (value: string, name: string) => void) => void;
  };
  text?: () => Promise<string>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isOpaqueResponse(response: Response): boolean {
  const { type } = response as unknown as ResponseLike;
  return type === "opaque" || type === "opaqueredirect";
}

function responseHeaders(response: Response): Record<string, string> | null {
  const { headers } = response as unknown as ResponseLike;
  if (typeof headers?.forEach !== "function") return null;

  const output: Record<string, string> = {};
  headers.forEach((value, name) => {
    output[name.toLowerCase()] = value;
  });
  return output;
}

function isJsonContentType(contentType: string | undefined): boolean {
  return !!contentType && /(?:^|[+/])json(?:;|$)/i.test(contentType);
}

function bodyByteLength(body: string): number {
  return typeof TextEncoder === "function"
    ? new TextEncoder().encode(body).byteLength
    : body.length;
}

async function describeResponse(
  response: Response,
  mode: ProbeResponseData["mode"]
): Promise<ProbeResponseData> {
  const candidate = response as unknown as ResponseLike;
  const opaque = isOpaqueResponse(response);
  const headers = opaque ? null : responseHeaders(response);
  const type = typeof candidate.type === "string" ? candidate.type as ResponseType : null;
  const url = typeof candidate.url === "string" ? candidate.url : null;
  const redirected = typeof candidate.redirected === "boolean" ? candidate.redirected : null;
  const status = typeof candidate.status === "number" ? candidate.status : null;
  const statusText = typeof candidate.statusText === "string" ? candidate.statusText : null;
  const ok = typeof candidate.ok === "boolean" ? candidate.ok : null;

  if (opaque) {
    return {
      mode,
      readable: false,
      type,
      url,
      redirected,
      status: null,
      statusText: null,
      ok: null,
      headers: null,
      body: null,
      json: null,
      bodyBytes: null,
      bodyError: "Opaque response: the browser did not expose cross-origin headers or body."
    };
  }

  if (typeof candidate.text !== "function") {
    return {
      mode,
      readable: false,
      type,
      url,
      redirected,
      status,
      statusText,
      ok,
      headers,
      body: null,
      json: null,
      bodyBytes: null,
      bodyError: "The fetch implementation did not expose a response body reader."
    };
  }

  try {
    const body = await candidate.text();
    let json: unknown | null = null;
    let bodyError: string | null = null;
    if (isJsonContentType(headers?.["content-type"])) {
      try {
        json = JSON.parse(body);
      } catch (error) {
        bodyError = `Response declared JSON but could not be parsed: ${errorMessage(error)}`;
      }
    }

    return {
      mode,
      readable: true,
      type,
      url,
      redirected,
      status,
      statusText,
      ok,
      headers,
      body,
      json,
      bodyBytes: bodyByteLength(body),
      bodyError
    };
  } catch (error) {
    return {
      mode,
      readable: false,
      type,
      url,
      redirected,
      status,
      statusText,
      ok,
      headers,
      body: null,
      json: null,
      bodyBytes: null,
      bodyError: `Could not read response body: ${errorMessage(error)}`
    };
  }
}

async function collectResponseData(
  response: Response,
  requestUrl: string,
  fetchImplementation: FetchImplementation,
  signal: AbortSignal
): Promise<{ response: ProbeResponseData; error: string | null }> {
  const primary = await describeResponse(response, "no-cors");
  if (!isOpaqueResponse(response)) return { response: primary, error: null };

  try {
    const corsResponse = await fetchImplementation(requestUrl, {
      mode: "cors",
      cache: "no-store",
      signal
    });
    return { response: await describeResponse(corsResponse, "cors"), error: null };
  } catch (error) {
    return {
      response: primary,
      error: `CORS diagnostic read failed: ${errorMessage(error)}`
    };
  }
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function normalizedKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function recordValue(record: JsonRecord | null, names: string[]): unknown {
  if (!record) return undefined;
  const expected = new Set(names.map(normalizedKey));
  return Object.entries(record).find(([name]) => expected.has(normalizedKey(name)))?.[1];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function traceRecord(body: string | null): JsonRecord | null {
  if (!body) return null;
  const output: JsonRecord = {};
  let count = 0;

  for (const line of body.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key) continue;
    output[key] = value;
    count++;
  }

  return count > 0 ? output : null;
}

function bodyRecord(response: ProbeResponseData): JsonRecord | null {
  const parsed = asRecord(response.json);
  if (parsed) return parsed;
  if (!response.body) return null;

  try {
    const json = asRecord(JSON.parse(response.body));
    if (json) return json;
  } catch {
    // Not JSON; the Cloudflare trace format is `key=value` per line.
  }
  return traceRecord(response.body);
}

function headerValue(headers: Record<string, string> | null, names: string[]): string | null {
  if (!headers) return null;
  for (const name of names) {
    const value = headers[name.toLowerCase()];
    if (value !== undefined) return value;
  }
  return null;
}

function echoedHeaders(record: JsonRecord | null): Record<string, string> | null {
  const headers = asRecord(recordValue(record, ["headers", "request_headers"]));
  if (!headers) return null;

  const output = Object.fromEntries(
    Object.entries(headers)
      .map(([name, value]) => [name, stringValue(value)] as const)
      .filter((entry): entry is [string, string] => entry[1] !== null)
  );
  return Object.keys(output).length > 0 ? output : null;
}

function extractProbeInsights(response: ProbeResponseData): ProbeInsights {
  const headers = response.headers;
  const record = bodyRecord(response);
  const publicIp = stringValue(recordValue(record, ["ip", "client_ip", "query", "ip_addr"]));
  const country = stringValue(recordValue(record, ["country", "country_code", "loc"]));
  const region = stringValue(recordValue(record, ["region", "region_name"]));
  const city = stringValue(recordValue(record, ["city"]));
  const timezone = stringValue(recordValue(record, ["timezone", "time_zone"]));
  const asn = stringValue(recordValue(record, ["asn", "as", "as_number"]));
  const organization = stringValue(recordValue(record, ["organization", "org", "asn_org", "as_name"]));
  const isp = stringValue(recordValue(record, ["isp"]));
  const tlsVersion = stringValue(recordValue(record, ["tls", "tls_version"]));
  const httpVersion = stringValue(recordValue(record, ["http", "http_version"]));
  const vpnExit = booleanValue(recordValue(record, ["mullvad_exit_ip", "vpn_exit", "is_vpn", "vpn"]));
  const colo = stringValue(recordValue(record, ["colo", "datacenter", "pop"]));
  const requestId = headerValue(headers, ["cf-ray", "x-request-id", "x-amzn-requestid"]);
  const server = headerValue(headers, ["server"]);
  const provider = headerValue(headers, ["cf-ray"]) || colo
    ? "Cloudflare"
    : headerValue(headers, ["x-amz-cf-id"])
      ? "CloudFront"
      : null;
  const cacheStatus = headerValue(headers, ["cf-cache-status", "x-cache"]);
  const cacheControl = headerValue(headers, ["cache-control"]);
  const cacheAge = headerValue(headers, ["age"]);
  const requestHeaders = echoedHeaders(record);
  const summary: string[] = [];

  if (!response.readable) summary.push("Response data unavailable");
  if (publicIp) summary.push("Public IP reported");
  if (country || region || city || timezone) summary.push("Location reported");
  if (asn || organization || isp) summary.push("Network identity reported");
  if (tlsVersion) summary.push(`TLS ${tlsVersion}`);
  if (httpVersion) summary.push(`HTTP ${httpVersion}`);
  if (provider && colo) summary.push(`${provider} edge ${colo}`);
  else if (provider) summary.push(`${provider} edge`);
  if (cacheStatus) summary.push(`Cache ${cacheStatus}`);
  if (requestHeaders) summary.push(`Request headers echoed (${Object.keys(requestHeaders).length})`);
  if (vpnExit !== null) summary.push(vpnExit ? "VPN exit detected" : "No VPN exit detected");

  return {
    publicIp,
    location: { country, region, city, timezone },
    network: { asn, organization, isp },
    tlsVersion,
    httpVersion,
    vpnExit,
    edge: {
      provider,
      colo,
      requestId,
      server,
      via: headerValue(headers, ["via"]),
      serverTiming: headerValue(headers, ["server-timing"]),
      altSvc: headerValue(headers, ["alt-svc"])
    },
    cache: { status: cacheStatus, control: cacheControl, age: cacheAge },
    cors: {
      readable: response.readable,
      allowedOrigin: headerValue(headers, ["access-control-allow-origin"]),
      exposedHeaders: headerValue(headers, ["access-control-expose-headers"])
    },
    rateLimit: {
      limit: headerValue(headers, ["x-ratelimit-limit", "ratelimit-limit"]),
      remaining: headerValue(headers, ["x-ratelimit-remaining", "ratelimit-remaining"]),
      reset: headerValue(headers, ["x-ratelimit-reset", "ratelimit-reset"]),
      retryAfter: headerValue(headers, ["retry-after"])
    },
    requestHeaders,
    summary
  };
}

function escapeMarkdownCell(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

function redactSummaryValue(body: string, value: string | null, replacement: string): string {
  return value ? body.split(value).join(replacement) : body;
}

function bodySummary(response: ProbeResponseData | null, insights: ProbeInsights | null): string {
  if (!response) return "—";
  if (response.body === null) return response.bodyError ? "unavailable" : "—";

  let safeBody = redactSummaryValue(response.body, insights?.publicIp ?? null, "<redacted-ip>");
  for (const value of Object.values(insights?.requestHeaders ?? {})) {
    safeBody = redactSummaryValue(safeBody, value, "<redacted-request-header>");
  }
  const compact = safeBody.replace(/\s+/g, " ").trim();
  const preview = compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
  const kind = isJsonContentType(response.headers?.["content-type"]) ? "JSON" : "text";
  return `${kind}, ${response.bodyBytes ?? 0} B${preview ? `: ${preview}` : " (empty)"}`;
}

function markdownSummary(probeResults: ProbeResult[]): string {
  const rows = probeResults.map((probe) => {
    const response = probe.response;
    const http = response?.status === null || response?.status === undefined
      ? "—"
      : `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
    const contentType = response?.headers?.["content-type"] ?? "—";
    const headerCount = response?.headers ? String(Object.keys(response.headers).length) : "unavailable";
    const latency = probe.latency === null ? "—" : `${Math.round(probe.latency)} ms`;
    const note = probe.error ?? response?.bodyError ?? "—";
    const insights = probe.insights?.summary.join("; ") || "—";

    return `| ${escapeMarkdownCell(probe.url)} | ${probe.state} | ${latency} | ${escapeMarkdownCell(http)} | ${escapeMarkdownCell(contentType)} | ${headerCount} | ${escapeMarkdownCell(bodySummary(response, probe.insights))} | ${escapeMarkdownCell(insights)} | ${escapeMarkdownCell(note)} |`;
  });

  return [
    "| Endpoint | State | Latency | HTTP | Content type | Headers | Body | Insights | Notes |",
    "| --- | --- | ---: | --- | --- | ---: | --- | --- | --- |",
    ...rows
  ].join("\n");
}

function runCheck(callback: ResultCallback, options: IsFastInternetOptions = {}): void {
  const threshold = finiteNonNegative(options.threshold, 589, "threshold");
  const minDownlinkMbps = options.minDownlinkMbps === undefined
    ? undefined
    : finiteNonNegative(options.minDownlinkMbps, 0, "minDownlinkMbps");
  const downloadBytes = finiteNonNegative(
    options.downloadBytes,
    DEFAULT_DOWNLOAD_BYTES,
    "downloadBytes"
  );
  const minDownloadMbps = options.minDownloadMbps === undefined
    ? undefined
    : finiteNonNegative(options.minDownloadMbps, 0, "minDownloadMbps");
  const allowEarlyExit = options.allowEarlyExit !== false;
  const timeout = options.timeout === undefined
    ? (allowEarlyExit ? threshold * 3 : null)
    : finiteNonNegative(options.timeout, 0, "timeout");
  const probes = options.images
    ? [...options.images]
    : options.image
      ? [options.image]
      : buildDefaultProbes(options.autoRegion !== false);
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  if (typeof fetchImplementation !== "function") {
    throw new Error("is-fast-internet requires fetch; pass options.fetch or use a modern browser");
  }

  const checkStarted = now();
  const probeController = new AbortController();
  const downloadController = new AbortController();
  let settled = false;
  let attemptedProbes = 0;
  let failedProbes = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let downloadedBytes: number | null = null;
  let downloadMbps: number | null = null;
  let downloadDone = downloadBytes === 0;
  let probeOutcome: {
    isFast: boolean;
    latency: number | null;
    probeUrl: string | null;
    reason: InternetCheckReason;
  } | null = null;

  const onExternalAbort = (): void => finish({
    isFast: false,
    latency: null,
    probeUrl: null,
    reason: "aborted"
  });

  function finish(outcome: NonNullable<typeof probeOutcome>): void {
    if (settled) return;
    settled = true;
    if (timer !== null) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
    probeController.abort();
    downloadController.abort();

    const connection = getConnectionInfo();
    const info: IsFastInternetInfo = {
      latency: outcome.latency,
      downlinkMbps: connection?.downlinkMbps ?? null,
      effectiveType: connection?.effectiveType ?? null,
      downloadMbps,
      downloadedBytes,
      probeUrl: outcome.probeUrl,
      attemptedProbes,
      failedProbes,
      duration: Math.max(0, now() - checkStarted),
      reason: outcome.reason
    };

    let isFast = outcome.isFast;
    if (isFast && minDownlinkMbps !== undefined && info.downlinkMbps !== null &&
        info.downlinkMbps < minDownlinkMbps) {
      isFast = false;
      info.reason = "downlink";
    }
    if (isFast && minDownloadMbps !== undefined && info.downloadMbps !== null &&
        info.downloadMbps < minDownloadMbps) {
      isFast = false;
      info.reason = "download";
    }

    callback(isFast, info);
  }

  function maybeFinish(): void {
    if (probeOutcome === null || !downloadDone) return;
    finish(probeOutcome);
  }

  function completeProbe(outcome: NonNullable<typeof probeOutcome>): void {
    if (probeOutcome !== null || settled) return;
    probeOutcome = outcome;
    probeController.abort();

    // A completed download is useful telemetry, but it cannot establish that
    // the probe set itself is reachable.
    if (outcome.reason === "unreachable") {
      finish(outcome);
      return;
    }
    maybeFinish();
  }

  if (options.signal?.aborted) {
    finish({ isFast: false, latency: null, probeUrl: null, reason: "aborted" });
    return;
  }
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });

  if (probes.length === 0) {
    finish({ isFast: false, latency: null, probeUrl: null, reason: "unreachable" });
    return;
  }

  if (timeout !== null) {
    timer = setTimeout(() => {
      if (probeOutcome !== null) {
        downloadDone = true;
        maybeFinish();
        return;
      }
      finish({ isFast: false, latency: null, probeUrl: null, reason: "timeout" });
    }, timeout);
  }

  probes.forEach((url, index) => {
    attemptedProbes++;
    const probeStarted = now();
    const bustedUrl = addCacheBuster(url, `${Date.now()}-${index}`);

    try {
      fetchImplementation(bustedUrl, {
        mode: "no-cors",
        cache: "no-store",
        signal: probeController.signal
      }).then(() => {
        const latency = Math.max(0, now() - probeStarted);
        completeProbe({
          isFast: latency <= threshold,
          latency,
          probeUrl: url,
          reason: latency <= threshold ? "fast" : "latency"
        });
      }).catch(() => {
        if (settled || probeOutcome !== null) return;
        failedProbes++;
        if (failedProbes === probes.length) {
          completeProbe({ isFast: false, latency: null, probeUrl: null, reason: "unreachable" });
        }
      });
    } catch {
      if (settled || probeOutcome !== null) return;
      failedProbes++;
      if (failedProbes === probes.length) {
        completeProbe({ isFast: false, latency: null, probeUrl: null, reason: "unreachable" });
      }
    }
  });

  if (settled || downloadBytes === 0) return;

  const downloadStarted = now();
  try {
    fetchImplementation(buildDownloadUrl(options.downloadUrl ?? DEFAULT_DOWNLOAD_URL, downloadBytes), {
      cache: "no-store",
      signal: downloadController.signal
    }).then((response) => response.arrayBuffer()).then((body) => {
      if (settled) return;
      const duration = Math.max(0, now() - downloadStarted);
      downloadedBytes = body.byteLength;
      downloadMbps = duration === 0 ? null : (body.byteLength * 8) / duration / 1_000;
      downloadDone = true;
      maybeFinish();
    }).catch(() => {
      if (settled) return;
      downloadDone = true;
      maybeFinish();
    });
  } catch {
    downloadDone = true;
    maybeFinish();
  }
}

interface PendingProbeResult extends Omit<ProbeResult, "state"> {
  state: ProbeState | "pending";
  notified: boolean;
}

/**
 * Collect every endpoint's result for the Promise API. This deliberately does
 * not replace `runCheck`: the callback API must keep its immediate
 * first-response behavior.
 */
function runDetailedCheck(
  callback: DetailedResultCallback,
  options: IsFastInternetOptions = {}
): void {
  const threshold = finiteNonNegative(options.threshold, 589, "threshold");
  const minDownlinkMbps = options.minDownlinkMbps === undefined
    ? undefined
    : finiteNonNegative(options.minDownlinkMbps, 0, "minDownlinkMbps");
  const downloadBytes = finiteNonNegative(
    options.downloadBytes,
    DEFAULT_DOWNLOAD_BYTES,
    "downloadBytes"
  );
  const minDownloadMbps = options.minDownloadMbps === undefined
    ? undefined
    : finiteNonNegative(options.minDownloadMbps, 0, "minDownloadMbps");
  const allowEarlyExit = options.allowEarlyExit !== false;
  const timeout = options.timeout === undefined
    ? (allowEarlyExit ? threshold * 3 : null)
    : finiteNonNegative(options.timeout, 0, "timeout");
  const probes = options.images
    ? [...options.images]
    : options.image
      ? [options.image]
      : buildDefaultProbes(options.autoRegion !== false);
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  if (typeof fetchImplementation !== "function") {
    throw new Error("is-fast-internet requires fetch; pass options.fetch or use a modern browser");
  }

  const checkStarted = now();
  const controller = new AbortController();
  const probeResults: PendingProbeResult[] = probes.map((url) => ({
    url,
    requestUrl: null,
    state: "aborted",
    latency: null,
    response: null,
    insights: null,
    notified: false,
    error: null
  }));
  let settled = false;
  let attemptedProbes = 0;
  let failedProbes = 0;
  let remainingProbes = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let downloadedBytes: number | null = null;
  let downloadMbps: number | null = null;
  let downloadDone = downloadBytes === 0;

  function snapshotProbe(probe: PendingProbeResult): ProbeResult {
    const { notified: _notified, ...result } = probe;
    return {
      ...result,
      state: probe.state === "pending" ? "aborted" : probe.state
    };
  }

  function finalProbeResults(): ProbeResult[] {
    return probeResults.map(snapshotProbe);
  }

  function notifyProbe(probe: PendingProbeResult): void {
    if (probe.notified) return;
    probe.notified = true;
    try {
      options.onProbeResult?.(snapshotProbe(probe));
    } catch {
      // Observer failures must not alter the connectivity result.
    }
  }

  function markPending(state: Extract<ProbeState, "timeout" | "aborted">): void {
    for (const probe of probeResults) {
      if (probe.state === "pending" || (probe.state === "aborted" && probe.requestUrl === null)) {
        probe.state = state;
        notifyProbe(probe);
      }
    }
  }

  function settle(forcedReason?: Extract<InternetCheckReason, "timeout" | "aborted">): void {
    if (settled) return;
    settled = true;
    if (timer !== null) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
    controller.abort();

    for (const probe of probeResults) notifyProbe(probe);

    const results = finalProbeResults();
    const fastest = results
      .filter((probe) => probe.state === "responded" && probe.latency !== null)
      .sort((left, right) => (left.latency as number) - (right.latency as number))[0] ?? null;
    let isFast = false;
    let latency: number | null = null;
    let probeUrl: string | null = null;
    let reason: InternetCheckReason;

    if (forcedReason === "aborted") {
      reason = "aborted";
    } else if (fastest && fastest.latency !== null) {
      latency = fastest.latency;
      probeUrl = fastest.url;
      isFast = fastest.latency <= threshold;
      reason = isFast ? "fast" : "latency";
    } else if (forcedReason === "timeout") {
      reason = "timeout";
    } else {
      reason = "unreachable";
    }

    const connection = getConnectionInfo();
    const info: IsFastInternetInfo & {
      probeResults: ProbeResult[];
      markdownSummary: string;
    } = {
      latency,
      downlinkMbps: connection?.downlinkMbps ?? null,
      effectiveType: connection?.effectiveType ?? null,
      downloadMbps,
      downloadedBytes,
      probeUrl,
      attemptedProbes,
      failedProbes,
      duration: Math.max(0, now() - checkStarted),
      reason,
      probeResults: results,
      markdownSummary: markdownSummary(results)
    };

    if (isFast && minDownlinkMbps !== undefined && info.downlinkMbps !== null &&
        info.downlinkMbps < minDownlinkMbps) {
      isFast = false;
      info.reason = "downlink";
    }
    if (isFast && minDownloadMbps !== undefined && info.downloadMbps !== null &&
        info.downloadMbps < minDownloadMbps) {
      isFast = false;
      info.reason = "download";
    }

    callback(isFast, info);
  }

  function finishWhenComplete(): void {
    if (remainingProbes !== 0) return;
    if (probeResults.every((probe) => probe.state === "failed")) {
      settle();
      return;
    }
    if (!downloadDone) return;
    settle();
  }

  const onExternalAbort = (): void => {
    markPending("aborted");
    settle("aborted");
  };

  if (options.signal?.aborted) {
    markPending("aborted");
    settle("aborted");
    return;
  }
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });

  if (probeResults.length === 0) {
    settle();
    return;
  }

  if (timeout !== null) {
    timer = setTimeout(() => {
      markPending("timeout");
      downloadDone = true;
      settle("timeout");
    }, timeout);
  }

  async function runProbe(probe: PendingProbeResult, index: number): Promise<void> {
    const probeStarted = now();
    const bustedUrl = addCacheBuster(probe.url, `${Date.now()}-${index}`);
    probe.requestUrl = bustedUrl;

    let response: Response;
    try {
      response = await fetchImplementation(bustedUrl, {
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal
      });
    } catch (error) {
      if (!settled) {
        probe.state = "failed";
        probe.error = errorMessage(error);
        failedProbes++;
        notifyProbe(probe);
      }
      return;
    }

    if (settled) return;
    probe.latency = Math.max(0, now() - probeStarted);
    probe.state = "responded";

    try {
      const collected = await collectResponseData(
        response,
        bustedUrl,
        fetchImplementation,
        controller.signal
      );
      if (!settled) {
        probe.response = collected.response;
        probe.insights = extractProbeInsights(collected.response);
        probe.error = collected.error;
        notifyProbe(probe);
      }
    } catch (error) {
      if (!settled) {
        probe.error = `Response analysis failed: ${errorMessage(error)}`;
        notifyProbe(probe);
      }
    }
  }

  for (const [index, probe] of probeResults.entries()) {
    probe.state = "pending";
    attemptedProbes++;
    remainingProbes++;
    void runProbe(probe, index).finally(() => {
      remainingProbes--;
      if (!settled) finishWhenComplete();
    });
  }

  if (downloadBytes === 0) return;

  const downloadStarted = now();
  try {
    fetchImplementation(buildDownloadUrl(options.downloadUrl ?? DEFAULT_DOWNLOAD_URL, downloadBytes), {
      cache: "no-store",
      signal: controller.signal
    }).then((response) => response.arrayBuffer()).then((body) => {
      if (settled) return;
      const duration = Math.max(0, now() - downloadStarted);
      downloadedBytes = body.byteLength;
      downloadMbps = duration === 0 ? null : (body.byteLength * 8) / duration / 1_000;
      downloadDone = true;
      finishWhenComplete();
    }).catch(() => {
      if (settled) return;
      downloadDone = true;
      finishWhenComplete();
    });
  } catch {
    downloadDone = true;
    finishWhenComplete();
  }
}

/**
 * Promise-based check that returns complete per-endpoint diagnostics and Markdown.
 */
export function checkInternet(options?: IsFastInternetOptions): Promise<InternetCheckResult> {
  return new Promise((resolve, reject) => {
    try {
      runDetailedCheck((isFast, info) => resolve({ isFast, ...info }), options);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Backwards-compatible callback API. For new code, prefer checkInternet().
 */
export default function isFastInternet(
  callback: ResultCallback,
  options?: IsFastInternetOptions
): void {
  runCheck(callback, options);
}
