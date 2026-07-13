export type InternetCheckReason =
  | "fast"
  | "latency"
  | "downlink"
  | "timeout"
  | "unreachable"
  | "aborted";

export interface IsFastInternetInfo {
  /** Round-trip time in ms of the winning probe, or null if none responded. */
  latency: number | null;
  /** Estimated downlink in Mbps from the Network Information API. */
  downlinkMbps: number | null;
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
}

export interface InternetCheckResult extends IsFastInternetInfo {
  isFast: boolean;
}

export type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface IsFastInternetOptions {
  /** Latency in ms considered "fast". Default: 589. */
  threshold?: number;
  /** Single probe URL (overrides the default geo-diverse set). */
  image?: string;
  /** Custom probe URLs; all are raced, first to respond decides. */
  images?: string[];
  /** Call back with false after threshold * 3 ms if nothing responded. Default: true. */
  allowEarlyExit?: boolean;
  /** Explicit timeout in ms. Overrides the threshold-derived early-exit timeout. */
  timeout?: number;
  /** Only include region probes matching the browser timezone. Default: true. */
  autoRegion?: boolean;
  /** Also require this downlink speed when the browser reports one. */
  minDownlinkMbps?: number;
  /** Cancel the check without throwing; the result reason will be "aborted". */
  signal?: AbortSignal;
  /** Custom fetch implementation, useful for controlled environments and tests. */
  fetch?: FetchImplementation;
}

interface RegionProbeGroup {
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
  "https://www.bing.com/robots.txt",
  "https://www.apple.com/favicon.ico",
  "https://www.apple.com/library/test/success.html",
  "https://yandex.com/favicon.ico",
  "https://api.cloudflare.com/cdn-cgi/trace",
  "https://1.1.1.1/cdn-cgi/trace",
  "https://www.akamai.com/favicon.ico"
] as const;

const REGION_PROBES: RegionProbeGroup[] = [
  {
    probes: [
      "https://www.baidu.com/favicon.ico",
      "https://www.alibaba.com/favicon.ico"
    ],
    timezones: ["Asia/Shanghai", "Asia/Urumqi", "Asia/Hong_Kong", "Asia/Macau"]
  },
  {
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
    probes: ["https://www.aparat.com/favicon.ico"],
    timezones: ["Asia/Tehran"]
  },
  {
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

function buildDefaultProbes(autoRegion: boolean): string[] {
  const probes: string[] = [...GLOBAL_PROBES];
  const timezone = autoRegion ? detectTimeZone() : null;

  for (const region of REGION_PROBES) {
    if (timezone === null || region.timezones.includes(timezone)) probes.push(...region.probes);
  }

  return probes;
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

function finiteNonNegative(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number`);
  }
  return resolved;
}

type ResultCallback = (isFast: boolean, info: IsFastInternetInfo) => void;

function runCheck(callback: ResultCallback, options: IsFastInternetOptions = {}): void {
  const threshold = finiteNonNegative(options.threshold, 589, "threshold");
  const minDownlinkMbps = options.minDownlinkMbps === undefined
    ? undefined
    : finiteNonNegative(options.minDownlinkMbps, 0, "minDownlinkMbps");
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
  let settled = false;
  let attemptedProbes = 0;
  let failedProbes = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const onExternalAbort = (): void => settle(false, null, null, "aborted");

  function settle(
    isFast: boolean,
    latency: number | null,
    probeUrl: string | null,
    reason: InternetCheckReason
  ): void {
    if (settled) return;
    settled = true;
    if (timer !== null) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
    controller.abort();

    const connection = getConnectionInfo();
    const info: IsFastInternetInfo = {
      latency,
      downlinkMbps: connection?.downlinkMbps ?? null,
      effectiveType: connection?.effectiveType ?? null,
      probeUrl,
      attemptedProbes,
      failedProbes,
      duration: Math.max(0, now() - checkStarted),
      reason
    };

    if (isFast && minDownlinkMbps !== undefined && info.downlinkMbps !== null &&
        info.downlinkMbps < minDownlinkMbps) {
      isFast = false;
      info.reason = "downlink";
    }

    callback(isFast, info);
  }

  if (options.signal?.aborted) {
    settle(false, null, null, "aborted");
    return;
  }
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });

  if (probes.length === 0) {
    settle(false, null, null, "unreachable");
    return;
  }

  if (timeout !== null) {
    timer = setTimeout(() => settle(false, null, null, "timeout"), timeout);
  }

  probes.forEach((url, index) => {
    attemptedProbes++;
    const probeStarted = now();
    const bustedUrl = addCacheBuster(url, `${Date.now()}-${index}`);

    try {
      fetchImplementation(bustedUrl, {
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal
      }).then(() => {
        const latency = Math.max(0, now() - probeStarted);
        settle(latency <= threshold, latency, url, latency <= threshold ? "fast" : "latency");
      }).catch(() => {
        if (settled) return;
        failedProbes++;
        if (failedProbes === probes.length) settle(false, null, null, "unreachable");
      });
    } catch {
      failedProbes++;
      if (failedProbes === probes.length) settle(false, null, null, "unreachable");
    }
  });
}

/**
 * Promise-based internet quality check with cancellation and diagnostic output.
 */
export function checkInternet(options?: IsFastInternetOptions): Promise<InternetCheckResult> {
  return new Promise((resolve, reject) => {
    try {
      runCheck((isFast, info) => resolve({ isFast, ...info }), options);
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
