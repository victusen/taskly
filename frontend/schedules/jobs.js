import { showToast, error as toastError } from "../scripts/ui/toast.js";
import { signOut } from "../scripts/auth/auth.js";
import { initShell, showGoogleResult } from "../scripts/ui/shell.js";
import { initAccountMenu } from "../scripts/ui/accountMenu.js";
import { initInviteModal } from "../scripts/ui/inviteModal.js";
import {
  startGoogleSheetsConnection,
  listProjectScheduleDatabaseConnections,
  getGoogleSheetsPickerConfig,
  disconnectGoogleSheetsConnection,
  listSpreadsheetSheets,
  listSpreadsheetColumns,
} from "../scripts/api/googleSheets.js";
import { inspectTemplateVariables } from "../scripts/utils/scheduleSheets.js";
import { openConnectModal, openDatabaseConnectModal } from "../scripts/ui/connectModal.js?v=20261118";
import { initPaymentModal } from "../scripts/payments/paymentModal.js";
import { sendNow } from "../scripts/api/schedules.js"
import {
  loadProject,
  loadProjects,
  loadProjectConnection,
  loadSchedules,
  changeStatus,
  updateSchedule,
  addSchedule,
  removeProject,
} from "../scripts/data/source.js";
import { saveDraft, readDrafts, deleteDraft } from "../scripts/data/drafts.js";

const PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const urlParams = new URLSearchParams(window.location.search);
const rawProjectId = urlParams.get("project");
const projectId = rawProjectId && PROJECT_ID_PATTERN.test(rawProjectId) ? rawProjectId : null;
const SCHEDULE_CACHE_TTL_MS = 5 * 60 * 1000;
const SCHEDULE_FETCH_PAGE_SIZE = 50;
const navigationEntry = window.performance?.getEntriesByType?.("navigation")?.[0];

if (!projectId) {
  window.location.replace("/dashboard");
  throw new Error("Missing or invalid project id.");
}

let currentProject = null;
let isFetchingSchedules = false;
let forceScheduleRefreshOnInit = navigationEntry?.type === "reload";
let reloadAfterCurrentFetchForce = false;
const scheduleMemoryCache = new Map();

// DOM references
const taskList = document.getElementById("task-list");
const taskLoader = document.getElementById("task-loader");
const noJobState = document.getElementById("no-job-state");
const projectNotFoundState = document.getElementById("project-not-found-state");
const requestErrorState = document.getElementById("request-error-state");
const requestErrorMessage = document.getElementById("request-error-message");
const retryBtn = document.getElementById("btn-retry-schedules");
const jobRows = document.getElementById("job-rows");
const taskPagination = document.getElementById("task-pagination");
const taskListFooter = document.getElementById("task-list-footer");
const scheduleListShell = document.getElementById("schedule-list-shell");
const footerAddScheduleBtn = document.getElementById("footer-add-schedule");
const scheduleDetailOverlay = document.getElementById("schedule-detail-overlay");
const projectTitleEl = document.getElementById("project-title");
const filterButtons = document.querySelectorAll(".toggles .toggle");
const connectGmailBtn = document.getElementById("connect-gmail-btn");
const mailAccountBtn = document.getElementById("cmp-mail-account");
const connectDatabaseBtns = document.querySelectorAll("#cmp-connect-database");
const sheetPicker = document.getElementById("sheet-picker-overlay");
const sheetPickerConnection = document.getElementById("sheet-picker-connection");
const sheetPickerFile = document.getElementById("sheet-picker-file");
const sheetPickerTab = document.getElementById("sheet-picker-tab");
const sheetPickerHeaderRow = document.getElementById("sheet-picker-header-row");
const sheetPickerStartRow = document.getElementById("sheet-picker-start-row");
const sheetPickerEndRow = document.getElementById("sheet-picker-end-row");
const sheetPickerEmailColumn = document.getElementById("sheet-picker-email-column");
const sheetPickerVariableName = document.getElementById("sheet-picker-variable-name");
const sheetPickerVariableColumn = document.getElementById("sheet-picker-variable-column");
const sheetPickerVariableList = document.getElementById("sheet-picker-variable-list");
const sheetVariableTags = document.getElementById("sheet-variable-tags");
const sheetPickerMessage = document.getElementById("sheet-picker-message");
const sheetPlanSummaryCopy = document.getElementById("sheet-plan-summary-copy");
const sheetPlanSummaryList = document.getElementById("sheet-plan-summary-list");
const addScheduleBtn = document.getElementById("add-schedule");
const emptyAddScheduleBtn = document.getElementById("empty-add-schedule");
const closeScheduleBtn = document.getElementById("close-btn");
const scheduleOverlay = document.getElementById("schedule-overlay");
const scheduleForm = document.getElementById("schedule-form");
const emailConnSelect = document.getElementById("email-connection");

let currentFilter = "all";
let currentChannel = "emails";
let schedules = [];
let currentPage = 1;
let pageSize = window.matchMedia("(max-width: 767px)").matches ? 1 : 4;
let totalSchedules = 0;
let hasMoreSchedules = false;
let reloadAfterCurrentFetch = false;
let inviteModal = null;
let currentProjectConnection = null;
let projectConnectionKnown = false;
let sheetPlan = null;
let scheduleDatabaseConnections = [];
let activeScheduleDatabaseId = null;
let spreadsheetFiles = [];
let spreadsheetSheets = [];
let spreadsheetColumns = [];
if (connectGmailBtn) connectGmailBtn.disabled = true;
if (mailAccountBtn) mailAccountBtn.disabled = true;

// Helper functions
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

const scheduleMenuIcons = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5v14"/><path d="M16 5v14"/></svg>',
  resume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 5 12 7-12 7z"/></svg>',
  delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
};

const formatDateTime = (iso) =>
  iso ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "None";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function statusBadge(status) {
  const map = {
    active: { cls: "badge-green", label: "Active" },
    running: { cls: "badge-green", label: "Running" },
    paused: { cls: "badge-warn", label: "Paused" },
    failed: { cls: "badge-red", label: "Failed" },
    new: { cls: "badge-blue", label: "New" },
  };
  const b = map[status] || { cls: "badge-green", label: status ? status.charAt(0).toUpperCase() + status.slice(1) : "Active" };
  return `<span class="badge ${b.cls}">${esc(b.label)}</span>`;
}

function setSheetPickerMessage(message, isError = false) {
  if (!sheetPickerMessage) return;
  sheetPickerMessage.textContent = message;
  sheetPickerMessage.dataset.error = String(isError);
}

function setSelectOptions(select, placeholder, options, selected = "") {
  if (!select) return;
  select.replaceChildren(new Option(placeholder, ""));
  for (const option of options) {
    const item = new Option(option.label, String(option.value));
    item.selected = String(option.value) === String(selected);
    select.add(item);
  }
  select.value = String(selected || "");
}

function selectedSheetFile() {
  return spreadsheetFiles.find((item) => String(item.id) === sheetPickerFile?.value)
    || (sheetPlan?.file && String(sheetPlan.file.id) === sheetPickerFile?.value ? sheetPlan.file : null);
}

function selectedSheetTab() {
  return spreadsheetSheets.find((item) => String(item.id) === sheetPickerTab?.value)
    || (sheetPlan?.sheet && String(sheetPlan.sheet.id) === sheetPickerTab?.value ? sheetPlan.sheet : null);
}

function renderSheetSummary() {
  if (!sheetPlanSummaryCopy || !sheetPlanSummaryList) return;
  sheetPlanSummaryList.replaceChildren();
  const clearButton = document.getElementById("sheet-plan-clear");
  if (clearButton) clearButton.hidden = !sheetPlan;
  if (!sheetPlan?.file || !sheetPlan?.sheet) {
    sheetPlanSummaryCopy.textContent = "No spreadsheet selected.";
    return;
  }

  const range = sheetPlan.endRow
    ? `Rows ${sheetPlan.startRow}-${sheetPlan.endRow}`
    : `From row ${sheetPlan.startRow}; all populated recipients`;
  const account = scheduleDatabaseConnections.find((item) => item.id === sheetPlan.connection_id);
  sheetPlanSummaryCopy.textContent = "Spreadsheet recipients selected";
  sheetPlanSummaryList.append(
    el("li", "", `Google account: ${account?.account_email || "Reconnect this account"}`),
    el("li", "", `Spreadsheet: ${sheetPlan.file.name}`),
    el("li", "", `Sheet: ${sheetPlan.sheet.title}`),
    el("li", "", `Email column: ${sheetPlan.emailColumn || "Choose in spreadsheet setup"}`),
    el("li", "", range),
  );
}

function renderVariableTags() {
  if (!sheetVariableTags) return;
  sheetVariableTags.replaceChildren();
  for (const [name, column] of Object.entries(sheetPlan?.variableColumns || {})) {
    const tag = el("span", "sheet-variable-tag");
    const insert = el("button", "sheet-variable-tag", `{${name}}`);
    insert.type = "button";
    insert.setAttribute("aria-label", `Insert {${name}} into the email body`);
    insert.addEventListener("click", () => {
      const body = document.getElementById("cmp-body");
      if (!body) return;
      const start = body.selectionStart;
      const end = body.selectionEnd;
      const token = `{${name}}`;
      body.value = `${body.value.slice(0, start)}${token}${body.value.slice(end)}`;
      body.focus();
      body.setSelectionRange(start + token.length, start + token.length);
      body.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const remove = el("button", "sheet-variable-remove", "Ãƒâ€”");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove spreadsheet variable ${name}`);
    remove.addEventListener("click", () => {
      delete sheetPlan.variableColumns[name];
      renderVariableTags();
      renderSheetSummary();
      renderPickerVariables();
    });
    tag.append(insert, remove);
    tag.title = `Column ${column}`;
    sheetVariableTags.append(tag);
  }
}

function renderPickerVariables() {
  if (!sheetPickerVariableList) return;
  sheetPickerVariableList.replaceChildren();
  for (const [name, column] of Object.entries(sheetPlan?.variableColumns || {})) {
    const item = el("span", "sheet-variable-tag", `{${name}} Ã‚Â· ${column}`);
    sheetPickerVariableList.append(item);
  }
}

function setColumnOptions(select, placeholder, columns, selected = "") {
  setSelectOptions(select, placeholder, columns.map((column) => ({
    value: column.letter,
    label: `${column.letter} Ã¢â‚¬â€ ${column.header}`,
  })), selected);
}

function updateSheetPlanFromInputs() {
  if (!sheetPlan) return;
  sheetPlan.headerRow = Number(sheetPickerHeaderRow?.value);
  sheetPlan.startRow = Number(sheetPickerStartRow?.value);
  sheetPlan.endRow = sheetPickerEndRow?.value ? Number(sheetPickerEndRow.value) : null;
  renderSheetSummary();
}

function setSheetPlan(plan) {
  sheetPlan = plan ? JSON.parse(JSON.stringify(plan)) : null;
  if (!sheetPlan) {
    spreadsheetSheets = [];
    spreadsheetColumns = [];
    setSelectOptions(sheetPickerTab, "Select a sheet tab", []);
    setSelectOptions(sheetPickerEmailColumn, "Choose a column", []);
    setSelectOptions(sheetPickerVariableColumn, "Choose a column", []);
    const addVariableButton = document.getElementById("sheet-picker-add-variable");
    if (addVariableButton) addVariableButton.disabled = true;
  }
  if (sheetPlan?.connection_id) activeScheduleDatabaseId = String(sheetPlan.connection_id);
  if (sheetPickerConnection && activeScheduleDatabaseId) {
    sheetPickerConnection.value = activeScheduleDatabaseId;
  }
  spreadsheetFiles = sheetPlan?.file ? [sheetPlan.file] : [];
  spreadsheetSheets = sheetPlan?.sheet ? [sheetPlan.sheet] : [];
  spreadsheetColumns = sheetPlan?.columns || [];
  setSelectOptions(sheetPickerFile, "Select a spreadsheet", spreadsheetFiles.map((file) => ({
    value: file.id,
    label: file.name || file.title || "Untitled spreadsheet",
  })), sheetPlan?.file?.id ?? "");
  if (sheetPickerFile) sheetPickerFile.disabled = true;
  setSelectOptions(sheetPickerTab, "Select a sheet tab", spreadsheetSheets.map((sheet) => ({
    value: sheet.id,
    label: sheet.title || sheet.name || "Untitled sheet",
  })), sheetPlan?.sheet?.id ?? "");
  if (sheetPickerTab) sheetPickerTab.disabled = !sheetPlan?.file;
  if (sheetPickerHeaderRow) sheetPickerHeaderRow.value = String(sheetPlan?.headerRow || 1);
  if (sheetPickerStartRow) sheetPickerStartRow.value = String(sheetPlan?.startRow || Number(sheetPlan?.headerRow || 1) + 1);
  if (sheetPickerEndRow) sheetPickerEndRow.value = sheetPlan?.endRow ? String(sheetPlan.endRow) : "";
  setColumnOptions(sheetPickerEmailColumn, "Choose a column", spreadsheetColumns, sheetPlan?.emailColumn || "");
  setColumnOptions(sheetPickerVariableColumn, "Choose a column", spreadsheetColumns);
  if (sheetPickerEmailColumn) sheetPickerEmailColumn.disabled = !spreadsheetColumns.length;
  if (sheetPickerVariableColumn) sheetPickerVariableColumn.disabled = !spreadsheetColumns.length;
  const applyButton = document.getElementById("sheet-picker-apply");
  if (applyButton) applyButton.disabled = !sheetPlan?.file || !sheetPlan?.sheet || !sheetPlan?.emailColumn;
  renderSheetSummary();
  renderVariableTags();
  renderPickerVariables();
}

async function loadSheetConnections() {
  setSheetPickerMessage("Loading Google Sheets accountsÃ¢â‚¬Â¦");
  try {
    scheduleDatabaseConnections = await listProjectScheduleDatabaseConnections(projectId);
    const callbackConnectionId = urlParams.get("google_connection_id");
    const requestedId = callbackConnectionId
      || sheetPlan?.connection_id
      || activeScheduleDatabaseId;
    const selected = scheduleDatabaseConnections.find((connection) => connection.id === requestedId)
      || scheduleDatabaseConnections.find((connection) => connection.status === "active")
      || scheduleDatabaseConnections[0];
    activeScheduleDatabaseId = selected?.id || null;
    if (callbackConnectionId) {
      urlParams.delete("google_connection_id");
      window.history.replaceState({}, "", `${window.location.pathname}?${urlParams}${window.location.hash}`);
      if (sheetPlan && sheetPlan.connection_id !== activeScheduleDatabaseId) {
        sheetPlan = { ...sheetPlan, connection_id: activeScheduleDatabaseId, file: null, sheet: null, columns: [], emailColumn: "", variableColumns: {} };
        setSheetPlan(sheetPlan);
      }
    }
    setSelectOptions(sheetPickerConnection, "Select a Google account", scheduleDatabaseConnections.map((connection) => ({
      value: connection.id,
      label: `${connection.account_email}${connection.status === "active" ? "" : ` (${connection.status.replaceAll("_", " ")})`}`,
    })), activeScheduleDatabaseId || "");
    renderSheetSummary();
    const active = selected?.status === "active";
    const browseButton = document.getElementById("sheet-picker-browse");
    const disconnectButton = document.getElementById("sheet-picker-disconnect");
    if (browseButton) browseButton.disabled = !active;
    if (disconnectButton) disconnectButton.disabled = !selected;

    if (!selected) {
      setSheetPickerMessage("Connect a Google account to select a spreadsheet.");
      return;
    }
    if (!active) {
      setSheetPickerMessage(`This account is ${selected.status.replaceAll("_", " ")}. Reconnect it to use its spreadsheets.`, true);
      return;
    }
    if (sheetPlan?.file?.id && sheetPlan.connection_id === selected.id) {
      await loadSheetTabs(sheetPlan.file.id);
      setSheetPickerMessage("Choose the sheet tab, then map its recipient email column.");
    } else {
      setSheetPickerMessage("Choose a spreadsheet with Google Picker, then select its sheet tab and columns.");
    }
  } catch (error) {
    setSheetPickerMessage(`Could not load Google Sheets accounts: ${error.message}`, true);
  }
}

async function loadSheetTabs(spreadsheetId) {
  spreadsheetSheets = [];
  setSelectOptions(sheetPickerTab, "Loading sheet tabsÃ¢â‚¬Â¦", []);
  if (sheetPickerTab) sheetPickerTab.disabled = true;
  const applyButton = document.getElementById("sheet-picker-apply");
  if (applyButton) applyButton.disabled = true;
  if (!spreadsheetId) return;

  try {
    spreadsheetSheets = await listSpreadsheetSheets(projectId, activeScheduleDatabaseId, spreadsheetId);
    const selectedSheetId = sheetPlan?.sheet?.id;
    setSelectOptions(sheetPickerTab, "Select a sheet tab", spreadsheetSheets.map((sheet) => ({
      value: sheet.id,
      label: sheet.title || sheet.name || "Untitled sheet",
    })), selectedSheetId ?? "");
    if (sheetPickerTab) sheetPickerTab.disabled = false;
    if (selectedSheetId !== undefined && spreadsheetSheets.some((sheet) => String(sheet.id) === String(selectedSheetId))) {
      await loadSheetColumns(spreadsheetId, selectedSheetId, sheetPlan?.headerRow || 1);
    }
    setSheetPickerMessage(spreadsheetSheets.length ? "Choose the sheet tab to use." : "This spreadsheet has no available tabs.", !spreadsheetSheets.length);
  } catch (error) {
    setSheetPickerMessage(`Could not load sheet tabs: ${error.message}`, true);
  }
}

async function loadSheetColumns(spreadsheetId, sheetId, headerRow) {
  spreadsheetColumns = [];
  setColumnOptions(sheetPickerEmailColumn, "Loading columnsÃ¢â‚¬Â¦", []);
  setColumnOptions(sheetPickerVariableColumn, "Loading columnsÃ¢â‚¬Â¦", []);
  if (sheetPickerEmailColumn) sheetPickerEmailColumn.disabled = true;
  if (sheetPickerVariableColumn) sheetPickerVariableColumn.disabled = true;
  const row = Number(headerRow);
  if (!spreadsheetId || sheetId === undefined || !Number.isSafeInteger(row) || row < 1) return;

  try {
    const columns = await listSpreadsheetColumns(projectId, activeScheduleDatabaseId, spreadsheetId, sheetId, row);
    if (
      sheetPickerFile?.value !== String(spreadsheetId) ||
      sheetPickerTab?.value !== String(sheetId) ||
      Number(sheetPickerHeaderRow?.value) !== row
    ) return;
    spreadsheetColumns = columns;
    if (sheetPlan) sheetPlan.columns = spreadsheetColumns;
    setColumnOptions(sheetPickerEmailColumn, "Choose a column", spreadsheetColumns, sheetPlan?.emailColumn || "");
    setColumnOptions(sheetPickerVariableColumn, "Choose a column", spreadsheetColumns);
    if (sheetPickerEmailColumn) sheetPickerEmailColumn.disabled = !spreadsheetColumns.length;
    if (sheetPickerVariableColumn) sheetPickerVariableColumn.disabled = !spreadsheetColumns.length;
    const addVariableButton = document.getElementById("sheet-picker-add-variable");
    if (addVariableButton) addVariableButton.disabled = !spreadsheetColumns.length;
    const applyButton = document.getElementById("sheet-picker-apply");
    if (applyButton) applyButton.disabled = !sheetPlan?.emailColumn;
    setSheetPickerMessage(spreadsheetColumns.length
      ? "Choose the recipient email column. Add columns for any email variables."
      : "No column headers were found in this row.", !spreadsheetColumns.length);
  } catch (error) {
    setSheetPickerMessage(`Could not load spreadsheet columns: ${error.message}`, true);
  }
}

function openSheetPicker() {
  if (!sheetPicker) return;
  sheetPicker.classList.add("open");
  sheetPicker.setAttribute("aria-hidden", "false");
  if (sheetPlan) setSheetPlan(sheetPlan);
  void loadSheetConnections();
}

function closeSheetPicker() {
  sheetPicker?.classList.remove("open");
  sheetPicker?.setAttribute("aria-hidden", "true");
}

let pickerApiPromise = null;
function loadGooglePickerApi() {
  if (window.google?.picker?.PickerBuilder) return Promise.resolve();
  if (pickerApiPromise) return pickerApiPromise;

  pickerApiPromise = new Promise((resolve, reject) => {
    const loadPicker = () => {
      if (!window.gapi?.load) {
        reject(new Error("Google Picker could not be loaded."));
        return;
      }
      window.gapi.load("picker", {
        callback: resolve,
        onerror: () => reject(new Error("Google Picker could not be loaded.")),
        timeout: 10000,
        ontimeout: () => reject(new Error("Google Picker took too long to load.")),
      });
    };

    let script = document.querySelector('script[data-google-picker-api="true"]');
    if (!script) {
      script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.dataset.googlePickerApi = "true";
      script.addEventListener("load", loadPicker, { once: true });
      script.addEventListener("error", () => reject(new Error("Google Picker could not be loaded.")), { once: true });
      document.head.append(script);
    } else if (window.gapi?.load) {
      loadPicker();
    } else {
      script.addEventListener("load", loadPicker, { once: true });
    }
  }).catch((error) => {
    pickerApiPromise = null;
    throw error;
  });
  return pickerApiPromise;
}

async function browseGoogleSheets() {
  if (!activeScheduleDatabaseId) {
    setSheetPickerMessage("Select a Google Sheets account first.", true);
    return;
  }
  const browseButton = document.getElementById("sheet-picker-browse");
  if (browseButton) browseButton.disabled = true;
  setSheetPickerMessage("Opening Google PickerÃ¢â‚¬Â¦");
  try {
    const [config] = await Promise.all([
      getGoogleSheetsPickerConfig(projectId, activeScheduleDatabaseId),
      loadGooglePickerApi(),
    ]);
    const picker = new window.google.picker.PickerBuilder()
      .addView(window.google.picker.ViewId.SPREADSHEETS)
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setOrigin(window.location.origin)
      .setTitle("Choose a spreadsheet")
      .setCallback((data) => {
        if (data.action !== window.google.picker.Action.PICKED) return;
        const document = data.docs?.[0];
        if (!document?.id) {
          setSheetPickerMessage("Google Picker did not return a spreadsheet.", true);
          return;
        }
        const file = { id: String(document.id), name: String(document.name || "Untitled spreadsheet") };
        sheetPlan = {
          ...(sheetPlan || {}),
          version: 1,
          provider: "google_sheets",
          connection_id: activeScheduleDatabaseId,
          file,
          sheet: null,
          headerRow: 1,
          startRow: 2,
          endRow: null,
          emailColumn: "",
          variableColumns: {},
        };
        setSheetPlan(sheetPlan);
        void loadSheetTabs(file.id);
      })
      .build();
    picker.setVisible(true);
    setSheetPickerMessage("Select a spreadsheet in Google Picker.");
  } catch (error) {
    setSheetPickerMessage(`Could not open Google Picker: ${error.message}`, true);
  } finally {
    if (browseButton) {
      const selected = scheduleDatabaseConnections.find((connection) => connection.id === activeScheduleDatabaseId);
      browseButton.disabled = selected?.status !== "active";
    }
  }
}

function validateCurrentSheetPlan(subject, body) {
  if (!sheetPlan) return [];
  const errors = [];
  if (!sheetPlan.connection_id) errors.push("Choose the Google Sheets account that owns this connection.");
  if (!sheetPlan.file?.id || sheetPlan.sheet?.id === undefined) errors.push("Choose a spreadsheet and sheet tab.");
  if (!sheetPlan.emailColumn) errors.push("Choose the spreadsheet column containing recipient email addresses.");
  const headerRow = Number(sheetPlan.headerRow);
  const startRow = Number(sheetPlan.startRow);
  const endRow = sheetPlan.endRow === null || sheetPlan.endRow === undefined || sheetPlan.endRow === ""
    ? null
    : Number(sheetPlan.endRow);
  if (!Number.isSafeInteger(headerRow) || !Number.isSafeInteger(startRow) || headerRow < 1 || startRow <= headerRow || startRow > 1_000_000) {
    errors.push("Choose a valid header row and first data row.");
  }
  if (endRow !== null && (!Number.isSafeInteger(endRow) || endRow < startRow || endRow > 1_000_000 || endRow - startRow + 1 > 500)) {
    errors.push("The selected spreadsheet range can contain at most 500 rows.");
  }

  const mappings = sheetPlan.variableColumns || {};
  const required = inspectTemplateVariables(subject, body).variables;
  const missing = required.filter((name) => !mappings[name]);
  if (missing.length) {
    errors.push(`Choose a spreadsheet column for ${missing.map((name) => `{${name}}`).join(", ")}.`);
  }
  const usedVariables = new Set(inspectTemplateVariables(subject, body).variables);
  const unused = Object.keys(mappings).filter((name) => !usedVariables.has(name));
  if (unused.length) {
    errors.push(`Use each selected variable in the subject or email body: ${unused.map((name) => `{${name}}`).join(", ")}.`);
  }
  return errors;
}

window.bzComposer = window.bzComposer || {};
window.bzComposer.openSheetPicker = openSheetPicker;
window.bzComposer.getSheetPlan = () => sheetPlan ? JSON.parse(JSON.stringify(sheetPlan)) : null;
window.bzComposer.setSheetPlan = setSheetPlan;
window.bzComposer.validateSheetPlan = validateCurrentSheetPlan;

connectDatabaseBtns.forEach((button) => button.addEventListener("click", () => {
  openDatabaseConnectModal({
    onSelect(provider) {
      if (provider === "google-sheets") {
        openSheetPicker();
        return;
      }
      const providerName = {
        excel: "Excel",
        supabase: "Supabase",
        firebase: "Firebase",
        mongodb: "MongoDB",
        postgresql: "PostgreSQL",
      }[provider] || "This database";
      showToast("info", `${providerName} connection is coming soon.`);
    },
  });
}));
document.getElementById("sheet-picker-close")?.addEventListener("click", closeSheetPicker);
document.getElementById("sheet-picker-cancel")?.addEventListener("click", closeSheetPicker);
document.getElementById("sheet-plan-clear")?.addEventListener("click", () => setSheetPlan(null));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sheetPicker?.classList.contains("open")) closeSheetPicker();
});
sheetPicker?.addEventListener("click", (event) => {
  if (event.target === sheetPicker) closeSheetPicker();
});
document.getElementById("sheet-picker-connect")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    sessionStorage.setItem("bzResumeSheetsPicker", projectId);
    sessionStorage.setItem("bzResumeSheetsComposer", JSON.stringify({
      name: document.getElementById("cmp-name")?.value || "",
      recipients: document.getElementById("cmp-recipients")?.value || "",
      subject: document.querySelector('#cmp-form [name="subject"]')?.value || "",
      body: document.getElementById("cmp-body")?.value || "",
      how: document.getElementById("cmp-how")?.value || "once",
      date: document.getElementById("cmp-date")?.value || "",
      time: document.getElementById("cmp-time")?.value || "09:00",
      spreadsheet: window.bzComposer.getSheetPlan?.() || null,
    }));
    await startGoogleSheetsConnection(projectId);
  } catch (error) {
    sessionStorage.removeItem("bzResumeSheetsPicker");
    sessionStorage.removeItem("bzResumeSheetsComposer");
    setSheetPickerMessage(error.message || "Could not start the Google Sheets connection.", true);
    button.disabled = false;
  }
});
document.getElementById("sheet-picker-browse")?.addEventListener("click", () => {
  void browseGoogleSheets();
});
sheetPickerConnection?.addEventListener("change", async () => {
  const previousConnectionId = activeScheduleDatabaseId;
  activeScheduleDatabaseId = sheetPickerConnection.value || null;
  const selected = scheduleDatabaseConnections.find((connection) => connection.id === activeScheduleDatabaseId);
  const browseButton = document.getElementById("sheet-picker-browse");
  const disconnectButton = document.getElementById("sheet-picker-disconnect");
  if (browseButton) browseButton.disabled = selected?.status !== "active";
  if (disconnectButton) disconnectButton.disabled = !selected;
  if (sheetPlan && previousConnectionId !== activeScheduleDatabaseId) {
    sheetPlan.connection_id = activeScheduleDatabaseId;
    if (sheetPlan.file?.id && activeScheduleDatabaseId && selected?.status === "active") {
      await loadSheetTabs(sheetPlan.file.id);
    }
  }
});
document.getElementById("sheet-picker-disconnect")?.addEventListener("click", async () => {
  const connectionId = activeScheduleDatabaseId;
  const connection = scheduleDatabaseConnections.find((item) => item.id === connectionId);
  if (!connection) return;
  if (!window.confirm(`Disconnect ${connection.account_email} from this project? Active schedules using this connection will be paused until you reconnect and resume them.`)) return;
  const button = document.getElementById("sheet-picker-disconnect");
  if (button) button.disabled = true;
  try {
    await disconnectGoogleSheetsConnection(projectId, connectionId);
    if (sheetPlan?.connection_id === connectionId) setSheetPlan(null);
    activeScheduleDatabaseId = null;
    await loadSheetConnections();
    invalidateScheduleCache();
    await loadRows(currentFilter, { forceRefresh: true });
    showToast("success", "Google Sheets account disconnected.");
  } catch (error) {
    setSheetPickerMessage(`Could not disconnect Google Sheets: ${error.message}`, true);
  } finally {
    if (button) button.disabled = false;
  }
});
sheetPickerTab?.addEventListener("change", () => {
  const file = selectedSheetFile();
  const sheet = selectedSheetTab();
  if (!file || !sheet) return;
  const headerRow = Number(sheetPickerHeaderRow?.value || 1);
  const startRow = Math.max(headerRow + 1, Number(sheetPickerStartRow?.value || headerRow + 1));
  if (sheetPickerStartRow) sheetPickerStartRow.value = String(startRow);
  if (sheetPickerEndRow) sheetPickerEndRow.value = "";
  sheetPlan = {
    version: 1,
    provider: "google_sheets",
    connection_id: activeScheduleDatabaseId,
    file,
    sheet,
    headerRow,
    startRow,
    endRow: null,
    emailColumn: "",
    variableColumns: {},
  };
  void loadSheetColumns(file.id, sheet.id, headerRow);
});
sheetPickerHeaderRow?.addEventListener("change", () => {
  if (!sheetPlan?.file || sheetPlan.sheet?.id === undefined) return;
  const headerRow = Number(sheetPickerHeaderRow.value);
  if (Number.isSafeInteger(headerRow) && headerRow >= 1) {
    sheetPlan.headerRow = headerRow;
    if (Number(sheetPickerStartRow.value) <= headerRow) {
      sheetPickerStartRow.value = String(headerRow + 1);
      sheetPlan.startRow = headerRow + 1;
    }
    updateSheetPlanFromInputs();
    void loadSheetColumns(sheetPlan.file.id, sheetPlan.sheet.id, headerRow);
  }
});
[sheetPickerStartRow, sheetPickerEndRow].forEach((input) => {
  input?.addEventListener("input", updateSheetPlanFromInputs);
});
sheetPickerEmailColumn?.addEventListener("change", () => {
  if (!sheetPlan) return;
  sheetPlan.emailColumn = sheetPickerEmailColumn.value;
  renderSheetSummary();
  const applyButton = document.getElementById("sheet-picker-apply");
  if (applyButton) applyButton.disabled = !sheetPlan.emailColumn;
});
document.getElementById("sheet-picker-add-variable")?.addEventListener("click", () => {
  if (!sheetPlan) return;
  const name = String(sheetPickerVariableName?.value || "").trim();
  const column = sheetPickerVariableColumn?.value || "";
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) {
    setSheetPickerMessage("Use a variable name with letters, numbers, or underscores; it must start with a letter or underscore.", true);
    return;
  }
  if (!column) {
    setSheetPickerMessage("Choose the spreadsheet column for this variable.", true);
    return;
  }
  if (Object.hasOwn(sheetPlan.variableColumns || {}, name)) {
    setSheetPickerMessage(`The variable {${name}} already has a column.`, true);
    return;
  }
  sheetPlan.variableColumns = { ...(sheetPlan.variableColumns || {}), [name]: column };
  if (sheetPickerVariableName) sheetPickerVariableName.value = "";
  renderVariableTags();
  renderPickerVariables();
  setSheetPickerMessage(`Added {${name}} from column ${column}.`);
});
document.getElementById("sheet-picker-apply")?.addEventListener("click", () => {
  const selectedConnection = scheduleDatabaseConnections.find((connection) => connection.id === sheetPlan?.connection_id);
  if (!selectedConnection || selectedConnection.status !== "active") {
    setSheetPickerMessage("Choose an active Google Sheets account first.", true);
    return;
  }
  if (!sheetPlan?.file?.id || sheetPlan.sheet?.id === undefined || !sheetPlan.emailColumn) {
    setSheetPickerMessage("Choose a spreadsheet, sheet tab, and recipient email column first.", true);
    return;
  }
  const errors = validateCurrentSheetPlan("", "");
  const rangeErrors = errors.filter((message) => message.includes("header row") || message.includes("range"));
  if (rangeErrors.length) {
    setSheetPickerMessage(rangeErrors[0], true);
    return;
  }
  updateSheetPlanFromInputs();
  renderSheetSummary();
  closeSheetPicker();
});

function hideAllStates() {
  if (taskLoader) {
    taskLoader.hidden = true;
    taskLoader.style.display = "none";
  }
  if (jobRows) {
    jobRows.hidden = true;
    jobRows.style.display = "none";
  }
  if (noJobState) noJobState.hidden = true;
  if (projectNotFoundState) projectNotFoundState.hidden = true;
  if (requestErrorState) requestErrorState.hidden = true;
  if (scheduleListShell) scheduleListShell.hidden = true;
}

function setLoading(isLoading) {
  filterButtons.forEach((button) => { button.disabled = isLoading; });
  document.querySelectorAll(".channel-pill").forEach((button) => { button.disabled = isLoading; });
  if (isLoading) {
    hideAllStates();
    if (taskLoader) {
      taskLoader.hidden = false;
      taskLoader.style.display = "flex";
    }
  } else {
    if (taskLoader) {
      taskLoader.hidden = true;
      taskLoader.style.display = "none";
    }
  }
}

function showProjectNotFound() {
  hideAllStates();
  if (projectNotFoundState) {
    projectNotFoundState.hidden = false;
  }
}

function showRequestError(msg) {
  hideAllStates();
  if (requestErrorMessage) {
    requestErrorMessage.textContent = msg || "Could not retrieve schedules. Please check your connection.";
  }
  if (requestErrorState) {
    requestErrorState.hidden = false;
  }
}

function renderPagination() {
  if (!taskPagination) return;

  const hasSchedules = totalSchedules > 0;
  const firstItem = hasSchedules ? (currentPage - 1) * pageSize + 1 : 0;
  const lastItem = hasSchedules ? Math.min(currentPage * pageSize, totalSchedules) : 0;
  const canGoBack = hasSchedules && currentPage > 1;
  const canGoForward = hasSchedules && hasMoreSchedules;
  taskPagination.innerHTML = `
    <span class="page-summary">${firstItem}Ã¢â‚¬â€œ${lastItem} of ${totalSchedules} schedules</span>
    <span class="page-mobile-summary">${totalSchedules} ${totalSchedules === 1 ? "schedule" : "schedules"}</span>
    <span class="page-current">${hasSchedules ? currentPage : "0 / 0"}</span>
    <span class="page-mobile-current">${hasSchedules ? `${currentPage} / ${totalSchedules}` : "0 / 0"}</span>
    <button type="button" class="page-btn" data-page="${currentPage - 1}" ${canGoBack ? "" : "disabled"} aria-label="Previous schedule page">Ã¢â‚¬Â¹</button>
    <button type="button" class="page-btn" data-page="${currentPage + 1}" ${canGoForward ? "" : "disabled"} aria-label="Next schedule page">Ã¢â‚¬Âº</button>`;
  taskPagination.hidden = false;
  taskPagination.style.display = "flex";
  if (taskListFooter) taskListFooter.hidden = false;
}

function formatScheduleDateTime(value, timezone = "UTC") {
  if (!value) return "Ã¢â‚¬â€";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ã¢â‚¬â€";
  try {
    const formattedDate = new Intl.DateTimeFormat("en-US", {
      month: "2-digit", day: "2-digit", year: "2-digit", timeZone: timezone,
    }).format(date);
    const formattedTime = new Intl.DateTimeFormat(undefined, {
      hour: "numeric", minute: "2-digit", timeZone: timezone,
    }).format(date);
    return `${formattedDate} Ã‚Â· ${formattedTime}`;
  } catch {
    return `${new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }).format(date)} Ã‚Â· ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
}

function getScheduleFrequencyOption(schedule) {
  const repeatOption = schedule.schedule_rule?.every;
  if (schedule.schedule_type === "recurring" && repeatOption) {
    return repeatOption;
  }

  if (schedule.schedule_type === "one_time") {
    const scheduledAt = Date.parse(schedule.scheduled_for || "");
    const createdAt = Date.parse(schedule.created_at || "");
    if (
      Number.isFinite(scheduledAt) &&
      Number.isFinite(createdAt) &&
      Math.abs(scheduledAt - createdAt) < 30_000
    ) {
      return "now";
    }
    return "once";
  }

  return "";
}

function getScheduleFrequency(schedule) {
  const labels = {
    now: "Now",
    once: "Once",
    daily: "Daily",
    weekday: "Every weekday (MonÃ¢â‚¬â€œFri)",
    weekends: "Every weekend",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
    christmas: "Christmas",
    "christmas-eve": "Christmas Eve",
    "new year": "New Year's Day",
    "new years-eve": "New Year's Eve",
    valentines: "Valentine's Day",
  };
  return labels[getScheduleFrequencyOption(schedule)] || "Ã¢â‚¬â€";
}

/**
 * Renders the current page of schedule rows and the pager.
 */
function renderRows() {
  const btnAll = document.querySelector('[data-filter="all"]');
  const btnRunning = document.querySelector('[data-filter="running"]');
  const btnNew = document.querySelector('[data-filter="new"]');
  const btnPaused = document.querySelector('[data-filter="paused"]');

  if (btnAll) btnAll.textContent = "All";
  if (btnRunning) btnRunning.textContent = "Running";
  if (btnNew) btnNew.textContent = "New";
  if (btnPaused) btnPaused.textContent = "Paused";

  renderPagination();
  if (schedules.length === 0) {
    hideAllStates();
    if (noJobState) noJobState.hidden = false;
    return;
  }

  hideAllStates();
  if (scheduleListShell) scheduleListShell.hidden = false;
  if (jobRows) {
    jobRows.hidden = false;
    jobRows.style.display = "block";
    const tableRows = schedules.map((row) => {
      const recipients = Array.isArray(row.config?.recipients) ? row.config.recipients : [];
      const name = row.name || row.config?.subject || "Untitled task";
      const type = String(row.job_type || "email").replace(/^./, (letter) => letter.toUpperCase());
      const frequency = getScheduleFrequency(row);
      const createdAt = formatScheduleDateTime(row.created_at);
      const nextRun = formatScheduleDateTime(row.next_run_at);
      const lastRun = formatScheduleDateTime(row.last_run_at);
      const statusAction = row.status === "active" ? "Pause" : row.status === "paused" ? "Resume" : "";
      const statusActionIcon = statusAction === "Pause" ? scheduleMenuIcons.pause : scheduleMenuIcons.resume;
      const canEditSchedule = row.status === "active" || row.status === "paused";
      const canDeleteSchedule = ["active", "paused", "failed"].includes(row.status);
      return `
        <tr data-id="${esc(row.id)}" data-schedule='${esc(JSON.stringify(row))}'>
          <td class="schedule-select-cell"><input type="checkbox" aria-label="Select ${esc(name)}"></td>
          <td class="schedule-name-cell" title="${esc(name)}"><button type="button" class="schedule-name-button" data-view-schedule>${esc(name)}</button></td>
          <td class="schedule-type-cell">${esc(type)}</td>
          <td class="schedule-frequency-cell">${esc(frequency)}</td>
          <td><div class="schedule-date-time"><strong>${esc(createdAt.split(" Ã‚Â· ")[0])}</strong><span>${esc(createdAt.split(" Ã‚Â· ")[1] || "")}</span></div></td>
          <td><div class="schedule-date-time"><strong>${esc(nextRun.split(" Ã‚Â· ")[0])}</strong><span>${esc(nextRun.split(" Ã‚Â· ")[1] || "Ã¢â‚¬â€")}</span></div></td>
          <td><div class="schedule-date-time"><strong>${esc(lastRun.split(" Ã‚Â· ")[0])}</strong><span>${esc(lastRun.split(" Ã‚Â· ")[1] || "Ã¢â‚¬â€")}</span></div></td>
          <td>${recipients.length}</td>
          <td>${statusBadge(row.status)}</td>
          <td class="schedule-actions-cell">
            <div class="schedule-row-actions">
              <button type="button" class="schedule-menu-trigger" aria-label="Schedule actions" aria-expanded="false">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
              </button>
              <div class="schedule-row-menu" hidden>
                <button type="button" data-sidebar-toggle aria-pressed="false">Expand</button>
                ${canEditSchedule ? `<button type="button" data-edit="${esc(row.id)}">${scheduleMenuIcons.edit}<span>Edit</span></button>` : ""}
                ${statusAction ? `<button type="button" data-schedule-action="${statusAction.toLowerCase()}" data-id="${esc(row.id)}">${statusActionIcon}<span>${statusAction}</span></button>` : ""}
                ${canDeleteSchedule ? `<button type="button" data-delete-schedule="${esc(row.id)}">${scheduleMenuIcons.delete}<span>Delete</span></button>` : ""}
              </div>
            </div>
          </td>
        </tr>`;
    }).join("");
    const mobileCards = schedules.map((row) => {
      const recipients = Array.isArray(row.config?.recipients) ? row.config.recipients : [];
      const name = row.name || row.config?.subject || "Untitled task";
      const type = String(row.job_type || "email").replace(/^./, (letter) => letter.toUpperCase());
      const frequency = getScheduleFrequency(row);
      const createdAt = formatScheduleDateTime(row.created_at).split(" Ã‚Â· ");
      const nextRun = formatScheduleDateTime(row.next_run_at).split(" Ã‚Â· ");
      const lastRun = formatScheduleDateTime(row.last_run_at).split(" Ã‚Â· ");
      const statusAction = row.status === "active" ? "Pause" : row.status === "paused" ? "Resume" : "";
      const statusActionIcon = statusAction === "Pause" ? scheduleMenuIcons.pause : scheduleMenuIcons.resume;
      const canEditSchedule = row.status === "active" || row.status === "paused";
      const canDeleteSchedule = ["active", "paused", "failed"].includes(row.status);
      const dateValue = (parts) => `<span class="schedule-mobile-date"><strong>${esc(parts[0] || "Ã¢â‚¬â€")}</strong><span>${esc(parts[1] || "")}</span></span>`;
      return `
        <article class="schedule-mobile-card" data-schedule='${esc(JSON.stringify(row))}'>
          <label class="schedule-select-cell schedule-mobile-select" aria-label="Select ${esc(name)}">
            <input type="checkbox" aria-label="Open actions for ${esc(name)}">
          </label>
          <div class="schedule-mobile-header">
            <button type="button" class="schedule-mobile-title schedule-name-button" data-view-schedule>${esc(name)}</button>
            <div class="schedule-row-actions">
              <button type="button" class="schedule-menu-trigger" aria-label="Schedule actions" aria-expanded="false">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
              </button>
              <div class="schedule-row-menu" hidden>
                <button type="button" data-sidebar-toggle aria-pressed="false">Expand</button>
                ${canEditSchedule ? `<button type="button" data-edit="${esc(row.id)}">${scheduleMenuIcons.edit}<span>Edit</span></button>` : ""}
                ${statusAction ? `<button type="button" data-schedule-action="${statusAction.toLowerCase()}" data-id="${esc(row.id)}">${statusActionIcon}<span>${statusAction}</span></button>` : ""}
                ${canDeleteSchedule ? `<button type="button" data-delete-schedule="${esc(row.id)}">${scheduleMenuIcons.delete}<span>Delete</span></button>` : ""}
              </div>
            </div>
          </div>
          <div class="schedule-mobile-meta">
            <div class="schedule-mobile-field"><span class="schedule-mobile-label">Type</span><span class="schedule-mobile-value schedule-type-cell">${esc(type)}</span></div>
            <div class="schedule-mobile-field"><span class="schedule-mobile-label">Status</span><span class="schedule-mobile-value">${statusBadge(row.status)}</span></div>
            <div class="schedule-mobile-field"><span class="schedule-mobile-label">Frequency</span><span class="schedule-mobile-value schedule-frequency-cell">${esc(frequency)}</span></div>
            <div class="schedule-mobile-field"><span class="schedule-mobile-label">Created at</span><span class="schedule-mobile-value">${dateValue(createdAt)}</span></div>
            <div class="schedule-mobile-field"><span class="schedule-mobile-label">Next run</span><span class="schedule-mobile-value">${dateValue(nextRun)}</span></div>
            <div class="schedule-mobile-field"><span class="schedule-mobile-label">Last run</span><span class="schedule-mobile-value">${dateValue(lastRun)}</span></div>
            <div class="schedule-mobile-field"><span class="schedule-mobile-label">Recipients</span><span class="schedule-mobile-value">${recipients.length}</span></div>
          </div>
        </article>`;
    }).join("");
    jobRows.innerHTML = `
      <div class="schedule-table-scroll">
        <table class="schedule-table">
          <thead><tr>
            <th class="schedule-select-cell">Select</th>
            <th>Name</th><th>Type</th><th>Frequency</th><th>Created at</th><th>Next run</th><th>Last run</th>
            <th>Recipients</th><th>Status</th><th aria-label="More actions"></th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div class="schedule-mobile-list">${mobileCards}</div>`;
  }

  if (typeof window.bzRightPanel?.updateTaskCount === 'function') {
    window.bzRightPanel.updateTaskCount(totalSchedules);
  }
}

function scheduleCacheKey(jobType) {
  return `bzade:schedules:${projectId}:${jobType}`;
}

function readScheduleCache(jobType) {
  const key = scheduleCacheKey(jobType);
  let cached = scheduleMemoryCache.get(key) || null;

  if (!cached) {
    try {
      cached = JSON.parse(sessionStorage.getItem(key) || "null");
    } catch (error) {
      console.warn("Could not read the schedule cache:", error);
      return null;
    }
  }

  if (
    !cached ||
    !Array.isArray(cached.items) ||
    !Number.isFinite(cached.cachedAt) ||
    Date.now() - cached.cachedAt >= SCHEDULE_CACHE_TTL_MS
  ) {
    scheduleMemoryCache.delete(key);
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn("Could not clear the expired schedule cache:", error);
    }
    return null;
  }

  scheduleMemoryCache.set(key, cached);
  return cached;
}

function writeScheduleCache(jobType, items, cachedAt = Date.now()) {
  const key = scheduleCacheKey(jobType);
  const cached = { cachedAt, items };
  scheduleMemoryCache.set(key, cached);
  try {
    sessionStorage.setItem(key, JSON.stringify(cached));
  } catch (error) {
    console.warn("Could not persist the schedule cache for this tab:", error);
  }
}

function invalidateScheduleCache(jobType = null) {
  const jobTypes = jobType ? [jobType] : ["email", "payload"];
  for (const type of jobTypes) {
    const key = scheduleCacheKey(type);
    scheduleMemoryCache.delete(key);
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn("Could not invalidate the schedule cache:", error);
    }
  }
}

function updateScheduleCache(updatedRows) {
  const rows = Array.isArray(updatedRows) ? updatedRows : [updatedRows];
  for (const row of rows) {
    if (!row?.id) continue;
    const jobType = row.job_type === "payload" ? "payload" : "email";
    const cached = readScheduleCache(jobType);
    if (!cached) continue;

    const updatedItems = cached.items.map((item) =>
      item.id === row.id ? { ...item, ...row } : item,
    );
    writeScheduleCache(jobType, updatedItems, cached.cachedAt);
  }
}

async function fetchAllSchedules(jobType) {
  const items = [];
  let page = 1;

  while (true) {
    const result = await loadSchedules(projectId, {
      page,
      pageSize: SCHEDULE_FETCH_PAGE_SIZE,
      filter: "all",
      jobType,
    });
    if (Array.isArray(result)) return result;
    if (!result || !Array.isArray(result.items)) {
      throw new Error("The schedules response was not in the expected format.");
    }

    items.push(...result.items);
    if (!result.hasMore) return items;
    if (result.items.length === 0) {
      throw new Error("The schedules response indicated more results but returned none.");
    }
    page += 1;
  }
}

function prefetchOtherChannelSchedules(jobType) {
  const otherJobType = jobType === "payload" ? "email" : "payload";
  if (readScheduleCache(otherJobType)) return;
  fetchAllSchedules(otherJobType)
    .then((items) => writeScheduleCache(otherJobType, items))
    .catch((error) => console.warn(`Could not prefetch ${otherJobType} schedules:`, error));
}

function renderCachedSchedules(allSchedules, filter = currentFilter) {
  const filtered = allSchedules.filter((schedule) => {
    if (schedule.status === "cancelled") return false;
    if (filter === "running") return schedule.status === "active";
    if (filter === "new") return Number(schedule.run_count || 0) === 0;
    if (filter === "paused") return schedule.status === "paused";
    return true;
  });
  totalSchedules = filtered.length;
  const lastPage = Math.max(1, Math.ceil(totalSchedules / pageSize));
  currentPage = Math.min(currentPage, lastPage);
  const start = (currentPage - 1) * pageSize;
  schedules = filtered.slice(start, start + pageSize);
  hasMoreSchedules = start + schedules.length < totalSchedules;
  renderRows();
}

/**
 * Reuses schedule data for five minutes; explicit refreshes and successful
 * schedule creation bypass the cache.
 */
async function loadRows(filter = currentFilter, { forceRefresh = false } = {}) {
  if (isFetchingSchedules) {
    reloadAfterCurrentFetch = true;
    reloadAfterCurrentFetchForce ||= forceRefresh;
    return;
  }

  const jobType = currentChannel === "payload" ? "payload" : "email";
  const shouldForceRefresh = forceRefresh || forceScheduleRefreshOnInit;
  const cached = shouldForceRefresh ? null : readScheduleCache(jobType);
  if (cached) {
    setLoading(false);
    renderCachedSchedules(cached.items, filter);
    return;
  }

  isFetchingSchedules = true;
  const startedAt = Date.now();
  setLoading(true);

  const TIMEOUT_MS = 6000;
  const MIN_LOADER_MS = 700;
  let fetchError = null;
  let fetchedItems = null;
  let timer = null;

  try {
    fetchedItems = await Promise.race([
      fetchAllSchedules(jobType),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS);
      }),
    ]);
    writeScheduleCache(jobType, fetchedItems);
    forceScheduleRefreshOnInit = false;
    prefetchOtherChannelSchedules(jobType);
  } catch (err) {
    fetchError = err;
    schedules = [];
    totalSchedules = 0;
    hasMoreSchedules = false;
  } finally {
    clearTimeout(timer);
    // Keep the red loader on screen long enough to be seen even when the
    // backend rejects instantly (offline/CORS).
    const remaining = MIN_LOADER_MS - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    setLoading(false);
    isFetchingSchedules = false;

    if (fetchError && fetchError.status === 404) {
      showProjectNotFound();
    } else if (fetchError) {
      showRequestError(fetchError.message === "timeout"
        ? "Loading schedules timed out. Check your connection and try again."
        : fetchError.message);
    } else {
      renderCachedSchedules(fetchedItems, filter);
    }
    if (reloadAfterCurrentFetch) {
      const forceQueuedRefresh = reloadAfterCurrentFetchForce;
      reloadAfterCurrentFetch = false;
      reloadAfterCurrentFetchForce = false;
      await loadRows(currentFilter, { forceRefresh: forceQueuedRefresh });
    }
  }
}

retryBtn?.addEventListener("click", () => {
  loadRows(currentFilter, { forceRefresh: true });
});

mailAccountBtn?.addEventListener("click", () => {
  if (!projectConnectionKnown) {
    showToast("error", "Could not verify this project's mail account. Check your connection and try again.");
    return;
  }
  if (currentProjectConnection?.status === "active") {
    showToast("info", "This project already has a mail account. Go in and see your projects.");
    return;
  }
  openConnectModal({
    projectId,
    projectName: currentProject?.project_name || currentProject?.business_name || "",
  });
});

const sidebar = document.getElementById("left-sidebar");
const sidebarCollapseButton = document.getElementById("sidebar-collapse-btn");
const viewMenuToggle = document.getElementById("drop-toggle");
const viewMenu = document.getElementById("drop");

viewMenuToggle?.addEventListener("click", () => {
  viewMenu?.classList.toggle("show");
});
viewMenu?.querySelector("[data-upgrade]")?.addEventListener("click", () => {
  viewMenu.classList.remove("show");
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".drop-wrap")) viewMenu?.classList.remove("show");
});

function closeScheduleMenus() {
  jobRows?.querySelectorAll(".schedule-row-menu").forEach((menu) => {
    menu.hidden = true;
    menu.style.position = "";
    menu.style.top = "";
    menu.style.left = "";
    menu.style.right = "";
    menu.style.maxHeight = "";
    menu.style.overflowY = "";
  });
  jobRows?.querySelectorAll(".schedule-menu-trigger").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function positionScheduleMenu(menu, trigger) {
  menu.hidden = false;
  menu.style.position = "fixed";
  menu.style.top = "0";
  menu.style.left = "0";
  menu.style.right = "auto";
  menu.style.maxHeight = `${Math.max(0, window.innerHeight - 16)}px`;
  menu.style.overflowY = "auto";

  const menuRect = menu.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const left = Math.max(8, Math.min(
    triggerRect.right - menuRect.width,
    window.innerWidth - menuRect.width - 8,
  ));
  let top = triggerRect.bottom + 4;
  if (top + menuRect.height > window.innerHeight - 8) {
    top = triggerRect.top - menuRect.height - 4;
  }
  top = Math.max(8, Math.min(top, window.innerHeight - menuRect.height - 8));

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function setSchedulesSidebarCollapsed(collapsed) {
  if (!sidebar) return;
  sidebar.classList.toggle("collapsed", collapsed);
  const label = collapsed ? "Expand navigation" : "Collapse navigation";
  sidebarCollapseButton?.setAttribute("aria-label", label);
  sidebarCollapseButton?.setAttribute("title", label);
  jobRows?.querySelectorAll("[data-sidebar-toggle]").forEach((button) => {
    button.textContent = collapsed ? "Collapse" : "Expand";
    button.setAttribute("aria-pressed", String(collapsed));
  });
}

function toggleSchedulesSidebar() {
  if (!sidebar) {
    console.error("The schedules sidebar is unavailable.");
    return;
  }
  setSchedulesSidebarCollapsed(!sidebar.classList.contains("collapsed"));
}

window.toggleSchedulesSidebar = toggleSchedulesSidebar;
window.bzScheduleFrequencyOption = getScheduleFrequencyOption;
sidebarCollapseButton?.addEventListener("click", toggleSchedulesSidebar);

// Wire up global hook for composer
window.loadRows = loadRows;

// Project & sidebar updates
async function updateProjectUI(project) {
  if (projectTitleEl && project) {
    projectTitleEl.textContent = project.project_name;
  }
  if (project) {
    document.title = `bzade - ${project.project_name}`;
  }
  // Sync right panel settings tab
  if (typeof window.bzRightPanel?.updateProjectInfo === 'function') {
    window.bzRightPanel.updateProjectInfo(project);
  }

  try {
    const loadedProjects = await loadProjects();
    const allProjects = Array.isArray(loadedProjects) ? loadedProjects : [];
    // /schedules clones the nav template (data-sub-nav).
    // uses the legacy side-panel ids. Support both so neither page regresses.
    const subNavs = document.querySelectorAll(
      "[data-sub-nav], #desktop-sibling-projects, #mobile-sibling-projects"
    );

    const renderSiblings = (container) => {
      if (!container) return;
      container.innerHTML = "";
      for (const p of allProjects) {
        const isCurrent = p.id === (project?.id || projectId);
        const projectName = p.project_name || p.business_name || "Untitled Project";
        const item = el("a", `nav-item ${isCurrent ? "active" : ""}`);
        item.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z"/><path d="M3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5"/></svg><span>${esc(projectName)}</span>`;
        item.href = `/schedules?project=${encodeURIComponent(p.id)}`;
        item.style.padding = "6px 10px";
        item.style.fontSize = "13px";
        item.title = p.business_name && p.business_name !== projectName
          ? `${projectName} Ã¢â‚¬â€ ${p.business_name}`
          : projectName;
        item.setAttribute("aria-label", item.title);
        container.appendChild(item);
      }
    };

    subNavs.forEach(renderSiblings);
  } catch (e) {
    console.error("Could not load sibling projects:", e);
  } finally {
    document.querySelectorAll("[data-subnav-skeleton]").forEach((node) => node.remove());
  }

  // If project has an active connected Gmail/mail account, show light channel switcher and hide connect btn
  try {
    const returnedFromGoogle = urlParams.has("google");
    currentProjectConnection = project?.id
      ? await loadProjectConnection(project.id, { refresh: returnedFromGoogle })
      : null;
    projectConnectionKnown = Boolean(project?.id);
    const hasConnection = currentProjectConnection?.status === "active";
    const channelSwitcher = document.getElementById("channel-switcher");
    const connectGmailBtn = document.getElementById("connect-gmail-btn");
    if (channelSwitcher && connectGmailBtn) {
      if (hasConnection) {
        channelSwitcher.style.display = "inline-flex";
        connectGmailBtn.style.display = "none";
      } else {
        channelSwitcher.style.display = "none";
        connectGmailBtn.style.display = "inline-flex";
      }
    }
  } catch (connErr) {
    projectConnectionKnown = false;
    console.warn("Could not check connections for channel switcher:", connErr);
  } finally {
    renderHeaderConnection();
    const hasProject = Boolean(project?.id);
    if (connectGmailBtn) connectGmailBtn.disabled = !hasProject;
    if (mailAccountBtn) mailAccountBtn.disabled = !hasProject;
  }
}

function renderHeaderConnection() {
  const account = document.getElementById("header-connected-account");
  const email = document.getElementById("header-connected-account-email");
  const sender = currentProjectConnection?.status === "active" ? currentProjectConnection : null;
  if (!account || !email) return;
  email.textContent = sender?.email_address || "";
  account.hidden = !sender;
  account.title = sender ? `Connected mail account: ${sender.email_address}` : "";
}

function isImmediate(draft) {
  return draft.schedule_type === "immediate";
}

// Populate connections in schedule overlay modal
async function populateConnections() {
  if (!emailConnSelect) return;
  try {
    const connection = currentProjectConnection?.status === "active" ? currentProjectConnection : null;
    emailConnSelect.innerHTML = "";
    if (!connection) {
      emailConnSelect.add(new Option("No mail account connected", ""));
    } else {
      const label = `${connection.email_address} (${connection.provider === "google" ? "Gmail" : "SMTP"})`;
      emailConnSelect.add(new Option(label, connection.id));
    }
  } catch (err) {
    console.warn("Could not populate connections select:", err);
  }
}

async function refreshSenderField() {
  renderHeaderConnection();
  const account = document.getElementById("cmp-mail-account");
  const emailLabel = document.getElementById("cmp-mail-account-email");
  if (!account || !emailLabel) return;

  try {
    const sender = currentProjectConnection?.status === "active" ? currentProjectConnection : null;
    emailLabel.textContent = sender?.email_address || "Mail account unavailable";
    emailLabel.dataset.email = sender?.email_address || "";
    account.title = sender
      ? `${sender.email_address} (${sender.provider === "google" ? "Gmail" : "SMTP"})`
      : "Connect a mail account first";
  } catch (err) {
    console.warn("Could not load the project mail account:", err);
    emailLabel.textContent = "Mail account unavailable";
    emailLabel.dataset.email = "";
    account.title = "Could not load the mail account for this project";
  }
}

// Filter buttons
filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter || "all";
    currentPage = 1;
    loadRows(currentFilter);
  });
});

// Pager: display the next set of schedule rows in place.
taskPagination?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (!button) return;

  const page = Number(button.dataset.page);
  if (!Number.isInteger(page) || page < 1 || page === currentPage) return;

  currentPage = page;
  loadRows(currentFilter);
  jobRows?.scrollIntoView?.({ block: "nearest" });
});

function openScheduleDetails(rowElement) {
  if (!scheduleDetailOverlay || !rowElement?.dataset.schedule) return;
  const schedule = JSON.parse(rowElement.dataset.schedule);
  const config = schedule.config || {};
  const value = (id, content) => {
    const node = document.getElementById(id);
    if (node) node.textContent = content || "Ã¢â‚¬â€";
  };
  const recipients = Array.isArray(config.recipients) ? config.recipients.join(", ") : "";
  const parser = new DOMParser();
  const message = parser.parseFromString(String(config.body || ""), "text/html").body.textContent.trim();
  value("schedule-detail-name", schedule.name || config.subject || "Untitled task");
  value("schedule-detail-type", schedule.job_type || "email");
  const statusNode = document.getElementById("schedule-detail-status");
  if (statusNode) statusNode.innerHTML = statusBadge(schedule.status);
  value("schedule-detail-created", formatScheduleDateTime(schedule.created_at));
  value("schedule-detail-frequency", getScheduleFrequency(schedule));
  value("schedule-detail-next", formatScheduleDateTime(schedule.next_run_at));
  value("schedule-detail-last", formatScheduleDateTime(schedule.last_run_at));
  value("schedule-detail-timezone", "UTC");
  value("schedule-detail-recipients", recipients || "No recipients");
  value("schedule-detail-subject", config.subject || "No subject");
  value("schedule-detail-message", message || "No message content");
  value("schedule-detail-error", schedule.last_failure_reason || "");
  const errorWrap = document.getElementById("schedule-detail-error-wrap");
  if (errorWrap) errorWrap.hidden = !schedule.last_failure_reason;
  const detailEditButton = document.getElementById("schedule-detail-edit");
  if (detailEditButton) {
    detailEditButton.hidden = schedule.status !== "active" && schedule.status !== "paused";
  }
  scheduleDetailOverlay.dataset.schedule = JSON.stringify(schedule);
  scheduleDetailOverlay.classList.add("open");
  scheduleDetailOverlay.setAttribute("aria-hidden", "false");
}

function closeScheduleDetails() {
  scheduleDetailOverlay?.classList.remove("open");
  scheduleDetailOverlay?.setAttribute("aria-hidden", "true");
}

scheduleDetailOverlay?.addEventListener("click", (event) => {
  if (event.target === scheduleDetailOverlay || event.target.closest("[data-detail-close]")) {
    closeScheduleDetails();
    return;
  }
  if (event.target.closest("[data-detail-edit]")) {
    const schedule = JSON.parse(scheduleDetailOverlay.dataset.schedule || "null");
    if (schedule && typeof window.bzComposer?.openEdit === "function") {
      closeScheduleDetails();
      window.bzComposer.openEdit(null, schedule);
    }
  }
});

jobRows?.addEventListener("click", async (event) => {
  const mobileCheckbox = event.target.closest(".schedule-mobile-select input");
  if (mobileCheckbox) {
    event.preventDefault();
    mobileCheckbox.closest(".schedule-mobile-card")?.querySelector(".schedule-menu-trigger")?.click();
    event.stopPropagation();
    return;
  }

  const detailButton = event.target.closest("[data-view-schedule]");
  if (detailButton) {
    const row = detailButton.closest("[data-schedule]");
    if (row) openScheduleDetails(row);
    return;
  }

  const menuTrigger = event.target.closest(".schedule-menu-trigger");
  if (menuTrigger) {
    const menu = menuTrigger.parentElement.querySelector(".schedule-row-menu");
    const opening = menu.hidden;
    closeScheduleMenus();
    const sidebarToggle = menu.querySelector("[data-sidebar-toggle]");
    const sidebarCollapsed = sidebar?.classList.contains("collapsed") || false;
    if (sidebarToggle) {
      sidebarToggle.textContent = sidebarCollapsed ? "Collapse" : "Expand";
      sidebarToggle.setAttribute("aria-pressed", String(sidebarCollapsed));
    }
    if (opening) positionScheduleMenu(menu, menuTrigger);
    menuTrigger.setAttribute("aria-expanded", String(opening));
    event.stopPropagation();
    return;
  }

  const sidebarToggle = event.target.closest("[data-sidebar-toggle]");
  if (sidebarToggle) {
    toggleSchedulesSidebar();
    const actions = sidebarToggle.closest(".schedule-row-actions");
    const menu = actions?.querySelector(".schedule-row-menu");
    const trigger = actions?.querySelector(".schedule-menu-trigger");
    if (menu && trigger) positionScheduleMenu(menu, trigger);
    event.stopPropagation();
    return;
  }

  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    const row = editButton.closest("[data-schedule]");
    const schedule = row ? JSON.parse(row.dataset.schedule || "null") : null;
    if (schedule && typeof window.bzComposer?.openEdit === "function") {
      window.bzComposer.openEdit(null, schedule);
    }
    return;
  }

  const deleteButton = event.target.closest("[data-delete-schedule]");
  if (deleteButton) {
    const id = deleteButton.dataset.deleteSchedule;
    if (!id || !window.confirm("Delete this schedule? This cannot be undone.")) return;
    deleteButton.disabled = true;
    try {
      const result = await changeStatus("remove", [id]);
      if (result.failedCount) throw new Error("Could not delete this schedule.");
      updateScheduleCache(result.updated);
      showToast("success", "Schedule deleted.");
      await loadRows(currentFilter);
    } catch (error) {
      deleteButton.disabled = false;
      showToast("error", error.message || "Could not delete this schedule.");
    }
    return;
  }

  const actionButton = event.target.closest("[data-schedule-action]");
  if (actionButton) {
    const action = actionButton.dataset.scheduleAction;
    const id = actionButton.dataset.id;
    if (!["pause", "resume"].includes(action) || !id) return;
    actionButton.disabled = true;
    try {
      const result = await changeStatus(action, [id]);
      if (result.failedCount) throw new Error(`Could not ${action} this schedule.`);
      updateScheduleCache(result.updated);
      showToast("success", `Schedule ${action === "pause" ? "paused" : "resumed"}.`);
      await loadRows(currentFilter);
    } catch (error) {
      actionButton.disabled = false;
      showToast("error", error.message || `Could not ${action} this schedule.`);
    }
    return;
  }

});

document.addEventListener("click", (event) => {
  if (event.target.closest(".schedule-row-actions")) return;
  closeScheduleMenus();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeScheduleDetails();
});

footerAddScheduleBtn?.addEventListener("click", () => {
  if (typeof window.bzComposer?.openCreate === "function") window.bzComposer.openCreate();
});

window.addEventListener("resize", () => {
  const nextPageSize = window.matchMedia("(max-width: 767px)").matches ? 1 : 4;
  if (nextPageSize === pageSize) return;
  pageSize = nextPageSize;
  currentPage = 1;
  loadRows(currentFilter);
});

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (window.innerWidth < 768) return;
    jobRows?.querySelector(".schedule-table-scroll")?.scrollTo?.({ left: 0 });
  }, 180);
});

const NAV_TOASTS = {
  audiences: "Audiences Ã¢â‚¬â€ coming soon. Track subscriber segments here.",
  notifications: "Coming soon.",
  "api-keys": "Coming soon.",
  "email-template": "Email templates Ã¢â‚¬â€ coming soon. Save and reuse your best emails here.",
};

let draftsOverlay = null;

function openDrafts() {
  if (!draftsOverlay) {
    draftsOverlay = document.createElement("div");
    draftsOverlay.className = "drafts-overlay";
    draftsOverlay.style.cssText = "position:fixed;inset:0;z-index:4700;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(17,24,39,.55);";
    draftsOverlay.innerHTML = `
      <section role="dialog" aria-modal="true" aria-labelledby="drafts-title" style="width:min(560px,100%);max-height:min(680px,90vh);display:flex;flex-direction:column;background:#fff;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.2);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #e5e7eb;">
          <div>
            <p class="drafts-kicker">Your saved drafts</p>
            <h2 id="drafts-title" style="margin:0;font-size:18px;color:#111827;">Email drafts</h2>
          </div>
          <button type="button" data-drafts-close aria-label="Close drafts" style="border:0;background:transparent;font-size:24px;line-height:1;cursor:pointer;color:#6b7280;">&times;</button>
        </div>
        <div data-drafts-list style="padding:12px 20px;overflow:auto;"></div>
      </section>`;
    document.body.appendChild(draftsOverlay);
    draftsOverlay.addEventListener("click", (event) => {
      if (event.target === draftsOverlay || event.target.closest("[data-drafts-close]")) {
        draftsOverlay.remove();
        draftsOverlay = null;
        return;
      }
      const openButton = event.target.closest("[data-open-draft]");
      if (openButton) {
        const draft = readDrafts().find((item) => item.id === openButton.dataset.openDraft);
        if (draft && typeof window.bzComposer?.openDraft === "function") {
          draftsOverlay.remove();
          draftsOverlay = null;
          window.bzComposer.openDraft(draft);
        }
        return;
      }
      const deleteButton = event.target.closest("[data-delete-draft]");
      if (deleteButton) {
        try {
          deleteDraft(deleteButton.dataset.deleteDraft);
          renderDraftsList();
          showToast("success", "Draft deleted.");
        } catch (err) {
          showToast("error", err.message || "Could not delete this draft.");
        }
      }
    });
  }
  renderDraftsList();
}

function renderDraftsList() {
  if (!draftsOverlay) return;
  const list = draftsOverlay.querySelector("[data-drafts-list]");
  const drafts = readDrafts();
  list.replaceChildren();
  if (drafts.length === 0) {
    list.textContent = "No saved drafts yet. Use Save draft in the schedule editor to keep an email here.";
    list.style.cssText = "padding:24px 20px;overflow:auto;color:#6b7280;font-size:14px;";
    return;
  }
  list.style.cssText = "padding:12px 20px;overflow:auto;";
  for (const draft of drafts) {
    const row = document.createElement("article");
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #f3f4f6;";
    const detail = document.createElement("div");
    detail.style.cssText = "min-width:0;";
    const name = document.createElement("strong");
    name.textContent = draft.name || "Untitled draft";
    const subject = document.createElement("p");
    subject.style.cssText = "margin:3px 0 0;color:#6b7280;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    subject.textContent = draft.subject || "No subject";
    detail.append(name, subject);
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;flex-shrink:0;";
    const open = document.createElement("button");
    open.type = "button";
    open.dataset.openDraft = draft.id;
    open.textContent = "Open";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.deleteDraft = draft.id;
    remove.textContent = "Delete";
    for (const button of [open, remove]) {
      button.style.cssText = "padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151;cursor:pointer;font:inherit;font-size:13px;";
    }
    actions.append(open, remove);
    row.append(detail, actions);
    list.appendChild(row);
  }
}

document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-nav-toast]");
  if (!trigger) return;
  event.preventDefault();
  if (trigger.dataset.navToast === "drafts") {
    openDrafts();
    return;
  }
  const message = NAV_TOASTS[trigger.dataset.navToast];
  if (message) showToast("info", message);
});

// Shared across the schedule page and legacy jobs page headers.
try {
  document.body.dataset.theme = localStorage.getItem("bzade_theme") === "dark" ? "dark" : "";
} catch (err) {
  console.error("Could not load theme preference:", err);
}
// Sign out buttons in the cloned sidebar/drawer
document.querySelectorAll("[data-logout]").forEach((button) => {
  button.addEventListener("click", async () => {
    invalidateScheduleCache();
    try {
      await signOut();
    } catch (err) {
      console.error(err);
    }
    window.location.href = "/";
  });
});

function openScheduleModal() {
  scheduleOverlay?.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeScheduleModal() {
  scheduleOverlay?.classList.remove("open");
  document.body.style.overflow = "";
}

connectGmailBtn?.addEventListener("click", () => {
  if (!projectConnectionKnown) {
    showToast("error", "Could not verify this project's mail account. Check your connection and try again.");
    return;
  }
  if (currentProjectConnection?.status === "active") {
    showToast("info", "This project already has a mail account. Go in and see your projects.");
    return;
  }
  openConnectModal({
    projectId,
    projectName: currentProject?.project_name || currentProject?.business_name || "",
  });
});

addScheduleBtn?.addEventListener("click", () => {
  const composer = document.getElementById("job-composer");
  if (composer?.classList.contains("sched-editor-overlay") && typeof window.bzComposer?.openCreate === "function") {
    window.bzComposer.openCreate();
    return;
  }
  openScheduleModal();
});
emptyAddScheduleBtn?.addEventListener("click", () => {
  if (typeof window.bzComposer?.openCreate === "function") {
    window.bzComposer.openCreate();
    return;
  }
  openScheduleModal();
});
closeScheduleBtn?.addEventListener("click", closeScheduleModal);
scheduleOverlay?.addEventListener("click", (e) => {
  if (e.target === scheduleOverlay) closeScheduleModal();
});


// Clean tokens / hash fragments from URL
if (window.location.hash && (window.location.hash.includes("access_token") || window.location.hash.includes("refresh_token") || window.location.hash === "#")) {
  window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
}

// Channel switcher pills (Emails vs Payloads)
const channelSwitcherEl = document.getElementById("channel-switcher");
if (channelSwitcherEl) {
  const pills = channelSwitcherEl.querySelectorAll(".channel-pill");
  pills.forEach((pill) => {
    pill.addEventListener("click", async () => {
      const channel = pill.dataset.channel || "emails";
      if (channel === currentChannel) return;
      currentChannel = channel;
      currentPage = 1;
      pills.forEach((p) => {
        p.classList.remove("active");
        p.style.background = "transparent";
        p.style.color = "#6b7280";
        p.style.fontWeight = "500";
        p.style.boxShadow = "none";
      });
      pill.classList.add("active");
      pill.style.background = "#ffffff";
      pill.style.color = "#111827";
      pill.style.fontWeight = "600";
      pill.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
      await loadRows(currentFilter);
    });
  });
}

// Schedule form submission (Overlay modal)
scheduleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  closeScheduleModal();
  setLoading(true);
  let created = false;

  try {
    const form = new FormData(scheduleForm);
    const type = String(form.get("schedule_type") || "one_time");
    const payload = {
      project_id: projectId,
      name: String(form.get("name") || "").trim().replace(/(^|[\s'-])([a-z])/gi, (match, separator, letter) => `${separator}${letter.toUpperCase()}`),
      job_type: "email",
      schedule_type: type,
      email_connection_id: String(form.get("email_connection_id") || "") || null,
      timezone: "UTC",
      scheduled_for: String(form.get("scheduled_for") || ""),
      config: {
        recipients: String(form.get("recipient") || "")
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
        subject: String(form.get("subject") || "").trim(),
        body: String(form.get("body") || ""),
        body_type: "html",
      },
    };
    if (type === "recurring") {
      payload.schedule_rule = { every: String(form.get("every") || "") };
    };

    await addSchedule(payload);
    created = true;
    currentPage = 1;
    showToast("success", "Schedule created successfully.");
  } catch (err) {
    toastError(err.message || "Unable to create schedule.");
  } finally {
    if (created) {
      invalidateScheduleCache();
      await loadRows(currentFilter, { forceRefresh: true });
    } else {
      await loadRows();
    }
  }
});


// Composer submission hooks (Inline composer in Column 2)
async function senderFor(draft) {
  const sender = currentProjectConnection?.status === "active" ? currentProjectConnection : null;
  if (!sender) {
    throw new Error(`Connect a mail account first, then try again.`);
  }
  return sender;
}

function payloadFor(draft, sender) {
  const payload = {
    project_id: projectId,
    email_connection_id: sender?.id || null,
    name: draft.name,
    schedule_type: draft.schedule_type,
    timezone: "UTC",
    config: {
      recipients: draft.recipients,
      subject: draft.subject,
      body: draft.body,
      body_type: "html",
      spreadsheet: draft.spreadsheet || null,
    },
  };

  if (draft.scheduled_for) payload.scheduled_for = draft.scheduled_for;
  if (draft.schedule_rule) payload.schedule_rule = draft.schedule_rule;

  return payload;
}

window.bzComposer = window.bzComposer || {};
window.bzComposer.saveDraft = saveDraft;
window.bzComposer.toast = showToast;
window.bzComposer.refreshSender = refreshSenderField;

window.bzComposer.onSubmit = async (draft) => {
  setLoading(true);
  let saved = false;
  let created = false;
  let succeeded = false;
  try {
    const sender = await senderFor(draft);
    const payload = payloadFor(draft, sender);
    if (isImmediate(draft)) {
      const response = await sendNow(payload);
      saved = true;
      if (response.data?.run?.status !== "succeeded") {
        throw new Error(response.data?.run?.error || "The email could not be sent.");
      }
    } else {
      await addSchedule(payload);
      saved = true;
      created = true;
    }
    succeeded = true;
  } catch (err) {
    // DB rejected: re-throw so composer shows error inline
    toastError(err.message || "Could not save task.");
    throw err;
  } finally {
    if (created) {
      currentPage = 1;
      invalidateScheduleCache();
      await loadRows(currentFilter, { forceRefresh: true });
    } else {
      await loadRows();
    }
    if (succeeded && typeof window.bzShowSuccess === "function") {
      window.bzShowSuccess();
    }
  }
};

window.bzComposer.onUpdate = async (id, draft) => {
  setLoading(true);
  let saved = false;
  let updatedSchedule = null;
  try {
    const sender = await senderFor(draft);
    updatedSchedule = await updateSchedule(id, payloadFor(draft, sender));
    saved = true;
  } catch (err) {
    toastError(err.message || "Could not update task.");
    throw err;
  } finally {
    if (saved) {
      currentPage = 1;
      updateScheduleCache(updatedSchedule);
    }
    await loadRows();
    if (saved && typeof window.bzShowSuccess === "function") {
      window.bzShowSuccess();
    } else if (saved) {
      showToast("success", "Task updated.");
    }
  }
};

async function init() {
  showGoogleResult();
  renderPagination();
  void loadRows();

  void loadProject(projectId)
    .then(async (project) => {
      currentProject = project;
      await updateProjectUI(project);
      await populateConnections();
      await refreshSenderField();
    })
    .catch((err) => console.warn("Could not load project info:", err));

  // Wire up Project Settings & Delete Project Modals
  const deleteModal = document.getElementById("delete-project-modal");
  const deleteModalName = document.getElementById("delete-modal-project-name");
  const deleteModalCancel = document.getElementById("delete-modal-cancel");
  const deleteModalClose = document.getElementById("delete-modal-close");
  const deleteModalConfirm = document.getElementById("delete-modal-confirm");
  const settingsModal = document.getElementById("project-settings-modal");
  const settingsActiveName = document.getElementById("settings-active-name");
  const settingsModalClose = document.getElementById("settings-modal-close");
  const settingsDeleteBtn = document.getElementById("settings-delete-btn");

  function openSettings() {
    const pName = currentProject?.project_name || currentProject?.business_name || "Active Project";
    if (settingsActiveName) settingsActiveName.textContent = pName;
    if (settingsModal) settingsModal.style.display = "flex";
  }

  function closeSettings() {
    if (settingsModal) settingsModal.style.display = "none";
  }

  function openDeleteModal() {
    const pName = currentProject?.project_name || currentProject?.business_name || "Active Project";
    if (deleteModalName) deleteModalName.textContent = pName;
    if (deleteModal) deleteModal.style.display = "flex";
  }

  function closeDeleteModal() {
    if (deleteModal) deleteModal.style.display = "none";
  }

  // Wire settings navigation items
  document.querySelectorAll('a[onclick*="Project settings"], [data-action="open-settings"]').forEach((link) => {
    link.removeAttribute("onclick");
    link.addEventListener("click", (e) => {
      e.preventDefault();
      openSettings();
    });
  });

  settingsModalClose?.addEventListener("click", closeSettings);
  settingsModal?.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettings();
  });

  settingsDeleteBtn?.addEventListener("click", () => {
    closeSettings();
    openDeleteModal();
  });

  deleteModalCancel?.addEventListener("click", closeDeleteModal);
  deleteModalClose?.addEventListener("click", closeDeleteModal);
  deleteModal?.addEventListener("click", (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });

  deleteModalConfirm?.addEventListener("click", async () => {
    if (!currentProject) return;
    deleteModalConfirm.disabled = true;
    deleteModalConfirm.textContent = "Deleting...";

    try {
      await removeProject(currentProject.id);
      showToast("success", "Project deleted successfully.");
      closeDeleteModal();
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 500);
    } catch (err) {
      showToast("error", err.message || "Could not delete project.");
      deleteModalConfirm.disabled = false;
      deleteModalConfirm.textContent = "Delete Project";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDeleteModal();
      closeSettings();
    }
  });

  // Wire up preview button in the inline composer
  const previewBtn = document.getElementById("cmp-preview-btn");
  const previewPanel = document.getElementById("cmp-preview-panel");
  const previewFrame = document.getElementById("cmp-preview-frame");
  const cmpBody = document.getElementById("cmp-body");

  if (previewBtn && previewPanel && previewFrame && cmpBody) {
    previewBtn.addEventListener("click", () => {
      const html = cmpBody.value.trim();
      const isVisible = previewPanel.style.display !== "none";
      if (isVisible) {
        previewPanel.style.display = "none";
        previewBtn.textContent = "";
        previewBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Preview`;
      } else {
        previewPanel.style.display = "block";
        previewBtn.textContent = "Hide preview";
        const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
        doc.open();
        doc.write(html || "<p style='color:#999;font-size:13px;padding:16px;'>Nothing to preview yet.</p>");
        doc.close();
      }
    });
  }

  // Phone drawer. /schedules also wires this inline; the calls are
  // Idempotent so double-binding is harmless.
  const drawerOverlay = document.getElementById("mobile-sidebar-overlay");
  const drawerOpenBtn = document.getElementById("hamburger-btn");
  const drawerCloseBtn = document.getElementById("sidebar-close-btn");
  const setDrawer = (open) => {
    drawerOverlay?.classList.toggle("open", open);
    drawerOpenBtn?.setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
  };
  drawerOpenBtn?.addEventListener("click", () => setDrawer(true));
  drawerCloseBtn?.addEventListener("click", () => setDrawer(false));
  drawerOverlay?.addEventListener("click", (e) => {
    if (e.target === drawerOverlay) setDrawer(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setDrawer(false);
  });
}

await init();
const sheetPickerResumeProject = sessionStorage.getItem("bzResumeSheetsPicker");
if (
  sheetPickerResumeProject === projectId &&
  Boolean(urlParams.get("google"))
) {
  sessionStorage.removeItem("bzResumeSheetsPicker");
  const savedComposer = sessionStorage.getItem("bzResumeSheetsComposer");
  sessionStorage.removeItem("bzResumeSheetsComposer");
  if (savedComposer) {
    try {
      const state = JSON.parse(savedComposer);
      window.bzComposer.openCreate?.();
      document.getElementById("cmp-name").value = state.name || "";
      document.getElementById("cmp-recipients").value = state.recipients || "";
      document.querySelector('#cmp-form [name="subject"]').value = state.subject || "";
      document.getElementById("cmp-body").value = state.body || "";
      document.getElementById("cmp-date").value = state.date || "";
      document.getElementById("cmp-time").value = state.time || "09:00";
      const howSelect = document.getElementById("cmp-how");
      howSelect.value = state.how || "once";
      howSelect.dispatchEvent(new Event("change", { bubbles: true }));
      window.bzComposer.setSheetPlan?.(state.spreadsheet || null);
    } catch (error) {
      showToast("error", `Could not restore the schedule draft: ${error.message}`);
    }
  } else {
    window.bzComposer.openCreate?.();
  }
  openSheetPicker();
}

/* The sidebar drawer, project sub-list and help dropdown are wired by the
   inline layout script in /schedules, so only the invite modal is left. */
inviteModal = initInviteModal();
initAccountMenu({ onInvite: () => inviteModal.open() });
initPaymentModal();
