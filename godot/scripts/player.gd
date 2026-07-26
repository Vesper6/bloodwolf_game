extends Node2D
## 玩家（血狼·雷加）：移动/朝向/血量/能量；武器逻辑由 main.gd 驱动

const SPEED := 235.0

var hp := 100.0
var max_hp := 100.0
var facing := Vector2.RIGHT
var atk_pct := 0.0
var haste_pct := 0.0
var move_pct := 0.0
var pickup_range := 90.0
var crit_chance := 5.0
var crit_dmg := 200.0
var level := 1
var xp := 0.0
var energy := 0.0
var raging := false
var rage_timer := 0.0

var anim: AnimatedSprite2D


func _ready() -> void:
	anim = AnimatedSprite2D.new()
	anim.sprite_frames = SpriteUtil.frames_from_strip("res://assets/player_rega.png")
	anim.speed_scale = 1.6
	add_child(anim)


func haste_mul() -> float:
	return (1.0 + haste_pct / 100.0) * (2.0 if raging else 1.0)


func xp_need() -> int:
	return roundi(8.0 * pow(1.17, level - 1))


func _process(delta: float) -> void:
	var dir := Vector2.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): dir.y -= 1
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): dir.y += 1
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): dir.x -= 1
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): dir.x += 1
	if dir != Vector2.ZERO:
		dir = dir.normalized()
		position += dir * SPEED * (1.0 + move_pct / 100.0) * delta
		facing = dir
		anim.flip_h = dir.x < 0
		if not anim.is_playing():
			anim.play()
	elif anim.is_playing():
		anim.stop()
		anim.frame = 0

	if raging:
		rage_timer -= delta
		if rage_timer <= 0:
			raging = false
	anim.modulate = Color(1, 0.45, 0.45) if raging else Color.WHITE
