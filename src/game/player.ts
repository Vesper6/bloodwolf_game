import { Sprite, Texture } from 'pixi.js'
import { CFG, CharId, TagId } from '../core/config'
import { Weapon } from './weapons'

export class Player {
  charId: CharId = 'rega'
  /** 范围乘数（卡恩被动） */
  areaMul = 1
  /** 局外天赋：幸运（提升三选一稀有度） */
  luck = 0
  sprite: Sprite
  x = 0
  y = 0
  hp = CFG.player.maxHp
  maxHp = CFG.player.maxHp
  radius = CFG.player.radius
  facingAngle = 0

  // 被动词条累计
  atkPct = 0
  hastePct = 0
  movePct = 0
  pickupPct = 0
  critChance = CFG.player.critChance
  critDmg = CFG.player.critDmg
  buildDmgPct = 0

  /** 每种被动已叠加的等级（上限 PASSIVE_MAX_LV） */
  passiveLv: Record<string, number> = {}
  /** 流派标签计数（共鸣） */
  tags: Record<TagId, number> = { blood: 0, crit: 0, build: 0 }

  weapons: Weapon[] = []

  // 血怒
  energy = 0
  raging = false
  rageTimer = 0

  // 成长
  level = 1
  xp = 0
  pendingLevels = 0

  private keys = new Set<string>()
  private touchStart: { x: number; y: number } | null = null
  private touchDir = { x: 0, y: 0 }

  constructor(tex: Texture, onRage: () => void) {
    this.sprite = new Sprite(tex)
    this.sprite.anchor.set(0.5)

    window.addEventListener('keydown', e => {
      this.keys.add(e.code)
      if (e.code === 'Space') { e.preventDefault(); onRage() }
    })
    window.addEventListener('keyup', e => this.keys.delete(e.code))

    // 手机触屏虚拟摇杆
    window.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).tagName === 'CANVAS') this.touchStart = { x: e.clientX, y: e.clientY }
    })
    window.addEventListener('pointermove', e => {
      if (!this.touchStart) return
      const dx = e.clientX - this.touchStart.x
      const dy = e.clientY - this.touchStart.y
      const len = Math.hypot(dx, dy)
      this.touchDir = len > 12 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 }
    })
    window.addEventListener('pointerup', () => {
      this.touchStart = null
      this.touchDir = { x: 0, y: 0 }
    })
  }

  get hasteMul(): number {
    return (1 + this.hastePct / 100) * (this.raging ? 1 + CFG.rage.hasteBonus / 100 : 1)
  }

  get pickupRange(): number {
    return CFG.player.pickupRange * (1 + this.pickupPct / 100)
  }

  xpNeed(): number {
    return Math.round(CFG.xp.base * Math.pow(CFG.xp.growth, this.level - 1))
  }

  gainXP(v: number): void {
    this.xp += v
    while (this.xp >= this.xpNeed()) {
      this.xp -= this.xpNeed()
      this.level++
      this.pendingLevels++
      this.heal(this.maxHp * 0.1) // 升级恢复 10% 生命
    }
  }

  heal(v: number): void {
    this.hp = Math.min(this.maxHp, this.hp + v)
  }

  /** 应用被动词条并记录等级 */
  applyPassive(key: string, value: number): void {
    this.passiveLv[key] = (this.passiveLv[key] ?? 0) + 1
    switch (key) {
      case 'atk': this.atkPct += value; break
      case 'haste': this.hastePct += value; break
      case 'move': this.movePct += value; break
      case 'maxhp': this.maxHp += value; this.heal(value); break
      case 'pickup': this.pickupPct += value; break
      case 'crit': this.critChance += value; break
      case 'critdmg': this.critDmg += value; break
      case 'blueprint': this.buildDmgPct += value; break
    }
  }

  startRage(): boolean {
    if (this.raging || this.energy < CFG.rage.energyMax) return false
    this.raging = true
    this.rageTimer = CFG.rage.duration
    this.energy = 0
    return true
  }

  update(dt: number): void {
    let dx = 0, dy = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1
    if (dx === 0 && dy === 0) { dx = this.touchDir.x; dy = this.touchDir.y }

    const len = Math.hypot(dx, dy)
    if (len > 0) {
      dx /= len; dy /= len
      const spd = CFG.player.speed * (1 + this.movePct / 100)
      this.x += dx * spd * dt
      this.y += dy * spd * dt
      this.facingAngle = Math.atan2(dy, dx)
      this.sprite.scale.x = dx < 0 ? -1 : 1
    }

    if (this.raging) {
      this.rageTimer -= dt
      if (this.rageTimer <= 0) this.raging = false
    }
    this.sprite.tint = this.raging ? 0xff6a6a : 0xffffff
    this.sprite.position.set(this.x, this.y)
  }
}
