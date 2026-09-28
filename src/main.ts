import './styles.css'
import { fetchRemoteState, isRemote, resetRemoteState, saveRemoteState, submitReport, type ApiState } from './api'

type OutcomeKey =
  | 'courseNA'
  | 'feesHesitation'
  | 'discussParents'
  | 'needsFollowUp'
  | 'confirmedVisits'
  | 'notInterested'
  | 'alreadyVisited'
  | 'alreadyAdmitted'
  | 'hungUp'
  | 'wrongNumber'

type CallState = Record<OutcomeKey, number> & { notReceived: number }

type OutcomeDefinition = {
  key: OutcomeKey
  label: string
  code: string
  tone: string
}

const STORAGE_KEY = 'calltrack-state-v1'
const initialState: CallState = {
  courseNA: 19,
  feesHesitation: 15,
  discussParents: 14,
  needsFollowUp: 21,
  confirmedVisits: 12,
  notInterested: 11,
  alreadyVisited: 8,
  alreadyAdmitted: 7,
  hungUp: 13,
  wrongNumber: 8,
  notReceived: 37,
}

const outcomes: OutcomeDefinition[] = [
  { key: 'courseNA', label: 'Course N/A', code: 'CN', tone: 'olive' },
  { key: 'feesHesitation', label: 'Fees Hesitation', code: 'FH', tone: 'clay' },
  { key: 'discussParents', label: 'Discuss with Parents', code: 'DP', tone: 'blue' },
  { key: 'needsFollowUp', label: 'Needs Follow-up', code: 'NF', tone: 'amber' },
  { key: 'confirmedVisits', label: 'Confirmed Visits', code: 'CV', tone: 'sea' },
  { key: 'notInterested', label: 'Not Interested', code: 'NI', tone: 'clay' },
  { key: 'alreadyVisited', label: 'Already Visited', code: 'AV', tone: 'blue' },
  { key: 'alreadyAdmitted', label: 'Already Admitted', code: 'AA', tone: 'sea' },
  { key: 'hungUp', label: 'Hung Up', code: 'HU', tone: 'clay' },
  { key: 'wrongNumber', label: 'Wrong Number', code: 'WN', tone: 'olive' },
]

type Cluster = { code: string; college: string }

const CLUSTER_STORAGE_KEY = 'calltrack-clusters-v1'
const OPERATOR_STORAGE_KEY = 'calltrack-operator'

function loadClusters(): Cluster[] {
  try {
    const raw = localStorage.getItem(CLUSTER_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is Cluster => {
        const item = entry as Partial<Cluster> | null
        return Boolean(item && typeof item.code === 'string' && typeof item.college === 'string')
      })
      .map((entry) => ({ code: entry.code.slice(0, 24), college: entry.college.slice(0, 120) }))
  } catch {
    return []
  }
}

function saveClusters(): void {
  localStorage.setItem(CLUSTER_STORAGE_KEY, JSON.stringify(clusters))
  lastSaved = new Date()
}

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('App root not found')
const app: HTMLDivElement = root

let state = loadState()
let clusters = loadClusters()
let operatorName = localStorage.getItem(OPERATOR_STORAGE_KEY) ?? ''
let reportStatus = ''
let lastSaved = new Date()
let syncLabel = isRemote ? 'Connecting to server' : 'Saved locally'

const COUNTER_KEYS: Array<keyof CallState> = [
  ...outcomes.map((outcome) => outcome.key),
  'notReceived',
]

function applyRemoteState(remote: ApiState): void {
  const next = { ...initialState }
  COUNTER_KEYS.forEach((key) => {
    const value = Number(remote[key])
    if (Number.isFinite(value)) next[key] = Math.max(0, Math.floor(value))
  })
  state = next
  saveState()
  render()
}

async function hydrateFromServer(): Promise<void> {
  if (!isRemote) return
  try {
    const record = await fetchRemoteState()
    applyRemoteState(record.state)
    syncLabel = 'Synced with server'
  } catch {
    syncLabel = 'Offline, saved locally'
  }
  render()
}

let pendingSync: number | undefined

function syncToServer(): void {
  if (!isRemote) return
  window.clearTimeout(pendingSync)
  pendingSync = window.setTimeout(() => {
    void saveRemoteState(state)
      .then(() => {
        syncLabel = 'Synced with server'
        render()
      })
      .catch(() => {
        syncLabel = 'Sync failed, saved locally'
        render()
      })
  }, 400)
}

async function resetEverywhere(): Promise<void> {
  if (!isRemote) {
    resetState()
    return
  }
  syncLabel = 'Syncing reset'
  render()
  try {
    const record = await resetRemoteState()
    applyRemoteState(record.state)
    syncLabel = 'Synced with server'
  } catch {
    resetState()
    syncLabel = 'Reset failed, saved locally'
  }
  render()
}

function loadState(): CallState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...initialState }
    const parsed = JSON.parse(raw) as Partial<CallState>
    const safeState = { ...initialState }
    ;(Object.keys(safeState) as Array<keyof CallState>).forEach((key) => {
      const value = Number(parsed[key])
      if (Number.isFinite(value)) safeState[key] = Math.max(0, Math.floor(value))
    })
    return safeState
  } catch {
    return { ...initialState }
  }
}

function totalReceived(): number {
  return outcomes.reduce((sum, outcome) => sum + state[outcome.key], 0)
}

function totalCalls(): number {
  return totalReceived() + state.notReceived
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function percent(value: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((value / total) * 100)}%`
}

function saveState(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  lastSaved = new Date()
}

function setCount(key: keyof CallState, nextValue: number): void {
  if (!Number.isFinite(nextValue)) return
  state[key] = Math.max(0, Math.floor(nextValue))
  saveState()
  render()
  syncToServer()
}

function resetState(): void {
  const shouldReset = window.confirm('Reset this tracker to the starting sample counts?')
  if (!shouldReset) return
  void resetEverywhere()
}

function metricBlock(label: string, value: number, note: string, className: string, key?: keyof CallState): string {
  const control = key
    ? `<div class="metric-adjust" data-control="count" data-key="${key}">
        <button class="step-button" data-action="decrement" aria-label="Decrease ${label}">−</button>
        <input class="metric-input" data-input="${key}" aria-label="${label} count" type="number" min="0" value="${value}" />
        <button class="step-button" data-action="increment" aria-label="Increase ${label}">+</button>
      </div>`
    : `<div class="metric-value">${formatNumber(value)}</div>`
  return `<section class="metric-block ${className}">
    <div class="metric-kicker"><span>${label}</span><span class="metric-index">${className === 'metric-anchor' ? '01' : className === 'metric-received' ? '02' : '03'}</span></div>
    ${control}
    <p class="metric-note">${note}</p>
  </section>`
}

function outcomeRow(outcome: OutcomeDefinition): string {
  const count = state[outcome.key]
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
  </div>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function clusterRow(cluster: Cluster, index: number): string {
  return `<div class="cluster-row">
    <span class="cluster-badge">${escapeHtml(cluster.code)}</span>
    <span class="cluster-college">${escapeHtml(cluster.college)}</span>
    <button class="cluster-remove" data-action="remove-cluster" data-index="${index}" aria-label="Remove ${escapeHtml(cluster.college)}">&times;</button>
  </div>`
}

function addCluster(code: string, college: string): void {
  const cleanCode = code.replace(/\s+/g, ' ').trim().slice(0, 24)
  const cleanCollege = college.replace(/\s+/g, ' ').trim().slice(0, 120)
  if (!cleanCode || !cleanCollege) {
    reportStatus = 'Enter both a cluster code and a college name.'
    render()
    return
  }
  const duplicate = clusters.some(
    (cluster) => cluster.code.toLowerCase() === cleanCode.toLowerCase() && cluster.college.toLowerCase() === cleanCollege.toLowerCase(),
  )
  if (duplicate) {
    reportStatus = 'That cluster is already in the directory.'
    render()
    return
  }
  clusters = [...clusters, { code: cleanCode, college: cleanCollege }]
  saveClusters()
  reportStatus = ''
  render()
}

function removeCluster(index: number): void {
  clusters = clusters.filter((_, position) => position !== index)
  saveClusters()
  render()
}

async function sendReport(): Promise<void> {
  if (!isRemote) {
    reportStatus = 'Reporting needs the API. Set VITE_API_URL and restart.'
    render()
    return
  }
  if (!operatorName.trim()) {
    reportStatus = 'Enter your name before reporting.'
    render()
    return
  }
  reportStatus = 'Sending report…'
  render()
  try {
    const result = await submitReport({
      operator: operatorName.trim(),
      state,
      clusters,
    })
    reportStatus = `Report sent ${result.reportDate} at ${result.reportTime}. ${result.clusterCount} ${result.clusterCount === 1 ? 'cluster' : 'clusters'} recorded.`
  } catch (error) {
    reportStatus = error instanceof Error ? `Report failed: ${error.message}` : 'Report failed.'
  }
  render()
}

function render(): void {
  const received = totalReceived()
  const notReceived = state.notReceived
  const calls = totalCalls()
  const coverage = calls === 0 ? 0 : Math.round((received / calls) * 100)
  const activeOutcome = outcomes.reduce((best, outcome) => state[outcome.key] > state[best.key] ? outcome : best, outcomes[0])
  const isRhythmPage = window.location.pathname === '/rhythm'
  const rhythmBars = [0.68, 0.82, 0.74, 0.92, 0.86, 1, 0.96]
    .map((multiplier, index) => `<div class="rhythm-bar-column"><div class="rhythm-bar-track"><span style="height:${Math.max(18, Math.round((received / 160) * multiplier * 100))}%"></span></div><strong>${Math.round(received * multiplier)}</strong><small>${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]}</small></div>`)
    .join('')
  const rhythmRows = outcomes
    .slice()
    .sort((a, b) => state[b.key] - state[a.key])
    .map((outcome, index) => `<div class="rhythm-row"><span class="rhythm-rank">0${index + 1}</span><span class="rhythm-name">${outcome.label}</span><span class="rhythm-line"><span style="width:${percent(state[outcome.key], received)}"></span></span><span class="rhythm-count">${formatNumber(state[outcome.key])}</span></div>`)
    .join('')
  const mainContent = isRhythmPage
    ? `<section class="metrics-band rhythm-metrics" aria-label="Primary call metrics">
        ${metricBlock('Total Calls', calls, 'All incoming call activity', 'metric-anchor')}
        ${metricBlock('Total Received', received, `${coverage}% of total volume`, 'metric-received')}
        ${metricBlock('Not Received', notReceived, 'Calls still outside contact', 'metric-not-received', 'notReceived')}
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
        ${metricBlock('Total Calls', calls, 'All incoming call activity', 'metric-anchor')}
        ${metricBlock('Total Received', received, `${coverage}% of total volume`, 'metric-received')}
        ${metricBlock('Not Received', notReceived, 'Calls still outside contact', 'metric-not-received', 'notReceived')}
      </section>
      <section class="flow-strip" aria-label="Call flow summary">
        <div class="strip-label"><span class="eyebrow">Call flow</span><strong>${formatNumber(received)} received / ${formatNumber(notReceived)} not received</strong></div>
        <div class="flow-bar"><span style="width:${coverage}%"></span></div>
        <div class="strip-stat"><strong>${coverage}%</strong><span>contact coverage</span></div>
        <div class="strip-stat"><strong>${formatNumber(activeOutcome ? state[activeOutcome.key] : 0)}</strong><span>highest outcome: ${activeOutcome?.label ?? 'none'}</span></div>
      </section>
      <section class="detail-grid" id="outcomes">
        <div class="section-heading"><div><span class="eyebrow">Received calls / detail</span><h2>Outcome ledger</h2></div><span class="section-count">${outcomes.length} tracked outcomes</span></div>
        <div class="ledger-grid">${outcomes.map(outcomeRow).join('')}</div>
      </section>
      <section class="lower-grid" id="clusters">
        <div class="cluster-panel">
          <div class="section-heading compact">
            <div><span class="eyebrow">Cluster code / college</span><h2>Cluster directory</h2></div>
            <span class="section-count">${clusters.length} ${clusters.length === 1 ? 'entry' : 'entries'}</span>
          </div>
          <form class="cluster-form" data-form="cluster">
            <input class="cluster-input cluster-code-input" name="code" placeholder="CL-01" aria-label="Cluster code" maxlength="24" autocomplete="off" />
            <input class="cluster-input" name="college" placeholder="College name" aria-label="College name" maxlength="120" autocomplete="off" />
            <button class="cluster-add" type="submit">Add</button>
          </form>
          ${clusters.length === 0
            ? '<p class="cluster-empty">No clusters added yet. Enter a cluster code and college name to start the directory.</p>'
            : `<div class="cluster-list">${clusters.map(clusterRow).join('')}</div>`}
        </div>
        <div class="note-panel">
          <span class="eyebrow">Desk note</span>
          <p>Keep follow-up calls visible before the next shift begins. ${isRemote ? 'Counts sync to the shared CallTrack API as you work.' : 'Counts are local to this browser and update as you work.'}</p>
          <span class="note-rule"></span>
          <span class="note-meta">${isRemote ? 'State syncs automatically' : 'State persists automatically'}</span>
          <div class="report-block">
            <label class="report-operator">
              <span>Operator</span>
              <input class="cluster-input" data-role="operator" value="${escapeHtml(operatorName)}" placeholder="Your name" maxlength="80" autocomplete="off" />
            </label>
            <button class="report-button" data-action="report" ${isRemote ? '' : 'disabled'}>Send report to supervisor</button>
            <span class="report-status" data-role="report-status">${escapeHtml(reportStatus)}</span>
          </div>
        </div>
      </section>`

  app.innerHTML = `<div class="shell">
    <aside class="rail">
      <div class="brand-lockup">
        <img src="/calltrack-mark.png" alt="" class="brand-mark" />
        <div><span class="brand-name">CallTrack</span><span class="brand-caption">Operations desk</span></div>
      </div>
      <div class="rail-section">
        <span class="rail-label">Workspace</span>
        <nav class="rail-nav" aria-label="Workspace navigation">
          <a class="nav-item ${!isRhythmPage ? 'active' : ''}" href="/"><span class="nav-marker"></span>Dashboard</a>
          <a class="nav-item ${isRhythmPage ? 'active' : ''}" href="/rhythm"><span class="nav-marker"></span>Received rhythm</a>
          <a class="nav-item" href="/#outcomes"><span class="nav-marker"></span>Call outcomes</a>
        </nav>
      </div>
      <div class="rail-footer">
        <div class="owner-chip"><span class="owner-initials">AD</span><div><strong>Admissions desk</strong><span>Shift A / local mode</span></div></div>
        <button class="reset-button" data-action="reset">Reset sample data</button>
      </div>
    </aside>

    <main class="main-content" id="dashboard">
      <header class="topbar">
        <div><span class="eyebrow">Admissions / ${isRhythmPage ? 'Received rhythm' : 'Daily call flow'}</span><h1>${isRhythmPage ? 'Received rhythm' : 'Call-centre tracker'}</h1></div>
        <div class="topbar-meta"><span class="live-status"><span class="status-dot"></span>Live counts</span><span class="divider"></span><span class="date-label">Tuesday, 29 September 2026</span></div>
      </header>

      <section class="intro-row">
        <div><p class="intro-copy">${isRhythmPage ? 'See when contact is building and which outcomes are shaping the received-call mix.' : 'A clear view of every conversation in the queue. Adjust an outcome as soon as a call is resolved.'}</p></div>
        <div class="save-state"><span class="save-dot"></span><span>${syncLabel} &middot; ${lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
      </section>
      ${mainContent}
      <footer class="page-footer"><span>CallTrack v1.0</span><span>${isRemote ? 'Shared operations workspace' : 'Local operations workspace'}</span><span>${isRemote ? 'Shared through the CallTrack API' : 'Data stays on this device'}</span></footer>
    </main>
  </div>`
}

app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement
  const actionElement = target.closest<HTMLElement>('[data-action]')
  const control = target.closest<HTMLElement>('[data-control="count"]')
  if (!actionElement) return
  const action = actionElement.dataset.action
  if (action === 'reset') {
    resetState()
    return
  }
  if (action === 'remove-cluster') {
    const index = Number(actionElement.dataset.index)
    if (Number.isInteger(index)) removeCluster(index)
    return
  }
  if (action === 'report') {
    void sendReport()
    return
  }
  const key = control?.dataset.key as keyof CallState | undefined
  if (!key) return
  const delta = action === 'increment' ? 1 : -1
  setCount(key, state[key] + delta)
})

app.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement
  if (form.dataset.form !== 'cluster') return
  event.preventDefault()
  const data = new FormData(form)
  addCluster(String(data.get('code') ?? ''), String(data.get('college') ?? ''))
})

app.addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement
  if (input.dataset.role !== 'operator') return
  operatorName = input.value
  localStorage.setItem(OPERATOR_STORAGE_KEY, operatorName)
})

app.addEventListener('change', (event) => {
  const input = event.target as HTMLInputElement
  const key = input.dataset.input as keyof CallState | undefined
  if (!key) return
  const value = Number(input.value)
  setCount(key, Number.isFinite(value) ? value : state[key])
})

window.addEventListener('popstate', render)

render()
void hydrateFromServer()
