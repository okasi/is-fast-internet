# ⚡ is-fast-internet

**A tiny, zero-dependency internet quality check built for real-world networks.**

Zero dependencies. Microscopic bundle. Delivers an accurate answer **even behind the Great Firewall, across Russia, Iran, and Turkmenistan**.

It races tiny probes against the world's smartest geo-diverse domains. Whichever responds first wins — blocked domains simply lose the race instead of hanging your app. Google is **intentionally excluded** (it's blocked or unreliable exactly where this library shines).

### ✨ Why it's awesome

- ⚡ **Blazing detection** — sub-threshold latency wins in milliseconds
- 🧠 **Region-smart** — only fires Baidu/Alibaba in China timezones, VK in Russia, etc. (saves requests + stays stealthy)
- 🗺️ **18 global + 6 regional probes** — Yandex, Cloudflare, Akamai, AWS, Firefox, Microsoft, and IP/privacy diagnostics + local heroes
- 📡 **Measured bandwidth by default** — fully downloads a capped 64 KiB payload, plus browser-provided estimates when available
- 🪶 **Zero dependencies**, pure `fetch`, works in any modern browser
- 🧭 **Actionable diagnostics** — know whether latency, bandwidth, timeout, cancellation, or reachability decided the result
- 🧹 **No request leaks** — losing probes are aborted as soon as the result is known
- 🔌 **Modern and compatible** — Promise API, AbortSignal support, plus the original callback API

The global set is small by design. Region-specific probes are added automatically based on the visitor's browser timezone, so people in New York never hit Baidu and visitors in Shanghai get the China-optimized probes.

## Install

**[Try the live Signal Lab demo →](https://okasi.github.io/is-fast-internet/)**

```sh
npm install is-fast-internet
```

## Quick start

```js
import { checkInternet } from "is-fast-internet";

const result = await checkInternet();

if (result.isFast) {
  // Load the high-resolution experience.
} else {
  // Serve the lightweight experience.
}

console.log(result);
// { isFast: true, latency: 82, reason: "fast", probeUrl: "https://...", ... }
```

`checkInternet()` also returns a complete endpoint ledger and a ready-to-render
Markdown summary:

```js
const { probeResults, markdownSummary } = await checkInternet();

for (const probe of probeResults) {
  console.log(probe.url, probe.response?.headers, probe.response?.body);
}

console.log(markdownSummary);
```

Cancel a check using the same `AbortSignal` pattern as `fetch`:

```js
const controller = new AbortController();
const pending = checkInternet({ signal: controller.signal });
controller.abort();

const result = await pending;
console.log(result.reason); // "aborted"
```

Cancellation resolves to a diagnostic result instead of throwing, so it is safe in UI teardown paths.

### Callback API

The original API remains fully supported:

```js
import isFastInternet from "is-fast-internet";

isFastInternet((isFast, info) => {
  console.log(isFast, info.reason, info.latency);
});
```

CommonJS also works:

```js
const isFastInternet = require("is-fast-internet");
const { checkInternet } = require("is-fast-internet");
```

## Options

```js
await checkInternet({
  threshold: 589,        // ms of latency considered "fast" (default 589)
  timeout: 1500,         // explicit overall deadline (default threshold * 3)
  autoRegion: true,      // only fire region probes matching browser timezone (default true)
  minDownlinkMbps: 5,    // also require this downlink when known (default: unset)
  minDownloadMbps: 2,    // also require this measured 64 KiB transfer speed (default: unset)
  signal,                 // optional AbortSignal
  images: [               // custom URLs fully replace the defaults
    "https://cdn.example.com/px.gif"
  ]
});
```

| Option | Default | Purpose |
| --- | --- | --- |
| `threshold` | `589` | Maximum winning-probe latency considered fast |
| `timeout` | `threshold * 3` | Overall deadline; takes precedence over `allowEarlyExit` |
| `allowEarlyExit` | `true` | Disable the derived deadline when false and `timeout` is unset |
| `autoRegion` | `true` | Only add probes relevant to the browser timezone |
| `minDownlinkMbps` | unset | Require this speed when the browser exposes an estimate |
| `downloadBytes` | `65536` | Bytes fully downloaded to sample throughput; set to `0` to disable |
| `downloadUrl` | Cloudflare speed-test endpoint | CORS-enabled endpoint for the capped download test |
| `minDownloadMbps` | unset | Require the measured capped-download speed when available |
| `image` | unset | Legacy single custom probe URL |
| `images` | defaults | Custom probe list; an empty list returns `unreachable` immediately |
| `signal` | unset | Cancel with an `AbortSignal` |
| `fetch` | `globalThis.fetch` | Inject a fetch-compatible implementation for tests or controlled runtimes |
| `onProbeResult` | unset | Receive each finalized `ProbeResult` as `checkInternet()` collects it |

All numeric options must be finite and non-negative. Invalid values reject `checkInternet()` with a `RangeError` and throw from the callback API.

## Understanding results

| Reason | Meaning |
| --- | --- |
| `fast` | A probe responded within the threshold and passed the optional downlink gate |
| `latency` | The winning reachable probe exceeded the threshold |
| `downlink` | Latency passed, but browser-reported downlink missed `minDownlinkMbps` |
| `download` | Latency passed, but the capped download missed `minDownloadMbps` |
| `timeout` | No probe responded before the deadline |
| `unreachable` | Every probe failed, or no probes were configured |
| `aborted` | The supplied signal cancelled the check |

The result also includes `probeUrl`, `latency`, `downloadMbps`, `downloadedBytes`, `duration`, `attemptedProbes`, and `failedProbes`.

## Response diagnostics

`checkInternet()` waits for every configured probe to settle (or for the
overall deadline) and returns one `probeResults` item per probe, in configured
order. Each item includes the cache-busted request URL, state, latency,
transport/CORS error, and any browser-readable response data:

- `response.headers` contains every header exposed to the page.
- `response.body` is the complete readable response text; JSON content is also
  available as `response.json`, with UTF-8 size in `response.bodyBytes`.
- `response.status`, `statusText`, `ok`, `type`, `url`, and `redirected` retain
  the available HTTP and Fetch metadata.
- `insights` normalizes useful body and header signals into stable fields, while
  retaining the raw data in `response`.
- `markdownSummary` is a compact Markdown table showing endpoint state,
  latency, HTTP metadata, header count, a redacted body preview, and extracted
  insights. The full headers and body remain in `probeResults`.

### Recognized signals

| `insights` field | Data used | Typical probes |
| --- | --- | --- |
| `publicIp`, `location`, `network` | JSON/text fields such as `ip`, `country`, `city`, `asn`, `organization`, and `isp` | IPify, ifconfig, GeoJS, Mullvad, Akamai |
| `tlsVersion`, `httpVersion`, `vpnExit` | Trace/JSON fields such as `tls`, `http`, and `mullvad_exit_ip` | Cloudflare trace, TLS Peet, How’s My SSL, Mullvad |
| `edge` | `cf-ray`, `server`, `via`, `server-timing`, `alt-svc`, plus body fields such as `colo` | Cloudflare, Akamai, AWS/CDN-backed probes |
| `cache` | `cf-cache-status`, `x-cache`, `cache-control`, `age` | CDN and captive-portal probes |
| `cors`, `rateLimit` | CORS and rate-limit headers, including `access-control-expose-headers`, `retry-after`, and `x-ratelimit-*` | Any CORS-readable probe |
| `requestHeaders` | A response body that echoes received request headers | `httpbin.org/headers` |

The `Insights` column in `markdownSummary` uses concise, privacy-conscious
labels such as `TLS TLSv1.3`, `Cloudflare edge FRA`, or `Cache HIT`; it never
puts the raw public IP or echoed request-header values into that summary. Those
values remain available in `insights` and the raw response body for callers
that explicitly need them.

Browser CORS rules still apply. Connectivity probes begin with `no-cors` so
the package remains usable with endpoints that do not send CORS headers. Such
responses are opaque, so the browser hides their HTTP status, headers, and
body. For each opaque response, `checkInternet()` makes one additional CORS
diagnostic request; if the endpoint permits it, the response fields are
populated. Otherwise they are `null`, `readable` is `false`, and `bodyError`
explains why. Only CORS-exposed headers are visible. Use endpoints you control
with appropriate CORS and `Access-Control-Expose-Headers` settings when you
need complete diagnostics.

Some probe bodies can contain a public IP, rough location, ASN/organization,
or echoed request headers. Treat `probeResults` as diagnostic telemetry and
avoid logging or exporting it without an appropriate privacy policy.

The callback API deliberately retains its original first-response behavior;
use `checkInternet()` when you need the complete per-endpoint analysis.
Pass `onProbeResult` to render those finalized endpoint records as they arrive
without waiting for the final Promise result.

## Default probes

`getDefaultProbes()` returns the active defaults as `{ url, region }` records.
Pass `{ autoRegion: false }` to inspect every regional default; the demo uses
this same export, so its probe list stays aligned with the package.

Always fires (small, global):

| Probe |
| --- |
| `yandex.com/favicon.ico` — not gated to Russian timezones since Yandex (Maps, Browser, Taxi) has real usage in Turkiye and elsewhere too |
| `api.cloudflare.com/cdn-cgi/trace` — Cloudflare's own recommended connectivity-diagnostic endpoint |
| `1.1.1.1/cdn-cgi/trace` — Cloudflare's anycast resolver connectivity diagnostic endpoint |
| `whatismyip.akamai.com/advanced?debug` |
| `checkip.global.api.aws/` |
| `checkip.amazonaws.com/` |
| `detectportal.firefox.com/canonical.html` — HTTPS |
| `edge.microsoft.com/captiveportal/generate_204` |
| `am.i.mullvad.net/json` |
| `tls.peet.ws/api/clean` |
| `test.nextdns.io/` |
| `www.howsmyssl.com/a/check` |
| `httpbin.org/headers` |
| `api.ipify.org?format=json` |
| `ifconfig.co/json`, `ifconfig.io` |
| `captive.apple.com/hotspot-detect.html` — HTTPS |
| `get.geojs.io/v1/ip/geo.json` |

Fires only when the browser's timezone matches (see [Region detection](#region-detection)):

| Region | Probe |
| --- | --- |
| China | `www.baidu.com/favicon.ico`, `www.alibaba.com/favicon.ico` |
| Russia / CIS | `vk.com/favicon.ico`, `dzen.ru/favicon.ico` |
| Iran | `www.aparat.com/favicon.ico` |
| Turkmenistan | `turkmenportal.com/favicon.ico` |

All active probes fire in parallel with a cache-busting query string, via
`fetch(url, { mode: "no-cors", cache: "no-store", signal })`. This works regardless
of content type — favicons, HTML pages, JSON — since it only needs to know
the request completed and how long it took, not read the (opaque) response
body, and it doesn't require CORS headers from the target domain. Whichever
completes first is by definition the lowest-latency reachable endpoint, so
its latency is compared against `threshold`. Failed probes (DNS blocks,
connection resets — what firewalls actually do) are counted, and if every
active probe fails the result is `unreachable`. Once a result is known, all
remaining requests are aborted.

> Note: national firewalls change frequently. If you deploy to a specific
> region, pass your own `images` list pointing at a domain you control or a
> CDN with local presence for the most reliable signal.

## Region detection

By default (`autoRegion: true`), the region-specific probes above only fire
when `Intl.DateTimeFormat().resolvedOptions().timeZone` matches that region
(e.g. `Asia/Shanghai` → Baidu/Alibaba, `Europe/Moscow` → VK, `Asia/Tehran` →
Aparat, `Asia/Ashgabat` → Turkmenportal). A visitor anywhere else
only ever fires the 18 global probes across Yandex, Cloudflare, Akamai,
AWS, Firefox, Microsoft, and independent IP/privacy diagnostic endpoints.

This is a latency/traffic optimization, not a correctness requirement — a
mismatched timezone (VPN, misconfigured system clock) just means the
region-specific probes are skipped, falling back to the global set. Set
`autoRegion: false` to always fire every probe regardless of timezone.

## Speed, not just latency

Every check also fully downloads a **64 KiB**, cache-disabled payload from
Cloudflare's CORS-enabled speed-test endpoint. It reports the completed
transfer as `downloadMbps` and its exact `downloadedBytes`; the request is
bounded by design, so it will not turn a quality check into an uncapped speed
test. Set `downloadBytes: 0` to opt out, or provide a CORS-enabled
`downloadUrl` you control. The sample is collected by default, but does not
change `isFast` unless `minDownloadMbps` is set—this preserves the existing
latency-based definition of a fast connection while letting applications add
a bandwidth gate.

The capped measurement reflects how quickly a small real asset can arrive;
it is not a sustained-line-rate benchmark. Latency and throughput are still
different things (a satellite link can have high bandwidth but terrible
latency).

When available, `info.downlinkMbps` and `info.effectiveType` give you a real
bandwidth estimate for free via the browser's [Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API) —
no additional request. This only exists in Chromium-based browsers (Chrome,
Edge, Opera, Android WebView); Safari and Firefox don't implement it, so
both fields will be `null` there. We deliberately don't ship a fallback
that downloads a large payload: the built-in 64 KiB sample covers every
modern browser with `fetch`, while a true speed-test service remains the
right choice for sustained Mbps numbers.

## Browser only

This package uses `fetch()` and is intended for browsers. It has no Node.js
runtime support.

## Development

Written in TypeScript (`src/index.ts`), built with [tsup](https://tsup.egoist.dev)
into both an ESM and a CommonJS bundle plus `.d.ts`/`.d.cts` type
declarations — a single source of truth instead of hand-maintaining two
parallel JS files.

```sh
npm install     # installs devDependencies (tsup, typescript)
npm run build   # emits dist/index.js, dist/index.cjs, dist/index.d.ts, dist/index.d.cts
npm run typecheck
npm test
npm run check   # typecheck, tests, and package validation
```

`dist/` is generated, not committed — `npm run build` runs automatically
before `npm publish` via the `prepublishOnly` script.

Pull requests run typechecking, the full ESM/CommonJS test suite, and an npm
package dry run in GitHub Actions.

## License

MIT
