import { Sprite, Texture } from 'pixi.js'
import { ENEMIES, EnemyKind } from '../core/config'

export class Enemy {
  sprite: Sprite
  x = 0; y = 0
  hp = 1; maxHp = 1
  speed = 0; dmg = 0; xp = 0; r = 10
  kind: EnemyKind = 'bat'
  orbCd = 0
  alive = true
  isBoss = false

  constructor(tex: Texture) {
    this.sprite = new Sprite(tex)
    this.sprite.anchor.set(0.5)
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
    this.sprite.position.set(x, y)
    this.sprite.visible = true
  }
}

export class Arrow {
  sprite: Sprite
  x = 0; y = 0; vx = 0; vy = 0
  dmg = 0; pierce = 0; life = 0
  hit = new Set<Enemy>()

  constructor(tex: Texture) {
    this.sprite = new Sprite(tex)
    this.sprite.anchor.set(0.5)
  }

  init(x: number, y: number, angle: number, speed: number, dmg: number, pierce: number): void {
    this.x = x; this.y = y
    this.vx = Math.cos(angle) * speed
    this.vy = Math.sin(angle) * speed
    this.dmg = dmg
    this.pierce = pierce
    this.life = 1.4
    this.hit.clear()
    this.sprite.rotation = angle
    this.sprite.position.set(x, y)
    this.sprite.visible = true
  }
}

export class Gem {
  sprite: Sprite
  x = 0; y = 0
  value = 1
  attracted = false

  constructor(tex: Texture) {
    this.sprite = new Sprite(tex)
    this.sprite.anchor.set(0.5)
  }

  init(x: number, y: number, value: number): void {
    this.x = x; this.y = y
    this.value = value
    this.attracted = false
    this.sprite.position.set(x, y)
    this.sprite.visible = true
  }
}
