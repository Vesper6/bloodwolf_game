import { Sprite } from 'pixi.js'
import { WEAPON_INFO, WeaponId } from '../core/config'
import { angleDiff, dist2 } from '../core/utils'
import type { Game } from './Game'

/**
 * 武器基类。三合一合成规则（GDD 5.2）：
 * 同名武器集齐 3 份 → 合成升 1 级（伤害×2.2 + 形态强化），最高 3 级。
 */
export abstract class Weapon {
  abstract readonly id: WeaponId
  abstract readonly baseDmg: number
  level = 1
  copies = 1
  timer = 0

  get name(): string { return WEAPON_INFO[this.id].name }

  /** 当前伤害：等级乘区 × 副本小加成 */
  get dmg(): number {
    return this.baseDmg * Math.pow(2.2, this.level - 1) * (1 + 0.15 * (this.copies - 1))
  }

  abstract update(g: Game, dt: number): void
}

/** 裂空爪：面向方向扇形斩击 */
export class ClawWeapon extends Weapon {
  readonly id = 'claw' as const
  readonly baseDmg = 16

  update(g: Game, dt: number): void {
    const interval = 0.9 / g.player.hasteMul
    this.timer += dt
    if (this.timer < interval) return
    this.timer = 0

    const p = g.player
    const range = 130 + 35 * (this.level - 1)
    const arc = ((120 + 40 * (this.level - 1)) * Math.PI) / 180
    const ang = p.facingAngle
    for (const e of g.enemies) {
      if (!e.alive) continue
      if (dist2(p.x, p.y, e.x, e.y) > (range + e.r) ** 2) continue
      const a = Math.atan2(e.y - p.y, e.x - p.x)
      if (Math.abs(angleDiff(a, ang)) <= arc / 2) g.dealDamage(e, this.dmg)
    }
    g.fx.slash(p.x, p.y, ang, range, arc)
  }
}

/** 银月长弓：锁定最近敌人射穿透箭，每级 +1 箭 +1 穿透 */
export class BowWeapon extends Weapon {
  readonly id = 'bow' as const
  readonly baseDmg = 22

  update(g: Game, dt: number): void {
    const interval = 1.1 / g.player.hasteMul
    this.timer += dt
    if (this.timer < interval) return
    if (g.enemies.length === 0) return
    this.timer = 0

    const p = g.player
    const targets = g.nearestEnemies(this.level)
    for (const t of targets) {
      const ang = Math.atan2(t.y - p.y, t.x - p.x)
      g.spawnArrow(p.x, p.y, ang, this.dmg, 1 + this.level)
    }
  }
}

/** 血焰法球：环绕自身的火球，每级 +1 球 */
export class OrbWeapon extends Weapon {
  readonly id = 'orb' as const
  readonly baseDmg = 9
  private angle = 0
  private sprites: Sprite[] = []

  get count(): number { return 1 + this.level }

  update(g: Game, dt: number): void {
    this.angle += dt * 2.4 * (0.8 + 0.2 * g.player.hasteMul)
    const radius = 82 + 14 * this.level
    const p = g.player

    while (this.sprites.length < this.count) {
      const s = new Sprite(g.tex.orb)
      s.anchor.set(0.5)
      g.world.addChild(s)
      this.sprites.push(s)
    }

    const positions: { x: number; y: number }[] = []
    for (let i = 0; i < this.count; i++) {
      const a = this.angle + (i / this.count) * Math.PI * 2
      const ox = p.x + Math.cos(a) * radius
      const oy = p.y + Math.sin(a) * radius
      this.sprites[i].position.set(ox, oy)
      positions.push({ x: ox, y: oy })
    }

    for (const e of g.enemies) {
      if (!e.alive || e.orbCd > 0) continue
      for (const o of positions) {
        if (dist2(o.x, o.y, e.x, e.y) < (16 + e.r) ** 2) {
          g.dealDamage(e, this.dmg)
          e.orbCd = 0.45
          break
        }
      }
    }
  }
}

export function createWeapon(id: WeaponId): Weapon {
  switch (id) {
    case 'claw': return new ClawWeapon()
    case 'bow': return new BowWeapon()
    case 'orb': return new OrbWeapon()
  }
}
