const input = document.querySelector("#api-token");
const status = document.querySelector("#status");
const autosaveStatus = document.querySelector("#autosave-status");
const removeTokenButton = document.querySelector("#remove-api-token");
const resetSettingsButton = document.querySelector("#reset-settings");
const preserveEventLog = document.querySelector("#preserve-event-log");
const toggleTokenButton = document.querySelector("#toggle-api-token");
const cookieSettings = document.querySelector("#cookie-settings");
const addCookieButton = document.querySelector("#add-cookie");
let originalToken = "";
let saveSequence = 0;
let saveInProgress = false;
const assistantKeys = [
  "useS3snippetCheckbox",
  "optimizelyUseNonCacheSnippetCheckbox",
];
const assistantDefaults = {
  useS3snippetCheckbox: false,
  optimizelyUseNonCacheSnippetCheckbox: false,
};
let testingCookies = [];
let cookieSaveTimer;
chrome.storage.local
  .get({
    apiToken: "",
    testingCookies: [],
  })
  .then(({ apiToken, testingCookies: storedCookies }) => {
    originalToken = apiToken;
    input.value = apiToken;
    testingCookies = Array.isArray(storedCookies)
      ? storedCookies.map(({ label, name }) => ({
          label: label || "",
          name: name || "",
        }))
      : [];
    renderCookieSettings();
  });

function renderCookieSettings() {
  cookieSettings.innerHTML = testingCookies
    .map(
      (cookie, index) =>
        `<div class="cookie-setting" data-cookie-index="${index}"><label>Label<input class="cookie-label" type="text" value="${escapeHtml(cookie.label)}" placeholder="Test cookie"></label><label>Cookie name<input class="cookie-name-input" type="text" value="${escapeHtml(cookie.name)}" placeholder="Cookie name"></label><button class="remove-cookie danger-button" type="button">Remove</button></div>`,
    )
    .join("");
  cookieSettings
    .querySelectorAll("input")
    .forEach((input) => input.addEventListener("input", updateCookieSettings));
  cookieSettings.querySelectorAll(".remove-cookie").forEach((button) =>
    button.addEventListener("click", () => {
      testingCookies.splice(
        Number(button.closest(".cookie-setting").dataset.cookieIndex),
        1,
      );
      renderCookieSettings();
      scheduleSave();
    }),
  );
}

function updateCookieSettings() {
  testingCookies = [...cookieSettings.querySelectorAll(".cookie-setting")].map(
    (row) => ({
      label: row.querySelector(".cookie-label").value.trim(),
      name: row.querySelector(".cookie-name-input").value.trim(),
    }),
  );
  clearTimeout(cookieSaveTimer);
  cookieSaveTimer = setTimeout(scheduleSave, 250);
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char],
  );
}
chrome.storage.sync.get(assistantDefaults).then((settings) => {
  assistantKeys.forEach((key) => {
    document.querySelector(`#${key}`).checked = Boolean(settings[key]);
  });
});
chrome.storage.sync.get({ preserveEventLog: false }).then((settings) => {
  preserveEventLog.checked = settings.preserveEventLog;
});
async function saveSettings() {
  const tokenChanged = arguments[0] === true;
  const sequence = ++saveSequence;
  if (saveInProgress) return;
  saveInProgress = true;
  try {
    const values = {
      testingCookies: testingCookies.filter((cookie) => cookie.name),
    };
    let tokenWasRemoved = false;
    if (tokenChanged) {
      const apiToken = input.value.trim();
      if (!apiToken) {
        await chrome.storage.local.remove([
          "apiToken",
          "apiTokenValidated",
          "apiTokenValidationScope",
        ]);
        originalToken = "";
        tokenWasRemoved = true;
      } else {
        showStatus("Validating token ...");
        const result = await chrome.runtime.sendMessage({
          type: "validateOptimizelyToken",
          token: apiToken,
        });
        if (!result?.ok) {
          showStatus(result?.error || "Token could not be validated.", true);
          return;
        }
        values.apiToken = apiToken;
        values.apiTokenValidated = true;
        values.apiTokenValidationScope = "account";
      }
    }
    await chrome.storage.local.set(values);
    const assistantValues = Object.fromEntries(
      assistantKeys.map((key) => {
        const element = document.querySelector(`#${key}`);
        return [
          key,
          element.type === "checkbox" ? element.checked : element.value.trim(),
        ];
      }),
    );
    await chrome.storage.sync.set({
      ...assistantValues,
      preserveEventLog: preserveEventLog.checked,
    });
    if (tokenChanged) originalToken = values.apiToken;
    showStatus(
      tokenWasRemoved
        ? "API token removed. Runtime features remain available."
        : "Saved.",
    );
  } finally {
    saveInProgress = false;
    if (sequence !== saveSequence) scheduleSave();
  }
}

function showStatus(message, isError = false) {
  [status, autosaveStatus].forEach((element) => {
    if (!element) return;
    element.className = `settings-status${isError ? " error" : " success"}`;
    element.textContent = message;
  });
}

let saveTimer;
let tokenSavePending = false;
function scheduleSave(tokenChanged = false) {
  tokenSavePending ||= tokenChanged;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const shouldValidateToken = tokenSavePending;
    tokenSavePending = false;
    saveSettings(shouldValidateToken).catch((error) =>
      showStatus(`Save failed: ${error.message}`, true),
    );
  }, 250);
}

input.addEventListener("input", () => scheduleSave(true));
[
  preserveEventLog,
  ...assistantKeys.map((key) => document.querySelector(`#${key}`)),
]
  .filter(Boolean)
  .forEach((element) =>
    element.addEventListener("change", () => scheduleSave(false)),
  );

removeTokenButton?.addEventListener("click", async () => {
  if (!window.confirm("Remove the API token? API metadata will be disabled."))
    return;
  await chrome.storage.local.remove([
    "apiToken",
    "apiTokenValidated",
    "apiTokenValidationScope",
  ]);
  await chrome.storage.local.set({ apiSetupSkipped: true });
  input.value = "";
  originalToken = "";
  showStatus("API token removed. Runtime features remain available.");
});

resetSettingsButton?.addEventListener("click", async () => {
  if (!window.confirm("Reset all tool settings?")) return;
  await chrome.storage.local.remove([
    "apiToken",
    "apiTokenValidated",
    "apiTokenValidationScope",
  ]);
  await chrome.storage.local.set({
    apiSetupSkipped: false,
    testingCookies: [],
  });
  await chrome.storage.sync.set({
    ...assistantDefaults,
    preserveEventLog: false,
  });
  input.value = "";
  testingCookies = [];
  renderCookieSettings();
  assistantKeys.forEach((key) => {
    document.querySelector(`#${key}`).checked = assistantDefaults[key];
  });
  preserveEventLog.checked = false;
  originalToken = "";
  showStatus("Settings reset.");
});

toggleTokenButton?.addEventListener("click", () => {
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  toggleTokenButton.setAttribute(
    "aria-label",
    visible ? "Show API token" : "Hide API token",
  );
  toggleTokenButton.title = visible ? "Show API token" : "Hide API token";
  toggleTokenButton.setAttribute("aria-pressed", String(!visible));
});

input?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  saveSettings(true).catch((error) =>
    showStatus(`Save failed: ${error.message}`, true),
  );
});

addCookieButton?.addEventListener("click", () => {
  testingCookies.push({ label: "", name: "" });
  renderCookieSettings();
});
