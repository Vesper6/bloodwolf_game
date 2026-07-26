import { CharId, MapId, TagId, WeaponId } from '../core/config'
import type { Game } from './Game'

/** 局内进度持久化（单机）：每3秒+关页前自动存档，刷新后可继续上局 */

const KEY = 'bloodwolf_run_v1'

export interface RunSave {
  ts: number
  charId: CharId
  moonLv: number
  mapId: MapId
  time: number
  kills: number
  gold: number
  shopBought: number
  totalDamage: number
  maxHit: number
  bossIdx: number
  victoryAnnounced: boolean
  player: {
    hp: number; maxHp: number; level: number; xp: number; energy: number
    atkPct: number; hastePct: number; movePct: number; pickupPct: number
    critChance: number; critDmg: number; buildDmgPct: number
    areaMul: number; luck: number
    passiveLv: Record<string, number>
    tags: Record<TagId, number>
  }
  weapons: { id: WeaponId; level: number; copies: number; evolved: boolean; fused: boolean; subIds?: WeaponId[] }[]
  buildings: { id: string; level: number; hp: number; x: number; y: number }[]
}

export function saveRun(g: Game): void {
  if (g.net || g.state === 'end') return
  const p = g.player
  const data: RunSave = {
    ts: Date.now(),
    charId: g.charId, moonLv: g.moonLv, mapId: g.mapId,
    time: g.time, kills: g.kills, gold: g.gold, shopBought: g.shopBought,
    totalDamage: g.totalDamage, maxHit: g.maxHit,
    bossIdx: g.bossIdxPublic, victoryAnnounced: g.victoryAnnouncedPublic,
    player: {
      hp: p.hp, maxHp: p.maxHp, level: p.level, xp: p.xp, energy: p.energy,
      atkPct: p.atkPct, hastePct: p.hastePct, movePct: p.movePct, pickupPct: p.pickupPct,
      critChance: p.critChance, critDmg: p.critDmg, buildDmgPct: p.buildDmgPct,
      areaMul: p.areaMul, luck: p.luck,
      passiveLv: p.passiveLv, tags: p.tags,
    },
    weapons: p.weapons.map(w => ({
      id: w.id, level: w.level, copies: w.copies, evolved: w.evolved, fused: w.fused,
      subIds: w.fused ? (w as unknown as { subIds?: WeaponId[] }).subIds : undefined,
    })),
    buildings: g.buildings.map(b => ({ id: b.id, level: b.level, hp: b.hp, x: b.x, y: b.y })),
  }
  try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* 存储满则忽略 */ }
}

export function loadRun(): RunSave | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as RunSave
    if (!d.charId || typeof d.time !== 'number') return null
    return d
  } catch { return null }
}

export function clearRun(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
