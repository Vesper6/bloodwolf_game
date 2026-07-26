import { Container, Graphics, Text } from 'pixi.js'
import { fmtNum } from '../core/utils'

interface FloatText { t: Text; life: number; max: number }
interface Slash { g: Graphics; life: number }

/** 飘字与斩击特效（对象池） */
export class Fx {
  layer = new Container()
  private pool: Text[] = []
  private texts: FloatText[] = []
  private slashes: Slash[] = []

  damageText(x: number, y: number, dmg: number, crit: boolean): void {
    if (this.texts.length > 90) return // 池上限，避免刷字卡顿
    const t = this.pool.pop() ?? new Text('', {
      fontFamily: 'Arial, sans-serif', fontWeight: '900',
      stroke: 0x000000, strokeThickness: 3,
    })
    t.text = fmtNum(dmg)
    t.style.fontSize = crit ? 24 : 15
    t.style.fill = crit ? 0xffce3a : 0xffffff
    t.anchor.set(0.5)
    t.position.set(x + (Math.random() * 24 - 12), y - 14)
    t.alpha = 1
    t.visible = true
    this.layer.addChild(t)
    this.texts.push({ t, life: crit ? 0.8 : 0.55, max: crit ? 0.8 : 0.55 })
  }

  healText(x: number, y: number, v: number): void {
    if (this.texts.length > 90) return
    const t = this.pool.pop() ?? new Text('', {
      fontFamily: 'Arial, sans-serif', fontWeight: '900',
      stroke: 0x000000, strokeThickness: 3,
    })
    t.text = '+' + fmtNum(v)
    t.style.fontSize = 14
    t.style.fill = 0x5bff7a
    t.anchor.set(0.5)
    t.position.set(x, y - 20)
    t.alpha = 1
    t.visible = true
    this.layer.addChild(t)
    this.texts.push({ t, life: 0.6, max: 0.6 })
  }

  /** 裂空爪扇形斩击 */
  slash(x: number, y: number, angle: number, range: number, arc: number): void {
    const g = new Graphics()
    g.beginFill(0xffe8e0, 0.4)
    g.moveTo(0, 0)
    g.arc(0, 0, range, angle - arc / 2, angle + arc / 2)
    g.lineTo(0, 0)
    g.endFill()
    g.lineStyle(3, 0xff6a4a, 0.9)
    g.arc(0, 0, range - 2, angle - arc / 2, angle + arc / 2)
    g.position.set(x, y)
    this.layer.addChild(g)
    this.slashes.push({ g, life: 0.16 })
  }

  /** 合成爆发环 */
  burstRing(x: number, y: number): void {
    const g = new Graphics()
    g.lineStyle(10, 0xffce3a, 0.9)
    g.drawCircle(0, 0, 60)
    g.position.set(x, y)
    this.layer.addChild(g)
    this.slashes.push({ g, life: 0.5 })
  }

  update(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const ft = this.texts[i]
      ft.life -= dt
      ft.t.y -= 55 * dt
      ft.t.alpha = Math.max(0, ft.life / ft.max)
      if (ft.life <= 0) {
        ft.t.visible = false
        this.layer.removeChild(ft.t)
        this.pool.push(ft.t)
        this.texts.splice(i, 1)
      }
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i]
      s.life -= dt
      s.g.alpha = Math.max(0, s.life / 0.5)
      s.g.scale.set(s.g.scale.x + dt * 2.5)
      if (s.life <= 0) {
        s.g.destroy()
        this.slashes.splice(i, 1)
      }
    }
  }
}
