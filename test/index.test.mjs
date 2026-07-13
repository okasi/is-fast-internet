import test from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const esmEntry = join(here, "..", "dist", "index.js");
const cjsEntry = join(here, "..", "dist", "index.cjs");

const { default: isFastInternet, checkInternet, getDefaultProbes } = await import(esmEntry);

// --- Test doubles -----------------------------------------------------------

// Stub global fetch: behavior is configured per-test via a URL-substring map.
// { <substring>: { delay, error? } }. An unmatched URL never settles, standing
// in for a hard-blocked domain whose connection just hangs.
let behavior = {};
globalThis.fetch = function (url) {
  if (url.includes("speed.cloudflare.com/__down?bytes=65536")) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ arrayBuffer: () => new ArrayBuffer(64 * 1024) }), 20);
    });
  }
  for (const [key, spec] of Object.entries(behavior)) {
    if (url.includes(key)) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (spec.error) reject(new TypeError("Failed to fetch"));
          else resolve({ type: "opaque" }); // stand-in for a no-cors Response
        }, spec.delay);
      });
    }
  }
  return new Promise(() => {}); // hangs forever
};

function stubTimeZone(tz) {
  const RealDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function (...args) {
    const instance = new RealDateTimeFormat(...args);
    return { resolvedOptions: () => ({ ...instance.resolvedOptions(), timeZone: tz }) };
  };
  return () => { Intl.DateTimeFormat = RealDateTimeFormat; };
}

function stubNavigator(value) {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
}

function run(opts) {
  return new Promise((resolve) => isFastInternet((fast) => resolve(fast), opts));
}

function runFull(opts) {
  return new Promise((resolve) => isFastInternet((fast, info) => resolve({ fast, info }), opts));
}

// --- Tests ------------------------------------------------------------------

test("fast probe wins even while other domains are blocked (hang)", async () => {
  behavior = { baidu: { delay: 50 } };
  assert.strictEqual(await run({ autoRegion: false }), true);
});

test("a probe slower than the threshold resolves to false", async () => {
  behavior = { aparat: { delay: 400 } };
  assert.strictEqual(await run({ threshold: 100, autoRegion: false }), false);
});

test("every probe erroring settles false, early, before the timeout", async () => {
  behavior = Object.fromEntries(
    getDefaultProbes({ autoRegion: false })
      .map(({ url }) => [url, { error: true, delay: 20 }])
  );
  const t0 = Date.now();
  assert.strictEqual(await run({ threshold: 500, autoRegion: false }), false);
  assert.ok(Date.now() - t0 < 300, "should settle on the last error, not wait 3x threshold");
});

test("all probes hanging triggers the early-exit timeout at ~3x threshold", async () => {
  behavior = {};
  const t0 = Date.now();
  assert.strictEqual(await run({ threshold: 100 }), false);
  assert.ok(Date.now() - t0 >= 290);
});

test("callback fires exactly once even when many probes resolve", async () => {
  behavior = { "yandex.com/favicon": { delay: 10 }, baidu: { delay: 15 } };
  let calls = 0;
  isFastInternet(() => calls++, { autoRegion: false });
  await new Promise((r) => setTimeout(r, 200));
  assert.strictEqual(calls, 1);
});

test("empty images array settles false instead of hanging (guard)", async () => {
  behavior = {};
  const t0 = Date.now();
  // allowEarlyExit:false means only the guard can settle this.
  assert.strictEqual(await run({ images: [], allowEarlyExit: false }), false);
  assert.ok(Date.now() - t0 < 100, "should settle synchronously, not hang");
});

test("legacy single `image` option is still supported", async () => {
  behavior = { "example.com": { delay: 30 } };
  assert.strictEqual(await run({ image: "https://example.com/px.gif" }), true);
});

test("CJS build behaves identically", async () => {
  const cjs = createRequire(import.meta.url)(cjsEntry);
  assert.strictEqual(typeof cjs, "function", "require() returns the function directly");
  assert.strictEqual(typeof cjs.checkInternet, "function", "named APIs remain available");
  assert.strictEqual(typeof cjs.getDefaultProbes, "function", "probe metadata is available to CommonJS");
  behavior = { baidu: { delay: 50 } };
  assert.strictEqual(await new Promise((r) => cjs(r, { autoRegion: false })), true);
});

test("getDefaultProbes exposes active and region-gated defaults", () => {
  const restore = stubTimeZone("America/New_York");
  const active = getDefaultProbes();
  const all = getDefaultProbes({ autoRegion: false });

  assert.strictEqual(active.length, 18);
  assert.ok(active.every((probe) => probe.region === null));
  assert.strictEqual(all.length, 24);
  assert.deepStrictEqual(
    [...new Set(all.map((probe) => probe.region).filter(Boolean))].sort(),
    ["China", "Iran", "Russia / CIS", "Turkmenistan"]
  );
  assert.deepStrictEqual(
    all.filter((probe) => probe.region === "China").map((probe) => probe.url),
    [
      "https://www.baidu.com/favicon.ico",
      "https://www.alibaba.com/favicon.ico"
    ]
  );
  restore();
});

test("autoRegion skips region probes for a non-matching timezone", async () => {
  const restore = stubTimeZone("America/New_York");
  behavior = { baidu: { delay: 20 } }; // would win if fired, but must not be probed
  assert.strictEqual(await run({ threshold: 100 }), false);
  restore();
});

test("autoRegion adds the region probe for a matching timezone", async () => {
  const restore = stubTimeZone("Asia/Shanghai");
  behavior = { baidu: { delay: 20 } };
  assert.strictEqual(await run({ threshold: 100 }), true);
  restore();
});

test("info.latency reflects the winning probe's round-trip time", async () => {
  behavior = { "yandex.com/favicon": { delay: 40 } };
  const { fast, info } = await runFull({ threshold: 100 });
  assert.strictEqual(fast, true);
  assert.ok(Math.abs(info.latency - 40) <= 15);
});

test("info reads downlinkMbps/effectiveType from navigator.connection", async () => {
  stubNavigator({ connection: { downlink: 12.5, effectiveType: "4g" } });
  behavior = { "yandex.com/favicon": { delay: 10 } };
  const { info } = await runFull({ threshold: 100 });
  assert.strictEqual(info.downlinkMbps, 12.5);
  assert.strictEqual(info.effectiveType, "4g");
});

test("downlinkMbps is null when the Network Information API is unavailable", async () => {
  stubNavigator({});
  behavior = { "yandex.com/favicon": { delay: 10 } };
  const { info } = await runFull({ threshold: 100 });
  assert.strictEqual(info.downlinkMbps, null);
});

test("minDownlinkMbps gates 'fast' even when latency is within threshold", async () => {
  stubNavigator({ connection: { downlink: 1.5, effectiveType: "3g" } });
  behavior = { "yandex.com/favicon": { delay: 10 } };
  const { fast } = await runFull({ threshold: 100, minDownlinkMbps: 5 });
  assert.strictEqual(fast, false);
});

test("Yandex fires globally (e.g. Turkiye), not gated to Russian timezones", async () => {
  const restore = stubTimeZone("Europe/Istanbul");
  behavior = { "yandex.com/favicon": { delay: 20 } };
  assert.strictEqual(await run({ threshold: 100 }), true);
  restore();
});

test("VK stays Russia-region-gated (does not fire for Turkiye)", async () => {
  const restore = stubTimeZone("Europe/Istanbul");
  behavior = { vk: { delay: 20 } };
  assert.strictEqual(await run({ threshold: 100 }), false);
  restore();
});

test("all global default probes fire regardless of timezone", async () => {
  const restore = stubTimeZone("America/Chicago");
  for (const { url } of getDefaultProbes({ autoRegion: false }).filter(({ region }) => region === null)) {
    behavior = { [url]: { delay: 20 } };
    assert.strictEqual(await run({ threshold: 100 }), true, `${url} should fire globally`);
  }
  restore();
});

test("Dzen fires for a matching Russian timezone", async () => {
  const restore = stubTimeZone("Europe/Moscow");
  behavior = { dzen: { delay: 20 } };
  assert.strictEqual(await run({ threshold: 100 }), true);
  restore();
});

test("Dzen does not fire for a non-Russia timezone", async () => {
  const restore = stubTimeZone("Europe/Istanbul");
  behavior = { dzen: { delay: 20 } };
  assert.strictEqual(await run({ threshold: 100 }), false);
  restore();
});

test("non-image endpoints (text/JSON) work as probes via fetch(no-cors)", async () => {
  for (const key of ["api.cloudflare.com/cdn-cgi/trace", "1.1.1.1/cdn-cgi/trace", "tls.peet.ws/api/clean", "httpbin.org/headers"]) {
    behavior = { [key]: { delay: 15 } };
    assert.strictEqual(await run({ threshold: 100 }), true, `${key} should be able to win the race`);
  }
});

test("checkInternet returns rich Promise-based diagnostics", async () => {
  stubNavigator({ connection: { downlink: 18, effectiveType: "4g" } });
  const result = await checkInternet({
    images: ["https://fast.example/probe", "https://blocked.example/probe"],
    threshold: 100,
    downloadBytes: 0,
    fetch: (url) => url.toString().includes("fast.example")
      ? new Promise((resolve) => setTimeout(() => resolve({}), 15))
      : new Promise(() => {})
  });

  assert.strictEqual(result.isFast, true);
  assert.strictEqual(result.reason, "fast");
  assert.strictEqual(result.probeUrl, "https://fast.example/probe");
  assert.strictEqual(result.attemptedProbes, 2);
  assert.strictEqual(result.failedProbes, 0);
  assert.strictEqual(result.downlinkMbps, 18);
  assert.ok(result.duration >= 10);
});

test("an explicit timeout reports why the check failed", async () => {
  const result = await checkInternet({
    images: ["https://blocked.example/probe"],
    threshold: 1_000,
    timeout: 20,
    downloadBytes: 0,
    fetch: () => new Promise(() => {})
  });

  assert.strictEqual(result.isFast, false);
  assert.strictEqual(result.reason, "timeout");
  assert.strictEqual(result.latency, null);
  assert.ok(result.duration >= 15);
});

test("settling aborts losing probe requests", async () => {
  let losingProbeAborted = false;
  const result = await checkInternet({
    images: ["https://winner.example/probe", "https://loser.example/probe"],
    threshold: 100,
    downloadBytes: 0,
    fetch: (url, init) => {
      if (url.toString().includes("winner.example")) {
        return new Promise((resolve) => setTimeout(() => resolve({}), 10));
      }
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => {
          losingProbeAborted = true;
          reject(new Error("aborted"));
        }, { once: true });
      });
    }
  });

  assert.strictEqual(result.isFast, true);
  assert.strictEqual(losingProbeAborted, true);
});

test("an AbortSignal resolves with an aborted diagnostic", async () => {
  const controller = new AbortController();
  const pending = checkInternet({
    images: ["https://blocked.example/probe"],
    downloadBytes: 0,
    signal: controller.signal,
    fetch: () => new Promise(() => {})
  });
  controller.abort();

  const result = await pending;
  assert.strictEqual(result.isFast, false);
  assert.strictEqual(result.reason, "aborted");
  assert.strictEqual(result.attemptedProbes, 1);
});

test("an already-aborted signal starts no requests", async () => {
  const controller = new AbortController();
  controller.abort();
  let fetchCalls = 0;

  const result = await checkInternet({
    images: ["https://example.com/probe"],
    signal: controller.signal,
    fetch: () => {
      fetchCalls++;
      return Promise.resolve({});
    }
  });

  assert.strictEqual(result.reason, "aborted");
  assert.strictEqual(result.attemptedProbes, 0);
  assert.strictEqual(fetchCalls, 0);
});

test("cache busting preserves URL fragments", async () => {
  let requestedUrl;
  await checkInternet({
    image: "https://example.com/probe?client=test#section",
    downloadBytes: 0,
    fetch: (url) => {
      requestedUrl = url.toString();
      return Promise.resolve({});
    }
  });

  assert.match(requestedUrl, /\?client=test&isFastInternet=/);
  assert.ok(requestedUrl.endsWith("#section"));
});

test("invalid numeric options reject with a useful error", async () => {
  await assert.rejects(
    checkInternet({ threshold: -1, images: ["https://example.com"] }),
    { name: "RangeError", message: /threshold/ }
  );
});

test("the default capped download reports a completed transfer sample", async () => {
  const bytes = 64 * 1024;
  const requestedUrls = [];
  const result = await checkInternet({
    images: ["https://fast.example/probe"],
    threshold: 100,
    fetch: (url) => {
      requestedUrls.push(url.toString());
      if (url.toString().includes("fast.example")) {
        return new Promise((resolve) => setTimeout(() => resolve({}), 10));
      }
      return new Promise((resolve) => setTimeout(() => resolve({
        arrayBuffer: () => new ArrayBuffer(bytes)
      }), 20));
    }
  });

  assert.ok(requestedUrls.includes("https://speed.cloudflare.com/__down?bytes=65536"));
  assert.strictEqual(result.downloadedBytes, bytes);
  assert.ok(result.downloadMbps > 0);
  assert.strictEqual(result.reason, "fast");
});

test("minDownloadMbps can gate a completed capped download", async () => {
  const result = await checkInternet({
    images: ["https://fast.example/probe"],
    threshold: 100,
    minDownloadMbps: 100_000,
    fetch: (url) => url.toString().includes("fast.example")
      ? Promise.resolve({})
      : Promise.resolve({ arrayBuffer: () => new ArrayBuffer(64 * 1024) })
  });

  assert.strictEqual(result.isFast, false);
  assert.strictEqual(result.reason, "download");
});

test("checkInternet returns headers, bodies, JSON analysis, and a Markdown table for every probe", async () => {
  const result = await checkInternet({
    images: ["https://json.example/probe", "https://text.example/probe"],
    threshold: 100,
    downloadBytes: 0,
    fetch: (url) => {
      if (url.toString().includes("json.example")) {
        return Promise.resolve(new Response(JSON.stringify({ region: "eu", healthy: true }), {
          status: 201,
          headers: {
            "content-type": "application/json",
            "x-probe": "json"
          }
        }));
      }
      return Promise.resolve(new Response("ready | steady", {
        status: 202,
        headers: {
          "content-type": "text/plain",
          "x-probe": "text"
        }
      }));
    }
  });

  assert.strictEqual(result.probeResults.length, 2);
  assert.deepStrictEqual(result.probeResults.map((probe) => probe.state), ["responded", "responded"]);
  assert.deepStrictEqual(result.probeResults[0].response.json, { region: "eu", healthy: true });
  assert.strictEqual(result.probeResults[0].response.status, 201);
  assert.strictEqual(result.probeResults[0].response.headers["x-probe"], "json");
  assert.strictEqual(result.probeResults[1].response.body, "ready | steady");
  assert.match(result.markdownSummary, /^\| Endpoint \| State \| Latency/m);
  assert.match(result.markdownSummary, /application\/json/);
  assert.match(result.markdownSummary, /ready \\| steady/);
});

test("checkInternet retries opaque probes with CORS to collect exposed response data", async () => {
  const result = await checkInternet({
    image: "https://cors.example/probe",
    threshold: 100,
    downloadBytes: 0,
    fetch: (_url, init) => {
      if (init?.mode === "cors") {
        return Promise.resolve(new Response("diagnostic payload", {
          headers: { "content-type": "text/plain", "x-probe": "cors" }
        }));
      }
      return Promise.resolve({ type: "opaque" });
    }
  });

  assert.strictEqual(result.probeResults[0].state, "responded");
  assert.strictEqual(result.probeResults[0].response.mode, "cors");
  assert.strictEqual(result.probeResults[0].response.readable, true);
  assert.strictEqual(result.probeResults[0].response.body, "diagnostic payload");
  assert.strictEqual(result.probeResults[0].response.headers["x-probe"], "cors");
});

test("checkInternet records probes that do not finish before the diagnostic deadline", async () => {
  const result = await checkInternet({
    images: ["https://fast.example/probe", "https://hanging.example/probe"],
    threshold: 100,
    timeout: 30,
    downloadBytes: 0,
    fetch: (url) => url.toString().includes("fast.example")
      ? Promise.resolve(new Response("ok"))
      : new Promise(() => {})
  });

  assert.strictEqual(result.isFast, true);
  assert.strictEqual(result.reason, "fast");
  assert.deepStrictEqual(result.probeResults.map((probe) => probe.state), ["responded", "timeout"]);
  assert.match(result.markdownSummary, /\| timeout \|/);
});

test("onProbeResult streams each finalized diagnostic without changing the result", async () => {
  const observed = [];
  const result = await checkInternet({
    images: ["https://fast.example/probe", "https://hanging.example/probe"],
    timeout: 30,
    downloadBytes: 0,
    onProbeResult: (probe) => observed.push(probe),
    fetch: (url) => url.toString().includes("fast.example")
      ? Promise.resolve(new Response("ip=203.0.113.42\ntls=TLSv1.3"))
      : new Promise(() => {})
  });

  assert.strictEqual(result.isFast, true);
  assert.deepStrictEqual(observed.map((probe) => probe.state), ["responded", "timeout"]);
  assert.strictEqual(observed[0].insights.publicIp, "203.0.113.42");
});

test("checkInternet extracts useful header and body signals into probe insights", async () => {
  const result = await checkInternet({
    images: ["https://trace.example/probe", "https://headers.example/probe"],
    downloadBytes: 0,
    fetch: (url) => url.toString().includes("trace.example")
      ? Promise.resolve(new Response(
        "ip=203.0.113.42\nloc=SE\ncolo=ARN\ntls=TLSv1.3\nhttp=h2",
        {
          headers: {
            "cf-ray": "abc123-ARN",
            "cf-cache-status": "HIT",
            "cache-control": "max-age=60",
            "server-timing": "cfL4;desc=?proto=TCP",
            "access-control-allow-origin": "*",
            "access-control-expose-headers": "cf-ray, cf-cache-status",
            "x-ratelimit-remaining": "99"
          }
        }
      ))
      : Promise.resolve(new Response(JSON.stringify({
        headers: { "User-Agent": "probe-test", Accept: "*/*" }
      }), { headers: { "content-type": "application/json" } }))
  });

  const trace = result.probeResults[0].insights;
  const echoed = result.probeResults[1].insights;

  assert.strictEqual(trace.publicIp, "203.0.113.42");
  assert.strictEqual(trace.location.country, "SE");
  assert.strictEqual(trace.tlsVersion, "TLSv1.3");
  assert.strictEqual(trace.httpVersion, "h2");
  assert.strictEqual(trace.edge.provider, "Cloudflare");
  assert.strictEqual(trace.edge.colo, "ARN");
  assert.strictEqual(trace.cache.status, "HIT");
  assert.strictEqual(trace.rateLimit.remaining, "99");
  assert.ok(trace.summary.includes("Cloudflare edge ARN"));
  assert.deepStrictEqual(echoed.requestHeaders, { "User-Agent": "probe-test", Accept: "*/*" });
  assert.match(result.markdownSummary, /Cloudflare edge ARN/);
  assert.doesNotMatch(result.markdownSummary, /203\.0\.113\.42/);
  assert.doesNotMatch(result.markdownSummary, /probe-test/);
});
