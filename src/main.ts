import "./styles.css";
import {
  fetchRemoteState,
  isRemote,
  saveRemoteState,
  submitReport,
  type ApiState,
} from "./api";

type OutcomeKey =
  | "courseNA"
  | "feesHesitation"
  | "discussParents"
  | "needsFollowUp"
  | "confirmedVisits"
  | "notInterested"
  | "alreadyVisited"
  | "alreadyAdmitted"
  | "hungUp"
  | "wrongNumber";

type CallState = Record<OutcomeKey, number> & { notReceived: number };

type OutcomeDefinition = {
  key: OutcomeKey;
  label: string;
  code: string;
  tone: string;
};

const STORAGE_KEY = "calltrack-state-v1";
const initialState: CallState = {
  courseNA: 0,
  feesHesitation: 0,
  discussParents: 0,
  needsFollowUp: 0,
  confirmedVisits: 0,
  notInterested: 0,
  alreadyVisited: 0,
  alreadyAdmitted: 0,
  hungUp: 0,
  wrongNumber: 0,
  notReceived: 0,
};

const outcomes: OutcomeDefinition[] = [
  { key: "courseNA", label: "Course N/A", code: "CN", tone: "olive" },
  { key: "feesHesitation", label: "Fees Hesitation", code: "FH", tone: "clay" },
  {
    key: "discussParents",
    label: "Discuss with Parents",
    code: "DP",
    tone: "blue",
  },
  { key: "needsFollowUp", label: "Needs Follow-up", code: "NF", tone: "amber" },
  {
    key: "confirmedVisits",
    label: "Confirmed Visits",
    code: "CV",
    tone: "sea",
  },
  { key: "notInterested", label: "Not Interested", code: "NI", tone: "clay" },
  { key: "alreadyVisited", label: "Already Visited", code: "AV", tone: "blue" },
  {
    key: "alreadyAdmitted",
    label: "Already Admitted",
    code: "AA",
    tone: "sea",
  },
  { key: "hungUp", label: "Hung Up", code: "HU", tone: "clay" },
  { key: "wrongNumber", label: "Wrong Number", code: "WN", tone: "olive" },
];

type Cluster = { code: string; college: string };

const CLUSTER_STORAGE_KEY = "calltrack-clusters-v1";
const OPERATOR_STORAGE_KEY = "calltrack-operator";

function loadClusters(): Cluster[] {
  try {
    const raw = localStorage.getItem(CLUSTER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Cluster => {
        const item = entry as Partial<Cluster> | null;
        return Boolean(
          item &&
          typeof item.code === "string" &&
          typeof item.college === "string",
        );
      })
      .map((entry) => ({
        code: entry.code.slice(0, 24),
        college: entry.college.slice(0, 120),
      }));
  } catch {
    return [];
  }
}

function saveClusters(): void {
  localStorage.setItem(CLUSTER_STORAGE_KEY, JSON.stringify(clusters));
  lastSaved = new Date();
}

type ProspectStatus = "prospect" | "visited" | "dead";

const PROSPECT_STATUSES: ProspectStatus[] = ["prospect", "visited", "dead"];

const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  prospect: "Prospect",
  visited: "Visited",
  dead: "Dead",
};

type VisitProspect = {
  name: string;
  contact: string;
  visitDate: string;
  college: string;
  remarks: string;
  status: ProspectStatus;
};

const PROSPECT_STORAGE_KEY = "calltrack-prospects-v1";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateKey(key: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month: month - 1, day };
}

function formatDateKey(
  key: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!DATE_PATTERN.test(key)) return "";
  const { year, month, day } = parseDateKey(key);
  return new Intl.DateTimeFormat(
    "en-GB",
    options ?? { day: "2-digit", month: "short", year: "numeric" },
  ).format(new Date(year, month, day));
}

function isProspectStatus(value: unknown): value is ProspectStatus {
  return PROSPECT_STATUSES.includes(value as ProspectStatus);
}

function sanitizeProspects(input: unknown): VisitProspect[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry): entry is VisitProspect => {
      const item = entry as Partial<VisitProspect> | null;
      return Boolean(
        item &&
        typeof item === "object" &&
        typeof item.name === "string" &&
        item.name.trim(),
      );
    })
    .map((entry) => ({
      name: entry.name.slice(0, 80),
      contact: String(entry.contact ?? "").slice(0, 40),
      visitDate: DATE_PATTERN.test(String(entry.visitDate ?? ""))
        ? String(entry.visitDate)
        : "",
      college: String(entry.college ?? "").slice(0, 120),
      remarks: String(entry.remarks ?? "").slice(0, 200),
      status: isProspectStatus(entry.status) ? entry.status : "prospect",
    }));
}

function loadProspects(): VisitProspect[] {
  try {
    const raw = localStorage.getItem(PROSPECT_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeProspects(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveProspects(): void {
  localStorage.setItem(PROSPECT_STORAGE_KEY, JSON.stringify(prospects));
  lastSaved = new Date();
}

const BACKUP_FILE_PREFIX = "calltrack-prospects-";
const DASHBOARD_CLEARED_KEY = "calltrack-dashboard-cleared-v1";

function loadDashboardCleared(): Set<string> {
  try {
    const raw = localStorage.getItem(DASHBOARD_CLEARED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter(
        (key): key is string =>
          typeof key === "string" && DATE_PATTERN.test(key),
      ),
    );
  } catch {
    return new Set();
  }
}

function saveDashboardCleared(): void {
  localStorage.setItem(
    DASHBOARD_CLEARED_KEY,
    JSON.stringify([...dashboardCleared]),
  );
}

function downloadProspectsBackup(): void {
  const payload = {
    kind: "calltrack-prospects",
    version: 1,
    exportedAt: new Date().toISOString(),
    count: prospects.length,
    prospects,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${BACKUP_FILE_PREFIX}${todayKey()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  reportStatus = prospects.length
    ? `Downloaded a backup of ${prospects.length} prospect${prospects.length === 1 ? "" : "s"}.`
    : "There are no prospects to back up yet.";
  render();
}

function applyProspectsBackup(raw: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    reportStatus =
      "That file is not valid JSON. Choose a file downloaded from this page.";
    render();
    return;
  }
  const incoming = Array.isArray(parsed)
    ? parsed
    : (parsed as { prospects?: unknown } | null)?.prospects;
  const restored = sanitizeProspects(incoming);
  if (
    !Array.isArray(incoming) ||
    (incoming.length > 0 && restored.length === 0)
  ) {
    reportStatus = "That file does not contain a usable prospect list.";
    render();
    return;
  }
  const replacing = prospects.length;
  const confirmed = window.confirm(
    replacing
      ? `Restore ${restored.length} prospect${restored.length === 1 ? "" : "s"}? This replaces the ${replacing} currently on this device.`
      : `Restore ${restored.length} prospect${restored.length === 1 ? "" : "s"}?`,
  );
  if (!confirmed) {
    reportStatus = "Restore cancelled.";
    render();
    return;
  }
  prospects = restored;
  saveProspects();
  reportStatus = `Restored ${restored.length} prospect${restored.length === 1 ? "" : "s"} from backup.`;
  render();
}

function handleBackupFile(file: File | undefined): void {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => applyProspectsBackup(String(reader.result ?? ""));
  reader.onerror = () => {
    reportStatus = "That file could not be read.";
    render();
  };
  reader.readAsText(file);
}

function todayKey(): string {
  const now = new Date();
  return toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function countsByDate(
  list: VisitProspect[],
): Map<string, Record<ProspectStatus, number>> {
  const map = new Map<string, Record<ProspectStatus, number>>();
  for (const prospect of list) {
    if (!DATE_PATTERN.test(prospect.visitDate)) continue;
    let entry = map.get(prospect.visitDate);
    if (!entry) {
      entry = { prospect: 0, visited: 0, dead: 0 };
      map.set(prospect.visitDate, entry);
    }
    entry[prospect.status] += 1;
  }
  return map;
}

function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** Six weeks of cells so the grid height never jumps between months. */
function buildCalendarCells(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  const cells: string[] = [];
  for (let index = 0; index < 42; index += 1) {
    const day = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + index,
    );
    cells.push(toDateKey(day.getFullYear(), day.getMonth(), day.getDate()));
  }
  return cells;
}

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("App root not found");
const app: HTMLDivElement = root;

let state = loadState();
let clusters = loadClusters();
let prospects = loadProspects();
let dashboardCleared = loadDashboardCleared();
let selectedDate = todayKey();
const now = new Date();
let calendarYear = now.getFullYear();
let calendarMonth = now.getMonth();
let operatorName = localStorage.getItem(OPERATOR_STORAGE_KEY) ?? "";
let reportStatus = "";
let lastSaved = new Date();
let syncLabel = isRemote ? "Connecting to server" : "Saved locally";

const COUNTER_KEYS: Array<keyof CallState> = [
  ...outcomes.map((outcome) => outcome.key),
  "notReceived",
];

function applyRemoteState(remote: ApiState): void {
  const next = { ...initialState };
  COUNTER_KEYS.forEach((key) => {
    const value = Number(remote[key]);
    if (Number.isFinite(value)) next[key] = Math.max(0, Math.floor(value));
  });
  state = next;
  saveState();
  render();
}

async function hydrateFromServer(): Promise<void> {
  if (!isRemote) return;
  try {
    const record = await fetchRemoteState();
    applyRemoteState(record.state);
    syncLabel = "Synced with server";
  } catch {
    syncLabel = "Offline, saved locally";
  }
  render();
}

let pendingSync: number | undefined;

function syncToServer(): void {
  if (!isRemote) return;
  window.clearTimeout(pendingSync);
  pendingSync = window.setTimeout(() => {
    void saveRemoteState(state)
      .then(() => {
        syncLabel = "Synced with server";
        render();
      })
      .catch(() => {
        syncLabel = "Sync failed, saved locally";
        render();
      });
  }, 400);
}

function loadState(): CallState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...initialState };
    const parsed = JSON.parse(raw) as Partial<CallState>;
    const safeState = { ...initialState };
    (Object.keys(safeState) as Array<keyof CallState>).forEach((key) => {
      const value = Number(parsed[key]);
      if (Number.isFinite(value))
        safeState[key] = Math.max(0, Math.floor(value));
    });
    return safeState;
  } catch {
    return { ...initialState };
  }
}

function totalReceived(): number {
  return outcomes.reduce((sum, outcome) => sum + state[outcome.key], 0);
}

function totalCalls(): number {
  return totalReceived() + state.notReceived;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function percent(value: number, total: number): string {
  return total === 0 ? "0%" : `${Math.round((value / total) * 100)}%`;
}

function saveState(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  lastSaved = new Date();
}

function setCount(key: keyof CallState, nextValue: number): void {
  if (!Number.isFinite(nextValue)) return;
  state[key] = Math.max(0, Math.floor(nextValue));
  saveState();
  render();
  syncToServer();
}

/** Zero every call counter, locally and on the server. */
function clearCountersToZero(): void {
  const received = totalReceived();
  const calls = totalCalls();
  if (calls === 0) {
    reportStatus = "Every counter is already at 0.";
    render();
    return;
  }
  const shouldClear = window.confirm(
    `Set every call counter to 0? This clears ${formatNumber(calls)} calls (${formatNumber(received)} received). Prospects and clusters are not affected.`,
  );
  if (!shouldClear) return;
  state = Object.fromEntries(COUNTER_KEYS.map((key) => [key, 0])) as CallState;
  saveState();
  reportStatus = "All call counters set to 0.";
  render();
  syncToServer();
}

function metricBlock(
  label: string,
  value: number,
  note: string,
  className: string,
  key?: keyof CallState,
): string {
  const control = key
    ? `<div class="metric-adjust" data-control="count" data-key="${key}">
        <button class="step-button" data-action="decrement" aria-label="Decrease ${label}">−</button>
        <input class="metric-input" data-input="${key}" aria-label="${label} count" type="number" min="0" value="${value}" />
        <button class="step-button" data-action="increment" aria-label="Increase ${label}">+</button>
      </div>`
    : `<div class="metric-value">${formatNumber(value)}</div>`;
  return `<section class="metric-block ${className}">
    <div class="metric-kicker"><span>${label}</span><span class="metric-index">${className === "metric-anchor" ? "01" : className === "metric-received" ? "02" : "03"}</span></div>
    ${control}
    <p class="metric-note">${note}</p>
  </section>`;
}

function outcomeRow(outcome: OutcomeDefinition): string {
  const count = state[outcome.key];
  return `<div class="outcome-row">
    <div class="outcome-identity">
      <span class="outcome-code tone-${outcome.tone}">${outcome.code}</span>
      <div>
        <span class="outcome-label">${outcome.label}</span>
        <span class="outcome-share">${percent(count, totalReceived())} of received</span>
      </div>
    </div>
    <div class="row-control" data-control="count" data-key="${outcome.key}">
      <button class="step-button" data-action="decrement" aria-label="Decrease ${outcome.label}">−</button>
      <input class="count-input" data-input="${outcome.key}" aria-label="${outcome.label} count" type="number" min="0" value="${count}" />
      <button class="step-button" data-action="increment" aria-label="Increase ${outcome.label}">+</button>
    </div>
  </div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clusterRow(cluster: Cluster, index: number): string {
  return `<div class="cluster-row">
    <span class="cluster-badge">${escapeHtml(cluster.code)}</span>
    <span class="cluster-college">${escapeHtml(cluster.college)}</span>
    <button class="cluster-remove" data-action="remove-cluster" data-index="${index}" aria-label="Remove ${escapeHtml(cluster.college)}">&times;</button>
  </div>`;
}

function addCluster(code: string, college: string): void {
  const cleanCode = code.replace(/\s+/g, " ").trim().slice(0, 24);
  const cleanCollege = college.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!cleanCode || !cleanCollege) {
    reportStatus = "Enter both a cluster code and a college name.";
    render();
    return;
  }
  const duplicate = clusters.some(
    (cluster) =>
      cluster.code.toLowerCase() === cleanCode.toLowerCase() &&
      cluster.college.toLowerCase() === cleanCollege.toLowerCase(),
  );
  if (duplicate) {
    reportStatus = "That cluster is already in the directory.";
    render();
    return;
  }
  clusters = [...clusters, { code: cleanCode, college: cleanCollege }];
  saveClusters();
  reportStatus = "";
  render();
}

function removeCluster(index: number): void {
  clusters = clusters.filter((_, position) => position !== index);
  saveClusters();
  render();
}

function prospectRow(prospect: VisitProspect, index: number): string {
  const contact = prospect.contact
    ? escapeHtml(prospect.contact)
    : '<span class="prospect-blank">Not set</span>';
  const remarks = prospect.remarks
    ? escapeHtml(prospect.remarks)
    : '<span class="prospect-blank">No remarks</span>';
  const options = PROSPECT_STATUSES.map(
    (status) =>
      `<option value="${status}" ${status === prospect.status ? "selected" : ""}>${PROSPECT_STATUS_LABELS[status]}</option>`,
  ).join("");
  return `<div class="prospect-row status-${prospect.status}">
    <span class="prospect-name" data-label="Name">${escapeHtml(prospect.name)}</span>
    <span class="prospect-contact" data-label="Contact">${contact}</span>
    <span class="prospect-date" data-label="Visit date">${escapeHtml(formatDateKey(prospect.visitDate) || "Not set")}</span>
    <span class="prospect-college" data-label="College">${prospect.college ? escapeHtml(prospect.college) : '<span class="prospect-blank">Not set</span>'}</span>
    <span class="prospect-remarks" data-label="Remarks">${remarks}</span>
    <select class="status-select" data-role="status" data-index="${index}" aria-label="Status for ${escapeHtml(prospect.name)}">${options}</select>
    <button class="cluster-remove" data-action="remove-prospect" data-index="${index}" aria-label="Remove ${escapeHtml(prospect.name)}">&times;</button>
  </div>`;
}

function calendarCell(
  key: string,
  counts: Map<string, Record<ProspectStatus, number>>,
): string {
  const { day } = parseDateKey(key);
  const entry = counts.get(key);
  const total = entry ? entry.prospect + entry.visited + entry.dead : 0;
  const isSelected = key === selectedDate;
  const isToday = key === todayKey();
  const dots = entry
    ? PROSPECT_STATUSES.filter((status) => entry[status] > 0)
        .map((status) => `<span class="cal-dot status-${status}"></span>`)
        .join("")
    : "";
  return `<button
    class="cal-day ${isSelected ? "selected" : ""} ${isToday ? "today" : ""} ${total > 0 ? "has-count" : "empty"}"
    data-action="select-date"
    data-date="${key}"
    aria-label="${escapeHtml(formatDateKey(key, { day: "numeric", month: "long", year: "numeric" }))}, ${total} ${total === 1 ? "prospect" : "prospects"}"
    ${isSelected ? 'aria-current="date"' : ""}
  >
    <span class="cal-day-number">${day}</span>
    ${total > 0 ? `<span class="cal-bubble">${total}</span>` : ""}
    <span class="cal-dots">${dots}</span>
  </button>`;
}

function calendarBlock(
  counts: Map<string, Record<ProspectStatus, number>>,
): string {
  const cells = buildCalendarCells(calendarYear, calendarMonth);
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(calendarYear, calendarMonth, 1));
  const inMonth = (key: string) => parseDateKey(key).month === calendarMonth;
  return `<div class="calendar">
    <div class="calendar-head">
      <button class="cal-nav" data-action="prev-month" aria-label="Previous month">&larr;</button>
      <span class="calendar-title">${monthLabel}</span>
      <button class="cal-nav" data-action="next-month" aria-label="Next month">&rarr;</button>
    </div>
    <div class="cal-weekdays">${WEEKDAY_LABELS.map((label) => `<span>${label}</span>`).join("")}</div>
    <div class="cal-grid">
      ${cells.map((key) => calendarCell(key, counts)).join("")}
    </div>
  </div>`;
}

/** Prospects for one date, rendered as the full editable row. */
function selectedDateList(): string {
  const dayProspects = prospectsForDate(selectedDate);
  if (dayProspects.length === 0) {
    return `<p class="cluster-empty">No prospects scheduled for ${escapeHtml(formatDateKey(selectedDate))}. Pick another date on the calendar, or add one from the dashboard.</p>`;
  }
  return `<div class="prospect-list">
    <div class="prospect-row prospect-head">
      <span>Name</span><span>Contact</span><span>Visit date</span><span>College</span><span>Remarks</span><span>Status</span><span></span>
    </div>
    ${dayProspects.map((item) => prospectRow(item, prospects.indexOf(item))).join("")}
  </div>`;
}

function prospectsForDate(date: string): VisitProspect[] {
  return prospects.filter((prospect) => prospect.visitDate === date);
}

function clearDashboardToday(): void {
  const key = todayKey();
  const todays = prospectsForDate(key);
  if (todays.length === 0) {
    reportStatus = "There are no prospects on today's list to clear.";
    render();
    return;
  }
  const shouldClear = window.confirm(
    `Clear today's ${todays.length} prospect${todays.length === 1 ? "" : "s"} from the dashboard? They stay in the Visits calendar, and you can bring them back here.`,
  );
  if (!shouldClear) return;
  dashboardCleared = new Set([...dashboardCleared, key]);
  saveDashboardCleared();
  reportStatus = `Cleared ${todays.length} prospect${todays.length === 1 ? "" : "s"} from today's dashboard. They remain in the Visits calendar.`;
  render();
}

function restoreDashboardToday(): void {
  const key = todayKey();
  dashboardCleared = new Set(
    [...dashboardCleared].filter((entry) => entry !== key),
  );
  saveDashboardCleared();
  reportStatus = "Today's prospects are showing on the dashboard again.";
  render();
}

function dashboardProspectSection(): string {
  const key = todayKey();
  const todays = prospectsForDate(key);
  const isCleared = dashboardCleared.has(key);
  const visible = isCleared ? [] : todays;
  const head = `<div class="section-heading compact">
    <div><span class="eyebrow">Today's visits</span><h2>Add a prospect</h2></div>
    <span class="section-count">${isCleared ? `${todays.length} cleared` : `${todays.length} ${todays.length === 1 ? "entry" : "entries"}`}</span>
  </div>`;
  const controls = isCleared
    ? `<div class="dashboard-cleared">
        <p><strong>${todays.length} prospect${todays.length === 1 ? "" : "s"} hidden from this dashboard.</strong> Nothing was deleted. They still appear on the Visits calendar under today's date.</p>
        <button class="cluster-add" type="button" data-action="restore-dashboard">Show today's list again</button>
      </div>`
    : `<div class="dashboard-actions">
        <span class="dashboard-action-note">Added to ${escapeHtml(formatDateKey(key))} by default. Change the date to schedule ahead.</span>
        <button class="cluster-add backup-button" type="button" data-action="clear-dashboard" ${todays.length === 0 ? "disabled" : ""}>Clear today's list</button>
      </div>`;
  const list = isCleared
    ? ""
    : visible.length === 0
      ? '<p class="cluster-empty">Nothing scheduled for today yet. Enter a name above to start today\'s list.</p>'
      : `<div class="prospect-list dashboard-prospect-list">
          <div class="prospect-row prospect-head">
            <span>Name</span><span>Contact</span><span>Visit date</span><span>College</span><span>Remarks</span><span>Status</span><span></span>
          </div>
          ${visible.map((item) => prospectRow(item, prospects.indexOf(item))).join("")}
        </div>`;
  return `<section class="prospect-section dashboard-prospects" id="prospects">
    ${head}
    <form class="prospect-form" data-form="prospect">
      <label class="field"><span>Name</span><input class="cluster-input" name="name" placeholder="Prospect name" maxlength="80" autocomplete="off" /></label>
      <label class="field"><span>Contact no</span><input class="cluster-input" name="contact" placeholder="Phone number" maxlength="40" autocomplete="off" /></label>
      <label class="field"><span>Date of visit</span><input class="cluster-input" name="visitDate" type="date" value="${key}" /></label>
      <label class="field"><span>College</span><input class="cluster-input" name="college" placeholder="College name" maxlength="120" autocomplete="off" /></label>
      <label class="field"><span>Status</span>
        <select class="cluster-input" name="status">
          ${PROSPECT_STATUSES.map((status) => `<option value="${status}">${PROSPECT_STATUS_LABELS[status]}</option>`).join("")}
        </select>
      </label>
      <label class="field field-wide"><span>Remarks</span><input class="cluster-input" name="remarks" placeholder="Remarks" maxlength="200" autocomplete="off" /></label>
      <button class="cluster-add" type="submit">Add prospect</button>
    </form>
    ${controls}
    ${list}
  </section>`;
}

function addProspect(values: Record<string, string>): void {
  const name = (values.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) {
    reportStatus = "Enter a prospect name before adding.";
    render();
    return;
  }
  const visitDate = DATE_PATTERN.test(values.visitDate ?? "")
    ? values.visitDate
    : "";
  prospects = [
    ...prospects,
    {
      name,
      contact: (values.contact ?? "").trim().slice(0, 40),
      visitDate,
      college: (values.college ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
      remarks: (values.remarks ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      status: isProspectStatus(values.status) ? values.status : "prospect",
    },
  ];
  saveProspects();
  if (dashboardCleared.has(todayKey())) {
    dashboardCleared = new Set(
      [...dashboardCleared].filter((entry) => entry !== todayKey()),
    );
    saveDashboardCleared();
  }
  if (visitDate) {
    selectedDate = visitDate;
    const parsed = parseDateKey(visitDate);
    calendarYear = parsed.year;
    calendarMonth = parsed.month;
  }
  reportStatus = "";
  render();
}

function removeProspect(index: number): void {
  prospects = prospects.filter((_, position) => position !== index);
  saveProspects();
  render();
}

function setProspectStatus(index: number, status: ProspectStatus): void {
  const target = prospects[index];
  if (!target || target.status === status) return;
  prospects = prospects.map((prospect, position) =>
    position === index ? { ...prospect, status } : prospect,
  );
  saveProspects();
  render();
}

function selectDate(key: string): void {
  selectedDate = key;
  const parsed = parseDateKey(key);
  if (parsed.month !== calendarMonth || parsed.year !== calendarYear) {
    calendarYear = parsed.year;
    calendarMonth = parsed.month;
  }
  render();
}

async function sendReport(): Promise<void> {
  if (!isRemote) {
    reportStatus = "Reporting needs the API. Set VITE_API_URL and restart.";
    render();
    return;
  }
  if (!operatorName.trim()) {
    reportStatus = "Enter your name before reporting.";
    render();
    return;
  }
  reportStatus = "Sending report…";
  render();
  try {
    const result = await submitReport({
      operator: operatorName.trim(),
      state,
      clusters,
    });
    const clusterText = `${result.clusterCount} ${result.clusterCount === 1 ? "cluster" : "clusters"}`;
    reportStatus =
      result.delivered === "sheet"
        ? `Report sent ${result.reportDate} at ${result.reportTime}. ${clusterText} saved to the supervisor sheet.`
        : `Report saved ${result.reportDate} at ${result.reportTime} to the server log, NOT the supervisor sheet. ${result.message} ${clusterText} recorded.`;
  } catch (error) {
    reportStatus =
      error instanceof Error
        ? `Report failed: ${error.message}`
        : "Report failed.";
  }
  render();
}

function render(): void {
  const received = totalReceived();
  const notReceived = state.notReceived;
  const calls = totalCalls();
  const coverage = calls === 0 ? 0 : Math.round((received / calls) * 100);
  const activeOutcome = outcomes.reduce(
    (best, outcome) => (state[outcome.key] > state[best.key] ? outcome : best),
    outcomes[0],
  );
  const isRhythmPage = window.location.pathname === "/rhythm";
  const isVisitsPage = window.location.pathname === "/visits";
  const isDashboardPage = !isRhythmPage && !isVisitsPage;
  const prospectCounts = countsByDate(prospects);

  const pageTitle = isVisitsPage
    ? "Campus visits"
    : isRhythmPage
      ? "Received rhythm"
      : "Call-centre tracker";
  const pageEyebrow = isVisitsPage
    ? "Visits"
    : isRhythmPage
      ? "Received rhythm"
      : "Daily call flow";
  const pageIntro = isVisitsPage
    ? "Every prospect you have scheduled, laid out by visit date. Mark each one as a prospect, a completed visit, or dead as the campus work moves."
    : isRhythmPage
      ? "See when contact is building and which outcomes are shaping the received-call mix."
      : "A clear view of every conversation in the queue. Adjust an outcome as soon as a call is resolved.";
  const rhythmBars = [0.68, 0.82, 0.74, 0.92, 0.86, 1, 0.96]
    .map(
      (multiplier, index) =>
        `<div class="rhythm-bar-column"><div class="rhythm-bar-track"><span style="height:${Math.max(18, Math.round((received / 160) * multiplier * 100))}%"></span></div><strong>${Math.round(received * multiplier)}</strong><small>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</small></div>`,
    )
    .join("");
  const rhythmRows = outcomes
    .slice()
    .sort((a, b) => state[b.key] - state[a.key])
    .map(
      (outcome, index) =>
        `<div class="rhythm-row"><span class="rhythm-rank">0${index + 1}</span><span class="rhythm-name">${outcome.label}</span><span class="rhythm-line"><span style="width:${percent(state[outcome.key], received)}"></span></span><span class="rhythm-count">${formatNumber(state[outcome.key])}</span></div>`,
    )
    .join("");
  const dashboardContent = isRhythmPage
    ? `<section class="metrics-band rhythm-metrics" aria-label="Primary call metrics">
        ${metricBlock("Total Calls", calls, "All incoming call activity", "metric-anchor")}
        ${metricBlock("Total Received", received, `${coverage}% of total volume`, "metric-received")}
        ${metricBlock("Not Received", notReceived, "Calls still outside contact", "metric-not-received", "notReceived")}
      </section>
      <section class="rhythm-page-grid">
        <div class="rhythm-chart-panel">
          <div class="section-heading"><div><span class="eyebrow">Received activity / week</span><h2>Conversation rhythm</h2></div><span class="section-count">${formatNumber(received)} received today</span></div>
          <p class="rhythm-lead">A simple read on contact pace across the week. Saturday is the current high point in this local sample.</p>
          <div class="rhythm-chart">${rhythmBars}</div>
          <div class="rhythm-baseline"><span>Lower contact pace</span><span>Higher contact pace</span></div>
        </div>
        <div class="rhythm-summary-panel">
          <span class="eyebrow">Coverage readout</span>
          <strong class="rhythm-big-number">${coverage}%</strong>
          <p>of incoming calls have a recorded outcome. ${formatNumber(notReceived)} calls remain outside contact.</p>
          <div class="summary-rule"><span style="width:${coverage}%"></span></div>
          <div class="summary-pairs"><span>Received <b>${formatNumber(received)}</b></span><span>Not received <b>${formatNumber(notReceived)}</b></span></div>
        </div>
      </section>
      <section class="rhythm-breakdown">
        <div class="section-heading"><div><span class="eyebrow">Outcome mix / received calls</span><h2>What the desk is hearing</h2></div><span class="section-count">Ranked by count</span></div>
        <div class="rhythm-list">${rhythmRows}</div>
      </section>`
    : `<section class="metrics-band" aria-label="Primary call metrics">
        ${metricBlock("Total Calls", calls, "All incoming call activity", "metric-anchor")}
        ${metricBlock("Total Received", received, `${coverage}% of total volume`, "metric-received")}
        ${metricBlock("Not Received", notReceived, "Calls still outside contact", "metric-not-received", "notReceived")}
      </section>
      <section class="flow-strip" aria-label="Call flow summary">
        <div class="strip-label"><span class="eyebrow">Call flow</span><strong>${formatNumber(received)} received / ${formatNumber(notReceived)} not received</strong></div>
        <div class="flow-bar"><span style="width:${coverage}%"></span></div>
        <div class="strip-stat"><strong>${coverage}%</strong><span>contact coverage</span></div>
        <div class="strip-stat"><strong>${formatNumber(activeOutcome ? state[activeOutcome.key] : 0)}</strong><span>highest outcome: ${activeOutcome?.label ?? "none"}</span></div>
      </section>
      <section class="detail-grid" id="outcomes">
        <div class="section-heading"><div><span class="eyebrow">Received calls / detail</span><h2>Outcome ledger</h2></div><span class="section-count">${outcomes.length} tracked outcomes</span></div>
        <div class="ledger-grid">${outcomes.map(outcomeRow).join("")}</div>
      </section>
      <section class="lower-grid" id="clusters">
        <div class="cluster-panel">
          <div class="section-heading compact">
            <div><span class="eyebrow">Cluster code / college</span><h2>Cluster directory</h2></div>
            <span class="section-count">${clusters.length} ${clusters.length === 1 ? "entry" : "entries"}</span>
          </div>
          <form class="cluster-form" data-form="cluster">
            <input class="cluster-input cluster-code-input" name="code" placeholder="CL-01" aria-label="Cluster code" maxlength="24" autocomplete="off" />
            <input class="cluster-input" name="college" placeholder="College name" aria-label="College name" maxlength="120" autocomplete="off" />
            <button class="cluster-add" type="submit">Add</button>
          </form>
          ${
            clusters.length === 0
              ? '<p class="cluster-empty">No clusters added yet. Enter a cluster code and college name to start the directory.</p>'
              : `<div class="cluster-list">${clusters.map(clusterRow).join("")}</div>`
          }
        </div>
        <div class="note-panel">
          <span class="eyebrow">Desk note</span>
          <p>Keep follow-up calls visible before the next shift begins. ${isRemote ? "Counts sync to the shared CallTrack API as you work." : "Counts are local to this browser and update as you work."}</p>
          <span class="note-rule"></span>
          <span class="note-meta">${isRemote ? "State syncs automatically" : "State persists automatically"}</span>
          <div class="report-block">
            <label class="report-operator">
              <span>Operator</span>
              <input class="cluster-input" data-role="operator" value="${escapeHtml(operatorName)}" placeholder="Your name" maxlength="80" autocomplete="off" />
            </label>
            <button
              class="report-button"
              data-action="report"
              ${isRemote ? "" : "disabled"}
              title="${isRemote ? "Send your counters and cluster list to the supervisor sheet" : "Reporting is off because VITE_API_URL is not set in this build"}"
            >Send report to supervisor</button>
            <span class="report-status" data-role="report-status">${isRemote ? escapeHtml(reportStatus) : "Reporting is off: this build has no API address. Set VITE_API_URL on the host and redeploy."}</span>
          </div>
        </div>
      </section>
      ${dashboardProspectSection()}`;

  const visitsContent = `<section class="prospect-section" id="prospects">
        <div class="prospect-summary">
          <div class="day-tile status-prospect"><span class="day-tile-label">Prospect</span><strong class="day-tile-count">${prospectCounts.get(selectedDate)?.prospect ?? 0}</strong></div>
          <div class="day-tile status-visited"><span class="day-tile-label">Visited</span><strong class="day-tile-count">${prospectCounts.get(selectedDate)?.visited ?? 0}</strong></div>
          <div class="day-tile status-dead"><span class="day-tile-label">Dead</span><strong class="day-tile-count">${prospectCounts.get(selectedDate)?.dead ?? 0}</strong></div>
        </div>
        <div class="status-legend">
          <span class="legend-item status-prospect"><span class="legend-swatch"></span>Prospect</span>
          <span class="legend-item status-visited"><span class="legend-swatch"></span>Visited</span>
          <span class="legend-item status-dead"><span class="legend-swatch"></span>Dead</span>
        </div>
        ${calendarBlock(prospectCounts)}
        <div class="visits-day-head">
          <div><span class="eyebrow">Selected date</span><h2>${escapeHtml(formatDateKey(selectedDate, { day: "numeric", month: "long", year: "numeric" }))}</h2></div>
          <span class="section-count">${prospectCounts.get(selectedDate)?.prospect ?? 0} + ${prospectCounts.get(selectedDate)?.visited ?? 0} + ${prospectCounts.get(selectedDate)?.dead ?? 0} scheduled</span>
        </div>
        ${selectedDateList()}
        <div class="backup-bar">
          <div class="backup-copy">
            <strong>Backup</strong>
            <span>Prospects live only on this device. Download a copy before clearing browser data or switching devices.</span>
          </div>
          <div class="backup-actions">
            <button class="cluster-add backup-button" type="button" data-action="download-backup">Download backup</button>
            <label class="cluster-add backup-button backup-restore">
              Restore backup
              <input type="file" data-role="restore-file" accept="application/json,.json" />
            </label>
          </div>
        </div>
      </section>`;

  const activeContent = isVisitsPage ? visitsContent : dashboardContent;

  app.innerHTML = `<div class="shell">
    <aside class="rail">
      <div class="brand-lockup">
        <img src="/calltrack-mark.png" alt="" class="brand-mark" />
        <div><span class="brand-name">CallTrack</span><span class="brand-caption">Operations desk</span></div>
      </div>
      <div class="rail-section">
        <span class="rail-label">Workspace</span>
        <nav class="rail-nav" aria-label="Workspace navigation">
          <a class="nav-item ${isDashboardPage ? "active" : ""}" href="/"><span class="nav-marker"></span>Dashboard</a>
          <a class="nav-item ${isVisitsPage ? "active" : ""}" href="/visits"><span class="nav-marker"></span>Visits</a>
          <a class="nav-item ${isRhythmPage ? "active" : ""}" href="/rhythm"><span class="nav-marker"></span>Received rhythm</a>
        </nav>
      </div>
      <div class="rail-footer">
        <div class="owner-chip"><span class="owner-initials">AD</span><div><strong>Admissions desk</strong><span>Shift A / local mode</span></div></div>
        <div class="rail-actions">
          <button class="reset-button" data-action="clear-counters">Clear counts to 0</button>
        </div>
      </div>
    </aside>

    <main class="main-content" id="dashboard">
      <header class="topbar">
        <div><span class="eyebrow">Admissions / ${pageEyebrow}</span><h1>${pageTitle}</h1></div>
        <div class="topbar-meta"><span class="live-status"><span class="status-dot"></span>Live counts</span><span class="divider"></span><span class="date-label">Tuesday, 29 September 2026</span></div>
      </header>

      <section class="intro-row">
        <div><p class="intro-copy">${pageIntro}</p></div>
        <div class="save-state"><span class="save-dot"></span><span>${syncLabel} &middot; ${lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
      </section>
      ${activeContent}
      <footer class="page-footer"><span>CallTrack v1.0</span><span>${isRemote ? "Shared operations workspace" : "Local operations workspace"}</span><span>${isRemote ? "Shared through the CallTrack API" : "Data stays on this device"}</span></footer>
    </main>
  </div>`;
}

app.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const actionElement = target.closest<HTMLElement>("[data-action]");
  const control = target.closest<HTMLElement>('[data-control="count"]');
  if (!actionElement) return;
  const action = actionElement.dataset.action;
  if (action === "clear-counters") {
    clearCountersToZero();
    return;
  }
  if (action === "remove-cluster") {
    const index = Number(actionElement.dataset.index);
    if (Number.isInteger(index)) removeCluster(index);
    return;
  }
  if (action === "remove-prospect") {
    const index = Number(actionElement.dataset.index);
    if (Number.isInteger(index)) removeProspect(index);
    return;
  }
  if (action === "prev-month" || action === "next-month") {
    const next = shiftMonth(
      calendarYear,
      calendarMonth,
      action === "next-month" ? 1 : -1,
    );
    calendarYear = next.year;
    calendarMonth = next.month;
    render();
    return;
  }
  if (action === "select-date") {
    const key = actionElement.dataset.date;
    if (key && DATE_PATTERN.test(key)) selectDate(key);
    return;
  }
  if (action === "download-backup") {
    downloadProspectsBackup();
    return;
  }
  if (action === "clear-dashboard") {
    clearDashboardToday();
    return;
  }
  if (action === "restore-dashboard") {
    restoreDashboardToday();
    return;
  }
  if (action === "report") {
    void sendReport();
    return;
  }
  const key = control?.dataset.key as keyof CallState | undefined;
  if (!key) return;
  const delta = action === "increment" ? 1 : -1;
  setCount(key, state[key] + delta);
});

app.addEventListener("submit", (event) => {
  const form = event.target as HTMLFormElement;
  const kind = form.dataset.form;
  if (kind !== "cluster" && kind !== "prospect") return;
  event.preventDefault();
  const data = new FormData(form);
  if (kind === "cluster") {
    addCluster(
      String(data.get("code") ?? ""),
      String(data.get("college") ?? ""),
    );
    return;
  }
  addProspect({
    name: String(data.get("name") ?? ""),
    contact: String(data.get("contact") ?? ""),
    visitDate: String(data.get("visitDate") ?? ""),
    college: String(data.get("college") ?? ""),
    remarks: String(data.get("remarks") ?? ""),
    status: String(data.get("status") ?? "prospect"),
  });
});

app.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.dataset.role !== "operator") return;
  operatorName = input.value;
  localStorage.setItem(OPERATOR_STORAGE_KEY, operatorName);
});

app.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;

  if (
    target instanceof HTMLInputElement &&
    target.dataset.role === "restore-file"
  ) {
    handleBackupFile(target.files?.[0]);
    target.value = "";
    return;
  }

  if (target.dataset.role === "status") {
    const index = Number(target.dataset.index);
    if (Number.isInteger(index) && isProspectStatus(target.value)) {
      setProspectStatus(index, target.value);
    }
    return;
  }

  const input = target as HTMLInputElement;
  const key = input.dataset.input as keyof CallState | undefined;
  if (!key) return;
  const value = Number(input.value);
  setCount(key, Number.isFinite(value) ? value : state[key]);
});

window.addEventListener("popstate", render);

render();
void hydrateFromServer();
