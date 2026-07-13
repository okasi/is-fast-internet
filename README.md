# ⚡ is-fast-internet

**A tiny, zero-dependency internet quality check built for real-world networks.**

Zero dependencies. Microscopic bundle. Delivers an accurate answer **even behind the Great Firewall, across Russia, Iran, and Turkmenistan**.

It races tiny probes against the world's smartest geo-diverse domains. Whichever responds first wins — blocked domains simply lose the race instead of hanging your app. Google is **intentionally excluded** (it's blocked or unreliable exactly where this library shines).

### ✨ Why it's awesome

- ⚡ **Blazing detection** — sub-threshold latency wins in milliseconds
- 🧠 **Region-smart** — only fires Baidu/Alibaba in China timezones, VK in Russia, etc. (saves requests + stays stealthy)
- 🗺️ **35 global + 6 regional probes** — Apple, Yandex, Cloudflare, Akamai, AWS, Firefox, Microsoft, and IP/privacy diagnostics + local heroes
- 📡 **Free bandwidth bonus** — reads real `downlinkMbps` + `effectiveType` from the browser when available
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
| `image` | unset | Legacy single custom probe URL |
| `images` | defaults | Custom probe list; an empty list returns `unreachable` immediately |
| `signal` | unset | Cancel with an `AbortSignal` |
| `fetch` | `globalThis.fetch` | Inject a fetch-compatible implementation for tests or controlled runtimes |

All numeric options must be finite and non-negative. Invalid values reject `checkInternet()` with a `RangeError` and throw from the callback API.

## Understanding results

| Reason | Meaning |
| --- | --- |
| `fast` | A probe responded within the threshold and passed the optional downlink gate |
| `latency` | The winning reachable probe exceeded the threshold |
| `downlink` | Latency passed, but browser-reported downlink missed `minDownlinkMbps` |
| `timeout` | No probe responded before the deadline |
| `unreachable` | Every probe failed, or no probes were configured |
| `aborted` | The supplied signal cancelled the check |

The result also includes `probeUrl`, `latency`, `duration`, `attemptedProbes`, and `failedProbes`, providing enough context for field telemetry without exposing response bodies or user data.

## Default probes

`getDefaultProbes()` returns the active defaults as `{ url, region }` records.
Pass `{ autoRegion: false }` to inspect every regional default; the demo uses
this same export, so its probe list stays aligned with the package.

Always fires (small, global):

| Probe |
| --- |
| `www.apple.com/favicon.ico` |
| `www.apple.com/library/test/success.html` — the same endpoint iOS/macOS uses for its own captive-portal / internet check |
| `yandex.com/favicon.ico` — not gated to Russian timezones since Yandex (Maps, Browser, Taxi) has real usage in Turkiye and elsewhere too |
| `api.cloudflare.com/cdn-cgi/trace` — Cloudflare's own recommended connectivity-diagnostic endpoint |
| `1.1.1.1/cdn-cgi/trace` — Cloudflare's anycast resolver connectivity diagnostic endpoint |
| `www.akamai.com/favicon.ico` — major CDN operator with edge presence worldwide |
| `whatismyip.akamai.com/advanced?debug` |
| `checkip.global.api.aws/` |
| `checkip.amazonaws.com/` |
| `detectportal.firefox.com/canonical.html` — HTTPS |
| `www.msftconnecttest.com/connecttest.txt` — HTTP |
| `edge.microsoft.com/captiveportal/generate_204` |
| `am.i.mullvad.net/json` |
| `tls.peet.ws/api/all`, `tls.peet.ws/api/clean` |
| `test.nextdns.io/` |
| `www.howsmyssl.com/a/check` |
| `httpbin.org/ip`, `httpbin.org/headers`, `httpbin.org/anything` |
| `api.ipify.org`, `api.ipify.org?format=json`, `api64.ipify.org?format=json` |
| `ifconfig.co/ip`, `ifconfig.co/json`, `ifconfig.io` |
| `api.myip.com/` |
| `tools.keycdn.com/geo.json?host=1.1.1.1` |
| `captive.apple.com/hotspot-detect.html` — HTTP |
| `ipapi.co/json`, `get.geojs.io/v1/ip/geo.json`, `reallyfreegeoip.org/json/` |
| `api.seeip.org/geoip`, `free.freeipapi.com/api/json`, `api.ip.sb/geoip` |

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
only ever fires the 35 global probes across Apple, Yandex, Cloudflare, Akamai,
AWS, Firefox, Microsoft, and independent IP/privacy diagnostic endpoints.

This is a latency/traffic optimization, not a correctness requirement — a
mismatched timezone (VPN, misconfigured system clock) just means the
region-specific probes are skipped, falling back to the global set. Set
`autoRegion: false` to always fire every probe regardless of timezone.

## Speed, not just latency

This library's core check is **latency**, not bandwidth — a tiny probe
request tells you how responsive the connection is, not how many Mbps it
can sustain. Those are genuinely different things (a satellite link can
have high bandwidth but terrible latency).

When available, `info.downlinkMbps` and `info.effectiveType` give you a real
bandwidth estimate for free via the browser's [Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API) —
no extra request. This only exists in Chromium-based browsers (Chrome,
Edge, Opera, Android WebView); Safari and Firefox don't implement it, so
both fields will be `null` there. We deliberately don't ship a fallback
that downloads a large payload to estimate bandwidth on those browsers —
none of the probe domains send the `Timing-Allow-Origin` header needed to
read transfer size for free, so a real fallback would mean burning extra
bytes (ironic, on a connection you're trying to determine is slow) for an
estimate. If you need guaranteed cross-browser Mbps numbers, use a
dedicated speed-test service.

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
