# ⚡ is-fast-internet

**Censorship-proof ⚡ lightning-fast internet detection that just works.** 🌍🛡️

Zero dependencies. Microscopic bundle. Delivers an accurate answer **even behind the Great Firewall, across Russia, Iran, and Turkmenistan**.

It races tiny probes against the world's smartest geo-diverse domains. Whichever responds first wins — blocked domains simply lose the race instead of hanging your app. Google is **intentionally excluded** (it's blocked or unreliable exactly where this library shines).

### ✨ Why it's awesome

- ⚡ **Blazing detection** — sub-threshold latency wins in milliseconds
- 🧠 **Region-smart** — only fires Baidu/Alibaba in China timezones, VK in Russia, etc. (saves requests + stays stealthy)
- 🗺️ **9 global + 8 regional probes** — Bing, Apple, Yandex, Cloudflare, Akamai + local heroes
- 📡 **Free bandwidth bonus** — reads real `downlinkMbps` + `effectiveType` from the browser when available
- 🪶 **Zero dependencies**, pure `fetch`, works in any modern browser
- ✅ Callback fires **exactly once** — always, even on complete blockage or timeout

The global set is small by design. Region-specific probes are added automatically based on the visitor's browser timezone, so people in New York never hit Baidu and visitors in Shanghai get the China-optimized probes.

## Install

```sh
npm install is-fast-internet
```

## Usage

```js
import isFastInternet from "is-fast-internet";

isFastInternet(function (isFast, info) {
  if (isFast) {
    // load the heavy hero video
  } else {
    // serve the lightweight experience
  }
  console.log(info); // { latency: 82, downlinkMbps: 10, effectiveType: "4g" }
});
```

CommonJS also works:

```js
const isFastInternet = require("is-fast-internet");
```

## Options

```js
isFastInternet(callback, {
  threshold: 589,        // ms of latency considered "fast" (default 589)
  allowEarlyExit: true,  // call back with false after threshold * 3 ms (default true)
  autoRegion: true,      // only fire region probes matching browser timezone (default true)
  minDownlinkMbps: 5,    // also require this downlink when known (default: unset)
  images: [               // custom probe URLs — fully replaces the default set
    "https://cdn.example.com/px.gif"
  ]
});
```

The callback always fires exactly once: `callback(isFast, info)`.

- `isFast` — `true`/`false`, based on `latency <= threshold` (and `minDownlinkMbps`
  if you set it and it's known).
- `info.latency` — ms round-trip of the winning probe, or `null` if none loaded.
- `info.downlinkMbps` / `info.effectiveType` — see [Speed, not just latency](#speed-not-just-latency).

## Default probes

Always fires (small, global):

| Probe |
| --- |
| `www.bing.com/favicon.ico` |
| `www.apple.com/favicon.ico` |
| `www.apple.com/library/test/success.html` — the same endpoint iOS/macOS uses for its own captive-portal / internet check |
| `app-site-association.cdn-apple.com/a/v1/apple.com` |
| `yandex.com/favicon.ico` — not gated to Russian timezones since Yandex (Maps, Browser, Taxi) has real usage in Turkiye and elsewhere too |
| `yandex.com/internet/` — Yandex's own network diagnostic page |
| `www.cloudflare.com/favicon.ico` — major CDN operator with edge presence worldwide |
| `api.cloudflare.com/cdn-cgi/trace` — Cloudflare's own recommended connectivity-diagnostic endpoint |
| `www.akamai.com/favicon.ico` — major CDN operator with edge presence worldwide |

Fires only when the browser's timezone matches (see [Region detection](#region-detection)):

| Region | Probe |
| --- | --- |
| China | `www.baidu.com/favicon.ico`, `www.alibaba.com/favicon.ico`, `www.alibabacloud.com/favicon.ico` |
| Russia / CIS | `vk.com/favicon.ico`, `dzen.ru/favicon.ico` |
| Iran | `www.aparat.com/favicon.ico`, `www.digikala.com/favicon.ico` |
| Turkmenistan | `turkmenportal.com/favicon.ico` |

All active probes fire in parallel with a cache-busting query string, via
`fetch(url, { mode: "no-cors", cache: "no-store" })`. This works regardless
of content type — favicons, HTML pages, JSON — since it only needs to know
the request completed and how long it took, not read the (opaque) response
body, and it doesn't require CORS headers from the target domain. Whichever
completes first is by definition the lowest-latency reachable endpoint, so
its latency is compared against `threshold`. Failed probes (DNS blocks,
connection resets — what firewalls actually do) are counted, and if every
active probe fails the callback receives `false`.

> Note: national firewalls change frequently. If you deploy to a specific
> region, pass your own `images` list pointing at a domain you control or a
> CDN with local presence for the most reliable signal.

## Region detection

By default (`autoRegion: true`), the region-specific probes above only fire
when `Intl.DateTimeFormat().resolvedOptions().timeZone` matches that region
(e.g. `Asia/Shanghai` → Baidu/Alibaba, `Europe/Moscow` → VK, `Asia/Tehran` →
Aparat/Digikala, `Asia/Ashgabat` → Turkmenportal). A visitor anywhere else
only ever fires the 9 global probes (Bing, Apple ×2, Apple CDN, Yandex ×2,
Cloudflare ×2, Akamai).

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
```

`dist/` is generated, not committed — `npm run build` runs automatically
before `npm publish` via the `prepublishOnly` script.

## License

MIT
