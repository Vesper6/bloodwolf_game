# 《血狼》Godot 迁移方案

> 目标引擎：**Godot 4.2+**（GL Compatibility 渲染器，兼容 Web 导出）
> 工程位置：`godot/`（用 Godot 编辑器"导入"该目录即可打开运行）

## 为什么是 Godot
场景(.tscn)与脚本(.gd)全部是文本，AI 可全自主开发与无头测试；免费无抽成；2D 管线优秀；一键导出 Windows/macOS/Linux/Android/iOS/Web。

## 已完成（P0 骨架，已通过无头运行验证）

| 内容 | 文件 |
| --- | --- |
| 工程配置（1280x720、像素过滤、GL兼容渲染） | `project.godot` |
| 主循环：刷怪曲线/三武器/伤害乘区/宝石/三选一/三合一/Boss/胜负 | `scripts/main.gd` |
| 玩家：移动/朝向翻转/血怒/行走动画 | `scripts/player.gd` |
| 怪物：5种定义/追击/受击挤压 | `scripts/enemy.gd` |
| 序列帧工具：横向拼条→SpriteFrames（素材规格与页游版一致） | `scripts/sprites.gd` |
| HUD/三选一面板/结算（暂停式选卡） | `scenes/main.tscn` |
| 像素素材复用（8角色+5怪物拼条直接拷自 public/assets） | `assets/*.png` |

数值与页游版 `src/core/config.ts` 对齐（经验曲线 8×1.17^lv、怪物血量 1.13^分钟、
伤害 2.2^等级 乘区、刷怪节奏、血怒参数）。

## 迁移映射表（页游 → Godot）

| 页游版 (PixiJS/TS) | Godot 版 |
| --- | --- |
| `Game.ts` 主循环/ticker | `main.gd` `_process` |
| `AnimatedSprite` + 对象池 | `AnimatedSprite2D`（后续换 MultiMesh/对象池优化） |
| DOM HUD/卡牌 | `CanvasLayer` + Control 节点 |
| localStorage（天赋/存档） | `FileAccess` user:// + `ConfigFile` |
| `net.ts` 原生 WebSocket | `WebSocketPeer`（**协议不变，ws 服务器零改动**） |
| 万/亿飘字/震屏/顿帧 | Label+Tween / Camera2D offset / Engine.time_scale |

## 后续阶段

- **P1 系统补全**：8角色选择与专属技、被动词条池+稀有度、武器进化/禁忌融合、
  筑造系统、流派共鸣、精英词缀、连杀、Boss弹幕（Area2D 弹幕层）
- **P2 元游戏**：血月等级、血脉天赋（ConfigFile 存档）、无尽模式、局内进度持久化
- **P3 联机**：`WebSocketPeer` 接入现有 `server/`（消息协议 100% 复用），
  快照插值、倒地救援、共享经验
- **P4 优化与导出**：怪物 MultiMeshInstance2D 批渲染、对象池、
  导出 Web(HTML5)/Android/PC，接入平台

## 无头验证命令（CI 可用）

```bash
godot --headless --path godot --import          # 导入资源
godot --headless --path godot --quit-after 300  # 跑300帧冒烟
```
