extends Node2D
## 怪物：追击目标，属性由 main.gd 的 setup 注入

const DEFS := {
	"bat": {"hp": 14.0, "speed": 155.0, "dmg": 5.0, "xp": 1, "r": 12.0, "unlock": 0.0},
	"skeleton": {"hp": 34.0, "speed": 100.0, "dmg": 10.0, "xp": 2, "r": 14.0, "unlock": 60.0},
	"boar": {"hp": 90.0, "speed": 72.0, "dmg": 16.0, "xp": 4, "r": 16.0, "unlock": 180.0},
	"elite": {"hp": 850.0, "speed": 85.0, "dmg": 22.0, "xp": 40, "r": 22.0, "unlock": 120.0},
	"boss": {"hp": 3600.0, "speed": 58.0, "dmg": 32.0, "xp": 150, "r": 30.0, "unlock": 0.0},
}

var kind := "bat"
var hp := 1.0
var max_hp := 1.0
var speed := 100.0
var dmg := 5.0
var xp := 1
var radius := 12.0
var orb_cd := 0.0
var hit_pulse := 0.0
var target: Node2D
var anim: AnimatedSprite2D


func setup(p_kind: String, hp_mul: float, dmg_mul: float, p_target: Node2D) -> void:
	kind = p_kind
	target = p_target
	var d: Dictionary = DEFS[kind]
	max_hp = d.hp * hp_mul
	hp = max_hp
	speed = d.speed
	dmg = d.dmg * dmg_mul
	xp = d.xp
	radius = d.r
	anim = AnimatedSprite2D.new()
	anim.sprite_frames = SpriteUtil.frames_from_strip("res://assets/enemy_%s.png" % kind)
	if kind == "boss":
		anim.scale = Vector2(1.6, 1.6)
	add_child(anim)
	anim.play()


func _process(delta: float) -> void:
	if orb_cd > 0:
		orb_cd -= delta
	if target:
		var dir := (target.position - position)
		if dir.length() > 1.0:
			position += dir.normalized() * speed * delta
	if hit_pulse > 0.01:
		hit_pulse *= exp(-10.0 * delta)
		anim.scale = (Vector2(1.6, 1.6) if kind == "boss" else Vector2.ONE) * (1.0 + 0.22 * hit_pulse)
