import { Application, Graphics, Texture } from 'pixi.js'
import { BuildingId, ENEMIES, EnemyKind, PickupId } from '../core/config'

export interface Textures {
  player: Texture
  /** 程序化 4 帧行走动画（无外部素材时的默认动画） */
  playerFrames: Texture[]
  gem: Texture
  gemBig: Texture
  arrow: Texture
  orb: Texture
  chest: Texture
  coin: Texture
  shadow: Texture
  pickup: Record<PickupId, Texture>
  enemy: Record<EnemyKind, Texture>
  enemyFrames: Record<EnemyKind, Texture[]>
  building: Record<BuildingId, Texture>
}

/** 程序化生成占位美术（M0 阶段无需外部资源） */
export function makeTextures(app: Application): Textures {
  const gen = (g: Graphics) => {
    const t = app.renderer.generateTexture(g)
    g.destroy()
    return t
  }

  // 玩家：狼形剪影（深灰身体 + 狼耳 + 猩红双目），4 帧行走循环（上下起伏+耳朵摆动）
  const playerFrame = (dy: number, ear: number) => {
    const pg = new Graphics()
    pg.beginFill(0x1a1a24, 0.001) // 透明占位保证各帧同尺寸
    pg.drawRect(-22, -26, 44, 46)
    pg.endFill()
    pg.beginFill(0x3c3c4e)
    pg.drawEllipse(0, dy, 16, 16 - Math.abs(dy) * 0.6)
    pg.moveTo(-14, -8 + dy); pg.lineTo(-20 + ear, -24 + dy); pg.lineTo(-4, -13 + dy); pg.closePath()
    pg.moveTo(14, -8 + dy); pg.lineTo(20 + ear, -24 + dy); pg.lineTo(4, -13 + dy); pg.closePath()
    pg.endFill()
    pg.beginFill(0xff2d2d)
    pg.drawCircle(-6, -3 + dy, 2.6)
    pg.drawCircle(6, -3 + dy, 2.6)
    pg.endFill()
    return gen(pg)
  }
  const playerFrames = [playerFrame(0, 0), playerFrame(-2.5, 2), playerFrame(0, 0), playerFrame(2, -2)]

  // 通用投影（椭圆软阴影）
  const shg = new Graphics()
  shg.beginFill(0x000000, 0.32)
  shg.drawEllipse(0, 0, 16, 6)
  shg.endFill()

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
  const enemyFrames = {} as Record<EnemyKind, Texture[]>
  for (const kind of Object.keys(ENEMIES) as EnemyKind[]) {
    const def = ENEMIES[kind]
    // 每种怪 4 帧：呼吸/爬行式挤压拉伸（squash & stretch）
    const frame = (sq: number) => {
      const eg = new Graphics()
      const pad = def.r + 10
      eg.beginFill(0x000000, 0.001)
      eg.drawRect(-pad, -pad, pad * 2, pad * 2)
      eg.endFill()
      eg.lineStyle(2, 0x000000, 0.45)
      eg.beginFill(def.color)
      eg.drawEllipse(0, def.r * (1 - sq) * 0.5, def.r * (2 - sq) * 0.72, def.r * sq)
      eg.endFill()
      if (kind === 'elite' || kind === 'boss') {
        // 精英/Boss 加尖刺轮廓
        eg.beginFill(def.color)
        const spikes = 8
        for (let i = 0; i < spikes; i++) {
          const a = (i / spikes) * Math.PI * 2
          const r0 = def.r * sq, r1 = def.r * sq + 8
          eg.moveTo(Math.cos(a - 0.18) * r0, Math.sin(a - 0.18) * r0)
          eg.lineTo(Math.cos(a) * r1, Math.sin(a) * r1)
          eg.lineTo(Math.cos(a + 0.18) * r0, Math.sin(a + 0.18) * r0)
          eg.closePath()
        }
        eg.endFill()
      }
      eg.beginFill(0xff2020)
      const ey = -def.r * 0.2 * sq + def.r * (1 - sq) * 0.5
      eg.drawCircle(-def.r * 0.3, ey, Math.max(2, def.r * 0.12))
      eg.drawCircle(def.r * 0.3, ey, Math.max(2, def.r * 0.12))
      eg.endFill()
      return gen(eg)
    }
    enemyFrames[kind] = [frame(1), frame(0.88), frame(1), frame(1.1)]
    enemy[kind] = enemyFrames[kind][0]
  }

  // 金币
  const coin = new Graphics()
  coin.lineStyle(1.5, 0x8a6a10)
  coin.beginFill(0xffd24a); coin.drawCircle(0, 0, 7); coin.endFill()
  coin.beginFill(0xc89a20); coin.drawCircle(0, 0, 4); coin.endFill()

  // 局内道具图标
  const mk = (draw: (g: Graphics) => void) => {
    const g = new Graphics()
    g.beginFill(0xffffff, 0.12); g.drawCircle(0, 0, 14); g.endFill()
    draw(g)
    return g
  }
  const pk_magnet = mk(g => {
    g.lineStyle(4, 0xff4d4d); g.arc(0, 2, 7, Math.PI, 0)
    g.lineStyle(0)
    g.beginFill(0xd0d0e0); g.drawRect(-9, 0, 4, 7); g.drawRect(5, 0, 4, 7); g.endFill()
  })
  const pk_bomb = mk(g => {
    g.beginFill(0x2a2a34); g.drawCircle(0, 2, 8); g.endFill()
    g.lineStyle(2, 0xc89a20); g.moveTo(3, -5); g.lineTo(7, -10)
    g.lineStyle(0); g.beginFill(0xff7a2e); g.drawCircle(7, -10, 2.5); g.endFill()
  })
  const pk_potion = mk(g => {
    g.beginFill(0xff3a5a); g.drawRoundedRect(-5, -3, 10, 11, 3); g.endFill()
    g.beginFill(0xd0d0e0); g.drawRect(-2, -8, 4, 5); g.endFill()
  })
  const pk_freeze = mk(g => {
    g.beginFill(0x8ae8ff)
    g.moveTo(0, -9); g.lineTo(5, 0); g.lineTo(0, 9); g.lineTo(-5, 0); g.closePath()
    g.endFill()
    g.lineStyle(2, 0xd8f8ff); g.moveTo(-7, 0); g.lineTo(7, 0)
  })
  const pk_hourglass = mk(g => {
    g.beginFill(0xc06aff)
    g.moveTo(-6, -8); g.lineTo(6, -8); g.lineTo(0, 0); g.closePath()
    g.moveTo(-6, 8); g.lineTo(6, 8); g.lineTo(0, 0); g.closePath()
    g.endFill()
  })
  const pk_goldbag = mk(g => {
    g.beginFill(0xc89a20); g.drawCircle(0, 2, 8); g.endFill()
    g.beginFill(0x8a6a10); g.drawRect(-3, -8, 6, 4); g.endFill()
    g.beginFill(0xffd24a); g.drawCircle(0, 2, 4); g.endFill()
  })

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
    player: playerFrames[0],
    playerFrames,
    gem: gen(gg),
    gemBig: gen(gb),
    arrow: gen(ag),
    orb: gen(og),
    chest: gen(cg),
    coin: gen(coin),
    shadow: gen(shg),
    pickup: {
      magnet: gen(pk_magnet), bomb: gen(pk_bomb), potion: gen(pk_potion),
      freeze: gen(pk_freeze), hourglass: gen(pk_hourglass), goldbag: gen(pk_goldbag),
    },
    enemy,
    enemyFrames,
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
