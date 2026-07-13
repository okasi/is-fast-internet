const LATENCY_THRESHOLD = 589;
const SCAN_TIMEOUT = LATENCY_THRESHOLD * 3;
const modulePath = location.hostname.endsWith("github.io")
  ? "./is-fast-internet.js"
  : "../dist/index.js";
const { checkInternet, getDefaultProbes } = await import(modulePath);

const DEMO_REGIONS = new Set(["China", "Iran", "Turkmenistan"]);

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
const scanProgress = document.querySelector("#scan-progress");
const scanProgressBar = document.querySelector("#scan-progress-bar");
const terminalOutput = document.querySelector("#terminal-output");
const copyResultButton = document.querySelector("#copy-result");
const copyCodeButton = document.querySelector("#copy-code");
const toast = document.querySelector("#toast");

const outcomeCopy = {
  fast: ["Network ready", "Responsive enough for the full experience"],
  latency: ["High latency", "Reachable, but responsiveness is limited"],
  downlink: ["Limited bandwidth", "Latency passed; estimated downlink did not"],
  download: ["Limited bandwidth", "The capped download sample missed its speed gate"],
  timeout: ["Scan timed out", "No endpoint responded before the deadline"],
  unreachable: ["Network unreachable", "Every active endpoint rejected the probe"],
  aborted: ["Scan cancelled", "The check ended before a result was available"]
};

let activeController = null;
let latestResult = null;
let toastTimer = null;
let probeRecords = [];

function activeProbes() {
  const activeUrls = new Set(getDefaultProbes().map(({ url }) => url));

  return getDefaultProbes({ autoRegion: false })
    .filter(({ url, region }) => activeUrls.has(url) || DEMO_REGIONS.has(region))
    .map(({ url, region }) => ({
      url,
      demoLabel: DEMO_REGIONS.has(region) ? `${region} · normally geo-based` : null
    }));
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
    scanProgressBar.style.setProperty("--scan-progress", "0%");
    scanProgress.setAttribute("aria-valuenow", "0");
    scanProgress.setAttribute("aria-valuetext", "No scan started");
    return;
  }

  const totals = records.reduce((counts, probe) => {
    counts[probe.state] = (counts[probe.state] ?? 0) + 1;
    return counts;
  }, {});
  const finished = records.length - (totals.pending ?? 0);
  const unavailable = (totals.failed ?? 0) + (totals["timed-out"] ?? 0) + (totals.cancelled ?? 0);
  const progress = Math.round((finished / records.length) * 100);
  probeSummary.textContent = finished === records.length
    ? `${finished}/${records.length} complete · ${totals.responded ?? 0} reached · ${unavailable} unavailable`
    : `${finished}/${records.length} complete · ${totals.pending ?? 0} in flight`;
  scanProgressBar.style.setProperty("--scan-progress", `${progress}%`);
  scanProgress.setAttribute("aria-valuenow", String(progress));
  scanProgress.setAttribute("aria-valuetext", `${finished} of ${records.length} endpoints complete`);

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
    address.textContent = probe.url.hostname;
    address.title = probe.url.href;
    address.setAttribute("aria-label", `Open probe endpoint ${probe.url.href}`);
    endpoint.className = "probe-endpoint";
    endpoint.append(address);
    if (probe.demoLabel) {
      const label = document.createElement("span");
      label.className = "probe-geo-label";
      label.textContent = probe.demoLabel;
      endpoint.append(label);
    }
    if (probe.insights.length > 0) {
      const insight = document.createElement("span");
      insight.className = "probe-insight";
      insight.textContent = probe.insights.slice(0, 2).join(" · ");
      insight.title = probe.error ?? "Derived from readable response headers and body";
      endpoint.append(insight);
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

function displayProbeState(state) {
  return state === "timeout"
    ? "timed-out"
    : state === "aborted"
      ? "cancelled"
      : state;
}

function applyProbeResult(record, probe) {
  record.state = displayProbeState(probe.state);
  record.latency = probe.latency;
  record.insights = probe.insights?.summary ?? [];
  record.error = probe.error ?? probe.response?.bodyError ?? null;
}

async function checkAllProbes(signal) {
  const records = activeProbes().map(({ url, demoLabel }, order) => ({
    url: new URL(url),
    demoLabel,
    order,
    state: "pending",
    latency: null,
    insights: [],
    error: null
  }));
  probeRecords = records;
  renderProbeLedger(records);

  const result = await checkInternet({
    images: records.map((record) => record.url.href),
    threshold: LATENCY_THRESHOLD,
    timeout: SCAN_TIMEOUT,
    signal,
    downloadBytes: 0,
    onProbeResult: (probe) => {
      const record = records.find(({ url }) => url.href === probe.url);
      if (!record) return;
      applyProbeResult(record, probe);
      renderProbeLedger(records);
    }
  });

  result.probeResults.forEach((probe, index) => applyProbeResult(records[index], probe));
  renderProbeLedger(records);
  return result;
}

function setScanning(scanning) {
  consoleShell.classList.toggle("scanning", scanning);
  consoleShell.classList.remove("complete");
  probeList.setAttribute("aria-busy", String(scanning));
  runButton.disabled = scanning;
  runButton.querySelector("span").textContent = scanning ? "Scanning network…" : "Run again";
}

function revealMobileConsole() {
  if (!window.matchMedia("(max-width: 640px)").matches) return;

  requestAnimationFrame(() => {
    consoleShell.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
  });
}

function formatMilliseconds(value) {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

function renderResult(result) {
  latestResult = result;
  const [title, detail] = outcomeCopy[result.reason] ?? ["Check complete", "Network diagnostics are ready"];
  const insightCount = result.probeResults.filter((probe) => probe.insights?.summary.length > 0).length;
  const highlights = result.probeResults
    .filter((probe) => probe.insights?.summary.length > 0)
    .slice(0, 3)
    .map((probe) => ({ endpoint: new URL(probe.url).hostname, signals: probe.insights.summary }));

  statusTitle.textContent = title;
  statusDetail.textContent = insightCount
    ? `${detail} · ${insightCount} endpoint insight${insightCount === 1 ? "" : "s"}`
    : detail;
  latencyValue.textContent = formatMilliseconds(result.latency);
  latencyCaption.textContent = result.latency === null ? "no response" : "round trip";
  downlinkValue.textContent = result.downlinkMbps === null ? "N/A" : `${result.downlinkMbps} Mbps`;
  probesValue.textContent = `${result.attemptedProbes}`;
  const unavailable = result.probeResults.filter((probe) => probe.state !== "responded").length;
  probesCaption.textContent = unavailable
    ? `${unavailable} unavailable`
    : "all reachable";
  terminalOutput.textContent = JSON.stringify({
    isFast: result.isFast,
    reason: result.reason,
    latency: result.latency === null ? null : Math.round(result.latency),
    duration: Math.round(result.duration),
    insights: highlights
  });
  copyResultButton.disabled = false;
  consoleShell.classList.add("complete");
}

async function runLiveCheck() {
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  setScanning(true);
  revealMobileConsole();
  statusTitle.textContent = "Scanning endpoints";
  statusDetail.textContent = "Reading reachable endpoint signals, then ranking the fastest";
  latencyValue.textContent = "…";
  downlinkValue.textContent = "…";
  probesValue.textContent = "…";
  terminalOutput.textContent = "await checkInternet({ onProbeResult })";
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
