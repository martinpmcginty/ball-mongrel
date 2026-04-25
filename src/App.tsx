import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { nanoid } from 'nanoid'
import { db } from './db'
import {
  clearSpaceCreds,
  createSharedSpace,
  getSpaceCreds,
  pullSharedState,
  setSpaceCreds,
  upsertShared,
  type SpaceCreds,
} from './sync'
import {
  computePoints,
  emptyTotals,
  STAT_TYPES,
  totalsFromEvents,
  type Game,
  type GameId,
  type Player,
  type PlayerId,
  type StatEvent,
  type StatType,
} from './model'

type View =
  | { name: 'home' }
  | { name: 'roster' }
  | { name: 'new-game' }
  | { name: 'game'; gameId: GameId; tab: 'live' | 'dashboard' }

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function formatScore(goals: number, behinds: number) {
  return `${goals}.${behinds} (${computePoints(goals, behinds)})`
}

function App() {
  const [view, setView] = useState<View>({ name: 'home' })
  const [space, setSpace] = useState<SpaceCreds | null>(() => getSpaceCreds())

  const players = useLiveQuery(() => db.players.orderBy('createdAt').toArray(), [])
  const games = useLiveQuery(() => db.games.orderBy('createdAt').reverse().toArray(), [])

  const currentGameId = view.name === 'game' ? view.gameId : null
  const currentGame = useLiveQuery(
    () => (currentGameId ? db.games.get(currentGameId) : undefined),
    [currentGameId],
  )
  const currentEvents = useLiveQuery(
    () =>
      currentGameId
        ? db.statEvents.where('gameId').equals(currentGameId).sortBy('ts')
        : ([] as StatEvent[]),
    [currentGameId],
  )

  return (
    <div className="min-h-full text-slate-100">
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <Header
          view={view}
          onNavigate={setView}
          currentGameName={currentGame?.name}
        />

        {view.name === 'home' && (
          <Home
            games={games ?? []}
            playersCount={(players ?? []).length}
            space={space}
            onCreateSpace={async () => {
              const creds = await createSharedSpace()
              setSpace(creds)
              await pullSharedState(creds)
            }}
            onConnectSpace={async (creds) => {
              setSpaceCreds(creds)
              setSpace(creds)
              await pullSharedState(creds)
            }}
            onDisconnectSpace={() => {
              clearSpaceCreds()
              setSpace(null)
            }}
            onPullLatest={async () => {
              const creds = space
              if (!creds) return
              await pullSharedState(creds)
            }}
            onOpenRoster={() => setView({ name: 'roster' })}
            onNewGame={() => setView({ name: 'new-game' })}
            onOpenGame={(gameId) => setView({ name: 'game', gameId, tab: 'live' })}
          />
        )}

        {view.name === 'roster' && (
          <Roster
            players={players ?? []}
            space={space}
            onBack={() => setView({ name: 'home' })}
          />
        )}

        {view.name === 'new-game' && (
          <NewGame
            players={players ?? []}
            space={space}
            onCancel={() => setView({ name: 'home' })}
            onCreated={(gameId) => setView({ name: 'game', gameId, tab: 'live' })}
          />
        )}

        {view.name === 'game' && currentGame && (
          <GameScreen
            game={currentGame}
            players={players ?? []}
            events={currentEvents ?? []}
            space={space}
            tab={view.tab}
            onTab={(tab) => setView({ ...view, tab })}
            onBack={() => setView({ name: 'home' })}
          />
        )}
      </div>
    </div>
  )
}

function Header(props: {
  view: View
  currentGameName?: string
  onNavigate: (v: View) => void
}) {
  const title =
    props.view.name === 'home'
      ? 'Ball Mongrel'
      : props.view.name === 'roster'
        ? 'Roster'
        : props.view.name === 'new-game'
          ? 'New game'
          : props.currentGameName ?? 'Game'

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {props.view.name !== 'home' && (
          <button
            type="button"
            onClick={() => props.onNavigate({ name: 'home' })}
            className="h-11 rounded-xl bg-white/10 px-3 text-sm font-semibold ring-1 ring-white/10 active:bg-white/15"
          >
            Back
          </button>
        )}
        <div>
          <div className="text-xs font-semibold tracking-wide text-white/60">
            Australian Rules Football stats
          </div>
          <div className="text-xl font-extrabold tracking-tight">{title}</div>
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-tr from-fuchsia-500/30 via-cyan-500/20 to-emerald-500/20 px-3 py-2 ring-1 ring-white/10">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">
          Home team only
        </div>
        <div className="text-sm font-semibold">Goals · Behinds · Tackles · Marks</div>
      </div>
    </div>
  )
}

function Card(props: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">{props.children}</div>
  )
}

function PrimaryButton(props: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={clsx(
        'h-12 w-full rounded-2xl px-4 text-base font-extrabold tracking-tight',
        'bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-slate-950',
        'disabled:opacity-40 disabled:active:scale-100',
        'active:scale-[0.99]',
      )}
    >
      {props.children}
    </button>
  )
}

function SecondaryButton(props: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={clsx(
        'h-12 w-full rounded-2xl bg-white/10 px-4 text-base font-semibold ring-1 ring-white/10',
        'disabled:opacity-40 disabled:active:scale-100',
        'active:bg-white/15 active:scale-[0.99]',
      )}
    >
      {props.children}
    </button>
  )
}

function Home(props: {
  games: Game[]
  playersCount: number
  space: SpaceCreds | null
  onCreateSpace: () => void
  onConnectSpace: (creds: SpaceCreds) => void
  onDisconnectSpace: () => void
  onPullLatest: () => void
  onOpenRoster: () => void
  onNewGame: () => void
  onOpenGame: (gameId: GameId) => void
}) {
  const [spaceId, setSpaceId] = useState('')
  const [spaceKey, setSpaceKey] = useState('')

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore; clipboard not available in some contexts
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white/70">Shared database</div>
            {props.space ? (
              <div className="text-lg font-extrabold">
                Connected: <span className="text-white/70">{props.space.spaceId}</span>
              </div>
            ) : (
              <div className="text-lg font-extrabold">Not connected</div>
            )}
            <div className="mt-1 text-sm text-white/60">
              Use a shared space so multiple parents see the same roster, games, and stats.
            </div>
          </div>

          <div className="grid w-full gap-2 sm:w-[28rem]">
            {props.space ? (
              <>
                <div className="rounded-2xl bg-black/20 p-3 ring-1 ring-white/10">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                        Space ID
                      </div>
                      <div className="mt-1 break-all text-sm font-extrabold">
                        {props.space.spaceId}
                      </div>
                      <button
                        type="button"
                        onClick={() => copy(props.space!.spaceId)}
                        className="mt-2 h-10 w-full rounded-xl bg-white/10 text-sm font-semibold ring-1 ring-white/10 active:bg-white/15"
                      >
                        Copy ID
                      </button>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                        Space key
                      </div>
                      <div className="mt-1 break-all text-sm font-extrabold">
                        {props.space.spaceKey}
                      </div>
                      <button
                        type="button"
                        onClick={() => copy(props.space!.spaceKey)}
                        className="mt-2 h-10 w-full rounded-xl bg-white/10 text-sm font-semibold ring-1 ring-white/10 active:bg-white/15"
                      >
                        Copy key
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-white/50">
                    Share both values with the other parent and have them press <span className="font-semibold">Connect</span>.
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <SecondaryButton onClick={props.onPullLatest}>Pull latest</SecondaryButton>
                  <button
                    type="button"
                    onClick={props.onDisconnectSpace}
                    className="h-12 w-full rounded-2xl bg-rose-500/15 px-4 text-base font-semibold text-rose-100 ring-1 ring-rose-400/20 active:bg-rose-500/20"
                  >
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={spaceId}
                    onChange={(e) => setSpaceId(e.target.value)}
                    placeholder="Space ID"
                    className="h-12 rounded-2xl bg-black/20 px-4 text-base ring-1 ring-white/10 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                  />
                  <input
                    value={spaceKey}
                    onChange={(e) => setSpaceKey(e.target.value)}
                    placeholder="Space key"
                    className="h-12 rounded-2xl bg-black/20 px-4 text-base ring-1 ring-white/10 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <SecondaryButton
                    onClick={() => props.onConnectSpace({ spaceId: spaceId.trim(), spaceKey: spaceKey.trim() })}
                    disabled={!spaceId.trim() || !spaceKey.trim()}
                  >
                    Connect
                  </SecondaryButton>
                  <PrimaryButton onClick={props.onCreateSpace}>Create shared space</PrimaryButton>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white/70">Quick start</div>
            <div className="text-lg font-extrabold">
              Create a game and start tapping stats.
            </div>
            <div className="mt-1 text-sm text-white/60">
              Roster players: <span className="font-semibold">{props.playersCount}</span>
            </div>
          </div>
          <div className="grid w-full gap-2 sm:w-72">
            <PrimaryButton onClick={props.onNewGame} disabled={props.playersCount === 0}>
              New game
            </PrimaryButton>
            <SecondaryButton onClick={props.onOpenRoster}>Edit roster</SecondaryButton>
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-extrabold">Recent games</div>
        </div>

        {props.games.length === 0 ? (
          <div className="rounded-xl bg-black/20 p-4 text-sm text-white/60 ring-1 ring-white/10">
            No games yet. Create one to start tracking.
          </div>
        ) : (
          <div className="grid gap-2">
            {props.games.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => props.onOpenGame(g.id)}
                className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3 text-left ring-1 ring-white/10 active:bg-black/30"
              >
                <div>
                  <div className="text-base font-bold">{g.name}</div>
                  <div className="text-xs font-semibold text-white/50">
                    {new Date(g.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="text-xs font-extrabold text-white/60">Open</div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function Roster(props: { players: Player[]; space: SpaceCreds | null; onBack: () => void }) {
  const [name, setName] = useState('')
  const [number, setNumber] = useState<string>('')

  async function addPlayer() {
    const trimmed = name.trim()
    if (!trimmed) return
    const num = number.trim() ? Number(number) : undefined
    const player: Player = {
      id: nanoid(),
      name: trimmed,
      number: Number.isFinite(num) ? num : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.players.add(player)
    if (props.space) await upsertShared(props.space, { players: [player] })
    setName('')
    setNumber('')
  }

  async function deletePlayer(id: PlayerId) {
    // Also remove from any games lineups.
    await db.transaction('rw', db.players, db.games, async () => {
      await db.players.delete(id)
      const games = await db.games.toArray()
      await Promise.all(
        games
          .filter((g) => g.homePlayerIds.includes(id))
          .map((g) => db.games.update(g.id, { homePlayerIds: g.homePlayerIds.filter((p) => p !== id) })),
      )
    })
    if (props.space) {
      // Easiest/robust: after deletions, pull latest on other device. For now, just push updated games.
      const games = await db.games.toArray()
      await upsertShared(props.space, {
        games: games.map((g) => ({ ...g, updatedAt: Date.now() })),
      })
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <div className="text-lg font-extrabold">Add player</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player name"
            className="h-12 rounded-2xl bg-black/20 px-4 text-base ring-1 ring-white/10 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
          />
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Number (optional)"
            inputMode="numeric"
            className="h-12 rounded-2xl bg-black/20 px-4 text-base ring-1 ring-white/10 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
          />
          <PrimaryButton onClick={addPlayer} disabled={!name.trim()}>
            Add
          </PrimaryButton>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="text-lg font-extrabold">Players</div>
            <div className="text-sm text-white/60">
              Tap delete to remove. Games keep their history.
            </div>
          </div>
          <button
            type="button"
            onClick={props.onBack}
            className="h-11 rounded-xl bg-white/10 px-3 text-sm font-semibold ring-1 ring-white/10 active:bg-white/15"
          >
            Done
          </button>
        </div>

        {props.players.length === 0 ? (
          <div className="rounded-xl bg-black/20 p-4 text-sm text-white/60 ring-1 ring-white/10">
            Add your first player to get started.
          </div>
        ) : (
          <div className="grid gap-2">
            {props.players.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3 ring-1 ring-white/10"
              >
                <div>
                  <div className="text-base font-bold">
                    {typeof p.number === 'number' ? (
                      <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-sm font-extrabold ring-1 ring-white/10">
                        {p.number}
                      </span>
                    ) : null}
                    {p.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deletePlayer(p.id)}
                  className="h-11 rounded-xl bg-rose-500/15 px-3 text-sm font-semibold text-rose-100 ring-1 ring-rose-400/20 active:bg-rose-500/20"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function NewGame(props: {
  players: Player[]
  space: SpaceCreds | null
  onCancel: () => void
  onCreated: (gameId: GameId) => void
}) {
  const [name, setName] = useState('')
  const [opponent, setOpponent] = useState('')
  const [selected, setSelected] = useState<Record<PlayerId, boolean>>({})

  const selectedIds = useMemo(
    () => props.players.filter((p) => selected[p.id]).map((p) => p.id),
    [props.players, selected],
  )

  async function createGame() {
    const trimmed = name.trim() || `Game vs ${opponent.trim() || 'Opponent'}`
    const gameId = nanoid()
    const game: Game = {
      id: gameId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      name: trimmed,
      opponent: opponent.trim() || undefined,
      startedAt: Date.now(),
      homePlayerIds: selectedIds,
    }
    await db.games.add(game)
    if (props.space) await upsertShared(props.space, { games: [game] })
    props.onCreated(gameId)
  }

  return (
    <div className="grid gap-4">
      <Card>
        <div className="text-lg font-extrabold">Game details</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Game name (e.g. Round 3 vs Hawks)"
            className="h-12 rounded-2xl bg-black/20 px-4 text-base ring-1 ring-white/10 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
          />
          <input
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="Opponent (optional)"
            className="h-12 rounded-2xl bg-black/20 px-4 text-base ring-1 ring-white/10 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
          />
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold">Select home players</div>
            <div className="text-sm text-white/60">
              Pick the players who are playing today.
            </div>
          </div>
          <div className="text-sm font-semibold text-white/60">
            Selected: <span className="font-extrabold text-white">{selectedIds.length}</span>
          </div>
        </div>

        {props.players.length === 0 ? (
          <div className="rounded-xl bg-black/20 p-4 text-sm text-white/60 ring-1 ring-white/10">
            Your roster is empty. Add players first.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {props.players.map((p) => {
              const isOn = !!selected[p.id]
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected((s) => ({ ...s, [p.id]: !isOn }))}
                  className={clsx(
                    'flex items-center justify-between rounded-2xl px-4 py-3 text-left ring-1',
                    isOn
                      ? 'bg-emerald-500/15 ring-emerald-400/25'
                      : 'bg-black/20 ring-white/10 active:bg-black/30',
                  )}
                >
                  <div className="text-base font-bold">
                    {typeof p.number === 'number' ? (
                      <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-sm font-extrabold ring-1 ring-white/10">
                        {p.number}
                      </span>
                    ) : null}
                    {p.name}
                  </div>
                  <div
                    className={clsx(
                      'text-xs font-extrabold',
                      isOn ? 'text-emerald-100' : 'text-white/40',
                    )}
                  >
                    {isOn ? 'IN' : 'OUT'}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        <SecondaryButton onClick={props.onCancel}>Cancel</SecondaryButton>
        <PrimaryButton onClick={createGame} disabled={selectedIds.length === 0}>
          Start game
        </PrimaryButton>
      </div>
    </div>
  )
}

function GameScreen(props: {
  game: Game
  players: Player[]
  events: StatEvent[]
  space: SpaceCreds | null
  tab: 'live' | 'dashboard'
  onTab: (t: 'live' | 'dashboard') => void
  onBack: () => void
}) {
  const [showLineup, setShowLineup] = useState(false)
  const homePlayers = useMemo(() => {
    const byId = new Map(props.players.map((p) => [p.id, p] as const))
    return props.game.homePlayerIds.map((id) => byId.get(id)).filter(Boolean) as Player[]
  }, [props.players, props.game.homePlayerIds])

  const eventsByPlayer = useMemo(() => {
    const map = new Map<PlayerId, StatEvent[]>()
    for (const e of props.events) {
      const arr = map.get(e.playerId)
      if (arr) arr.push(e)
      else map.set(e.playerId, [e])
    }
    return map
  }, [props.events])

  const teamTotals = useMemo(() => totalsFromEvents(props.events), [props.events])

  async function addEvent(playerId: PlayerId, type: StatType) {
    const ev: StatEvent = {
      id: nanoid(),
      gameId: props.game.id,
      playerId,
      type,
      ts: Date.now(),
    }
    await db.statEvents.add(ev)
    if (props.space) await upsertShared(props.space, { events: [ev] })
  }

  async function undoLast() {
    const last = props.events.at(-1)
    if (!last) return
    await db.statEvents.delete(last.id)
    // Deleting events on server isn't implemented; do a pull on the other device for now.
    // Future: add delete endpoint or tombstones.
  }

  async function clearGameStats() {
    await db.statEvents.where('gameId').equals(props.game.id).delete()
    // Same note as undo: server doesn't delete existing events yet.
  }

  async function addPlayerToGame(playerId: PlayerId) {
    if (props.game.homePlayerIds.includes(playerId)) return
    const updated: Game = {
      ...props.game,
      homePlayerIds: [...props.game.homePlayerIds, playerId],
      updatedAt: Date.now(),
    }
    await db.games.put(updated)
    if (props.space) await upsertShared(props.space, { games: [updated] })
  }

  async function createPlayerAndAdd(name: string, number?: number) {
    const trimmed = name.trim()
    if (!trimmed) return
    const playerId = nanoid()
    await db.transaction('rw', db.players, db.games, async () => {
      const player: Player = {
        id: playerId,
        name: trimmed,
        number,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      await db.players.add(player)
      const updated: Game = {
        ...props.game,
        homePlayerIds: [...props.game.homePlayerIds, playerId],
        updatedAt: Date.now(),
      }
      await db.games.put(updated)
      if (props.space) await upsertShared(props.space, { players: [player], games: [updated] })
    })
  }

  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white/60">Team total</div>
            <div className="text-2xl font-extrabold tracking-tight">
              {formatScore(teamTotals.goal, teamTotals.behind)}
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-sm text-white/70">
              <Pill label="G" value={teamTotals.goal} />
              <Pill label="B" value={teamTotals.behind} />
              <Pill label="T" value={teamTotals.tackle} />
              <Pill label="M" value={teamTotals.mark} />
            </div>
          </div>

          <div className="grid w-full gap-2 sm:w-72">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => props.onTab('live')}
                className={clsx(
                  'h-11 rounded-xl text-sm font-extrabold ring-1',
                  props.tab === 'live'
                    ? 'bg-white/15 ring-white/20'
                    : 'bg-white/5 ring-white/10 active:bg-white/10',
                )}
              >
                Live
              </button>
              <button
                type="button"
                onClick={() => props.onTab('dashboard')}
                className={clsx(
                  'h-11 rounded-xl text-sm font-extrabold ring-1',
                  props.tab === 'dashboard'
                    ? 'bg-white/15 ring-white/20'
                    : 'bg-white/5 ring-white/10 active:bg-white/10',
                )}
              >
                Dashboard
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={undoLast}
                className="h-11 rounded-xl bg-white/10 text-sm font-semibold ring-1 ring-white/10 active:bg-white/15 disabled:opacity-40"
                disabled={props.events.length === 0}
              >
                Undo
              </button>
              <button
                type="button"
                onClick={() => setShowLineup((s) => !s)}
                className={clsx(
                  'h-11 rounded-xl text-sm font-semibold ring-1',
                  showLineup
                    ? 'bg-white/15 ring-white/20'
                    : 'bg-white/10 ring-white/10 active:bg-white/15',
                )}
              >
                Lineup
              </button>
            </div>

            <button
              type="button"
              onClick={clearGameStats}
              className="h-11 rounded-xl bg-rose-500/15 text-sm font-semibold text-rose-100 ring-1 ring-rose-400/20 active:bg-rose-500/20 disabled:opacity-40"
              disabled={props.events.length === 0}
            >
              Clear stats
            </button>
          </div>
        </div>
      </Card>

      {showLineup && (
        <LineupManager
          game={props.game}
          allPlayers={props.players}
          onAddExisting={addPlayerToGame}
          onCreateAndAdd={createPlayerAndAdd}
        />
      )}

      {props.tab === 'live' ? (
        <LiveEntry
          players={homePlayers}
          eventsByPlayer={eventsByPlayer}
          onAdd={addEvent}
        />
      ) : (
        <Dashboard players={homePlayers} eventsByPlayer={eventsByPlayer} teamTotals={teamTotals} />
      )}
    </div>
  )
}

function LineupManager(props: {
  game: Game
  allPlayers: Player[]
  onAddExisting: (playerId: PlayerId) => void
  onCreateAndAdd: (name: string, number?: number) => void
}) {
  const [name, setName] = useState('')
  const [number, setNumber] = useState<string>('')

  const notInGame = useMemo(() => {
    const inGame = new Set(props.game.homePlayerIds)
    return props.allPlayers.filter((p) => !inGame.has(p.id))
  }, [props.allPlayers, props.game.homePlayerIds])

  async function createAndAdd() {
    const trimmed = name.trim()
    if (!trimmed) return
    const num = number.trim() ? Number(number) : undefined
    await props.onCreateAndAdd(trimmed, Number.isFinite(num) ? num : undefined)
    setName('')
    setNumber('')
  }

  return (
    <Card>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold">Lineup</div>
          <div className="text-sm text-white/60">
            Add players mid-game (from roster or create new).
          </div>
        </div>
        <div className="text-sm font-semibold text-white/60">
          In game:{' '}
          <span className="font-extrabold text-white">{props.game.homePlayerIds.length}</span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New player name"
          className="h-12 rounded-2xl bg-black/20 px-4 text-base ring-1 ring-white/10 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
        />
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Number (optional)"
          inputMode="numeric"
          className="h-12 rounded-2xl bg-black/20 px-4 text-base ring-1 ring-white/10 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
        />
        <PrimaryButton onClick={createAndAdd} disabled={!name.trim()}>
          Create + add
        </PrimaryButton>
      </div>

      <div className="mt-3 rounded-2xl bg-black/20 p-3 ring-1 ring-white/10">
        <div className="text-sm font-extrabold">Add from roster</div>
        {notInGame.length === 0 ? (
          <div className="mt-1 text-sm text-white/60">Everyone in the roster is already in this game.</div>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {notInGame.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => props.onAddExisting(p.id)}
                className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-left ring-1 ring-white/10 active:bg-white/10"
              >
                <div className="text-base font-bold">
                  {typeof p.number === 'number' ? (
                    <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-sm font-extrabold ring-1 ring-white/10">
                      {p.number}
                    </span>
                  ) : null}
                  {p.name}
                </div>
                <div className="text-xs font-extrabold text-white/60">Add</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function Pill(props: { label: string; value: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">
      <div className="text-xs font-extrabold text-white/60">{props.label}</div>
      <div className="text-sm font-extrabold">{props.value}</div>
    </div>
  )
}

function LiveEntry(props: {
  players: Player[]
  eventsByPlayer: Map<PlayerId, StatEvent[]>
  onAdd: (playerId: PlayerId, type: StatType) => void
}) {
  return (
    <div className="grid gap-3">
      <div className="rounded-2xl bg-black/20 p-3 text-sm text-white/70 ring-1 ring-white/10">
        Tip: this view is optimized to show ~15 players at once on iPad. Rotate to landscape for a wider grid.
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {props.players.map((p) => {
        const totals = totalsFromEvents(props.eventsByPlayer.get(p.id) ?? [])
        return (
          <div
            key={p.id}
            className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {typeof p.number === 'number' ? (
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-extrabold ring-1 ring-white/10">
                      {p.number}
                    </span>
                  ) : (
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[10px] font-extrabold text-white/40 ring-1 ring-white/10">
                      #
                    </span>
                  )}
                  <div className="truncate text-base font-extrabold leading-tight">
                    {p.name}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[11px] font-extrabold text-white/70">
                  <div className="rounded-lg bg-black/20 py-1 ring-1 ring-white/10">
                    <div className="text-[9px] text-white/50">G</div>
                    <div>{totals.goal}</div>
                  </div>
                  <div className="rounded-lg bg-black/20 py-1 ring-1 ring-white/10">
                    <div className="text-[9px] text-white/50">B</div>
                    <div>{totals.behind}</div>
                  </div>
                  <div className="rounded-lg bg-black/20 py-1 ring-1 ring-white/10">
                    <div className="text-[9px] text-white/50">T</div>
                    <div>{totals.tackle}</div>
                  </div>
                  <div className="rounded-lg bg-black/20 py-1 ring-1 ring-white/10">
                    <div className="text-[9px] text-white/50">M</div>
                    <div>{totals.mark}</div>
                  </div>
                  <div className="rounded-lg bg-cyan-400/10 py-1 ring-1 ring-cyan-300/15">
                    <div className="text-[9px] text-white/50">Pts</div>
                    <div className="text-white">{totals.points}</div>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Score
                </div>
                <div className="text-sm font-extrabold">{formatScore(totals.goal, totals.behind)}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              <CompactStatButton label="+G" tone="score" onClick={() => props.onAdd(p.id, 'goal')} />
              <CompactStatButton
                label="+B"
                tone="score"
                onClick={() => props.onAdd(p.id, 'behind')}
              />
              <CompactStatButton
                label="+T"
                tone="field"
                onClick={() => props.onAdd(p.id, 'tackle')}
              />
              <CompactStatButton label="+M" tone="field" onClick={() => props.onAdd(p.id, 'mark')} />
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}

function CompactStatButton(props: { label: string; onClick: () => void; tone: 'score' | 'field' }) {
  const styles =
    props.tone === 'score'
      ? 'bg-cyan-400/15 ring-cyan-300/20 text-cyan-50 active:bg-cyan-400/20'
      : 'bg-white/10 ring-white/10 text-white active:bg-white/15'
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={clsx(
        'h-11 rounded-2xl text-sm font-extrabold ring-1',
        'active:scale-[0.99]',
        styles,
      )}
    >
      {props.label}
    </button>
  )
}

function Dashboard(props: {
  players: Player[]
  eventsByPlayer: Map<PlayerId, StatEvent[]>
  teamTotals: ReturnType<typeof emptyTotals>
}) {
  const rows = useMemo(() => {
    const list = props.players.map((p) => {
      const totals = totalsFromEvents(props.eventsByPlayer.get(p.id) ?? [])
      return { player: p, totals }
    })
    list.sort((a, b) => b.totals.points - a.totals.points || b.totals.goal - a.totals.goal)
    return list
  }, [props.players, props.eventsByPlayer])

  return (
    <div className="grid gap-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-extrabold">Team summary</div>
          <div className="text-sm font-semibold text-white/60">
            {formatScore(props.teamTotals.goal, props.teamTotals.behind)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STAT_TYPES.map((s) => (
            <div
              key={s.type}
              className="rounded-2xl bg-black/20 p-3 ring-1 ring-white/10"
            >
              <div className="text-xs font-bold uppercase tracking-widest text-white/40">
                {s.label}
              </div>
              <div className="text-2xl font-extrabold">{props.teamTotals[s.type]}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-3 text-lg font-extrabold">Player totals</div>
        <div className="grid gap-2">
          {rows.map((r) => (
            <div
              key={r.player.id}
              className="rounded-2xl bg-black/20 px-4 py-3 ring-1 ring-white/10"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-base font-extrabold">
                  {typeof r.player.number === 'number' ? (
                    <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-sm font-extrabold ring-1 ring-white/10">
                      {r.player.number}
                    </span>
                  ) : null}
                  {r.player.name}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill label="G" value={r.totals.goal} />
                  <Pill label="B" value={r.totals.behind} />
                  <Pill label="T" value={r.totals.tackle} />
                  <Pill label="M" value={r.totals.mark} />
                  <Pill label="Pts" value={r.totals.points} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

export default App
