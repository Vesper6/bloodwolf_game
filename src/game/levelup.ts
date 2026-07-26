import {
  BUILDINGS, BuildingId, MAX_BUILDINGS, PASSIVES, PASSIVE_MAX_LV, PASSIVE_TAG,
  RARITIES, RARITY_NAME, RARITY_WEIGHT, Rarity, TAG_NAME, TagId, WEAPON_INFO, WEAPON_TAG, WeaponId,
} from '../core/config'
import type { Game } from './Game'

export interface CardOption {
  type: string
  name: string
  desc: string
  extra?: string
  rarity: Rarity
  tag?: TagId
  apply: (g: Game) => void
}

function rollRarity(luck: number): { rarity: Rarity; idx: number } {
  // 狼运天赋：每级为蓝/紫/金增加权重
  const weights = [
    RARITY_WEIGHT[0],
    RARITY_WEIGHT[1] + luck * 1.5,
    RARITY_WEIGHT[2] + luck * 1.0,
    RARITY_WEIGHT[3] + luck * 0.5,
  ]
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return { rarity: RARITIES[i], idx: i }
  }
  return { rarity: 'white', idx: 0 }
}

const tagChip = (tag?: TagId) => (tag ? ` · 〔${TAG_NAME[tag]}〕` : '')

/**
 * 生成三选一。权重规则（GDD 6章）：
 * - 接近合成（2/3）的武器大幅倾斜
 * - 已持有流派标签的选项每件 +2 权重（越玩越成型）
 */
export function generateOptions(g: Game): CardOption[] {
  const p = g.player
  const options: CardOption[] = []
  const usedNames = new Set<string>()

  type Entry = { card: CardOption; weight: number }
  const entries: Entry[] = []

  const tagBias = (tag?: TagId) => (tag ? p.tags[tag] * 2 : 0)

  // ---- 武器卡 ----
  const allIds: WeaponId[] = ['claw', 'bow', 'orb']
  for (const id of allIds) {
    const owned = p.weapons.find(w => w.id === id)
    const info = WEAPON_INFO[id]
    const tag = WEAPON_TAG[id]
    if (!owned) {
      entries.push({
        weight: 10 + tagBias(tag),
        card: {
          type: '新武器' + tagChip(tag), name: info.name, desc: info.desc, rarity: 'blue', tag,
          extra: '获得后集齐 3 份可合成升级',
          apply: game => game.addWeapon(id),
        },
      })
    } else if (owned.level < 3 && !owned.evolved) {
      const willMerge = owned.copies >= 2
      entries.push({
        weight: (willMerge ? 26 : 14) + tagBias(tag),
        card: {
          type: '武器强化' + tagChip(tag), name: info.name,
          desc: willMerge
            ? `三合一就绪！立即合成为 ${owned.level + 1} 级（伤害×2.2 + 形态强化 + 全屏爆发）`
            : `获得 1 份（当前 ${owned.copies}/3）。集齐 3 份合成升级`,
          rarity: willMerge ? 'gold' : 'blue', tag,
          extra: willMerge ? '⚡ 合成瞬间全屏爆发' : `合成进度 ${owned.copies}/3`,
          apply: game => game.addWeapon(id),
        },
      })
    }
  }

  // ---- 筑造卡 ----
  const allBuildings: BuildingId[] = ['turret', 'totem', 'siphon']
  for (const id of allBuildings) {
    const owned = g.buildings.find(b => b.id === id)
    const def = BUILDINGS[id]
    if (!owned && g.buildings.length < MAX_BUILDINGS) {
      entries.push({
        weight: 8 + tagBias('build'),
        card: {
          type: '筑造' + tagChip('build'), name: def.name, desc: def.desc, rarity: 'blue', tag: 'build',
          extra: '放置在当前位置，可被怪物摧毁',
          apply: game => game.placeBuilding(id),
        },
      })
    } else if (owned && owned.level < 3) {
      entries.push({
        weight: 8 + tagBias('build'),
        card: {
          type: '筑造强化' + tagChip('build'), name: def.name,
          desc: `升至 ${owned.level + 1} 级：伤害/效果提升，修复并移到脚下`,
          rarity: 'purple', tag: 'build',
          extra: `当前 Lv${owned.level}`,
          apply: game => game.placeBuilding(id),
        },
      })
    }
  }

  // ---- 被动卡（占位权重，实际内容选中时再роll稀有度） ----
  const passivePool = Object.keys(PASSIVES).filter(k => (p.passiveLv[k] ?? 0) < PASSIVE_MAX_LV)

  const pickOne = (): CardOption | null => {
    const wPool = entries.filter(e => !usedNames.has(e.card.name))
    const pPool = passivePool.filter(k => !usedNames.has(PASSIVES[k].name))
    const wTotal = wPool.reduce((a, b) => a + b.weight, 0)
    const pTotal = pPool.reduce((a, k) => a + 8 + (PASSIVE_TAG[k] ? p.tags[PASSIVE_TAG[k]!] * 2 : 0), 0)
    if (wTotal + pTotal <= 0) return null

    let r = Math.random() * (wTotal + pTotal)
    for (const e of wPool) {
      r -= e.weight
      if (r <= 0) return e.card
    }
    for (const key of pPool) {
      r -= 8 + (PASSIVE_TAG[key] ? p.tags[PASSIVE_TAG[key]!] * 2 : 0)
      if (r <= 0) {
        const def = PASSIVES[key]
        const tag = PASSIVE_TAG[key]
        const { rarity, idx } = rollRarity(p.luck)
        const value = def.values[idx]
        const lv = p.passiveLv[key] ?? 0
        return {
          type: `被动 · ${RARITY_NAME[rarity]}` + tagChip(tag),
          name: def.name, desc: def.desc(value), rarity, tag,
          extra: `等级 ${lv}/${PASSIVE_MAX_LV}`,
          apply: game => game.player.applyPassive(key, value),
        }
      }
    }
    return null
  }

  for (let i = 0; i < 3; i++) {
    const card = pickOne()
    if (!card) break
    usedNames.add(card.name)
    options.push(card)
  }
  return options
}

/** DOM 渲染三选一 */
export function showLevelUpUI(options: CardOption[], onPick: (o: CardOption) => void): void {
  const overlay = document.getElementById('levelup')!
  const cards = document.getElementById('cards')!
  cards.innerHTML = ''
  for (const o of options) {
    const div = document.createElement('div')
    div.className = `card r-${o.rarity}`
    div.innerHTML = `
      <div class="c-type">${o.type}</div>
      <div class="c-name">${o.name}</div>
      <div class="c-desc">${o.desc}</div>
      ${o.extra ? `<div class="c-extra">${o.extra}</div>` : ''}
    `
    div.addEventListener('click', () => onPick(o))
    cards.appendChild(div)
  }
  overlay.classList.remove('hidden')
}

export function hideLevelUpUI(): void {
  document.getElementById('levelup')!.classList.add('hidden')
}
