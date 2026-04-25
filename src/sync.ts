import type { Game, Player, StatEvent } from './model'
import { db } from './db'

const STORAGE_KEY = 'bm_space'

export type SpaceCreds = { spaceId: string; spaceKey: string }

export function getSpaceCreds(): SpaceCreds | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SpaceCreds>
    if (!parsed.spaceId || !parsed.spaceKey) return null
    return { spaceId: parsed.spaceId, spaceKey: parsed.spaceKey }
  } catch {
    return null
  }
}

export function setSpaceCreds(creds: SpaceCreds) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds))
}

export function clearSpaceCreds() {
  localStorage.removeItem(STORAGE_KEY)
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(path, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res
}

export async function createSharedSpace(): Promise<SpaceCreds> {
  const res = await apiFetch('/api/spaces', { method: 'POST' })
  const json = (await res.json()) as SpaceCreds
  setSpaceCreds(json)
  return json
}

export async function pullSharedState(creds: SpaceCreds) {
  const res = await apiFetch(`/api/${creds.spaceId}/state`, {
    headers: { 'x-space-key': creds.spaceKey },
  })
  const json = (await res.json()) as { players: Player[]; games: Game[]; events: StatEvent[] }

  await db.transaction('rw', db.players, db.games, db.statEvents, async () => {
    await Promise.all([db.players.clear(), db.games.clear(), db.statEvents.clear()])
    if (json.players.length) await db.players.bulkAdd(json.players)
    if (json.games.length) await db.games.bulkAdd(json.games)
    if (json.events.length) await db.statEvents.bulkAdd(json.events)
  })
}

export async function upsertShared(creds: SpaceCreds, data: {
  players?: Player[]
  games?: Game[]
  events?: StatEvent[]
}) {
  await apiFetch(`/api/${creds.spaceId}/upsert`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-space-key': creds.spaceKey,
    },
    body: JSON.stringify(data),
  })
}

