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

  try {
    renderResult(await checkInternet({ signal: activeController.signal }));
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
