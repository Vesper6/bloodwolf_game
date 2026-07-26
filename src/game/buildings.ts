import { Graphics, Sprite } from 'pixi.js'
import { BUILDINGS, BuildingId } from '../core/config'
import { dist2 } from '../core/utils'
import type { Game } from './Game'

/**
 * 筑造物（GDD 7章）：有血量、自动作战，被怪物接触会磨损摧毁。
 * 同名筑造再次选择 = 升级 + 满血 + 移到玩家脚下。
 */
export class Building {
  readonly id: BuildingId
  level = 1
  x = 0; y = 0
  hp: number
  maxHp: number
  sprite: Sprite
  aura: Graphics | null = null
  private timer = 0

  constructor(id: BuildingId, g: Game, x: number, y: number) {
    this.id = id
    this.x = x; this.y = y
    this.maxHp = this.hp = BUILDINGS[id].hp
    this.sprite = new Sprite(g.tex.building[id])
    this.sprite.anchor.set(0.5)
    this.sprite.position.set(x, y)
    g.world.addChildAt(this.sprite, 0)
    if (id === 'totem' || id === 'siphon') {
      this.aura = new Graphics()
      this.redrawAura(g)
      g.world.addChildAt(this.aura, 0)
    }
  }

  get name(): string { return BUILDINGS[this.id].name }

  /** 光环/吸取半径 */
  radius(g: Game): number {
    const base = this.id === 'totem' ? 150 + 25 * (this.level - 1) : 240 + 40 * (this.level - 1)
    return base * (g.player.tags.build >= 7 ? 1.5 : 1)
  }

  redrawAura(g: Game): void {
    if (!this.aura) return
    const color = this.id === 'totem' ? 0xff3a5a : 0x4fd8ff
    this.aura.clear()
    this.aura.beginFill(color, 0.06)
    this.aura.drawCircle(0, 0, this.radius(g))
    this.aura.endFill()
    this.aura.lineStyle(1, color, 0.25)
    this.aura.drawCircle(0, 0, this.radius(g))
    this.aura.position.set(this.x, this.y)
  }

  upgrade(g: Game): void {
    this.level = Math.min(3, this.level + 1)
    this.maxHp = BUILDINGS[this.id].hp * this.level
    this.hp = this.maxHp
    this.x = g.player.x; this.y = g.player.y
    this.sprite.position.set(this.x, this.y)
    this.sprite.scale.set(1 + 0.15 * (this.level - 1))
    this.redrawAura(g)
  }

  update(g: Game, dt: number): void {
    const p = g.player
    switch (this.id) {
      case 'turret': {
        // 索敌射击
        const interval = (0.8 / Math.pow(1.4, this.level - 1)) * (p.tags.build >= 3 ? 0.75 : 1)
        this.timer += dt
        if (this.timer >= interval) {
          const range = 340 * (p.tags.build >= 7 ? 1.5 : 1)
          const target = g.nearestEnemyTo(this.x, this.y, range)
          if (target) {
            this.timer = 0
            const ang = Math.atan2(target.y - this.y, target.x - this.x)
            const dmg = 18 * Math.pow(2.2, this.level - 1)
            const pierce = p.tags.build >= 7 ? 2 : 0
            g.spawnArrow(this.x, this.y, ang, dmg, pierce, { tint: 0xffd27a, building: true })
            this.sprite.rotation = ang
          }
        }
        break
      }
      case 'totem': {
        // 光环治疗
        if (dist2(p.x, p.y, this.x, this.y) < this.radius(g) ** 2) {
          p.heal((2 + this.level) * dt)
        }
        break
      }
      case 'siphon': {
        // 吸取经验石
        const r2 = this.radius(g) ** 2
        for (const gem of g.gems) {
          if (!gem.attracted && dist2(gem.x, gem.y, this.x, this.y) < r2) gem.attracted = true
        }
        break
      }
    }
    // 低血量视觉反馈
    this.sprite.alpha = 0.45 + 0.55 * (this.hp / this.maxHp)
  }

  destroy(g: Game): void {
    g.world.removeChild(this.sprite)
    this.sprite.destroy()
    if (this.aura) {
      g.world.removeChild(this.aura)
      this.aura.destroy()
      this.aura = null
    }
  }
}
