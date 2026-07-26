/**
 * 服务端怪物模拟（权威）：刷怪、追击、血量、掉落。
 * 数值与客户端 src/core/config.ts 保持一致（M3 提取为共享包）。
 */

export const KINDS = ['bat', 'skeleton', 'boar', 'elite', 'boss'] as const
export type Kind = typeof KINDS[number]

interface KindDef { hp: number; speed: number; dmg: number; xp: number; unlockAt: number; weight: number }

const DEFS: Record<Kind, KindDef> = {
  bat:      { hp: 14,   speed: 155, dmg: 5,  xp: 1,   unlockAt: 0,   weight: 5 },
  skeleton: { hp: 34,   speed: 100, dmg: 10, xp: 2,   unlockAt: 60,  weight: 4 },
  boar:     { hp: 90,   speed: 72,  dmg: 16, xp: 4,   unlockAt: 180, weight: 3 },
  elite:    { hp: 850,  speed: 85,  dmg: 22, xp: 40,  unlockAt: 120, weight: 0 },
  boss:     { hp: 3600, speed: 58,  dmg: 32, xp: 150, unlockAt: 0,   weight: 0 },
}

const HP_GROWTH_PER_MIN = 1.13
const GEM_VALUE_GROWTH_PER_MIN = 0.2
const BASE_MAX_ENEMIES = 320
const BOSS_TIMES = [300, 600]
const WIN_TIME = 900

interface SimEnemy { id: number; kind: Kind; x: number; y: number; hp: number; maxHp: number; speed: number }
interface SimGem { x: number; y: number; v: number }

export interface SimEvent { type: string; data: unknown }
export interface PlayerPos { x: number; y: number }

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

export class EnemySim {
  time = 0
  winTime = WIN_TIME
  /** 血月等级（难度层）：怪物血量 ×1.25^(n-1) */
  moonLv = 1
  enemies = new Map<number, SimEnemy>()
  gems = new Map<number, SimGem>()
  chests = new Map<number, { x: number; y: number }>()
  private nextId = 1
  private spawnTimer = 0
  private eliteTimer = 0
  private bossIdx = 0
  private pending: SimEvent[] = []
  /** 记录最近一次的存活玩家位置，供消息处理时的死亡掉落定位 */
  private playerCount = 1

  update(dt: number, players: PlayerPos[], nClients: number): SimEvent[] {
    this.time += dt
    this.playerCount = Math.max(1, nClients)
    if (players.length === 0) return this.flush()

    const min = this.time / 60
    const countMul = 1 + 0.35 * (nClients - 1)
    const maxEnemies = Math.round(BASE_MAX_ENEMIES * countMul)

    // 刷怪
    this.spawnTimer -= dt
    if (this.spawnTimer <= 0) {
      this.spawnTimer = clamp(1.2 - min * 0.08, 0.3, 1.2)
      const count = Math.round(Math.min(2 + Math.floor(this.time / 20), 16) * countMul)
      for (let i = 0; i < count; i++) {
        if (this.enemies.size >= maxEnemies) break
        this.spawn(this.pickKind(), players)
      }
    }

    // 精英
    if (this.time >= DEFS.elite.unlockAt) {
      this.eliteTimer -= dt
      if (this.eliteTimer <= 0) {
        this.eliteTimer = 45
        this.spawn('elite', players)
      }
    }

    // Boss
    if (this.bossIdx < BOSS_TIMES.length && this.time >= BOSS_TIMES[this.bossIdx]) {
      this.bossIdx++
      const b = this.spawn('boss', players)
      if (b) {
        b.maxHp = b.hp = b.hp * this.bossIdx * 2
        this.pending.push({ type: 'boss', data: { id: b.id, idx: this.bossIdx } })
      }
    }

    // 追击最近的存活玩家
    for (const e of this.enemies.values()) {
      let tx = e.x, ty = e.y, best = Infinity
      for (const p of players) {
        const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2
        if (d < best) { best = d; tx = p.x; ty = p.y }
      }
      const d = Math.hypot(tx - e.x, ty - e.y) || 1
      e.x += ((tx - e.x) / d) * e.speed * dt
      e.y += ((ty - e.y) / d) * e.speed * dt
    }

    return this.flush()
  }

  private flush(): SimEvent[] {
    const out = this.pending
    this.pending = []
    return out
  }

  private pickKind(): Kind {
    const pool: Kind[] = []
    for (const k of ['bat', 'skeleton', 'boar'] as Kind[]) {
      if (this.time >= DEFS[k].unlockAt) for (let i = 0; i < DEFS[k].weight; i++) pool.push(k)
    }
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private spawn(kind: Kind, players: PlayerPos[]): SimEnemy | null {
    const anchor = players[Math.floor(Math.random() * players.length)]
    const hpMul = Math.pow(HP_GROWTH_PER_MIN, this.time / 60)
      * (1 + 0.75 * (this.playerCount - 1))
      * Math.pow(1.25, this.moonLv - 1)
    const ang = Math.random() * Math.PI * 2
    const dist = 620
    const def = DEFS[kind]
    const e: SimEnemy = {
      id: this.nextId++,
      kind,
      x: anchor.x + Math.cos(ang) * dist,
      y: anchor.y + Math.sin(ang) * dist,
      hp: def.hp * hpMul,
      maxHp: def.hp * hpMul,
      speed: def.speed,
    }
    this.enemies.set(e.id, e)
    return e
  }

  applyHit(id: number, dmg: number): void {
    const e = this.enemies.get(id)
    if (!e || dmg <= 0 || !Number.isFinite(dmg)) return
    e.hp -= dmg
    if (e.hp <= 0) this.kill(e)
  }

  private kill(e: SimEnemy): void {
    this.enemies.delete(e.id)
    this.pending.push({ type: 'dead', data: { id: e.id, x: Math.round(e.x), y: Math.round(e.y) } })

    // 掉落经验宝石
    const value = Math.max(1, Math.round(DEFS[e.kind].xp * (1 + (this.time / 60) * GEM_VALUE_GROWTH_PER_MIN)))
    this.dropGem(e.x, e.y, value)

    if (e.kind === 'elite' || e.kind === 'boss') {
      const cid = this.nextId++
      this.chests.set(cid, { x: e.x, y: e.y })
      this.pending.push({ type: 'chest+', data: { id: cid, x: Math.round(e.x), y: Math.round(e.y) } })
    }
    if (e.kind === 'boss') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        this.dropGem(e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, 15)
      }
    }
  }

  private dropGem(x: number, y: number, v: number): void {
    if (this.gems.size > 400) {
      // 超上限合并进随机现存宝石
      const keys = [...this.gems.keys()]
      const g = this.gems.get(keys[Math.floor(Math.random() * keys.length)])!
      g.v += v
      return
    }
    const id = this.nextId++
    this.gems.set(id, { x, y, v })
    this.pending.push({ type: 'gem+', data: { id, x: Math.round(x), y: Math.round(y), v } })
  }

  claimGem(id: number): number {
    const g = this.gems.get(id)
    if (!g) return 0
    this.gems.delete(id)
    return g.v
  }

  claimChest(id: number): boolean {
    return this.chests.delete(id)
  }

  /** 快照：[id, kindIdx, x, y, hp百分比] 扁平数组 */
  snapshot(): number[] {
    const out: number[] = []
    for (const e of this.enemies.values()) {
      out.push(e.id, KINDS.indexOf(e.kind), Math.round(e.x), Math.round(e.y), Math.round((e.hp / e.maxHp) * 100))
    }
    return out
  }

  /** 迟入玩家的初始化数据 */
  initData(): { time: number; gems: number[]; chests: number[] } {
    const gems: number[] = []
    for (const [id, g] of this.gems) gems.push(id, Math.round(g.x), Math.round(g.y), g.v)
    const chests: number[] = []
    for (const [id, c] of this.chests) chests.push(id, Math.round(c.x), Math.round(c.y))
    return { time: this.time, gems, chests }
  }
}
