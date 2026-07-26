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

/** 被动词条：数值按稀有度 [白, 蓝, 紫, 金]，每种最多叠 5 级 */
export interface PassiveDef { name: string; desc: (v: number) => string; values: number[] }

export const PASSIVE_MAX_LV = 5

export const PASSIVES: Record<string, PassiveDef> = {
  atk:       { name: '狂怒之心', desc: v => `攻击力 +${v}%`, values: [10, 16, 24, 40] },
  haste:     { name: '猎手本能', desc: v => `攻击速度 +${v}%`, values: [8, 12, 18, 30] },
  move:      { name: '疾风之步', desc: v => `移动速度 +${v}%`, values: [6, 10, 15, 25] },
  maxhp:     { name: '狼血沸腾', desc: v => `最大生命 +${v} 并治疗等量生命`, values: [15, 25, 40, 70] },
  pickup:    { name: '血月引力', desc: v => `拾取范围 +${v}%`, values: [20, 30, 45, 70] },
  crit:      { name: '鹰眼', desc: v => `暴击率 +${v}%`, values: [4, 7, 10, 16] },
  critdmg:   { name: '弱点撕裂', desc: v => `暴击伤害 +${v}%`, values: [20, 30, 45, 80] },
  blueprint: { name: '工程蓝图', desc: v => `筑造物伤害 +${v}%`, values: [15, 25, 40, 60] },
}

/** ---------- 武器进化（GDD 5.3）：3级武器 + 对应被动Lv3 + 血月宝箱 ---------- */
export interface EvolutionDef { requires: string; evoName: string; desc: string }

export const EVOLUTIONS: Record<WeaponId, EvolutionDef> = {
  claw: { requires: 'haste', evoName: '千爪风暴', desc: '近身持续旋风，吸附怪物绞杀' },
  bow:  { requires: 'crit',  evoName: '弑神狙',   desc: '每3秒锁定全屏血量最高者，巨额必暴击' },
  orb:  { requires: 'atk',   evoName: '血月熔核', desc: '巨型火球环绕，命中引发连锁爆炸' },
}

/** ---------- 流派标签与共鸣（GDD 6章，M1 实装 3 系） ---------- */
export type TagId = 'blood' | 'crit' | 'build'

export const TAG_NAME: Record<TagId, string> = { blood: '嗜血', crit: '暴击', build: '筑造' }

export const PASSIVE_TAG: Partial<Record<string, TagId>> = {
  atk: 'blood', maxhp: 'blood', crit: 'crit', critdmg: 'crit', blueprint: 'build',
}

export const WEAPON_TAG: Partial<Record<WeaponId, TagId>> = { claw: 'blood', bow: 'crit' }

export const RESONANCE_DESC: Record<TagId, Record<number, string>> = {
  blood: {
    3: '嗜血共鸣 III：击杀恢复 1 点生命',
    5: '嗜血共鸣 V：造成伤害的 2% 转化为治疗',
    7: '嗜血共鸣 VII：生命低于 50% 时伤害 +40%',
  },
  crit: {
    3: '暴击共鸣 III：暴击率 +8%',
    5: '暴击共鸣 V：暴击伤害 +60%',
    7: '暴击共鸣 VII：暴击率溢出部分每 1% 转化 2% 暴伤',
  },
  build: {
    3: '筑造共鸣 III：筑造物攻击间隔 -25%',
    5: '筑造共鸣 V：筑造物完整继承你的攻击力加成',
    7: '筑造共鸣 VII：筑造物射程 +50%，哨塔箭矢穿透 +2',
  },
}

/** ---------- 筑造系统（GDD 7章） ---------- */
export type BuildingId = 'turret' | 'totem' | 'siphon'

export interface BuildingDef { name: string; desc: string; hp: number }

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  turret: { name: '狼牙哨塔', desc: '自动索敌射击，升级提升伤害与射速', hp: 200 },
  totem:  { name: '血祭图腾', desc: '光环范围内持续恢复生命', hp: 160 },
  siphon: { name: '磁能虹吸柱', desc: '大范围吸取经验宝石', hp: 130 },
}

export const MAX_BUILDINGS = 4

export const RARITIES = ['white', 'blue', 'purple', 'gold'] as const
export type Rarity = typeof RARITIES[number]
export const RARITY_WEIGHT = [50, 28, 16, 6]
export const RARITY_NAME: Record<Rarity, string> = { white: '普通', blue: '稀有', purple: '史诗', gold: '传说' }
