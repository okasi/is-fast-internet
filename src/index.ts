export interface IsFastInternetInfo {
  /** Round-trip time in ms of the winning probe, or null if none responded. */
  latency: number | null;
  /**
   * Estimated downlink in Mbps from the browser's Network Information API.
   * Only available in Chromium-based browsers (Chrome, Edge, Opera, Android
   * WebView); always null in Safari and Firefox.
   */
  downlinkMbps: number | null;
  /** e.g. "4g", "3g", "2g", "slow-2g". Same browser support as downlinkMbps. */
  effectiveType: string | null;
}

export interface IsFastInternetOptions {
  /** Latency in ms considered "fast". Default: 589. */
  threshold?: number;
  /** Single probe URL (overrides the default geo-diverse set). */
  image?: string;
  /** Custom probe URLs; all are raced, first to respond decides. */
  images?: string[];
  /** Call back with false after threshold * 3 ms if nothing responded. Default: true. */
  allowEarlyExit?: boolean;
  /**
   * Use the browser's IANA timezone to only fire region-specific probes
   * (Baidu/Alibaba, VK/Dzen, Aparat/Digikala, Turkmenportal) when relevant,
   * instead of always firing all of them. Default: true.
   */
  autoRegion?: boolean;
  /**
   * If set, and downlinkMbps is known (Chromium browsers only), also
   * require downlinkMbps >= this value for the result to be "fast".
   */
  minDownlinkMbps?: number;
}

interface RegionProbeGroup {
  probes: string[];
  timezones: string[];
}

// Only the fields we actually read from the non-standard Network
// Information API. Not in lib.dom.d.ts since it's still experimental.
interface NetworkInformation {
  downlink?: number;
  effectiveType?: string;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
  mozConnection?: NetworkInformation;
  webkitConnection?: NetworkInformation;
}

// Always-fired global probes. Kept small — most users are on unrestricted
// networks and don't need the region-specific set below. Yandex is here
// rather than gated to Russian timezones because it has real usage outside
// Russia/CIS too (Maps, Browser, Taxi are popular in Turkiye, for example).
// Cloudflare and Akamai are large CDN operators with edge presence spanning
// most of the world, including regions with restrictive firewalls. Several
// entries below are purpose-built connectivity-check endpoints rather than
// favicons (Apple's success.html is what iOS/macOS itself uses to detect
// internet access; Cloudflare's /cdn-cgi/trace is their own recommended
// diagnostic endpoint) — these tend to be more stable over time than an
// arbitrary favicon path.
const GLOBAL_PROBES: string[] = [
  "https://www.bing.com/favicon.ico",
  "https://www.apple.com/favicon.ico",
  "https://www.apple.com/library/test/success.html",
  "https://app-site-association.cdn-apple.com/a/v1/apple.com",
  "https://yandex.com/favicon.ico",
  "https://yandex.com/internet/",
  "https://www.cloudflare.com/favicon.ico",
  "https://api.cloudflare.com/cdn-cgi/trace",
  "https://www.akamai.com/favicon.ico"
];

// Region-specific probes, only added when the browser's IANA timezone
// suggests the user is likely behind that region's firewall. This avoids
// firing e.g. Baidu/Yandex/Aparat requests for every visitor worldwide.
const REGION_PROBES: RegionProbeGroup[] = [
  {
    // China officially runs on one clock (Beijing/Asia-Shanghai) despite
    // spanning 5 geographic zones, so Asia/Harbin, Asia/Chongqing, etc. are
    // just deprecated IANA aliases that resolve to Asia/Shanghai anyway —
    // no need to list them. Asia/Urumqi is the one real exception: it's
    // Xinjiang's unofficial local time and a distinct IANA zone.
    probes: [
      "https://www.baidu.com/favicon.ico",
      "https://www.alibaba.com/favicon.ico",
      "https://www.alibabacloud.com/favicon.ico"
    ],
    timezones: ["Asia/Shanghai", "Asia/Urumqi", "Asia/Hong_Kong", "Asia/Macau"]
  },
  {
    // All 11 of Russia's current IANA timezones, Kaliningrad (UTC+2) to
    // Kamchatka/Anadyr (UTC+12), plus Simferopol (Crimea). Yandex is not
    // listed here — it's in GLOBAL_PROBES since it's not Russia-only.
    probes: ["https://vk.com/favicon.ico", "https://dzen.ru/favicon.ico"],
    timezones: [
      "Europe/Moscow", "Europe/Kaliningrad", "Europe/Samara", "Europe/Volgograd",
      "Europe/Saratov", "Europe/Kirov", "Europe/Ulyanovsk", "Europe/Astrakhan",
      "Europe/Simferopol",
      "Asia/Yekaterinburg", "Asia/Omsk", "Asia/Novosibirsk", "Asia/Barnaul",
      "Asia/Tomsk", "Asia/Novokuznetsk", "Asia/Krasnoyarsk", "Asia/Irkutsk",
      "Asia/Chita", "Asia/Yakutsk", "Asia/Khandyga", "Asia/Vladivostok",
      "Asia/Ust-Nera", "Asia/Magadan", "Asia/Sakhalin", "Asia/Srednekolymsk",
      "Asia/Kamchatka", "Asia/Anadyr"
    ]
  },
  {
    probes: ["https://www.aparat.com/favicon.ico", "https://www.digikala.com/favicon.ico"],
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
  let probes = GLOBAL_PROBES.slice();
  if (!autoRegion) {
    REGION_PROBES.forEach((region) => {
      probes = probes.concat(region.probes);
    });
    return probes;
  }
  const tz = detectTimeZone();
  REGION_PROBES.forEach((region) => {
    if (region.timezones.indexOf(tz) !== -1) probes = probes.concat(region.probes);
  });
  return probes;
}

interface ConnectionInfo {
  downlinkMbps: number;
  effectiveType: string | null;
}

// Free, instant bandwidth signal from the browser itself. Only available in
// Chromium-based browsers (Chrome, Edge, Opera, Android WebView) — Safari
// and Firefox don't implement the Network Information API, so this (and
// therefore info.downlinkMbps) will be null there.
function getConnectionInfo(): ConnectionInfo | null {
  const nav = typeof navigator !== "undefined" ? (navigator as NavigatorWithConnection) : null;
  const conn = nav && (nav.connection || nav.mozConnection || nav.webkitConnection);
  if (conn && typeof conn.downlink === "number") {
    return { downlinkMbps: conn.downlink, effectiveType: conn.effectiveType || null };
  }
  return null;
}

/**
 * Checks whether the user's connection is fast by racing tiny network
 * requests against geo-diverse domains (works behind national firewalls
 * in China, Russia, Iran, and Turkmenistan).
 */
export default function isFastInternet(
  callback: (isFast: boolean, info: IsFastInternetInfo) => void,
  options?: IsFastInternetOptions
): void {
  const opts = options || {};
  const threshold = opts.threshold || 589;
  const allowEarlyExit = opts.allowEarlyExit !== false;
  const autoRegion = opts.autoRegion !== false;
  const minDownlinkMbps = opts.minDownlinkMbps;
  const probes = opts.images || (opts.image ? [opts.image] : buildDefaultProbes(autoRegion));

  let settled = false;
  let failedCount = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function settle(fast: boolean, latency: number | null): void {
    if (settled) return;
    settled = true;
    if (timer !== null) clearTimeout(timer);

    const conn = getConnectionInfo();
    const info: IsFastInternetInfo = {
      latency,
      downlinkMbps: conn ? conn.downlinkMbps : null,
      effectiveType: conn ? conn.effectiveType : null
    };

    if (fast && typeof minDownlinkMbps === "number" && typeof info.downlinkMbps === "number") {
      fast = info.downlinkMbps >= minDownlinkMbps;
    }

    callback(fast, info);
  }

  // No probes to race (e.g. options.images === []). Settle rather than
  // hang silently — otherwise the callback would never fire when
  // allowEarlyExit is also disabled.
  if (probes.length === 0) {
    settle(false, null);
    return;
  }

  if (allowEarlyExit) {
    timer = setTimeout(() => {
      settle(false, null); // nothing responded in time — too slow (or fully blocked)
    }, threshold * 3);
  }

  probes.forEach((url) => {
    const startTime = Date.now();
    const bustedUrl = url + (url.indexOf("?") === -1 ? "?t=" : "&t=") + startTime;

    // no-cors mode: works for any content type (images, HTML, JSON, plain
    // text) and doesn't require CORS/Timing-Allow-Origin headers, since we
    // only need to know the request completed and how long it took — not
    // read the (opaque) response body. Rejects on real network failure
    // (DNS block, connection reset), which is what censorship triggers.
    fetch(bustedUrl, { mode: "no-cors", cache: "no-store" })
      .then(() => {
        // First probe to finish is the lowest-latency reachable one.
        const latency = Date.now() - startTime;
        settle(latency <= threshold, latency);
      })
      .catch(() => {
        failedCount++;
        if (failedCount === probes.length) settle(false, null); // every domain unreachable
      });
  });
}
