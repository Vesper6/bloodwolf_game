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
  fused = false

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
    const range = (130 + 35 * (this.level - 1)) * p.areaMul
    const arc = ((120 + 40 * (this.level - 1)) * Math.PI) / 180
    const ang = p.facingAngle
    for (const e of g.enemies) {
      if (!e.alive) continue
      if (dist2(p.x, p.y, e.x, e.y) > (range + e.r) ** 2) continue
      const a = Math.atan2(e.y - p.y, e.x - p.x)
      if (Math.abs(angleDiff(a, ang)) <= arc / 2) g.dealDamage(e, this.dmg, { element: 'metal' })
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
      g.spawnArrow(p.x, p.y, ang, this.dmg, 1 + this.level, { element: 'wood' })
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
    const radius = (82 + 14 * this.level) * g.player.areaMul
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
          g.dealDamage(e, this.dmg, { element: 'fire' })
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

/** 寒冰星轮（水）：三连穿透冰轮，冻缓敌人 */
export class FrostWeapon extends Weapon {
  readonly id = 'frost' as const
  readonly baseDmg = 18

  update(g: Game, dt: number): void {
    const interval = 1.3 / g.player.hasteMul
    this.timer += dt
    if (this.timer < interval || g.enemies.length === 0) return
    this.timer = 0
    const p = g.player
    const t = g.nearestEnemies(1)[0]
    if (!t) return
    const ang = Math.atan2(t.y - p.y, t.x - p.x)
    const n = 2 + this.level // 3/4/5 连
    for (let i = 0; i < n; i++) {
      g.spawnArrow(p.x, p.y, ang + (i - (n - 1) / 2) * 0.22, this.dmg, 2 + this.level,
        { tint: 0x8ae8ff, element: 'water' })
    }
  }
}

/** 大地重锤（土）：周期震地环形冲击波，眩晕 */
export class QuakeWeapon extends Weapon {
  readonly id = 'quake' as const
  readonly baseDmg = 30

  update(g: Game, dt: number): void {
    const interval = 1.8 / g.player.hasteMul
    this.timer += dt
    if (this.timer < interval) return
    this.timer = 0
    const p = g.player
    const radius = (140 + 30 * (this.level - 1)) * p.areaMul
    g.fx.quakeRing(p.x, p.y, radius)
    g.shakeBump(6)
    for (const e of g.enemies) {
      if (e.alive && dist2(p.x, p.y, e.x, e.y) < (radius + e.r) ** 2) {
        g.dealDamage(e, this.dmg, { element: 'earth' })
      }
    }
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
    const radius = 180 * p.areaMul

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
      if (doDamage) g.dealDamage(e, this.dmg, { element: 'metal' })
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
        g.spawnArrow(p.x, p.y, ang, this.dmg, 4, { element: 'wood' })
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
        g.dealDamage(target, this.dmg * 20, { forceCrit: true, element: 'wood' })
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
    const radius = 120 * p.areaMul
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
          g.dealDamage(e, this.dmg, { element: 'fire' })
          // 连锁爆炸
          const boom = 95 * p.areaMul
          g.fx.explosion(e.x, e.y, boom)
          for (const e2 of g.enemies) {
            if (!e2.alive || e2 === e) continue
            if (dist2(e.x, e.y, e2.x, e2.y) < (boom + e2.r) ** 2) g.dealDamage(e2, this.dmg * 0.5, { element: 'fire' })
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

/** 绝对零度：八方冰暴 */
export class EvoFrostWeapon extends Weapon {
  readonly id = 'frost' as const
  readonly baseDmg = 20

  constructor() { super(); this.level = 3; this.evolved = true }
  override get name(): string { return EVOLUTIONS.frost.evoName }

  update(g: Game, dt: number): void {
    const interval = 1.1 / g.player.hasteMul
    this.timer += dt
    if (this.timer < interval) return
    this.timer = 0
    const p = g.player
    const base = Math.random() * Math.PI * 2
    for (let i = 0; i < 8; i++) {
      g.spawnArrow(p.x, p.y, base + (i / 8) * Math.PI * 2, this.dmg, 6, { tint: 0x8ae8ff, element: 'water' })
    }
  }
}

/** 山崩地裂：双重震波 */
export class EvoQuakeWeapon extends Weapon {
  readonly id = 'quake' as const
  readonly baseDmg = 34
  private second = 0

  constructor() { super(); this.level = 3; this.evolved = true }
  override get name(): string { return EVOLUTIONS.quake.evoName }

  private wave(g: Game, radius: number): void {
    const p = g.player
    g.fx.quakeRing(p.x, p.y, radius)
    g.shakeBump(10)
    for (const e of g.enemies) {
      if (e.alive && dist2(p.x, p.y, e.x, e.y) < (radius + e.r) ** 2) {
        g.dealDamage(e, this.dmg, { element: 'earth' })
      }
    }
  }

  update(g: Game, dt: number): void {
    const interval = 1.6 / g.player.hasteMul
    this.timer += dt
    if (this.second > 0) {
      this.second -= dt
      if (this.second <= 0) this.wave(g, 320 * g.player.areaMul)
    }
    if (this.timer < interval) return
    this.timer = 0
    this.wave(g, 200 * g.player.areaMul)
    this.second = 0.3
  }
}

export function createWeapon(id: WeaponId): Weapon {
  switch (id) {
    case 'claw': return new ClawWeapon()
    case 'bow': return new BowWeapon()
    case 'orb': return new OrbWeapon()
    case 'frost': return new FrostWeapon()
    case 'quake': return new QuakeWeapon()
  }
}

/** 禁忌融合（GDD 5.4）：两把进化武器合而为一，腾出武器槽 */
export const FUSION_NAMES: Record<string, string> = {
  'bow+claw': '影狙·无我',
  'claw+orb': '千爪熔核',
  'bow+orb': '腐蚀之星',
  'claw+frost': '金水·霜刃风暴',
  'claw+quake': '金土·裂地爪狱',
  'bow+frost': '木水·凛冬神弓',
  'bow+quake': '木土·撼地狙杀',
  'frost+orb': '水火·蒸汽湮灭',
  'orb+quake': '火土·熔岩崩世',
  'frost+quake': '水土·冻土冰河',
}

export class FusedWeapon extends Weapon {
  readonly id: WeaponId
  readonly baseDmg = 0
  readonly fusionName: string
  readonly subIds: WeaponId[]
  private subs: Weapon[]

  constructor(a: Weapon, b: Weapon) {
    super()
    this.id = a.id
    this.subIds = [a.id, b.id]
    this.level = 3
    this.evolved = true
    this.fused = true
    this.subs = [a, b]
    this.fusionName = FUSION_NAMES[[a.id, b.id].sort().join('+')] ?? '禁忌兵装'
  }

  override get name(): string { return this.fusionName }

  update(g: Game, dt: number): void {
    for (const s of this.subs) s.update(g, dt)
  }

  override dispose(g: Game): void {
    for (const s of this.subs) s.dispose(g)
  }
}

export function createEvolvedWeapon(id: WeaponId): Weapon {
  switch (id) {
    case 'claw': return new EvoClawWeapon()
    case 'bow': return new EvoBowWeapon()
    case 'orb': return new EvoOrbWeapon()
    case 'frost': return new EvoFrostWeapon()
    case 'quake': return new EvoQuakeWeapon()
  }
}
