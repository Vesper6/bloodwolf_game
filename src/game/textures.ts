import { Application, Graphics, Texture } from 'pixi.js'
import { BuildingId, ENEMIES, EnemyKind } from '../core/config'

export interface Textures {
  player: Texture
  gem: Texture
  gemBig: Texture
  arrow: Texture
  orb: Texture
  chest: Texture
  enemy: Record<EnemyKind, Texture>
  building: Record<BuildingId, Texture>
}

/** 程序化生成占位美术（M0 阶段无需外部资源） */
export function makeTextures(app: Application): Textures {
  const gen = (g: Graphics) => {
    const t = app.renderer.generateTexture(g)
    g.destroy()
    return t
  }

  // 玩家：狼形剪影（深灰身体 + 狼耳 + 猩红双目）
  const pg = new Graphics()
  pg.beginFill(0x3c3c4e)
  pg.drawCircle(0, 0, 16)
  pg.moveTo(-14, -8); pg.lineTo(-20, -24); pg.lineTo(-4, -13); pg.closePath()
  pg.moveTo(14, -8); pg.lineTo(20, -24); pg.lineTo(4, -13); pg.closePath()
  pg.endFill()
  pg.beginFill(0xff2d2d)
  pg.drawCircle(-6, -3, 2.6)
  pg.drawCircle(6, -3, 2.6)
  pg.endFill()

  // 经验宝石：菱形
  const gg = new Graphics()
  gg.beginFill(0x4fd8ff)
  gg.moveTo(0, -8); gg.lineTo(6, 0); gg.lineTo(0, 8); gg.lineTo(-6, 0); gg.closePath()
  gg.endFill()

  const gb = new Graphics()
  gb.beginFill(0xffce50)
  gb.moveTo(0, -12); gb.lineTo(9, 0); gb.lineTo(0, 12); gb.lineTo(-9, 0); gb.closePath()
  gb.endFill()

  // 银箭
  const ag = new Graphics()
  ag.beginFill(0xdfe8ff)
  ag.drawRect(-14, -2, 24, 4)
  ag.moveTo(10, -5); ag.lineTo(18, 0); ag.lineTo(10, 5); ag.closePath()
  ag.endFill()

  // 血焰法球
  const og = new Graphics()
  og.beginFill(0xff5a1e, 0.35); og.drawCircle(0, 0, 15); og.endFill()
  og.beginFill(0xff7a2e); og.drawCircle(0, 0, 9); og.endFill()
  og.beginFill(0xffd7a0); og.drawCircle(-2, -2, 3.5); og.endFill()

  const enemy = {} as Record<EnemyKind, Texture>
  for (const kind of Object.keys(ENEMIES) as EnemyKind[]) {
    const def = ENEMIES[kind]
    const eg = new Graphics()
    eg.lineStyle(2, 0x000000, 0.45)
    eg.beginFill(def.color)
    eg.drawCircle(0, 0, def.r)
    eg.endFill()
    if (kind === 'elite' || kind === 'boss') {
      // 精英/Boss 加尖刺轮廓
      eg.beginFill(def.color)
      const spikes = 8
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2
        const r0 = def.r, r1 = def.r + 8
        eg.moveTo(Math.cos(a - 0.18) * r0, Math.sin(a - 0.18) * r0)
        eg.lineTo(Math.cos(a) * r1, Math.sin(a) * r1)
        eg.lineTo(Math.cos(a + 0.18) * r0, Math.sin(a + 0.18) * r0)
        eg.closePath()
      }
      eg.endFill()
    }
    eg.beginFill(0xff2020)
    eg.drawCircle(-def.r * 0.3, -def.r * 0.2, Math.max(2, def.r * 0.12))
    eg.drawCircle(def.r * 0.3, -def.r * 0.2, Math.max(2, def.r * 0.12))
    eg.endFill()
    enemy[kind] = gen(eg)
  }

  // 血月宝箱
  const cg = new Graphics()
  cg.beginFill(0xd8264a, 0.25); cg.drawCircle(0, 0, 26); cg.endFill()
  cg.lineStyle(2, 0xffce6b)
  cg.beginFill(0x6e2030); cg.drawRoundedRect(-16, -12, 32, 24, 4); cg.endFill()
  cg.beginFill(0xffce6b); cg.drawRect(-16, -3, 32, 6); cg.drawCircle(0, 0, 4); cg.endFill()

  // 狼牙哨塔：底座 + 炮管
  const tg = new Graphics()
  tg.lineStyle(2, 0x111111)
  tg.beginFill(0x4a4a5c); tg.drawCircle(0, 0, 18); tg.endFill()
  tg.beginFill(0x6a6a80); tg.drawCircle(0, 0, 11); tg.endFill()
  tg.beginFill(0xd0d0e0); tg.drawRect(6, -3, 22, 6); tg.endFill()
  tg.beginFill(0xff4d4d); tg.drawCircle(0, 0, 4); tg.endFill()

  // 血祭图腾：猩红柱
  const og2 = new Graphics()
  og2.lineStyle(2, 0x111111)
  og2.beginFill(0x8a1428); og2.drawRoundedRect(-10, -26, 20, 52, 5); og2.endFill()
  og2.beginFill(0xff4d6a); og2.drawCircle(0, -14, 6); og2.endFill()
  og2.beginFill(0x5a0c1a); og2.drawRect(-10, 2, 20, 6); og2.endFill()

  // 磁能虹吸柱：青蓝水晶
  const sg = new Graphics()
  sg.lineStyle(2, 0x111111)
  sg.beginFill(0x1a7a8c)
  sg.moveTo(0, -30); sg.lineTo(12, -6); sg.lineTo(8, 24); sg.lineTo(-8, 24); sg.lineTo(-12, -6); sg.closePath()
  sg.endFill()
  sg.beginFill(0x6fe8ff); sg.drawCircle(0, -8, 5); sg.endFill()

  return {
    player: gen(pg),
    gem: gen(gg),
    gemBig: gen(gb),
    arrow: gen(ag),
    orb: gen(og),
    chest: gen(cg),
    enemy,
    building: { turret: gen(tg), totem: gen(og2), siphon: gen(sg) },
  }
}

/** 背景网格纹理（按地图主题配色） */
export function makeGroundTexture(app: Application, theme: { base: number; line: number; dot: number }): Texture {
  const g = new Graphics()
  g.beginFill(theme.base)
  g.drawRect(0, 0, 128, 128)
  g.endFill()
  g.lineStyle(1, theme.line, 1)
  g.moveTo(0, 0); g.lineTo(128, 0)
  g.moveTo(0, 0); g.lineTo(0, 128)
  g.beginFill(theme.dot)
  for (let i = 0; i < 5; i++) {
    g.drawCircle(Math.random() * 128, Math.random() * 128, 1.5 + Math.random() * 2)
  }
  g.endFill()
  const t = app.renderer.generateTexture(g)
  g.destroy()
  return t
}
