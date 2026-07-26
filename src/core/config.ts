/** 《血狼》M0 数值配置（对应 GDD 第8章） */

export const CFG = {
  /** 生存目标（秒）：M0 原型 15 分钟 */
  winTime: 900,

  player: {
    maxHp: 100,
    speed: 235,
    radius: 16,
    /** 接触伤害每秒上限（防止怪物堆叠秒杀） */
    maxContactDps: 45,
    critChance: 5,   // %
    critDmg: 200,    // %
    pickupRange: 90,
    lowHpDmgBonus: 1.5, // 雷加被动：血量越低伤害越高，满值 +150%
  },

  rage: {
    energyMax: 100,
    energyPerKill: 2.5,
    duration: 10,
    hasteBonus: 100, // %
    lifesteal: 0.2,
  },

  /** 经验需求 = base × growth^(level-1) */
  xp: { base: 8, growth: 1.17 },
  /** 宝石价值随分钟数成长，保持中后期升级节奏 */
  gemValueGrowthPerMin: 0.2,

  /** 怪物成长：HP × hpGrowth^分钟 */
  enemyHpGrowthPerMin: 1.13,
  enemyDmgGrowthPerMin: 0.08,
  maxEnemies: 320,
  maxGems: 260,

  bossTimes: [300, 600] as number[],
}

export type EnemyKind = 'bat' | 'skeleton' | 'boar' | 'elite' | 'boss'

export interface EnemyDef {
  hp: number; speed: number; dmg: number; xp: number; r: number
  color: number; unlockAt: number; weight: number
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  bat:      { hp: 14,   speed: 155, dmg: 5,  xp: 1,   r: 10, color: 0x8a4fd0, unlockAt: 0,   weight: 5 },
  skeleton: { hp: 34,   speed: 100, dmg: 10, xp: 2,   r: 13, color: 0xc8c8d8, unlockAt: 60,  weight: 4 },
  boar:     { hp: 90,   speed: 72,  dmg: 16, xp: 4,   r: 18, color: 0xa8622e, unlockAt: 180, weight: 3 },
  elite:    { hp: 850,  speed: 85,  dmg: 22, xp: 40,  r: 26, color: 0xffb02e, unlockAt: 120, weight: 0 },
  boss:     { hp: 3600, speed: 58,  dmg: 32, xp: 150, r: 42, color: 0xe02222, unlockAt: 0,   weight: 0 },
}

export type WeaponId = 'claw' | 'bow' | 'orb'

export const WEAPON_INFO: Record<WeaponId, { name: string; desc: string }> = {
  claw: { name: '裂空爪', desc: '向面朝方向挥出撕裂爪击，大范围扇形伤害' },
  bow:  { name: '银月长弓', desc: '自动锁定最近的敌人，射出穿透银箭' },
  orb:  { name: '血焰法球', desc: '血焰球环绕自身旋转，灼烧接触的敌人' },
}

/** 被动词条：数值按稀有度 [白, 蓝, 紫, 金] */
export interface PassiveDef { name: string; desc: (v: number) => string; values: number[] }

export const PASSIVES: Record<string, PassiveDef> = {
  atk:     { name: '狂怒之心', desc: v => `攻击力 +${v}%`, values: [10, 16, 24, 40] },
  haste:   { name: '猎手本能', desc: v => `攻击速度 +${v}%`, values: [8, 12, 18, 30] },
  move:    { name: '疾风之步', desc: v => `移动速度 +${v}%`, values: [6, 10, 15, 25] },
  maxhp:   { name: '狼血沸腾', desc: v => `最大生命 +${v} 并治疗等量生命`, values: [15, 25, 40, 70] },
  pickup:  { name: '血月引力', desc: v => `拾取范围 +${v}%`, values: [20, 30, 45, 70] },
  crit:    { name: '鹰眼', desc: v => `暴击率 +${v}%`, values: [4, 7, 10, 16] },
  critdmg: { name: '弱点撕裂', desc: v => `暴击伤害 +${v}%`, values: [20, 30, 45, 80] },
}

export const RARITIES = ['white', 'blue', 'purple', 'gold'] as const
export type Rarity = typeof RARITIES[number]
export const RARITY_WEIGHT = [50, 28, 16, 6]
export const RARITY_NAME: Record<Rarity, string> = { white: '普通', blue: '稀有', purple: '史诗', gold: '传说' }
