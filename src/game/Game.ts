import { Application, Container, TilingSprite } from 'pixi.js'
import { CFG, ENEMIES, EnemyKind, WeaponId } from '../core/config'
import { clamp, dist2, fmtNum, fmtTime, rand } from '../core/utils'
import { Arrow, Enemy, Gem } from './entities'
import { Fx } from './fx'
import { generateOptions, hideLevelUpUI, showLevelUpUI } from './levelup'
import { Player } from './player'
import { Textures, makeGroundTexture, makeTextures } from './textures'
import { Weapon, createWeapon } from './weapons'

type GameState = 'running' | 'levelup' | 'end'

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
  private enemyPool: Enemy[] = []
  private arrowPool: Arrow[] = []
  private gemPool: Gem[] = []

  state: GameState = 'running'
  time = 0
  kills = 0
  totalDamage = 0
  maxHit = 0

  private shake = 0
  private hitstop = 0
  private spawnTimer = 0
  private eliteTimer = 0
  private bossIdx = 0
  private boss: Enemy | null = null

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

  constructor() {
    this.app = new Application({
      resizeTo: window,
      background: 0x0a0508,
      antialias: true,
    })
    document.getElementById('game-root')!.appendChild(this.app.view as HTMLCanvasElement)

    this.tex = makeTextures(this.app)
    this.bg = new TilingSprite(makeGroundTexture(this.app), 64, 64)
    this.app.stage.addChild(this.bg)
    this.app.stage.addChild(this.world)

    this.player = new Player(this.tex.player, () => this.tryRage())
    this.world.addChild(this.player.sprite)
    this.world.addChild(this.fx.layer)

    this.addWeapon('claw') // 雷加初始武器
    this.el.hud.classList.remove('hidden')

    this.app.ticker.add(() => {
      const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05)
      this.frame(dt)
    })
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
    if (this.state !== 'running') return

    this.time += dt
    if (this.time >= CFG.winTime) { this.end(true); return }

    this.player.update(dt)
    for (const w of this.player.weapons) w.update(this, dt)
    this.updateSpawner(dt)
    this.updateEnemies(dt)
    this.updateArrows(dt)
    this.updateGems(dt)
    this.fx.update(dt)
    this.updateCamera()
    this.updateHUD()

    if (this.player.pendingLevels > 0) this.openLevelUp()
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

    // 精英：2 分钟后每 45 秒一只
    if (this.time >= ENEMIES.elite.unlockAt) {
      this.eliteTimer -= dt
      if (this.eliteTimer <= 0) {
        this.eliteTimer = 45
        this.spawnEnemy('elite')
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
    const e = this.enemyPool.pop() ?? new Enemy(this.tex.enemy[kind])
    e.sprite.texture = this.tex.enemy[kind]
    const min = this.time / 60
    const hpMul = Math.pow(CFG.enemyHpGrowthPerMin, min)
    const dmgMul = 1 + min * CFG.enemyDmgGrowthPerMin
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

      const dx = p.x - e.x, dy = p.y - e.y
      const d = Math.hypot(dx, dy) || 1
      e.x += (dx / d) * e.speed * dt
      e.y += (dy / d) * e.speed * dt
      e.sprite.position.set(e.x, e.y)

      // 接触伤害（持续型，堆叠有上限）
      if (d < e.r + p.radius) contactDmg += e.dmg
    }
    if (contactDmg > 0) {
      p.hp -= Math.min(contactDmg, CFG.player.maxContactDps) * dt
      if (p.hp <= 0) this.end(false)
    }
  }

  private recycleEnemy(e: Enemy, idx: number): void {
    this.world.removeChild(e.sprite)
    e.sprite.visible = false
    this.enemies.splice(idx, 1)
    if (this.enemyPool.length < 100) this.enemyPool.push(e)
  }

  // ------------------------------------------------------------ 弹体

  spawnArrow(x: number, y: number, angle: number, dmg: number, pierce: number): void {
    const a = this.arrowPool.pop() ?? new Arrow(this.tex.arrow)
    a.init(x, y, angle, 720, dmg, pierce)
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
            this.dealDamage(e, a.dmg)
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

  dealDamage(e: Enemy, base: number): void {
    if (!e.alive) return
    const p = this.player
    let mul = 1 + p.atkPct / 100
    // 雷加被动：血量越低伤害越高（最高 +150%）
    mul *= 1 + CFG.player.lowHpDmgBonus * (1 - Math.max(0, p.hp) / p.maxHp)
    const crit = Math.random() * 100 < p.critChance
    const dmg = base * mul * (crit ? p.critDmg / 100 : 1)

    e.hp -= dmg
    this.totalDamage += dmg
    if (dmg > this.maxHit) this.maxHit = dmg
    this.fx.damageText(e.x, e.y - e.r, dmg, crit)
    if (crit) { this.hitstop = Math.max(this.hitstop, 0.03); this.shake = Math.max(this.shake, 4) }

    // 血怒吸血
    if (p.raging) {
      const heal = dmg * CFG.rage.lifesteal
      if (p.hp < p.maxHp) {
        p.heal(heal)
        if (Math.random() < 0.08) this.fx.healText(p.x, p.y, heal)
      }
    }

    if (e.hp <= 0) this.killEnemy(e)
  }

  private killEnemy(e: Enemy): void {
    e.alive = false
    this.kills++
    this.player.energy = Math.min(CFG.rage.energyMax, this.player.energy + CFG.rage.energyPerKill)
    this.dropGem(e.x, e.y, Math.round(e.xp * (1 + (this.time / 60) * CFG.gemValueGrowthPerMin)))

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
      const d2 = dist2(g.x, g.y, p.x, p.y)
      if (!g.attracted && d2 < range2) g.attracted = true
      if (g.attracted) {
        const d = Math.sqrt(d2) || 1
        const spd = 520 + (p.pickupRange * 2) / Math.max(d / 60, 1)
        g.x += ((p.x - g.x) / d) * spd * dt
        g.y += ((p.y - g.y) / d) * spd * dt
        g.sprite.position.set(g.x, g.y)
        if (d < 24) {
          p.gainXP(g.value)
          this.world.removeChild(g.sprite)
          g.sprite.visible = false
          this.gems.splice(i, 1)
          if (this.gemPool.length < 100) this.gemPool.push(g)
        }
      }
    }
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

  // ------------------------------------------------------------ 血怒

  tryRage(): void {
    if (this.state !== 'running') return
    if (this.player.startRage()) {
      this.flash()
      this.shake = 10
    }
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
    this.el.kills.textContent = `击杀 ${p ? this.kills : 0}`
    this.el.hpBar.style.width = `${clamp((p.hp / p.maxHp) * 100, 0, 100)}%`
    this.el.hpText.textContent = `${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`
    this.el.xpBar.style.width = `${clamp((p.xp / p.xpNeed()) * 100, 0, 100)}%`
    this.el.lvText.textContent = `Lv.${p.level}`
    this.el.energyBar.style.width = `${(p.energy / CFG.rage.energyMax) * 100}%`
    this.el.energyWrap.classList.toggle('ready', p.energy >= CFG.rage.energyMax || p.raging)
    document.getElementById('energy-text')!.textContent =
      p.raging ? `血怒中 ${p.rageTimer.toFixed(0)}s` : p.energy >= CFG.rage.energyMax ? '血怒就绪 [空格]' : '血怒 [空格]'

    this.el.weaponList.textContent = p.weapons
      .map(w => `${w.name} Lv${w.level}${w.level < 3 ? ` (${w.copies}/3)` : ' MAX'}`)
      .join(' · ')

    if (this.boss && this.boss.alive) {
      this.el.bossBar.style.width = `${clamp((this.boss.hp / this.boss.maxHp) * 100, 0, 100)}%`
    }
  }

  private end(victory: boolean): void {
    this.state = 'end'
    const title = document.getElementById('end-title')!
    title.textContent = victory ? '血月退散 · 胜利' : '你倒下了'
    title.classList.toggle('victory', victory)
    document.getElementById('end-stats')!.innerHTML = `
      生存时间 <b>${fmtTime(this.time)}</b><br/>
      击杀 <b>${this.kills}</b> · 等级 <b>Lv.${this.player.level}</b><br/>
      总伤害 <b>${fmtNum(this.totalDamage)}</b> · 最高单击 <b>${fmtNum(this.maxHit)}</b>
    `
    document.getElementById('end-screen')!.classList.remove('hidden')
  }
}
