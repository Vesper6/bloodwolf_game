import { MOON_MAX, TALENTS } from './config'

/** 局外存档（localStorage）：血晶、血脉天赋、血月等级解锁 */

const KEY = 'bloodwolf_meta_v1'

export interface MetaData {
  crystals: number
  talents: Record<string, number>
  moonUnlocked: number
}

export function loadMeta(): MetaData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw) as MetaData
      return { crystals: d.crystals ?? 0, talents: d.talents ?? {}, moonUnlocked: Math.min(d.moonUnlocked ?? 1, MOON_MAX) }
    }
  } catch { /* 存档损坏则重置 */ }
  return { crystals: 0, talents: {}, moonUnlocked: 1 }
}

export function saveMeta(d: MetaData): void {
  localStorage.setItem(KEY, JSON.stringify(d))
}

export function talentLv(d: MetaData, key: string): number {
  return d.talents[key] ?? 0
}

/** 购买天赋，成功返回 true */
export function buyTalent(d: MetaData, key: string): boolean {
  const def = TALENTS[key]
  const lv = talentLv(d, key)
  if (lv >= def.max) return false
  const cost = def.cost(lv)
  if (d.crystals < cost) return false
  d.crystals -= cost
  d.talents[key] = lv + 1
  saveMeta(d)
  return true
}

/** 结算奖励：击杀/时长/胜利换血晶 */
export function grantReward(d: MetaData, kills: number, seconds: number, victory: boolean, moonLv: number): number {
  const gain = Math.round(kills / 10 + (seconds / 60) * 5 + (victory ? 100 * moonLv : 0))
  d.crystals += gain
  if (victory && moonLv >= d.moonUnlocked && d.moonUnlocked < MOON_MAX) d.moonUnlocked = moonLv + 1
  saveMeta(d)
  return gain
}
