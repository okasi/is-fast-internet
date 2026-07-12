const modulePath = location.hostname.endsWith("github.io")
  ? "./is-fast-internet.js"
  : "../dist/index.js";

const { checkInternet } = await import(modulePath);

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

function cleanProbeUrl(input) {
  const url = new URL(input.toString());
  url.searchParams.delete("isFastInternet");
  return url;
}

function renderProbeLedger() {
  if (probeRecords.length === 0) {
    probeList.innerHTML = '<li class="probe-empty">Every contacted endpoint will appear here.</li>';
    probeSummary.textContent = "Waiting to scan";
    return;
  }

  const totals = probeRecords.reduce((counts, probe) => {
    counts[probe.state] = (counts[probe.state] ?? 0) + 1;
    return counts;
  }, {});
  const finished = (totals.responded ?? 0) + (totals.failed ?? 0) + (totals.cancelled ?? 0);
  probeSummary.textContent = finished === probeRecords.length
    ? `${probeRecords.length} contacted · ${totals.responded ?? 0} reached · ${totals.failed ?? 0} failed`
    : `${probeRecords.length} contacted · ${totals.pending ?? 0} in flight`;

  const fragment = document.createDocumentFragment();
  probeRecords.forEach((probe, index) => {
    const row = document.createElement("li");
    const number = document.createElement("span");
    const address = document.createElement("span");
    const host = document.createElement("span");
    const path = document.createElement("span");
    const state = document.createElement("span");

    row.dataset.state = probe.state;
    row.title = probe.url.href;
    number.className = "probe-index";
    number.textContent = String(index + 1).padStart(2, "0");
    address.className = "probe-address";
    host.textContent = probe.url.hostname;
    path.className = "probe-path";
    path.textContent = `${probe.url.pathname}${probe.url.search}`;
    state.className = "probe-state";
    state.textContent = probe.state === "responded"
      ? `${Math.round(probe.latency)}ms`
      : probe.state === "pending"
        ? "probing"
        : probe.state;

    address.append(host, " ", path);
    row.append(number, address, state);
    fragment.append(row);
  });

  probeList.replaceChildren(fragment);
}

async function trackedFetch(input, init) {
  const probe = {
    url: cleanProbeUrl(input),
    state: "pending",
    latency: null,
    startedAt: performance.now()
  };
  probeRecords.push(probe);
  renderProbeLedger();

  try {
    const response = await globalThis.fetch(input, init);
    probe.state = "responded";
    probe.latency = performance.now() - probe.startedAt;
    renderProbeLedger();
    return response;
  } catch (error) {
    probe.state = init?.signal?.aborted ? "cancelled" : "failed";
    renderProbeLedger();
    throw error;
  }
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
  activeController = new AbortController();
  setScanning(true);
  statusTitle.textContent = "Scanning endpoints";
  statusDetail.textContent = "Racing the closest reachable global signals";
  latencyValue.textContent = "…";
  downlinkValue.textContent = "…";
  probesValue.textContent = "…";
  terminalOutput.textContent = "await checkInternet({ signal })";
  copyResultButton.disabled = true;
  probeRecords = [];
  renderProbeLedger();

  try {
    renderResult(await checkInternet({
      signal: activeController.signal,
      fetch: trackedFetch
    }));
  } catch (error) {
    statusTitle.textContent = "Unable to start";
    statusDetail.textContent = error instanceof Error ? error.message : "The live check could not run";
    terminalOutput.textContent = "checkInternet() rejected";
  } finally {
    setScanning(false);
    activeController = null;
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
