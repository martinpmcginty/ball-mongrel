export type PlayerId = string
export type GameId = string
export type StatEventId = string

export type StatType = 'goal' | 'behind' | 'tackle' | 'mark'

export type Player = {
  id: PlayerId
  name: string
  number?: number
  createdAt: number
  updatedAt?: number
}

export type Game = {
  id: GameId
  createdAt: number
  updatedAt?: number
  name: string // e.g. "Round 3 vs Hawks"
  opponent?: string
  startedAt?: number
  endedAt?: number
  homePlayerIds: PlayerId[]
  currentQuarter?: 1 | 2 | 3 | 4
  quarterTimes?: Partial<Record<1 | 2 | 3 | 4, { startedAt?: number; endedAt?: number }>>
  quarterLineups?: Partial<Record<1 | 2 | 3 | 4, PlayerId[]>>
}

export type StatEvent = {
  id: StatEventId
  gameId: GameId
  playerId: PlayerId
  type: StatType
  ts: number
  quarter?: 1 | 2 | 3 | 4
}

export type PlayerTotals = Record<StatType, number> & {
  points: number
}

export const STAT_TYPES: { type: StatType; label: string; short: string }[] = [
  { type: 'goal', label: 'Goal', short: 'G' },
  { type: 'behind', label: 'Behind', short: 'B' },
  { type: 'tackle', label: 'Tackle', short: 'T' },
  { type: 'mark', label: 'Mark', short: 'M' },
]

export function emptyTotals(): PlayerTotals {
  return { goal: 0, behind: 0, tackle: 0, mark: 0, points: 0 }
}

export function computePoints(goal: number, behind: number) {
  return goal * 6 + behind
}

export function totalsFromEvents(events: StatEvent[]): PlayerTotals {
  const t = emptyTotals()
  for (const e of events) {
    t[e.type] += 1
  }
  t.points = computePoints(t.goal, t.behind)
  return t
}

