const LATENCY_THRESHOLD = 589;
const SCAN_TIMEOUT = LATENCY_THRESHOLD * 3;

const GLOBAL_PROBES = [
  "https://www.bing.com/robots.txt",
  "https://www.apple.com/favicon.ico",
  "https://www.apple.com/library/test/success.html",
  "https://yandex.com/favicon.ico",
  "https://api.cloudflare.com/cdn-cgi/trace",
  "https://1.1.1.1/cdn-cgi/trace",
  "https://www.akamai.com/favicon.ico"
];

const REGION_PROBES = [
  {
    demoLabel: "China · normally geo-based",
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
    demoLabel: "Iran · normally geo-based",
    probes: ["https://www.aparat.com/favicon.ico"],
    timezones: ["Asia/Tehran"]
  },
  {
    demoLabel: "Turkmenistan · normally geo-based",
    probes: ["https://turkmenportal.com/favicon.ico"],
    timezones: ["Asia/Ashgabat"]
  }
];

const runButton = document.querySelector("#run-check");
const consoleShell = document.querySelector("#console-shell");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const latencyValue = document.querySelector("#latency-value");
const latencyCaption = document.querySelector("#latency-caption");
const downlinkValue = document.querySelector("#downlink-value");
const probesValue = document.querySelector("#probes-value");
const probesCaption = document.querySelector("#probes-caption");
const probeSummary = document.querySelector("#probe-summary");
const probeList = document.querySelector("#probe-list");
const terminalOutput = document.querySelector("#terminal-output");
const copyResultButton = document.querySelector("#copy-result");
const copyCodeButton = document.querySelector("#copy-code");
const toast = document.querySelector("#toast");

const outcomeCopy = {
  fast: ["Network ready", "Responsive enough for the full experience"],
  latency: ["High latency", "Reachable, but responsiveness is limited"],
  downlink: ["Limited bandwidth", "Latency passed; estimated downlink did not"],
  timeout: ["Scan timed out", "No endpoint responded before the deadline"],
  unreachable: ["Network unreachable", "Every active endpoint rejected the probe"],
  aborted: ["Scan cancelled", "The check ended before a result was available"]
};

let activeController = null;
let latestResult = null;
let toastTimer = null;
let probeRecords = [];

function activeProbes() {
  let timeZone = "";

  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    // Use the global probes when the browser cannot expose a time zone.
  }

  return [
    ...GLOBAL_PROBES.map((url) => ({ url, demoLabel: null })),
    ...REGION_PROBES.flatMap(({ probes, timezones, demoLabel }) => (
      demoLabel || timezones.includes(timeZone)
        ? probes.map((url) => ({ url, demoLabel: demoLabel ?? null }))
        : []
    ))
  ];
}

function cacheBustedUrl(url, index) {
  const probeUrl = new URL(url);
  probeUrl.searchParams.set("isFastInternet", `${Date.now()}-${index}`);
  return probeUrl;
}

function getConnectionInfo() {
  const connection = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;

  return typeof connection?.downlink === "number"
    ? {
        downlinkMbps: connection.downlink,
        effectiveType: connection.effectiveType ?? null
      }
    : { downlinkMbps: null, effectiveType: null };
}

function compareProbes(left, right) {
  if (left.state === "responded" && right.state === "responded") {
    return left.latency - right.latency || left.order - right.order;
  }
  if (left.state === "responded") return -1;
  if (right.state === "responded") return 1;
  if (left.state === "pending" && right.state !== "pending") return -1;
  if (right.state === "pending" && left.state !== "pending") return 1;
  return left.order - right.order;
}

function renderProbeLedger(records = probeRecords) {
  if (records !== probeRecords) return;

  if (records.length === 0) {
    probeList.innerHTML = '<li class="probe-empty">Every contacted endpoint will appear here.</li>';
    probeSummary.textContent = "Waiting to scan";
    return;
  }

  const totals = records.reduce((counts, probe) => {
    counts[probe.state] = (counts[probe.state] ?? 0) + 1;
    return counts;
  }, {});
  const finished = records.length - (totals.pending ?? 0);
  const unavailable = (totals.failed ?? 0) + (totals["timed-out"] ?? 0) + (totals.cancelled ?? 0);
  probeSummary.textContent = finished === records.length
    ? `${records.length} checked · ${totals.responded ?? 0} reached · ${unavailable} unavailable`
    : `${records.length} checking · ${totals.pending ?? 0} in flight`;

  const fragment = document.createDocumentFragment();
  [...records].sort(compareProbes).forEach((probe, index) => {
    const row = document.createElement("li");
    const number = document.createElement("span");
    const endpoint = document.createElement("span");
    const address = document.createElement("a");
    const state = document.createElement("span");

    row.dataset.state = probe.state;
    number.className = "probe-index";
    number.textContent = String(index + 1).padStart(2, "0");
    address.className = "probe-address";
    address.href = probe.url.href;
    address.target = "_blank";
    address.rel = "noreferrer";
    address.textContent = probe.url.href;
    endpoint.className = "probe-endpoint";
    endpoint.append(address);
    if (probe.demoLabel) {
      const label = document.createElement("span");
      label.className = "probe-geo-label";
      label.textContent = probe.demoLabel;
      endpoint.append(label);
    }
    state.className = "probe-state";
    state.textContent = probe.state === "responded"
      ? `${Math.round(probe.latency)}ms`
      : probe.state === "pending"
        ? "probing"
        : probe.state === "timed-out"
          ? "timed out"
        : probe.state;

    row.append(number, endpoint, state);
    fragment.append(row);
  });

  probeList.replaceChildren(fragment);
}

async function fetchProbe(probe, controller, records, timedOut) {
  probe.startedAt = performance.now();

  try {
    await globalThis.fetch(cacheBustedUrl(probe.url.href, probe.order), {
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal
    });
    probe.state = "responded";
    probe.latency = performance.now() - probe.startedAt;
  } catch {
    probe.state = controller.signal.aborted
      ? timedOut()
        ? "timed-out"
        : "cancelled"
      : "failed";
  } finally {
    renderProbeLedger(records);
  }
}

async function checkAllProbes(signal) {
  const controller = new AbortController();
  const startedAt = performance.now();
  let timedOut = false;
  const stop = (reason) => controller.abort(reason);
  const onAbort = () => stop("aborted");

  if (signal.aborted) stop("aborted");
  else signal.addEventListener("abort", onAbort, { once: true });

  const timeout = setTimeout(() => {
    timedOut = true;
    stop("timeout");
  }, SCAN_TIMEOUT);

  const records = activeProbes().map(({ url, demoLabel }, order) => ({
    url: new URL(url),
    demoLabel,
    order,
    state: "pending",
    latency: null,
    startedAt: null
  }));
  probeRecords = records;
  renderProbeLedger(records);

  await Promise.allSettled(records.map((probe) => fetchProbe(probe, controller, records, () => timedOut)));
  clearTimeout(timeout);
  signal.removeEventListener("abort", onAbort);

  const responders = records
    .filter((probe) => probe.state === "responded")
    .sort(compareProbes);
  const fastest = responders[0] ?? null;
  const { downlinkMbps, effectiveType } = getConnectionInfo();
  const aborted = signal.aborted && !timedOut;
  const failedProbes = records.filter((probe) => (
    probe.state === "failed" || probe.state === "timed-out"
  )).length;

  return {
    isFast: !aborted && fastest !== null && fastest.latency <= LATENCY_THRESHOLD,
    reason: aborted
      ? "aborted"
      : fastest === null
        ? timedOut ? "timeout" : "unreachable"
        : fastest.latency <= LATENCY_THRESHOLD ? "fast" : "latency",
    latency: fastest?.latency ?? null,
    probeUrl: fastest?.url.href ?? null,
    downlinkMbps,
    effectiveType,
    attemptedProbes: records.length,
    failedProbes,
    duration: Math.max(0, performance.now() - startedAt)
  };
}

function setScanning(scanning) {
  consoleShell.classList.toggle("scanning", scanning);
  consoleShell.classList.remove("complete");
  runButton.disabled = scanning;
  runButton.querySelector("span").textContent = scanning ? "Scanning network…" : "Run again";
}

function formatMilliseconds(value) {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

function renderResult(result) {
  latestResult = result;
  const [title, detail] = outcomeCopy[result.reason] ?? ["Check complete", "Network diagnostics are ready"];

  statusTitle.textContent = title;
  statusDetail.textContent = detail;
  latencyValue.textContent = formatMilliseconds(result.latency);
  latencyCaption.textContent = result.latency === null ? "no response" : "round trip";
  downlinkValue.textContent = result.downlinkMbps === null ? "N/A" : `${result.downlinkMbps} Mbps`;
  probesValue.textContent = `${result.attemptedProbes}`;
  probesCaption.textContent = result.failedProbes
    ? `${result.failedProbes} failed`
    : "all reachable";
  terminalOutput.textContent = JSON.stringify({
    isFast: result.isFast,
    reason: result.reason,
    latency: result.latency === null ? null : Math.round(result.latency),
    duration: Math.round(result.duration)
  });
  copyResultButton.disabled = false;
  consoleShell.classList.add("complete");
}

async function runLiveCheck() {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  setScanning(true);
  statusTitle.textContent = "Scanning endpoints";
  statusDetail.textContent = "Waiting for every active endpoint, then ranking the fastest";
  latencyValue.textContent = "…";
  downlinkValue.textContent = "…";
  probesValue.textContent = "…";
  terminalOutput.textContent = "await Promise.allSettled(probes)";
  copyResultButton.disabled = true;

  try {
    const result = await checkAllProbes(controller.signal);
    if (activeController === controller) renderResult(result);
  } catch (error) {
    if (activeController === controller) {
      statusTitle.textContent = "Unable to start";
      statusDetail.textContent = error instanceof Error ? error.message : "The live check could not run";
      terminalOutput.textContent = "The endpoint scan failed to start";
    }
  } finally {
    if (activeController === controller) {
      setScanning(false);
      activeController = null;
    }
  }
}

async function copyText(text, label = "Copied to clipboard") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  toast.textContent = label;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 1800);
}

runButton.addEventListener("click", runLiveCheck);
copyResultButton.addEventListener("click", () => {
  if (latestResult) copyText(JSON.stringify(latestResult, null, 2), "Result copied");
});
copyCodeButton.addEventListener("click", () => copyText(
  'import { checkInternet } from "is-fast-internet";\n\nconst result = await checkInternet();\n\ndocument.body.dataset.quality = result.isFast ? "rich" : "lite";',
  "Code copied"
));
