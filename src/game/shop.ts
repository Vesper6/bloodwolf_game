import { PASSIVES, RARITIES, RARITY_NAME, RARITY_WEIGHT, Rarity, SHOP, WEAPON_INFO, WeaponId } from '../core/config'
import type { Game } from './Game'

/** 魔女商店（GDD 10.3）：金币购买词条/武器份/治疗，可刷新，越买越贵 */

export interface ShopItem {
  name: string
  desc: string
  rarity: Rarity
  price: number
  apply: (g: Game) => void
}

function rollRarity(luck: number): { rarity: Rarity; idx: number } {
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

/** 价格 = 基价 × 1.35^已购次数 */
const price = (base: number, bought: number) => Math.round(base * Math.pow(SHOP.priceGrowth, bought))

export function generateShopItems(g: Game): ShopItem[] {
  const p = g.player
  const items: ShopItem[] = []

  // 3 个随机词条
  const keys = Object.keys(PASSIVES).filter(k => (p.passiveLv[k] ?? 0) < 5)
  for (let i = 0; i < 3 && keys.length > 0; i++) {
    const key = keys.splice(Math.floor(Math.random() * keys.length), 1)[0]
    const def = PASSIVES[key]
    const { rarity, idx } = rollRarity(p.luck)
    const value = def.values[idx]
    items.push({
      name: def.name,
      desc: def.desc(value),
      rarity,
      price: price(SHOP.priceByRarity[idx], g.shopBought),
      apply: game => game.player.applyPassive(key, value),
    })
  }

  // 1 个武器份（推进合成）
  const owned = p.weapons.filter(w => !w.evolved && w.level < 3)
  if (owned.length > 0) {
    const w = owned[Math.floor(Math.random() * owned.length)]
    items.push({
      name: `${WEAPON_INFO[w.id].name} +1`,
      desc: `合成进度 ${w.copies}/3，集齐 3 份升级`,
      rarity: 'blue',
      price: price(SHOP.weaponCost, g.shopBought),
      apply: game => game.addWeapon(w.id as WeaponId),
    })
  }

  // 治疗
  items.push({
    name: '狼血药剂',
    desc: '回复 50% 最大生命',
    rarity: 'white',
    price: price(SHOP.healCost, g.shopBought),
    apply: game => game.player.heal(game.player.maxHp * 0.5),
  })

  return items
}

export function showShopUI(g: Game, onClose: () => void): void {
  const overlay = document.getElementById('shop')!
  const itemsBox = document.getElementById('shop-items')!
  const goldEl = document.getElementById('shop-gold')!
  let items = generateShopItems(g)

  const render = (): void => {
    goldEl.textContent = `🪙 ${g.gold}`
    itemsBox.innerHTML = ''
    for (const it of items) {
      const div = document.createElement('div')
      const afford = g.gold >= it.price
      div.className = `card r-${it.rarity}` + (afford ? '' : ' poor')
      div.innerHTML = `
        <div class="c-type">${RARITY_NAME[it.rarity]}</div>
        <div class="c-name">${it.name}</div>
        <div class="c-desc">${it.desc}</div>
        <div class="c-extra">🪙 ${it.price}</div>
      `
      if (afford) {
        div.addEventListener('click', () => {
          g.gold -= it.price
          g.shopBought++
          it.apply(g)
          items = items.filter(x => x !== it)
          render()
        })
      }
      itemsBox.appendChild(div)
    }
  }

  const rerollBtn = document.getElementById('shop-reroll') as HTMLButtonElement
  const rerollPrice = price(SHOP.rerollCost, g.shopBought)
  rerollBtn.textContent = `刷新货架 🪙${rerollPrice}`
  rerollBtn.onclick = () => {
    if (g.gold < rerollPrice) return
    g.gold -= rerollPrice
    items = generateShopItems(g)
    render()
  }
  ;(document.getElementById('shop-close') as HTMLButtonElement).onclick = () => {
    overlay.classList.add('hidden')
    onClose()
  }

  render()
  overlay.classList.remove('hidden')
}
