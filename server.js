import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { nanoid } from 'nanoid'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.json({ limit: '2mb' }))

function pgSslConfig() {
  // Render Postgres typically requires SSL; local dev often doesn't.
  if (process.env.PGSSLMODE === 'disable') return false
  if (!process.env.DATABASE_URL) return undefined
  if (process.env.NODE_ENV === 'development') return false
  return { rejectUnauthorized: false }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: pgSslConfig(),
})

async function ensureSchema() {
  await pool.query(`
    create table if not exists spaces (
      id text primary key,
      key text not null,
      created_at bigint not null
    );

    create table if not exists players (
      id text primary key,
      space_id text not null references spaces(id) on delete cascade,
      name text not null,
      number integer null,
      created_at bigint not null,
      updated_at bigint not null
    );

    create table if not exists games (
      id text primary key,
      space_id text not null references spaces(id) on delete cascade,
      created_at bigint not null,
      updated_at bigint not null,
      name text not null,
      opponent text null,
      started_at bigint null,
      ended_at bigint null,
      home_player_ids jsonb not null,
      current_quarter integer null,
      quarter_times jsonb null,
      quarter_lineups jsonb null
    );

    create table if not exists stat_events (
      id text primary key,
      space_id text not null references spaces(id) on delete cascade,
      game_id text not null,
      player_id text not null,
      type text not null,
      ts bigint not null,
      quarter integer null
    );

    create index if not exists idx_players_space on players(space_id);
    create index if not exists idx_games_space on games(space_id);
    create index if not exists idx_events_space_game on stat_events(space_id, game_id);
  `)

  // Backfill columns for existing databases.
  await pool.query(`alter table games add column if not exists current_quarter integer null;`)
  await pool.query(`alter table games add column if not exists quarter_times jsonb null;`)
  await pool.query(`alter table games add column if not exists quarter_lineups jsonb null;`)
  await pool.query(`alter table stat_events add column if not exists quarter integer null;`)
}

function requireSpaceKey(req, res, next) {
  const spaceId = req.params.spaceId
  const key = req.header('x-space-key')
  if (!spaceId || !key) return res.status(401).json({ error: 'missing space credentials' })
  req._space = { spaceId, key }
  next()
}

async function assertSpaceAuth(spaceId, key) {
  const r = await pool.query('select 1 from spaces where id=$1 and key=$2', [spaceId, key])
  return r.rowCount === 1
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/spaces', async (_req, res) => {
  const id = nanoid(10)
  const key = nanoid(16)
  const now = Date.now()
  await pool.query('insert into spaces(id, key, created_at) values ($1,$2,$3)', [id, key, now])
  res.json({ spaceId: id, spaceKey: key })
})

app.get('/api/:spaceId/state', requireSpaceKey, async (req, res) => {
  const { spaceId, key } = req._space
  if (!(await assertSpaceAuth(spaceId, key))) return res.status(403).json({ error: 'forbidden' })

  const [players, games, events] = await Promise.all([
    pool.query('select * from players where space_id=$1 order by created_at asc', [spaceId]),
    pool.query('select * from games where space_id=$1 order by created_at desc', [spaceId]),
    pool.query('select * from stat_events where space_id=$1 order by ts asc', [spaceId]),
  ])

  res.json({
    players: players.rows.map((p) => ({
      id: p.id,
      name: p.name,
      number: p.number ?? undefined,
      createdAt: Number(p.created_at),
      updatedAt: Number(p.updated_at),
    })),
    games: games.rows.map((g) => ({
      id: g.id,
      createdAt: Number(g.created_at),
      updatedAt: Number(g.updated_at),
      name: g.name,
      opponent: g.opponent ?? undefined,
      startedAt: g.started_at ? Number(g.started_at) : undefined,
      endedAt: g.ended_at ? Number(g.ended_at) : undefined,
      homePlayerIds: g.home_player_ids ?? [],
      currentQuarter: g.current_quarter ?? undefined,
      quarterTimes: g.quarter_times ?? undefined,
      quarterLineups: g.quarter_lineups ?? undefined,
    })),
    events: events.rows.map((e) => ({
      id: e.id,
      gameId: e.game_id,
      playerId: e.player_id,
      type: e.type,
      ts: Number(e.ts),
      quarter: e.quarter ?? undefined,
    })),
  })
})

app.post('/api/:spaceId/upsert', requireSpaceKey, async (req, res) => {
  const { spaceId, key } = req._space
  if (!(await assertSpaceAuth(spaceId, key))) return res.status(403).json({ error: 'forbidden' })

  const body = req.body ?? {}
  const players = Array.isArray(body.players) ? body.players : []
  const games = Array.isArray(body.games) ? body.games : []
  const events = Array.isArray(body.events) ? body.events : []

  await pool.query('begin')
  try {
    for (const p of players) {
      await pool.query(
        `
        insert into players(id, space_id, name, number, created_at, updated_at)
        values ($1,$2,$3,$4,$5,$6)
        on conflict (id) do update set
          name=excluded.name,
          number=excluded.number,
          updated_at=excluded.updated_at
        `,
        [
          p.id,
          spaceId,
          p.name,
          typeof p.number === 'number' ? p.number : null,
          Number(p.createdAt ?? Date.now()),
          Number(p.updatedAt ?? Date.now()),
        ],
      )
    }

    for (const g of games) {
      await pool.query(
        `
        insert into games(id, space_id, created_at, updated_at, name, opponent, started_at, ended_at, home_player_ids, current_quarter, quarter_times, quarter_lineups)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        on conflict (id) do update set
          updated_at=excluded.updated_at,
          name=excluded.name,
          opponent=excluded.opponent,
          started_at=excluded.started_at,
          ended_at=excluded.ended_at,
          home_player_ids=excluded.home_player_ids,
          current_quarter=excluded.current_quarter,
          quarter_times=excluded.quarter_times,
          quarter_lineups=excluded.quarter_lineups
        `,
        [
          g.id,
          spaceId,
          Number(g.createdAt ?? Date.now()),
          Number(g.updatedAt ?? Date.now()),
          g.name,
          g.opponent ?? null,
          g.startedAt ? Number(g.startedAt) : null,
          g.endedAt ? Number(g.endedAt) : null,
          JSON.stringify(g.homePlayerIds ?? []),
          typeof g.currentQuarter === 'number' ? g.currentQuarter : null,
          g.quarterTimes ? JSON.stringify(g.quarterTimes) : null,
          g.quarterLineups ? JSON.stringify(g.quarterLineups) : null,
        ],
      )
    }

    for (const e of events) {
      await pool.query(
        `
        insert into stat_events(id, space_id, game_id, player_id, type, ts, quarter)
        values ($1,$2,$3,$4,$5,$6,$7)
        on conflict (id) do nothing
        `,
        [
          e.id,
          spaceId,
          e.gameId,
          e.playerId,
          e.type,
          Number(e.ts ?? Date.now()),
          typeof e.quarter === 'number' ? e.quarter : null,
        ],
      )
    }

    await pool.query('commit')
    res.json({ ok: true })
  } catch (err) {
    await pool.query('rollback')
    throw err
  }
})

// Serve the built SPA
const distDir = path.join(__dirname, 'dist')
app.use(express.static(distDir))
// Express 5's router is stricter about wildcards; use a regex fallback.
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

const port = Number(process.env.PORT || 3000)
await ensureSchema()
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Ball Mongrel server listening on :${port}`)
})

