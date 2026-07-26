import { AnimatedSprite, Sprite, Texture } from 'pixi.js'
import { ENEMIES, EnemyKind } from '../core/config'

export class Enemy {
  sprite: AnimatedSprite
  x = 0; y = 0
  /** 联机模式：服务器快照目标位置（插值用） */
  tx = 0; ty = 0
  netId = 0
  hp = 1; maxHp = 1
  speed = 0; dmg = 0; xp = 0; r = 10
  kind: EnemyKind = 'bat'
  orbCd = 0
  alive = true
  isBoss = false
  /** 毒瘟：层数与tick计时（丝卡） */
  poison = 0
  poisonTick = 0
  /** 精英词缀：split=分裂 boom=自爆 magnet=磁力 */
  affix: 'split' | 'boom' | 'magnet' | null = null
  /** 受击挤压脉冲（0~1，衰减） */
  hitPulse = 0
  private shadow: Sprite | null = null

  constructor(tex: Texture, shadowTex?: Texture) {
    this.sprite = new AnimatedSprite([tex])
    this.sprite.anchor.set(0.5)
    if (shadowTex) {
      this.shadow = new Sprite(shadowTex)
      this.shadow.anchor.set(0.5)
      this.sprite.addChildAt(this.shadow, 0)
    }
  }

  /** 换肤：支持序列帧动画（美术素材替换适配） */
  setSkin(fs: Texture[]): void {
    this.sprite.textures = fs
    if (fs.length > 1) {
      this.sprite.animationSpeed = 0.12
      this.sprite.play()
    }
  }

  init(kind: EnemyKind, x: number, y: number, hpMul: number, dmgMul: number): void {
    const def = ENEMIES[kind]
    this.kind = kind
    this.x = x; this.y = y
    this.maxHp = this.hp = def.hp * hpMul
    this.speed = def.speed
    this.dmg = def.dmg * dmgMul
    this.xp = def.xp
    this.r = def.r
    this.orbCd = 0
    this.alive = true
    this.isBoss = kind === 'boss'
    this.poison = 0
    this.poisonTick = 0
    this.affix = null
    this.hitPulse = 0
    if (this.shadow) {
      this.shadow.position.set(0, def.r * 0.9)
      this.shadow.scale.set(def.r / 14)
    }
    this.sprite.scale.set(1)
    this.tx = x; this.ty = y
    this.netId = 0
    this.sprite.position.set(x, y)
    this.sprite.visible = true
  }
}

export class Arrow {
  sprite: Sprite
  x = 0; y = 0; vx = 0; vy = 0
  dmg = 0; pierce = 0; life = 0
  fromBuilding = false
  hit = new Set<Enemy>()

  constructor(tex: Texture) {
    this.sprite = new Sprite(tex)
    this.sprite.anchor.set(0.5)
  }

  init(x: number, y: number, angle: number, speed: number, dmg: number, pierce: number, tint: number, fromBuilding: boolean): void {
    this.x = x; this.y = y
    this.vx = Math.cos(angle) * speed
    this.vy = Math.sin(angle) * speed
    this.dmg = dmg
    this.pierce = pierce
    this.life = 1.4
    this.fromBuilding = fromBuilding
    this.hit.clear()
    this.sprite.rotation = angle
    this.sprite.tint = tint
    this.sprite.position.set(x, y)
    this.sprite.visible = true
  }
}

/** 敌方弹幕（Boss 弹幕战） */
export class Bullet {
  sprite: Sprite
  x = 0; y = 0; vx = 0; vy = 0
  life = 0
  dmg = 0

  constructor(tex: Texture) {
    this.sprite = new Sprite(tex)
    this.sprite.anchor.set(0.5)
    this.sprite.scale.set(0.55)
    this.sprite.tint = 0xff3050
  }

  init(x: number, y: number, angle: number, speed: number, dmg: number): void {
    this.x = x; this.y = y
    this.vx = Math.cos(angle) * speed
    this.vy = Math.sin(angle) * speed
    this.life = 4.5
    this.dmg = dmg
    this.sprite.position.set(x, y)
    this.sprite.visible = true
  }
}

/** 血月宝箱：精英/Boss 掉落，拾取触发武器进化或补给 */
export class Chest {
  sprite: Sprite
  x = 0; y = 0
  netId = 0
  claimed = false
  private t = 0

  constructor(tex: Texture, x: number, y: number) {
    this.sprite = new Sprite(tex)
    this.sprite.anchor.set(0.5)
    this.x = x; this.y = y
    this.sprite.position.set(x, y)
  }

  update(dt: number): void {
    this.t += dt
    this.sprite.scale.set(1 + Math.sin(this.t * 4) * 0.1)
  }
}

export class Gem {
  sprite: Sprite
  x = 0; y = 0
  value = 1
  attracted = false
  netId = 0
  claimed = false

  constructor(tex: Texture) {
    this.sprite = new Sprite(tex)
    this.sprite.anchor.set(0.5)
  }

  init(x: number, y: number, value: number): void {
    this.x = x; this.y = y
    this.value = value
    this.attracted = false
    this.netId = 0
    this.claimed = false
    this.sprite.position.set(x, y)
    this.sprite.visible = true
  }
}
