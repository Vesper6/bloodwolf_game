import { Graphics, Sprite } from 'pixi.js'
import { EVOLUTIONS, WEAPON_INFO, WeaponId } from '../core/config'
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
  evolved = false

  get name(): string { return WEAPON_INFO[this.id].name }

  /** 当前伤害：等级乘区 × 副本小加成 */
  get dmg(): number {
    return this.baseDmg * Math.pow(2.2, this.level - 1) * (1 + 0.15 * (this.copies - 1))
  }

  abstract update(g: Game, dt: number): void

  /** 被替换（进化）时清理自己创建的显示对象 */
  dispose(_g: Game): void {}
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

  override dispose(g: Game): void {
    for (const s of this.sprites) { g.world.removeChild(s); s.destroy() }
    this.sprites = []
  }
}

// ============================================================ 进化武器（GDD 5.3）

/** 千爪风暴：近身持续旋风，吸附怪物绞杀 */
export class EvoClawWeapon extends Weapon {
  readonly id = 'claw' as const
  readonly baseDmg = 9 // 每 0.22s 一跳，DPS 远超 3 级裂空爪
  private ring: Graphics | null = null

  constructor() { super(); this.level = 3; this.evolved = true }

  override get name(): string { return EVOLUTIONS.claw.evoName }

  update(g: Game, dt: number): void {
    const p = g.player
    const radius = 180

    if (!this.ring) {
      this.ring = new Graphics()
      for (let i = 0; i < 3; i++) {
        const a0 = (i / 3) * Math.PI * 2
        this.ring.lineStyle(5, 0xff6a4a, 0.55)
        this.ring.arc(0, 0, radius - 12, a0, a0 + 1.4)
      }
      this.ring.lineStyle(1.5, 0xffb0a0, 0.3)
      this.ring.drawCircle(0, 0, radius)
      g.world.addChild(this.ring)
    }
    this.ring.position.set(p.x, p.y)
    this.ring.rotation += dt * 6

    const tick = 0.22 / g.player.hasteMul
    this.timer += dt
    const doDamage = this.timer >= tick
    if (doDamage) this.timer = 0

    for (const e of g.enemies) {
      if (!e.alive) continue
      const d2 = dist2(p.x, p.y, e.x, e.y)
      if (d2 > (radius + e.r) ** 2) continue
      // 吸附
      const d = Math.sqrt(d2) || 1
      if (!e.isBoss) {
        e.x -= ((e.x - p.x) / d) * 130 * dt
        e.y -= ((e.y - p.y) / d) * 130 * dt
      }
      if (doDamage) g.dealDamage(e, this.dmg)
    }
  }

  override dispose(g: Game): void {
    if (this.ring) { g.world.removeChild(this.ring); this.ring.destroy(); this.ring = null }
  }
}

/** 弑神狙：保留三连穿透箭，每 3 秒锁定全屏血量最高者巨额必暴击 */
export class EvoBowWeapon extends Weapon {
  readonly id = 'bow' as const
  readonly baseDmg = 22
  private snipeTimer = 0

  constructor() { super(); this.level = 3; this.evolved = true }

  override get name(): string { return EVOLUTIONS.bow.evoName }

  update(g: Game, dt: number): void {
    const p = g.player
    // 常规箭（同 3 级长弓）
    const interval = 1.1 / p.hasteMul
    this.timer += dt
    if (this.timer >= interval && g.enemies.length > 0) {
      this.timer = 0
      for (const t of g.nearestEnemies(3)) {
        const ang = Math.atan2(t.y - p.y, t.x - p.x)
        g.spawnArrow(p.x, p.y, ang, this.dmg, 4)
      }
    }
    // 狙击
    this.snipeTimer += dt
    if (this.snipeTimer >= 3 / p.hasteMul) {
      let target = null
      let best = -1
      for (const e of g.enemies) {
        if (e.alive && e.hp > best) { best = e.hp; target = e }
      }
      if (target) {
        this.snipeTimer = 0
        g.fx.laser(p.x, p.y, target.x, target.y)
        g.dealDamage(target, this.dmg * 20, { forceCrit: true })
      }
    }
  }
}

/** 血月熔核：巨型火球环绕，命中引发连锁爆炸 */
export class EvoOrbWeapon extends Weapon {
  readonly id = 'orb' as const
  readonly baseDmg = 11
  private angle = 0
  private sprites: Sprite[] = []

  constructor() { super(); this.level = 3; this.evolved = true }

  override get name(): string { return EVOLUTIONS.orb.evoName }

  update(g: Game, dt: number): void {
    const p = g.player
    const count = 4
    const radius = 120
    this.angle += dt * 2.1

    while (this.sprites.length < count) {
      const s = new Sprite(g.tex.orb)
      s.anchor.set(0.5)
      s.scale.set(1.8)
      s.tint = 0xff9a4a
      g.world.addChild(s)
      this.sprites.push(s)
    }

    for (let i = 0; i < count; i++) {
      const a = this.angle + (i / count) * Math.PI * 2
      const ox = p.x + Math.cos(a) * radius
      const oy = p.y + Math.sin(a) * radius
      this.sprites[i].position.set(ox, oy)

      for (const e of g.enemies) {
        if (!e.alive || e.orbCd > 0) continue
        if (dist2(ox, oy, e.x, e.y) < (26 + e.r) ** 2) {
          e.orbCd = 0.45
          g.dealDamage(e, this.dmg)
          // 连锁爆炸
          g.fx.explosion(e.x, e.y, 95)
          for (const e2 of g.enemies) {
            if (!e2.alive || e2 === e) continue
            if (dist2(e.x, e.y, e2.x, e2.y) < (95 + e2.r) ** 2) g.dealDamage(e2, this.dmg * 0.5)
          }
          break
        }
      }
    }
  }

  override dispose(g: Game): void {
    for (const s of this.sprites) { g.world.removeChild(s); s.destroy() }
    this.sprites = []
  }
}

export function createWeapon(id: WeaponId): Weapon {
  switch (id) {
    case 'claw': return new ClawWeapon()
    case 'bow': return new BowWeapon()
    case 'orb': return new OrbWeapon()
  }
}

export function createEvolvedWeapon(id: WeaponId): Weapon {
  switch (id) {
    case 'claw': return new EvoClawWeapon()
    case 'bow': return new EvoBowWeapon()
    case 'orb': return new EvoOrbWeapon()
  }
}
