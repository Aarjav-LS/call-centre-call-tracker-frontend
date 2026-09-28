export type CounterKey =
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
  | 'notReceived'

export type ApiState = Record<CounterKey, number>

export type ApiRecord = {
  id: string
  state: ApiState
  updatedAt: string
}

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export const isRemote = API_URL.length > 0

async function request(path: string, init?: RequestInit): Promise<ApiRecord> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!response.ok) {
    throw new Error(`CallTrack API request failed with ${response.status}`)
  }
  return (await response.json()) as ApiRecord
}

export function fetchRemoteState(): Promise<ApiRecord> {
  return request('/api/state')
}

export function saveRemoteState(state: ApiState): Promise<ApiRecord> {
  return request('/api/state', { method: 'PUT', body: JSON.stringify({ state }) })
}

export function resetRemoteState(): Promise<ApiRecord> {
  return request('/api/reset', { method: 'POST' })
}

export type ReportResult = {
  id: string
  operator: string
  submittedAt: string
  reportDate: string
  reportTime: string
  timezone: string
  delivered: 'sheet' | 'local'
  message: string
  clusterCount: number
  derived: {
    totalReceived: number
    totalNotReceived: number
    totalCalls: number
    coverage: number
  }
}

export async function submitReport(payload: {
  operator: string
  state: ApiState
  clusters: Array<{ code: string; college: string }>
}): Promise<ReportResult> {
  const response = await fetch(`${API_URL}/api/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.error ?? `Report failed with ${response.status}`)
  }
  return (await response.json()) as ReportResult
}
