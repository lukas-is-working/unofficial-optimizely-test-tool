function sendState(state) {
  // The old content script can outlive an extension reload. Do not report that
  // expected lifecycle race as an uncaught page error.
  try {
    if (!chrome.runtime?.id) return;
    chrome.runtime.sendMessage({ type: "pageState", state }).catch(() => {});
  } catch (_) {
    // The extension context was invalidated between the checks.
  }
}

document.addEventListener("bf-optimizely-state", (event) => {
  sendState(event.detail);
});

async function sendAssistantSettings() {
  try {
    const settings = await chrome.storage.sync.get({
      disableConsoleLoggingCheckbox: false,
    });
    window.postMessage(
      { source: "bf-optimizely-tool", type: "assistantSettings", settings },
      "*",
    );
  } catch (_) {}
}

sendAssistantSettings();
window.addEventListener("message", (event) => {
  if (
    event.source === window &&
    event.data?.source === "bf-optimizely-tool" &&
    event.data.type === "getAssistantSettings"
  ) {
    sendAssistantSettings();
  }
});

window.addEventListener("message", (event) => {
  if (
    event.source !== window ||
    event.data?.source !== "bf-optimizely-tool" ||
    event.data.type !== "state"
  )
    return;
  sendState(event.data.state);
});
