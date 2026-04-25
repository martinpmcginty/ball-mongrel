import Dexie, { type Table } from 'dexie'
import type { Game, Player, StatEvent } from './model'

export class BallMongrelDb extends Dexie {
  players!: Table<Player, string>
  games!: Table<Game, string>
  statEvents!: Table<StatEvent, string>

  constructor() {
    super('ball-mongrel')

    this.version(1).stores({
      players: 'id, createdAt, name',
      games: 'id, createdAt, name',
      statEvents: 'id, gameId, playerId, type, ts',
    })
  }
}

export const db = new BallMongrelDb()

