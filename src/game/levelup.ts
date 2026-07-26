import { PASSIVES, RARITIES, RARITY_NAME, RARITY_WEIGHT, Rarity, WEAPON_INFO, WeaponId } from '../core/config'
import type { Game } from './Game'

export interface CardOption {
  type: string
  name: string
  desc: string
  extra?: string
  rarity: Rarity
  apply: (g: Game) => void
}

function rollRarity(): { rarity: Rarity; idx: number } {
  const total = RARITY_WEIGHT.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < RARITY_WEIGHT.length; i++) {
    r -= RARITY_WEIGHT[i]
    if (r <= 0) return { rarity: RARITIES[i], idx: i }
  }
  return { rarity: 'white', idx: 0 }
}

/** 生成三选一选项（权重向"接近合成的武器"倾斜，对应 GDD 6 章成型规则） */
export function generateOptions(g: Game): CardOption[] {
  const p = g.player
  const options: CardOption[] = []
  const usedNames = new Set<string>()

  const weaponCards: { card: CardOption; weight: number }[] = []
  const allIds: WeaponId[] = ['claw', 'bow', 'orb']
  for (const id of allIds) {
    const owned = p.weapons.find(w => w.id === id)
    const info = WEAPON_INFO[id]
    if (!owned) {
      weaponCards.push({
        weight: 10,
        card: {
          type: '新武器', name: info.name, desc: info.desc, rarity: 'blue',
          extra: '获得后集齐 3 份可合成升级',
          apply: game => game.addWeapon(id),
        },
      })
    } else if (owned.level < 3) {
      const willMerge = owned.copies >= 2
      weaponCards.push({
        // 越接近合成权重越高（2/3 时大幅倾斜）
        weight: willMerge ? 26 : 14,
        card: {
          type: '武器强化', name: info.name,
          desc: willMerge
            ? `三合一就绪！立即合成为 ${owned.level + 1} 级（伤害×2.2 + 形态强化 + 全屏爆发）`
            : `获得 1 份（当前 ${owned.copies}/3）。集齐 3 份合成升级`,
          rarity: willMerge ? 'gold' : 'blue',
          extra: willMerge ? '⚡ 合成瞬间全屏爆发' : `合成进度 ${owned.copies}/3`,
          apply: game => game.addWeapon(id),
        },
      })
    }
  }

  const passiveKeys = Object.keys(PASSIVES)

  const pickWeighted = (): CardOption | null => {
    const pool = weaponCards.filter(w => !usedNames.has(w.card.name))
    const passivePool = passiveKeys.filter(k => !usedNames.has(PASSIVES[k].name))
    const weaponTotal = pool.reduce((a, b) => a + b.weight, 0)
    const passiveTotal = passivePool.length * 8
    if (weaponTotal + passiveTotal === 0) return null

    let r = Math.random() * (weaponTotal + passiveTotal)
    for (const w of pool) {
      r -= w.weight
      if (r <= 0) return w.card
    }
    const key = passivePool[Math.floor(Math.random() * passivePool.length)]
    const def = PASSIVES[key]
    const { rarity, idx } = rollRarity()
    const value = def.values[idx]
    return {
      type: `被动 · ${RARITY_NAME[rarity]}`, name: def.name, desc: def.desc(value), rarity,
      apply: game => {
        const pl = game.player
        switch (key) {
          case 'atk': pl.atkPct += value; break
          case 'haste': pl.hastePct += value; break
          case 'move': pl.movePct += value; break
          case 'maxhp': pl.maxHp += value; pl.heal(value); break
          case 'pickup': pl.pickupPct += value; break
          case 'crit': pl.critChance += value; break
          case 'critdmg': pl.critDmg += value; break
        }
      },
    }
  }

  for (let i = 0; i < 3; i++) {
    const card = pickWeighted()
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
