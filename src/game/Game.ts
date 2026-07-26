import { Application, Container, Graphics, Sprite, Text, TilingSprite } from 'pixi.js'
import { Net } from '../net/net'
import {
  BuildingId, CFG, CHARS, CharId, ENEMIES, EVOLUTIONS, EnemyKind, MAPS, MapId, PASSIVES,
  RESONANCE_DESC, TAG_NAME, TagId, WeaponId, moonMul,
} from '../core/config'
import { MetaData, grantReward, loadMeta, saveMeta, talentLv } from '../core/meta'
import { clamp, dist2, fmtNum, fmtTime, rand } from '../core/utils'
import { Building } from './buildings'
import { Arrow, Bullet, Chest, Enemy, Gem } from './entities'
import { Fx } from './fx'
import { generateOptions, hideLevelUpUI, showLevelUpUI } from './levelup'
import { Player } from './player'
import { Textures, makeGroundTexture, makeTextures } from './textures'
import { FusedWeapon, Weapon, createEvolvedWeapon, createWeapon } from './weapons'
import { getFrames, getTex } from './assets'
import { RunSave, clearRun, loadRun, saveRun } from './persist'

type GameState = 'running' | 'levelup' | 'end'

interface RemoteView {
  sprite: Sprite
  label: Text
  hpBar: Graphics
  x: number; y: number
  state: { x: number; y: number; hp: number; maxHp: number; level: number; downed: boolean; name: string }
}

export class Game {
  app: Application
  world = new Container()
  bg!: TilingSprite
  tex!: Textures
  fx = new Fx()
  player!: Player

  enemies: Enemy[] = []
  arrows: Arrow[] = []
  gems: Gem[] = []
  buildings: Building[] = []
  chests: Chest[] = []
  bullets: Bullet[] = []
  private enemyPool: Enemy[] = []
  private arrowPool: Arrow[] = []
  private gemPool: Gem[] = []
  private bulletPool: Bullet[] = []
  private bossRingTimer = 0
  private bossAimTimer = 0

  state: GameState = 'running'
  time = 0
  kills = 0
  combo = 0
  private comboTimer = 0
  totalDamage = 0
  maxHit = 0

  private shake = 0
  private hitstop = 0
  private spawnTimer = 0
  private eliteTimer = 0
  private bossIdx = 0
  private boss: Enemy | null = null

  // ---- 联机 ----
  net: Net | null = null
  private remotes = new Map<string, RemoteView>()
  private enemyById = new Map<number, Enemy>()
  private hitQueue: [number, number][] = []
  private stateTimer = 0
  downed = false
  private reviveTarget: string | null = null
  private reviveProgress = 0
  private pendingBoss: { id: number; idx: number } | null = null

  // HUD 元素缓存
  private el = {
    hud: document.getElementById('hud')!,
    timer: document.getElementById('timer')!,
    kills: document.getElementById('kills')!,
    hpBar: document.getElementById('hp-bar')!,
    hpText: document.getElementById('hp-text')!,
    xpBar: document.getElementById('xp-bar')!,
    lvText: document.getElementById('lv-text')!,
    energyBar: document.getElementById('energy-bar')!,
    energyWrap: document.getElementById('energy-bar')!.parentElement!,
    weaponList: document.getElementById('weapon-list')!,
    bossWrap: document.getElementById('boss-bar-wrap')!,
    bossName: document.getElementById('boss-name')!,
    bossBar: document.getElementById('boss-bar')!,
    flash: document.getElementById('flash')!,
  }

  charId: CharId = 'rega'
  moonLv = 1
  mapId: MapId = 'wasteland'
  private persistTimer = 0
  get bossIdxPublic(): number { return this.bossIdx }
  get victoryAnnouncedPublic(): boolean { return this.victoryAnnounced }
  private meta: MetaData = loadMeta()
  private victoryAnnounced = false

  constructor(net: Net | null = null, charId: CharId = 'rega', moonLv = 1, mapId: MapId = 'wasteland') {
    this.net = net
    this.charId = charId
    this.moonLv = moonLv
    this.mapId = mapId
    this.app = new Application({
      resizeTo: window,
      background: 0x0a0508,
      antialias: true,
    })
    document.getElementById('game-root')!.appendChild(this.app.view as HTMLCanvasElement)

    this.tex = makeTextures(this.app)
    // 美术素材热替换（有则覆盖占位图）
    this.tex.gem = getTex('gem') ?? this.tex.gem
    this.tex.gemBig = getTex('gem_big') ?? this.tex.gemBig
    this.tex.arrow = getTex('arrow') ?? this.tex.arrow
    this.tex.orb = getTex('orb') ?? this.tex.orb
    this.tex.chest = getTex('chest') ?? this.tex.chest
    for (const b of ['turret', 'totem', 'siphon'] as const) {
      this.tex.building[b] = getTex('building_' + b) ?? this.tex.building[b]
    }
    const groundTex = getTex('ground_' + this.mapId) ?? makeGroundTexture(this.app, MAPS[this.mapId])
    this.bg = new TilingSprite(groundTex, 64, 64)
    this.app.stage.addChild(this.bg)
    this.app.stage.addChild(this.world)

    this.player = new Player(this.tex.player, () => this.trySkill())
    this.world.addChild(this.player.sprite)
    this.world.addChild(this.fx.layer)

    this.setupCharacter()
    this.player.setSkin(getFrames('player_' + this.charId) ?? this.tex.playerFrames)
    const pShadow = new Sprite(this.tex.shadow)
    pShadow.anchor.set(0.5)
    pShadow.position.set(0, 15)
    this.player.sprite.addChildAt(pShadow, 0)
    this.el.hud.classList.remove('hidden')
    ;(window as unknown as Record<string, unknown>).__game = this // 调试/自动化测试入口

    if (net) this.bindNet(net)
    else window.addEventListener('beforeunload', () => saveRun(this))

    this.app.ticker.add(() => {
      // 帧异常保护：单帧报错不中断游戏循环
      try {
        const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05)
        this.frame(dt)
      } catch (e) {
        console.error('[frame]', e)
      }
    })
  }

  // ------------------------------------------------------------ 角色与局外成长（M3）

  private setupCharacter(): void {
    const p = this.player
    const def = CHARS[this.charId]
    p.charId = this.charId

    // 局外血脉天赋
    p.atkPct += talentLv(this.meta, 'atk') * 2
    p.maxHp += talentLv(this.meta, 'hp') * 10
    p.hp = p.maxHp
    p.movePct += talentLv(this.meta, 'speed')
    p.luck = talentLv(this.meta, 'luck')

    // 角色被动
    switch (this.charId) {
      case 'vera': p.critChance += 10; p.hastePct += 15; break
      case 'vivi': p.buildDmgPct += 40; break
      case 'kane': p.areaMul = 1.3; break
      case 'gordon': p.maxHp += 60; p.hp = p.maxHp; break
      case 'rin': p.critChance += 15; p.critDmg += 50; break
      case 'sika': break // 被动在 dealDamage 中叠毒
      case 'laojin': p.luck += 6; p.pickupPct += 50; break
    }

    this.addWeapon(def.weapon)
    if (def.building) this.placeBuilding(def.building)

    document.getElementById('energy-text')!.textContent = `${def.skill.name} [空格]`
  }

  /** 从存档恢复上局进度（刷新后继续） */
  restoreRun(d: RunSave): void {
    this.time = d.time
    this.kills = d.kills
    this.totalDamage = d.totalDamage
    this.maxHit = d.maxHit
    this.bossIdx = d.bossIdx
    this.victoryAnnounced = d.victoryAnnounced
    const p = this.player
    Object.assign(p, d.player)
    p.pendingLevels = 0
    // 重建武器
    for (const w of p.weapons) w.dispose(this)
    p.weapons = d.weapons.map(w => {
      if (w.fused && w.subIds?.length === 2) {
        return new FusedWeapon(createEvolvedWeapon(w.subIds[0]), createEvolvedWeapon(w.subIds[1]))
      }
      const inst = w.evolved ? createEvolvedWeapon(w.id) : createWeapon(w.id)
      inst.level = w.level
      inst.copies = w.copies
      return inst
    })
    // 重建筑造物
    for (const b of this.buildings) b.destroy(this)
    this.buildings = d.buildings.map(b => {
      const inst = new Building(b.id as BuildingId, this, b.x, b.y)
      inst.level = b.level
      inst.maxHp = inst.maxHp * b.level
      inst.hp = b.hp
      inst.sprite.scale.set(1 + 0.15 * (b.level - 1))
      inst.redrawAura(this)
      return inst
    })
    this.announce(`已恢复上局进度：${CHARS[this.charId].name} · ${fmtTime(d.time)}`, false, true)
  }

  /** 主动技能（空格），能量满释放 */
  trySkill(): void {
    if (this.state !== 'running' || this.downed) return
    const p = this.player
    if (this.charId === 'rega') {
      if (p.startRage()) { this.flash(); this.shake = 10 }
      return
    }
    if (p.energy < CFG.rage.energyMax) return
    p.energy = 0
    this.flash()
    this.shake = 14
    switch (this.charId) {
      case 'vera': {
        // 月影齐射：16 向穿透箭
        const bow = p.weapons.find(w => w.id === 'bow')
        const dmg = (bow?.dmg ?? 22) * 2
        for (let i = 0; i < 16; i++) {
          this.spawnArrow(p.x, p.y, (i / 16) * Math.PI * 2, dmg, 6)
        }
        break
      }
      case 'vivi':
        // 快速筑造：免费放置/升级哨塔
        this.placeBuilding('turret')
        break
      case 'kane': {
        // 血月陨落：全屏陨石
        const orb = p.weapons.find(w => w.id === 'orb')
        const dmg = (orb?.dmg ?? 9) * 6
        for (const e of [...this.enemies]) {
          if (!e.alive) continue
          if (dist2(e.x, e.y, p.x, p.y) < 700 ** 2) {
            this.fx.explosion(e.x, e.y, 60)
            this.dealDamage(e, dmg)
          }
        }
        this.hitstop = 0.08
        break
      }
      case 'gordon':
        // 磁石护罩：5秒无敌+接触反噬
        p.invulnTimer = 5
        break
      case 'sika':
        // 瘟疫领域：大范围+6层剧毒
        for (const e of this.enemies) {
          if (e.alive && dist2(e.x, e.y, p.x, p.y) < 400 ** 2) e.poison = Math.min(8, e.poison + 6)
        }
        break
      case 'laojin': {
        // 掷命骰：赌一把
        if (Math.random() < 0.6) {
          const keys = Object.keys(PASSIVES)
          const key = keys[Math.floor(Math.random() * keys.length)]
          const def = PASSIVES[key]
          p.applyPassive(key, def.values[3])
          this.announce(`🎲 掷命骰：${def.name}（传说）！${def.desc(def.values[3])}`, false, true)
        } else {
          p.hp = Math.max(1, p.hp * 0.85)
          this.announce('🎲 掷命骰失败：失去15%生命', true)
        }
        break
      }
      case 'rin': {
        // 千影闪：近身五连必暴击
        const claw = p.weapons.find(w => w.id === 'claw')
        const dmg = claw?.dmg ?? 16
        for (const e of [...this.enemies]) {
          if (!e.alive || dist2(e.x, e.y, p.x, p.y) > 300 ** 2) continue
          for (let i = 0; i < 5; i++) this.dealDamage(e, dmg, { forceCrit: true })
        }
        this.fx.slash(p.x, p.y, 0, 300, Math.PI * 2)
        this.hitstop = 0.08
        break
      }
    }
  }

  // ------------------------------------------------------------ 联机（M2：服务器怪物权威 + 消息同步）

  private bindNet(net: Net): void {
    this.announce(`已连接房间 ${net.roomId} · 分享房号邀请队友`, false, true)
    net.onStatus = msg => this.announce(msg, true)
    net.bind({
      onInit: d => {
        this.time = d.time
        for (let i = 0; i < d.gems.length; i += 4) this.netSpawnGem(d.gems[i], d.gems[i + 1], d.gems[i + 2], d.gems[i + 3])
        for (let i = 0; i < d.chests.length; i += 3) this.netSpawnChest(d.chests[i], d.chests[i + 1], d.chests[i + 2])
      },
      onSnap: data => this.applySnapshot(data),
      onDead: d => {
        const e = this.enemyById.get(d.id)
        if (e) {
          e.x = d.x; e.y = d.y
          this.netKillEnemy(e)
        }
      },
      onGemAdd: d => this.netSpawnGem(d.id, d.x, d.y, d.v),
      onGemRemove: d => {
        const idx = this.gems.findIndex(g => g.netId === d.id)
        if (idx >= 0) {
          const g = this.gems[idx]
          this.world.removeChild(g.sprite)
          g.sprite.visible = false
          this.gems.splice(idx, 1)
          if (this.gemPool.length < 100) this.gemPool.push(g)
        }
      },
      onXp: d => this.player.gainXP(d.v), // 经验全队共享
      onChestAdd: d => this.netSpawnChest(d.id, d.x, d.y),
      onChestRemove: d => {
        const idx = this.chests.findIndex(c => c.netId === d.id)
        if (idx >= 0) {
          const c = this.chests[idx]
          this.world.removeChild(c.sprite)
          c.sprite.destroy()
          this.chests.splice(idx, 1)
          if (d.by === this.net!.id) this.openChest(c.x, c.y)
        }
      },
      onBoss: d => {
        this.pendingBoss = d
        this.el.bossName.textContent = d.idx === 1 ? '血月魔王 · 加尔诺' : '永夜狼王 · 弗恩里'
        this.el.bossWrap.classList.remove('hidden')
        this.flash()
      },
      onPState: d => this.updateRemote(d),
      onPLeave: d => this.removeRemote(d.id),
      onRevived: d => {
        if (d.id === this.net!.id) {
          this.downed = false
          this.player.hp = this.player.maxHp * 0.5
          this.announce('你被队友救起了！', false, true)
        } else {
          const r = this.remotes.get(d.id)
          if (r) r.state.downed = false
          this.announce('队友被救起')
        }
      },
      onOver: d => this.end(d.victory),
    })
  }

  private netSpawnGem(netId: number, x: number, y: number, v: number): void {
    if (this.gems.some(g => g.netId === netId)) return
    const g = this.gemPool.pop() ?? new Gem(this.tex.gem)
    g.sprite.texture = v >= 10 ? this.tex.gemBig : this.tex.gem
    g.init(x, y, v)
    g.netId = netId
    this.world.addChildAt(g.sprite, 0)
    this.gems.push(g)
  }

  private netSpawnChest(netId: number, x: number, y: number): void {
    if (this.chests.some(c => c.netId === netId)) return
    const c = new Chest(this.tex.chest, x, y)
    c.netId = netId
    this.world.addChild(c.sprite)
    this.chests.push(c)
  }

  /** 应用服务器怪物快照：[id, kindIdx, x, y, hp%] */
  private applySnapshot(data: number[]): void {
    const KINDS: EnemyKind[] = ['bat', 'skeleton', 'boar', 'elite', 'boss']
    const seen = new Set<number>()
    for (let i = 0; i < data.length; i += 5) {
      const id = data[i]
      const kind = KINDS[data[i + 1]] ?? 'bat'
      const x = data[i + 2], y = data[i + 3], hpPct = data[i + 4]
      seen.add(id)
      let e = this.enemyById.get(id)
      if (!e) {
        e = this.enemyPool.pop() ?? new Enemy(this.tex.enemy[kind], this.tex.shadow)
        e.setSkin(getFrames('enemy_' + kind) ?? this.tex.enemyFrames[kind])
        const hpMul = Math.pow(CFG.enemyHpGrowthPerMin, this.time / 60)
        e.init(kind, x, y, hpMul, 1 + (this.time / 60) * CFG.enemyDmgGrowthPerMin)
        e.netId = id
        this.world.addChildAt(e.sprite, 0)
        this.enemies.push(e)
        this.enemyById.set(id, e)
        if (this.pendingBoss && this.pendingBoss.id === id) {
          this.boss = e
          e.maxHp = e.hp
          this.pendingBoss = null
        }
      }
      e.tx = x; e.ty = y
      // 服务器血量权威（百分比纠偏）
      e.hp = Math.min(e.hp, (hpPct / 100) * e.maxHp + 1)
    }
    // 快照中消失且未收到死亡事件的怪物：静默移除
    for (const [id, e] of this.enemyById) {
      if (!seen.has(id)) {
        e.alive = false
        this.enemyById.delete(id)
      }
    }
  }

  /** 联机模式下的击杀表现（死亡由服务器判定） */
  private netKillEnemy(e: Enemy): void {
    if (!e.alive) return
    e.alive = false
    this.enemyById.delete(e.netId)
    this.kills++
    this.fx.deathBurst(e.x, e.y, ENEMIES[e.kind].color)
    this.player.energy = Math.min(CFG.rage.energyMax, this.player.energy + CFG.rage.energyPerKill)
    if (this.player.tags.blood >= 3) this.player.heal(1)
    if (e.isBoss || this.boss === e) {
      this.boss = null
      this.el.bossWrap.classList.add('hidden')
      this.flash()
      this.shake = 20
    }
  }

  /** 倒地（联机）：等待队友救援，全灭才失败（服务器判定） */
  private enterDowned(): void {
    if (this.downed) return
    this.downed = true
    this.player.hp = 0
    this.player.sprite.alpha = 0.35
    this.announce('你倒下了！队友靠近 3 秒可将你救起', true)
  }

  private updateRemote(d: { id: string } & RemoteView['state']): void {
    let r = this.remotes.get(d.id)
    if (!r) {
      const sprite = new Sprite(this.tex.player)
      sprite.anchor.set(0.5)
      sprite.tint = 0x8ab4ff // 队友蓝色调
      const label = new Text(d.name || '狼裔', {
        fontFamily: 'Arial', fontSize: 12, fill: 0xaaccff, stroke: 0x000000, strokeThickness: 3,
      })
      label.anchor.set(0.5)
      const hpBar = new Graphics()
      this.world.addChild(sprite, label, hpBar)
      r = { sprite, label, hpBar, x: d.x, y: d.y, state: d }
      this.remotes.set(d.id, r)
      this.announce(`${d.name || '狼裔'} 加入了战斗`)
    }
    r.state = d
  }

  private removeRemote(id: string): void {
    const r = this.remotes.get(id)
    if (!r) return
    r.sprite.destroy(); r.label.destroy(); r.hpBar.destroy()
    this.remotes.delete(id)
    this.announce('一名队友离开了')
  }

  private updateNet(dt: number): void {
    const net = this.net!
    const p = this.player

    // 10Hz 上报自身状态
    this.stateTimer += dt
    if (this.stateTimer >= 0.1) {
      this.stateTimer = 0
      net.sendState({
        x: Math.round(p.x), y: Math.round(p.y),
        hp: Math.round(p.hp), maxHp: p.maxHp,
        level: p.level, downed: this.downed, name: CHARS[this.charId].name,
      })
      net.sendHits(this.hitQueue)
      this.hitQueue = []
    }

    // 渲染队友（插值）
    for (const r of this.remotes.values()) {
      r.x += (r.state.x - r.x) * Math.min(1, dt * 10)
      r.y += (r.state.y - r.y) * Math.min(1, dt * 10)
      r.sprite.position.set(r.x, r.y)
      r.sprite.alpha = r.state.downed ? 0.35 : 1
      r.label.position.set(r.x, r.y - 34)
      r.hpBar.clear()
      r.hpBar.beginFill(0x000000, 0.5).drawRect(r.x - 16, r.y - 26, 32, 4).endFill()
      r.hpBar.beginFill(r.state.downed ? 0x777777 : 0xff4d4d)
        .drawRect(r.x - 16, r.y - 26, 32 * clamp(r.state.hp / r.state.maxHp, 0, 1), 4).endFill()
    }

    // 救援：靠近倒地队友 3 秒
    if (!this.downed) {
      let target: string | null = null
      for (const [id, r] of this.remotes) {
        if (r.state.downed && dist2(p.x, p.y, r.x, r.y) < 70 ** 2) { target = id; break }
      }
      if (target) {
        if (this.reviveTarget !== target) { this.reviveTarget = target; this.reviveProgress = 0 }
        this.reviveProgress += dt
        if (this.reviveProgress >= 3) {
          net.revive(target)
          this.reviveTarget = null
          this.reviveProgress = 0
        }
      } else {
        this.reviveTarget = null
        this.reviveProgress = 0
      }
    }
  }

  // ------------------------------------------------------------ 主循环

  private frame(dt: number): void {
    this.bg.width = this.app.screen.width
    this.bg.height = this.app.screen.height

    if (this.hitstop > 0) {
      this.hitstop -= dt
      this.updateCamera()
      return
    }
    if (this.state === 'end') return
    // 联机模式：三选一不暂停游戏（GDD 9.2），单机则暂停
    if (this.state === 'levelup' && !this.net) return

    this.time += dt
    // 单机：达成生存目标后进入无尽模式（不结束，怪物继续膨胀）
    if (!this.net && this.time >= CFG.winTime && !this.victoryAnnounced) {
      this.victoryAnnounced = true
      // 解锁立即落存档（防中途关页面丢进度），血晶奖励在结算时发放
      if (this.moonLv >= this.meta.moonUnlocked && this.meta.moonUnlocked < 30) {
        this.meta.moonUnlocked = this.moonLv + 1
        saveMeta(this.meta)
      }
      this.flash()
      this.announce(`🌕 血月退散！血月等级 ${this.moonLv} 通关 · 进入无尽模式`, false, true)
    }

    if (!this.downed) {
      this.player.update(dt)
      for (const w of this.player.weapons) w.update(this, dt)
    }
    if (this.net) this.updateNet(dt)
    else this.updateSpawner(dt)
    this.updateEnemies(dt)
    this.updateArrows(dt)
    this.updateGems(dt)
    this.updateBuildings(dt)
    this.updateChests(dt)
    this.updateBullets(dt)
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0 }
    if (!this.net) {
      this.persistTimer += dt
      if (this.persistTimer >= 3) { this.persistTimer = 0; saveRun(this) }
    }
    this.fx.update(dt)
    this.updateCamera()
    this.updateHUD()

    if (this.player.pendingLevels > 0 && this.state === 'running') this.openLevelUp()
  }

  private updateCamera(): void {
    const cx = this.app.screen.width / 2
    const cy = this.app.screen.height / 2
    let ox = 0, oy = 0
    if (this.shake > 0.5) {
      ox = rand(-this.shake, this.shake)
      oy = rand(-this.shake, this.shake)
      this.shake *= 0.86
    } else this.shake = 0
    this.world.position.set(cx - this.player.x + ox, cy - this.player.y + oy)
    this.bg.tilePosition.set(-this.player.x + ox, -this.player.y + oy)
  }

  // ------------------------------------------------------------ 刷怪

  private updateSpawner(dt: number): void {
    const min = this.time / 60

    this.spawnTimer -= dt
    if (this.spawnTimer <= 0) {
      this.spawnTimer = clamp(1.2 - min * 0.08, 0.3, 1.2)
      const count = Math.min(2 + Math.floor(this.time / 20), 16)
      for (let i = 0; i < count; i++) {
        if (this.enemies.length >= CFG.maxEnemies) break
        this.spawnEnemy(this.pickKind())
      }
    }

    // 精英：2 分钟后每 45 秒一只，随机词缀（GDD 10.2）
    if (this.time >= ENEMIES.elite.unlockAt) {
      this.eliteTimer -= dt
      if (this.eliteTimer <= 0) {
        this.eliteTimer = 45
        const e = this.spawnEnemy('elite')
        if (e) {
          const affixes = ['split', 'boom', 'magnet'] as const
          e.affix = affixes[Math.floor(Math.random() * affixes.length)]
          e.sprite.tint = e.affix === 'split' ? 0x8affff : e.affix === 'boom' ? 0xff8a3a : 0xff6ad0
          this.announce(`精英来袭：${e.affix === 'split' ? '分裂' : e.affix === 'boom' ? '自爆' : '磁力'}词缀`, true)
        }
      }
    }

    // Boss
    if (this.bossIdx < CFG.bossTimes.length && this.time >= CFG.bossTimes[this.bossIdx]) {
      this.bossIdx++
      const b = this.spawnEnemy('boss')
      if (b) {
        b.maxHp = b.hp = b.hp * this.bossIdx * 2
        this.boss = b
        this.el.bossName.textContent = this.bossIdx === 1 ? '血月魔王 · 加尔诺' : '永夜狼王 · 弗恩里'
        this.el.bossWrap.classList.remove('hidden')
        this.flash()
      }
    }
  }

  private pickKind(): EnemyKind {
    const pool: EnemyKind[] = []
    for (const k of ['bat', 'skeleton', 'boar'] as EnemyKind[]) {
      const def = ENEMIES[k]
      if (this.time >= def.unlockAt) {
        for (let i = 0; i < def.weight; i++) pool.push(k)
      }
    }
    return pool[Math.floor(Math.random() * pool.length)]
  }

  private spawnEnemy(kind: EnemyKind): Enemy | null {
    const e = this.enemyPool.pop() ?? new Enemy(this.tex.enemy[kind], this.tex.shadow)
    e.setSkin(getFrames('enemy_' + kind) ?? this.tex.enemyFrames[kind])
    const min = this.time / 60
    // 血月等级压制（GDD 8.3）：血量全额倍率，伤害温和递增
    const hpMul = Math.pow(CFG.enemyHpGrowthPerMin, min) * moonMul(this.moonLv)
    const dmgMul = (1 + min * CFG.enemyDmgGrowthPerMin) * (1 + (this.moonLv - 1) * 0.15)
    const ang = Math.random() * Math.PI * 2
    const dist = Math.max(this.app.screen.width, this.app.screen.height) / 2 + 80
    e.init(kind, this.player.x + Math.cos(ang) * dist, this.player.y + Math.sin(ang) * dist, hpMul, dmgMul)
    this.world.addChildAt(e.sprite, 0)
    this.enemies.push(e)
    return e
  }

  private updateEnemies(dt: number): void {
    const p = this.player
    let contactDmg = 0
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]
      if (!e.alive) {
        this.recycleEnemy(e, i)
        continue
      }
      if (e.orbCd > 0) e.orbCd -= dt

      // 毒瘟结算（每0.8秒一跳，每层4点基础伤害）
      if (e.poison > 0) {
        e.poisonTick += dt
        if (e.poisonTick >= 0.8) {
          e.poisonTick = 0
          e.sprite.tint = 0x7aff5a
          this.dealDamage(e, e.poison * 4, { noPoison: true })
          if (!e.alive) continue
        }
      }

      let d: number
      if (this.net) {
        // 联机：向服务器快照位置插值
        e.x += (e.tx - e.x) * Math.min(1, dt * 8)
        e.y += (e.ty - e.y) * Math.min(1, dt * 8)
        d = Math.hypot(p.x - e.x, p.y - e.y) || 1
      } else {
        // 血月狂暴（无尽模式）：全怪提速40%变红
        const frenzy = this.victoryAnnounced ? 1.4 : 1
        const dx = p.x - e.x, dy = p.y - e.y
        d = Math.hypot(dx, dy) || 1
        e.x += (dx / d) * e.speed * frenzy * dt
        e.y += (dy / d) * e.speed * frenzy * dt
        if (this.victoryAnnounced) e.sprite.tint = 0xff8080
      }
      if (e.hitPulse > 0.01) {
        e.hitPulse *= Math.exp(-10 * dt)
        e.sprite.scale.set(1 + 0.22 * e.hitPulse)
      }
      e.sprite.position.set(e.x, e.y)

      // 接触伤害（持续型，堆叠有上限；倒地/选卡时免疫）
      if (d < e.r + p.radius) {
        contactDmg += e.dmg
        // 戈登护罩反噬
        if (p.invulnTimer > 0 && this.charId === 'gordon' && e.orbCd <= 0) {
          e.orbCd = 0.4
          this.dealDamage(e, 30)
        }
      }

      // 磨损筑造物
      for (const b of this.buildings) {
        if (dist2(e.x, e.y, b.x, b.y) < (e.r + 26) ** 2) b.hp -= e.dmg * 0.5 * dt
      }
    }
    const invuln = this.downed || this.state === 'levelup' || p.invulnTimer > 0
    if (contactDmg > 0 && !invuln) {
      p.hp -= Math.min(contactDmg, CFG.player.maxContactDps) * dt
      if (p.hp <= 0) {
        if (this.net) this.enterDowned()
        else this.end(false)
      }
    }
  }

  private recycleEnemy(e: Enemy, idx: number): void {
    this.world.removeChild(e.sprite)
    e.sprite.visible = false
    this.enemies.splice(idx, 1)
    if (this.enemyPool.length < 100) this.enemyPool.push(e)
  }

  // ------------------------------------------------------------ Boss 弹幕（战魂铭人式）

  private updateBullets(dt: number): void {
    const p = this.player
    // Boss 存活时发射弹幕（单机与联机通用，基于本地 Boss 位置）
    const boss = this.boss && this.boss.alive ? this.boss : null
    if (boss) {
      const dmg = 14 * (1 + (this.moonLv - 1) * 0.15)
      this.bossRingTimer += dt
      if (this.bossRingTimer >= 2.4) {
        this.bossRingTimer = 0
        const offset = Math.random() * Math.PI * 2
        for (let i = 0; i < 14; i++) {
          this.spawnBullet(boss.x, boss.y, offset + (i / 14) * Math.PI * 2, 180, dmg)
        }
      }
      this.bossAimTimer += dt
      if (this.bossAimTimer >= 4.5) {
        this.bossAimTimer = 0
        const aim = Math.atan2(p.y - boss.y, p.x - boss.x)
        for (let i = -2; i <= 2; i++) {
          this.spawnBullet(boss.x, boss.y, aim + i * 0.18, 300, dmg)
        }
      }
    }

    const invuln = this.downed || this.state === 'levelup' || p.invulnTimer > 0
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]
      b.life -= dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.sprite.position.set(b.x, b.y)
      let dead = b.life <= 0
      if (!dead && !invuln && dist2(b.x, b.y, p.x, p.y) < (10 + p.radius) ** 2) {
        p.hp -= b.dmg
        this.shake = Math.max(this.shake, 5)
        dead = true
        if (p.hp <= 0) {
          if (this.net) this.enterDowned()
          else this.end(false)
        }
      }
      if (dead) {
        this.world.removeChild(b.sprite)
        b.sprite.visible = false
        this.bullets.splice(i, 1)
        if (this.bulletPool.length < 80) this.bulletPool.push(b)
      }
    }
  }

  private spawnBullet(x: number, y: number, angle: number, speed: number, dmg: number): void {
    const b = this.bulletPool.pop() ?? new Bullet(this.tex.orb)
    b.init(x, y, angle, speed, dmg)
    this.world.addChild(b.sprite)
    this.bullets.push(b)
  }

  // ------------------------------------------------------------ 弹体

  spawnArrow(x: number, y: number, angle: number, dmg: number, pierce: number, opts?: { tint?: number; building?: boolean }): void {
    const a = this.arrowPool.pop() ?? new Arrow(this.tex.arrow)
    a.init(x, y, angle, 720, dmg, pierce, opts?.tint ?? 0xffffff, opts?.building ?? false)
    this.world.addChild(a.sprite)
    this.arrows.push(a)
  }

  private updateArrows(dt: number): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i]
      a.life -= dt
      a.x += a.vx * dt
      a.y += a.vy * dt
      a.sprite.position.set(a.x, a.y)

      if (a.life > 0 && a.pierce >= 0) {
        for (const e of this.enemies) {
          if (!e.alive || a.hit.has(e)) continue
          if (dist2(a.x, a.y, e.x, e.y) < (12 + e.r) ** 2) {
            a.hit.add(e)
            this.dealDamage(e, a.dmg, { building: a.fromBuilding })
            a.pierce--
            if (a.pierce < 0) break
          }
        }
      }
      if (a.life <= 0 || a.pierce < 0) {
        this.world.removeChild(a.sprite)
        a.sprite.visible = false
        this.arrows.splice(i, 1)
        if (this.arrowPool.length < 60) this.arrowPool.push(a)
      }
    }
  }

  // ------------------------------------------------------------ 伤害结算（GDD 8.1 乘区公式）

  nearestEnemies(n: number): Enemy[] {
    const p = this.player
    return [...this.enemies]
      .filter(e => e.alive)
      .sort((a, b) => dist2(p.x, p.y, a.x, a.y) - dist2(p.x, p.y, b.x, b.y))
      .slice(0, n)
  }

  nearestEnemyTo(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null
    let bestD = range * range
    for (const e of this.enemies) {
      if (!e.alive) continue
      const d = dist2(x, y, e.x, e.y)
      if (d < bestD) { bestD = d; best = e }
    }
    return best
  }

  /** 伤害乘区结算（GDD 8.1）+ 流派共鸣效果 */
  dealDamage(e: Enemy, base: number, opts?: { forceCrit?: boolean; building?: boolean; noPoison?: boolean }): void {
    if (!e.alive) return
    const p = this.player
    const tags = p.tags

    // 丝卡被动：攻击叠毒
    if (this.charId === 'sika' && !opts?.noPoison) e.poison = Math.min(8, e.poison + 1)

    // 暴击共鸣 III/V/VII
    let critChance = p.critChance + (tags.crit >= 3 ? 8 : 0)
    let critDmg = p.critDmg + (tags.crit >= 5 ? 60 : 0)
    if (tags.crit >= 7 && critChance > 100) critDmg += (critChance - 100) * 2
    const crit = opts?.forceCrit || Math.random() * 100 < critChance

    let mul: number
    if (opts?.building) {
      // 筑造物：默认继承 50% 攻击力加成，筑造共鸣 V 继承 100%，工程蓝图独立乘区
      const inherit = tags.build >= 5 ? 1 : 0.5
      mul = (1 + (p.atkPct / 100) * inherit) * (1 + p.buildDmgPct / 100)
    } else {
      mul = 1 + p.atkPct / 100
      // 雷加专属被动：血量越低伤害越高（最高 +150%）
      if (this.charId === 'rega') {
        mul *= 1 + CFG.player.lowHpDmgBonus * (1 - Math.max(0, p.hp) / p.maxHp)
      }
    }
    // 嗜血共鸣 VII
    if (tags.blood >= 7 && p.hp < p.maxHp * 0.5) mul *= 1.4

    const dmg = base * mul * (crit ? critDmg / 100 : 1)

    e.hp -= dmg
    e.hitPulse = 1
    this.totalDamage += dmg
    if (dmg > this.maxHit) this.maxHit = dmg
    this.fx.damageText(e.x, e.y - e.r, dmg, crit)
    if (crit) { this.hitstop = Math.max(this.hitstop, 0.03); this.shake = Math.max(this.shake, 4) }

    // 联机：命中上报服务器权威结算，死亡等服务器判定
    if (this.net) {
      this.hitQueue.push([e.netId, Math.round(dmg)])
      return
    }

    // 血怒吸血 + 嗜血共鸣 V
    let steal = 0
    if (p.raging) steal += CFG.rage.lifesteal
    if (tags.blood >= 5) steal += 0.02
    if (steal > 0 && p.hp < p.maxHp) {
      const heal = Math.min(dmg * steal, p.maxHp * 0.05)
      p.heal(heal)
      if (Math.random() < 0.06) this.fx.healText(p.x, p.y, heal)
    }

    if (e.hp <= 0) this.killEnemy(e)
  }

  private killEnemy(e: Enemy): void {
    e.alive = false
    this.kills++
    this.fx.deathBurst(e.x, e.y, ENEMIES[e.kind].color)
    this.onCombo()
    // 精英词缀结算
    if (e.affix === 'split') {
      for (let i = 0; i < 4; i++) {
        const s = this.spawnEnemy('bat')
        if (s) { s.x = e.x + rand(-40, 40); s.y = e.y + rand(-40, 40) }
      }
      this.announce('精英分裂！')
    } else if (e.affix === 'boom') {
      this.fx.explosion(e.x, e.y, 130)
      this.shake = Math.max(this.shake, 8)
      if (dist2(e.x, e.y, this.player.x, this.player.y) < 130 ** 2 && this.player.invulnTimer <= 0 && !this.downed) {
        this.player.hp -= 25
        if (this.player.hp <= 0) { if (this.net) this.enterDowned(); else this.end(false) }
      }
    } else if (e.affix === 'magnet') {
      for (const g of this.gems) g.attracted = true
      this.announce('磁力脉冲！全场经验飞向你', false, true)
    }
    this.player.energy = Math.min(CFG.rage.energyMax, this.player.energy + CFG.rage.energyPerKill)
    this.dropGem(e.x, e.y, Math.round(e.xp * (1 + (this.time / 60) * CFG.gemValueGrowthPerMin)))

    // 嗜血共鸣 III：击杀回血
    if (this.player.tags.blood >= 3) this.player.heal(1)

    // 精英/Boss 掉落血月宝箱
    if (e.kind === 'elite' || e.isBoss) this.dropChest(e.x, e.y)

    if (e.isBoss) {
      this.boss = null
      this.el.bossWrap.classList.add('hidden')
      this.flash()
      this.shake = 20
      // Boss 掉落一圈宝石
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        this.dropGem(e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, 15)
      }
    }
  }

  // ------------------------------------------------------------ 经验宝石

  private dropGem(x: number, y: number, value: number): void {
    // 地面宝石超上限：合并进随机现存宝石（GDD 性能规则）
    if (this.gems.length >= CFG.maxGems) {
      const g = this.gems[Math.floor(Math.random() * this.gems.length)]
      g.value += value
      g.sprite.texture = this.tex.gemBig
      return
    }
    const g = this.gemPool.pop() ?? new Gem(this.tex.gem)
    g.sprite.texture = value >= 10 ? this.tex.gemBig : this.tex.gem
    g.init(x, y, value)
    this.world.addChildAt(g.sprite, 0)
    this.gems.push(g)
  }

  private updateGems(dt: number): void {
    const p = this.player
    const range2 = p.pickupRange ** 2
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i]
      g.sprite.scale.set(1 + 0.13 * Math.sin(this.time * 6 + g.x * 0.05))
      const d2 = dist2(g.x, g.y, p.x, p.y)
      if (!g.attracted && d2 < range2) g.attracted = true
      if (g.attracted) {
        const d = Math.sqrt(d2) || 1
        const spd = 520 + (p.pickupRange * 2) / Math.max(d / 60, 1)
        g.x += ((p.x - g.x) / d) * spd * dt
        g.y += ((p.y - g.y) / d) * spd * dt
        g.sprite.position.set(g.x, g.y)
        if (d < 24) {
          if (this.net) {
            // 联机：向服务器认领，经验由服务器广播全队共享
            if (!g.claimed) { g.claimed = true; this.net.claimGem(g.netId) }
          } else {
            p.gainXP(g.value)
            this.world.removeChild(g.sprite)
            g.sprite.visible = false
            this.gems.splice(i, 1)
            if (this.gemPool.length < 100) this.gemPool.push(g)
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ 筑造系统（GDD 7章）

  placeBuilding(id: BuildingId): void {
    const owned = this.buildings.find(b => b.id === id)
    if (owned) {
      owned.upgrade(this)
      this.announce(`${owned.name} 升至 Lv${owned.level}`)
      return
    }
    const b = new Building(id, this, this.player.x, this.player.y)
    this.buildings.push(b)
  }

  private updateBuildings(dt: number): void {
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i]
      if (b.hp <= 0) {
        this.announce(`${b.name} 被摧毁了！`, true)
        this.fx.explosion(b.x, b.y, 50)
        b.destroy(this)
        this.buildings.splice(i, 1)
        continue
      }
      b.update(this, dt)
    }
  }

  // ------------------------------------------------------------ 血月宝箱与武器进化（GDD 5.3）

  dropChest(x: number, y: number): void {
    if (this.chests.length >= 3) return
    const c = new Chest(this.tex.chest, x, y)
    this.world.addChild(c.sprite)
    this.chests.push(c)
    this.announce('血月宝箱降临！拾取以进化武器')
  }

  private updateChests(dt: number): void {
    const p = this.player
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i]
      c.update(dt)
      if (dist2(c.x, c.y, p.x, p.y) < 44 ** 2) {
        if (this.net) {
          // 联机：先到先得，由服务器仲裁
          if (!c.claimed) { c.claimed = true; this.net.claimChest(c.netId) }
        } else {
          this.world.removeChild(c.sprite)
          c.sprite.destroy()
          this.chests.splice(i, 1)
          this.openChest(c.x, c.y)
        }
      }
    }
  }

  private openChest(x: number, y: number): void {
    // 进化条件：3级未进化武器 + 对应被动 Lv3+
    const p = this.player
    const target = p.weapons.find(w =>
      w.level >= 3 && !w.evolved && (p.passiveLv[EVOLUTIONS[w.id].requires] ?? 0) >= 3,
    )
    if (target) {
      this.evolveWeapon(target)
      return
    }
    // 禁忌融合（GDD 5.4）：两把进化武器合而为一，效果全保留并腾出武器槽
    const evolved = p.weapons.filter(w => w.evolved && !w.fused)
    if (evolved.length >= 2) {
      const [a, b] = evolved
      const fusion = new FusedWeapon(a, b)
      p.weapons = p.weapons.filter(w => w !== a && w !== b)
      p.weapons.push(fusion)
      p.atkPct += 30 // 禁忌之力
      this.flash()
      this.shake = 24
      this.hitstop = 0.15
      this.fx.burstRing(p.x, p.y)
      this.announce(`☠ 禁忌融合！${a.name} + ${b.name} → ${fusion.name}（攻击力+30%，武器槽+1）`, false, true)
      return
    }
    // 无可进化：补给（经验爆珠 + 治疗）
    p.heal(25)
    const value = Math.max(3, Math.round(6 * (1 + (this.time / 60) * CFG.gemValueGrowthPerMin)))
    if (this.net) {
      p.gainXP(value * 8) // 联机：宝箱经验直接入账（服务器不追踪补给宝石）
    } else {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        this.dropGem(x + Math.cos(a) * 40, y + Math.sin(a) * 40, value)
      }
    }
    this.announce('血月宝箱：获得补给')
  }

  private evolveWeapon(w: Weapon): void {
    const idx = this.player.weapons.indexOf(w)
    if (idx < 0) return
    w.dispose(this)
    const evo = createEvolvedWeapon(w.id)
    this.player.weapons[idx] = evo
    this.flash()
    this.shake = 22
    this.hitstop = 0.12
    this.fx.burstRing(this.player.x, this.player.y)
    this.announce(`⚔ 武器进化！${w.name} → ${evo.name}`, false, true)
  }

  // ------------------------------------------------------------ 流派共鸣（GDD 6章）

  addTag(tag: TagId): void {
    const p = this.player
    const before = p.tags[tag]
    p.tags[tag] = before + 1
    for (const threshold of [3, 5, 7]) {
      if (before < threshold && p.tags[tag] >= threshold) {
        this.flash()
        this.announce(`✦ ${RESONANCE_DESC[tag][threshold]}`, false, true)
      }
    }
  }

  /** 连杀狂热：3秒内连续击杀，每30连杀奖励15点能量 */
  private onCombo(): void {
    this.combo++
    this.comboTimer = 3
    if (this.combo % 30 === 0) {
      this.player.energy = Math.min(CFG.rage.energyMax, this.player.energy + 15)
      this.announce(`🔥 ${this.combo} 连杀！能量+15`, false, true)
    }
  }

  // ------------------------------------------------------------ 公告走马灯

  private announce(text: string, warn = false, epic = false): void {
    const wrap = document.getElementById('announce')!
    const div = document.createElement('div')
    div.className = 'toast' + (warn ? ' warn' : '') + (epic ? ' epic' : '')
    div.textContent = text
    wrap.appendChild(div)
    setTimeout(() => div.remove(), 3200)
    while (wrap.children.length > 4) wrap.children[0].remove()
  }

  // ------------------------------------------------------------ 武器与合成

  addWeapon(id: WeaponId): void {
    const owned = this.player.weapons.find(w => w.id === id)
    if (!owned) {
      this.player.weapons.push(createWeapon(id))
      return
    }
    owned.copies++
    if (owned.copies >= 3 && owned.level < 3) {
      owned.copies = 1
      owned.level++
      this.mergeBurst(owned)
    }
  }

  /** 三合一合成瞬间：全屏爆发（GDD 5.2） */
  private mergeBurst(w: Weapon): void {
    this.flash()
    this.shake = 16
    this.fx.burstRing(this.player.x, this.player.y)
    for (const e of [...this.enemies]) {
      if (e.alive) this.dealDamage(e, w.dmg * 8)
    }
  }

  private flash(): void {
    this.el.flash.classList.remove('on')
    void this.el.flash.offsetWidth // 重启动画
    this.el.flash.classList.add('on')
  }

  // ------------------------------------------------------------ 升级三选一

  private openLevelUp(): void {
    this.state = 'levelup'
    const options = generateOptions(this)
    if (options.length === 0) {
      this.player.pendingLevels = 0
      this.state = 'running'
      return
    }
    showLevelUpUI(options, o => {
      o.apply(this)
      if (o.tag) this.addTag(o.tag)
      this.player.pendingLevels--
      if (this.player.pendingLevels > 0) {
        this.openLevelUp()
      } else {
        hideLevelUpUI()
        this.state = 'running'
      }
    })
  }

  // ------------------------------------------------------------ HUD / 结算

  private updateHUD(): void {
    const p = this.player
    this.el.timer.textContent = fmtTime(this.time)
    this.el.kills.textContent = `击杀 ${this.kills}` + (this.combo >= 10 ? ` · ${this.combo}连杀` : '')
    this.el.hpBar.style.width = `${clamp((p.hp / p.maxHp) * 100, 0, 100)}%`
    this.el.hpText.textContent = `${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`
    this.el.xpBar.style.width = `${clamp((p.xp / p.xpNeed()) * 100, 0, 100)}%`
    this.el.lvText.textContent = `Lv.${p.level}`
    this.el.energyBar.style.width = `${(p.energy / CFG.rage.energyMax) * 100}%`
    this.el.energyWrap.classList.toggle('ready', p.energy >= CFG.rage.energyMax || p.raging)
    const skillName = CHARS[this.charId].skill.name
    document.getElementById('energy-text')!.textContent =
      p.raging ? `${skillName}中 ${p.rageTimer.toFixed(0)}s`
        : p.energy >= CFG.rage.energyMax ? `${skillName}就绪 [空格]` : `${skillName} [空格]`

    const weaponText = p.weapons
      .map(w => {
        if (w.evolved) return `★${w.name}`
        if (w.level < 3) return `${w.name} Lv${w.level} (${w.copies}/3)`
        const req = EVOLUTIONS[w.id].requires
        const ready = (p.passiveLv[req] ?? 0) >= 3
        return `${w.name} MAX${ready ? '·可进化(拾取宝箱)' : `·进化需${PASSIVES[req].name}Lv3`}`
      })
      .join(' · ')
    const buildingText = this.buildings.map(b => `${b.name} Lv${b.level}`).join(' · ')
    const tagText = (Object.keys(TAG_NAME) as TagId[])
      .filter(t => p.tags[t] > 0)
      .map(t => `${TAG_NAME[t]}×${p.tags[t]}`)
      .join(' ')
    this.el.weaponList.textContent =
      weaponText + (buildingText ? ` ｜ ${buildingText}` : '') + (tagText ? ` ｜ 共鸣 ${tagText}` : '')

    if (this.boss && this.boss.alive) {
      this.el.bossBar.style.width = `${clamp((this.boss.hp / this.boss.maxHp) * 100, 0, 100)}%`
    }
  }

  private end(victory: boolean): void {
    if (this.state === 'end') return
    this.state = 'end'
    clearRun()
    const won = victory || this.victoryAnnounced
    const gained = grantReward(this.meta, this.kills, this.time, won, this.moonLv)
    const title = document.getElementById('end-title')!
    title.textContent = won ? '血月退散 · 胜利' : '你倒下了'
    title.classList.toggle('victory', won)
    document.getElementById('end-stats')!.innerHTML = `
      ${CHARS[this.charId].name} · 血月等级 ${this.moonLv}<br/>
      生存时间 <b>${fmtTime(this.time)}</b><br/>
      击杀 <b>${this.kills}</b> · 等级 <b>Lv.${this.player.level}</b><br/>
      总伤害 <b>${fmtNum(this.totalDamage)}</b> · 最高单击 <b>${fmtNum(this.maxHit)}</b><br/>
      获得血晶 <b>+${gained}</b>${won && this.moonLv < 30 ? ` · 解锁血月等级 ${this.moonLv + 1}` : ''}
    `
    document.getElementById('end-screen')!.classList.remove('hidden')
  }
}
