import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { WebGLErrorBoundary } from "./WebGLErrorBoundary"

// ── Device capability — computed once at module level, never per-render ───
function isLowEndDevice() {
  if (typeof window === "undefined") return true
  const cores  = navigator.hardwareConcurrency ?? 4
  const memory = navigator.deviceMemory       ?? 4
  return cores <= 2 || memory <= 1
}

const isLowEndCached = isLowEndDevice()
// Segment counts derived once — not inside component bodies
const SEGMENTS_X = isLowEndCached ? 80  : 160
const SEGMENTS_Y = isLowEndCached ? 50  : 100

// ── Aurora — emerald blob style matching brand ────────────────────────────
const auroraVertexShader = `
  void main() {
    gl_Position = vec4(position.xy, 0.999, 1.0);
  }
`

const auroraFragmentShader = `
  uniform float uTime;
  uniform vec2  uResolution;

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;

    // Near-black base
    vec3 color = vec3(0.02, 0.02, 0.03);
    float t = uTime * 0.12;

    // Blob 1 — bright emerald bottom-left
    float d1 = distance(vec2(uv.x, uv.y * 1.6), vec2(0.28 + sin(t) * 0.08, -0.25 + cos(t * 0.7) * 0.06));
    color   += vec3(0.04, 0.72, 0.50) * smoothstep(1.4, 0.0, d1) * 0.60;

    // Blob 2 — deep teal bottom-right (distinct from grid — cooler hue)
    float d2 = distance(vec2(uv.x, uv.y * 1.6), vec2(0.72 + cos(t * 1.1) * 0.08, -0.30 + sin(t * 0.9) * 0.05));
    color   += vec3(0.01, 0.32, 0.38) * smoothstep(1.5, 0.0, d2) * 0.55;

    // Blob 3 — center deep glow, slightly blue-green so aurora reads separate from grid
    float d3 = distance(vec2(uv.x, uv.y * 1.9), vec2(0.50 + sin(t * 0.6) * 0.07, -0.28));
    color   += vec3(0.01, 0.20, 0.28) * smoothstep(1.1, 0.0, d3) * 0.45;

    // Fade — threshold 0.1 so aurora reaches 90% up the screen (was 0.35 — too low)
    color *= smoothstep(1.0, 0.0, uv.y - 0.1);

    // Dither to prevent banding
    float noise = fract(sin(dot(uv.xy, vec2(12.9898, 78.233))) * 43758.5453);
    color      += noise * 0.012;

    gl_FragColor = vec4(color, 1.0);
  }
`

function AuroraShader({ opacity = 1 }) {
  const matRef   = useRef(null)
  const { size } = useThree()
  // Own time ref — avoids touching state.clock (THREE.Clock deprecation)
  const timeRef  = useRef(0)

  const uniforms = useMemo(() => ({
    uTime:       { value: 0 },
    uResolution: { value: new THREE.Vector2(800, 600) },
  }), [])

  useFrame((_, delta) => {
    if (!matRef.current || document.hidden) return
    timeRef.current += delta
    matRef.current.uniforms.uTime.value = timeRef.current
    matRef.current.uniforms.uResolution.value.set(size.width, size.height)
  })

  return (
    <mesh renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={auroraVertexShader}
        fragmentShader={auroraFragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  )
}

// ── Grid shaders ──────────────────────────────────────────────────────────
const gridVertexShader = `
  uniform float uTime;
  uniform vec3  uMousePos;
  uniform float uMouseActive;

  uniform vec2  uRipple0Origin; uniform float uRipple0Time;
  uniform vec2  uRipple1Origin; uniform float uRipple1Time;
  uniform vec2  uRipple2Origin; uniform float uRipple2Time;
  uniform vec2  uRipple3Origin; uniform float uRipple3Time;
  uniform vec2  uRipple4Origin; uniform float uRipple4Time;

  varying vec3  vWorldPos;
  varying vec3  vOriginalPos;   // undeformed position for stable dot placement
  varying float vStrength;
  varying float vMouseDist;

  float rippleStrength(vec2 pos, vec2 origin, float rTime) {
    if (rTime < 0.0) return 0.0;
    float dist  = distance(pos, origin);
    float speed = 4.0;
    float front = rTime * speed;
    float width = 1.8;
    float delta = dist - front;
    // sin → oscillating rings (crests AND troughs in Z, but vStrength only takes crests)
    float wave  = sin(delta * 7.0) * exp(-delta * delta / (width * width));
    float decay = exp(-rTime * 1.0);
    return wave * decay;
  }

  void main() {
    vec3 pos    = position;
    vOriginalPos = position;   // capture before ANY deformation

    // ── Ripples ─────────────────────────────────────────────────────────
    float r0 = rippleStrength(pos.xy, uRipple0Origin, uRipple0Time);
    float r1 = rippleStrength(pos.xy, uRipple1Origin, uRipple1Time);
    float r2 = rippleStrength(pos.xy, uRipple2Origin, uRipple2Time);
    float r3 = rippleStrength(pos.xy, uRipple3Origin, uRipple3Time);
    float r4 = rippleStrength(pos.xy, uRipple4Origin, uRipple4Time);
    float ripple = r0 + r1 + r2 + r3 + r4;
    pos.z += ripple * 1.8;

    // ── Elastic mouse pull ───────────────────────────────────────────────
    float mouseDist   = distance(pos.xy, uMousePos.xy);
    vMouseDist        = mouseDist;
    float pinchRadius = 10.0;
    float mouseStr    = 0.0;

    if (mouseDist < pinchRadius && uMouseActive > 0.01) {
      mouseStr    = smoothstep(pinchRadius, 0.0, mouseDist) * uMouseActive;
      vec2 dir    = uMousePos.xy - pos.xy;
      float pull  = pow(mouseStr, 1.5);
      pos.xy     += dir * pull * 0.55;
      pos.z      += pull * 2.5;
    }

    // ── Idle breathing ───────────────────────────────────────────────────
    pos.z += sin(pos.x * 0.3 + uTime * 0.2) * 0.12
           + cos(pos.y * 0.3 + uTime * 0.15) * 0.12;

    // Only positive ripple crests glow — troughs stay dark like real water
    vStrength = clamp(max(0.0, ripple) * 0.9 + mouseStr, 0.0, 1.0);

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos     = worldPos.xyz;
    gl_Position   = projectionMatrix * viewMatrix * worldPos;
  }
`

const gridFragmentShader = `
  uniform vec3  uColorRest;
  uniform vec3  uColorActive;
  uniform float uTime;
  uniform vec3  uMousePos;

  varying vec3  vWorldPos;
  varying vec3  vOriginalPos;
  varying float vStrength;
  varying float vMouseDist;

  void main() {
    // ── Dots placed on ORIGINAL undeformed position ──────────────────────
    // Prevents dots from sliding when elastic pull deforms vertices
    vec2  gridUV  = vOriginalPos.xy * 2.0;
    vec2  cell    = fract(gridUV) - 0.5;
    float dist    = length(cell);
    float dotAlpha = 1.0 - smoothstep(0.07, 0.11, dist);

    // ── Per-dot organic breathing — slow (0.7) so it reads as breathing ──
    // Each dot has a unique phase so they don't all pulse in sync
    float dotHash = fract(sin(dot(floor(gridUV), vec2(12.9898, 78.233))) * 43758.5453);
    float breathe = sin(uTime * 0.7 + dotHash * 6.2832) * 0.5 + 0.5;
    dotAlpha     *= mix(0.35, 1.0, breathe);

    // ── Radial fade from center ──────────────────────────────────────────
    float fromCenter = length(vWorldPos.xy);
    float fade       = smoothstep(28.0, 4.0, fromCenter);

    // ── Depth color shift — far dots cooler/darker, near dots warmer ─────
    // vWorldPos.y increases as dots go further up (away in perspective)
    float depthMix  = smoothstep(-8.0, 20.0, vWorldPos.y);
    vec3  depthColor = mix(uColorRest, vec3(0.01, 0.12, 0.18), depthMix);

    // ── Color: depth-shifted rest → active ──────────────────────────────
    vec3 color = mix(depthColor, uColorActive, vStrength);

    // ── Cursor glow halo — computed from ORIGINAL pos for stable circle ──
    float glowDist = distance(vOriginalPos.xy, uMousePos.xy);
    float glow     = smoothstep(8.0, 0.0, glowDist);
    color         += uColorActive * glow * 0.65;   // was 0.4*0.6=0.24 — now 0.65, much more visible

    // ── Alpha: base 0.18 idle, up to 0.88 when active ───────────────────
    // Clamped cleanly — no overflow above 1.0
    float finalAlpha = dotAlpha * mix(0.18, 0.88, vStrength) * fade;
    if (finalAlpha < 0.005) discard;

    gl_FragColor = vec4(color, clamp(finalAlpha, 0.0, 1.0));
  }
`

function makeRipple() { return { x: 0, y: 0, t: -99.0 } }

function InteractiveGrid({ variant }) {
  const { camera } = useThree()
  const matRef     = useRef(null)

  const pointerRef      = useRef(new THREE.Vector2(0, 0))
  const targetMousePos  = useRef(new THREE.Vector3(0, 0, 0))
  const _vec            = useRef(new THREE.Vector3())
  const _dir            = useRef(new THREE.Vector3())
  const _pos            = useRef(new THREE.Vector3())
  const mouseActiveRef  = useRef(0)
  const isMovingRef     = useRef(false)
  // 5 ripple slots so rapid taps don't overwrite each other
  const ripples         = useRef([makeRipple(), makeRipple(), makeRipple(), makeRipple(), makeRipple()])
  const rippleIdx       = useRef(0)
  const timeRef         = useRef(0)
  const lastTouchTime   = useRef(0)
  // Store initial camera Y so sway is relative, not hardcoded
  const baseCamY        = useRef(camera.position.y)
  const baseCamX        = useRef(camera.position.x)

  useEffect(() => {
    baseCamY.current = camera.position.y
    baseCamX.current = camera.position.x
  }, [camera])

  useEffect(() => {
    let moveTimeout

    function ndcToWorld(nx, ny) {
      _vec.current.set(nx, ny, 0.5)
      _vec.current.unproject(camera)
      _dir.current.copy(_vec.current).sub(camera.position).normalize()
      const d = (-6 - camera.position.z) / _dir.current.z
      _pos.current.copy(camera.position).addScaledVector(_dir.current, d)
      return { x: _pos.current.x, y: _pos.current.y }
    }

    function spawnRipple(nx, ny) {
      const { x, y } = ndcToWorld(nx, ny)
      const slot = rippleIdx.current % 5
      ripples.current[slot] = { x, y, t: 0.0 }
      rippleIdx.current++
    }

    function onPointerMove(e) {
      isMovingRef.current = true
      clearTimeout(moveTimeout)
      moveTimeout = setTimeout(() => { isMovingRef.current = false }, 800)
      pointerRef.current.x =  (e.clientX / window.innerWidth)  * 2 - 1
      pointerRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }

    function onMouseLeave() { isMovingRef.current = false }

    function onClick(e) {
      // Suppress click that fires after touchstart on mobile — prevents double ripple
      if (performance.now() - lastTouchTime.current < 500) return
      spawnRipple(
        (e.clientX  / window.innerWidth)  * 2 - 1,
       -(e.clientY  / window.innerHeight) * 2 + 1
      )
    }

    function onTouchMove(e) {
      const t = e.touches[0]
      isMovingRef.current = true
      clearTimeout(moveTimeout)
      moveTimeout = setTimeout(() => { isMovingRef.current = false }, 800)
      pointerRef.current.x =  (t.clientX / window.innerWidth)  * 2 - 1
      pointerRef.current.y = -(t.clientY / window.innerHeight) * 2 + 1
    }

    function onTouchStart(e) {
      lastTouchTime.current = performance.now()
      const t  = e.touches[0]
      const nx =  (t.clientX / window.innerWidth)  * 2 - 1
      const ny = -(t.clientY / window.innerHeight) * 2 + 1
      pointerRef.current.x = nx
      pointerRef.current.y = ny
      spawnRipple(nx, ny)
    }

    window.addEventListener("pointermove",  onPointerMove, { passive: true })
    window.addEventListener("click",        onClick)
    document.addEventListener("mouseleave", onMouseLeave)
    window.addEventListener("touchstart",   onTouchStart,  { passive: true })
    window.addEventListener("touchmove",    onTouchMove,   { passive: true })

    return () => {
      window.removeEventListener("pointermove",  onPointerMove)
      window.removeEventListener("click",        onClick)
      document.removeEventListener("mouseleave", onMouseLeave)
      window.removeEventListener("touchstart",   onTouchStart)
      window.removeEventListener("touchmove",    onTouchMove)
      clearTimeout(moveTimeout)
    }
  }, [camera])

  const uniforms = useMemo(() => ({
    uTime:          { value: 0 },
    uMousePos:      { value: new THREE.Vector3() },
    uMouseActive:   { value: 0 },
    // Emerald brand colors — match project palette
    uColorRest:     { value: new THREE.Color(0.02, 0.30, 0.22) },
    uColorActive:   { value: new THREE.Color(0.20, 0.85, 0.60) },
    uRipple0Origin: { value: new THREE.Vector2(0, 0) }, uRipple0Time: { value: -99.0 },
    uRipple1Origin: { value: new THREE.Vector2(0, 0) }, uRipple1Time: { value: -99.0 },
    uRipple2Origin: { value: new THREE.Vector2(0, 0) }, uRipple2Time: { value: -99.0 },
    uRipple3Origin: { value: new THREE.Vector2(0, 0) }, uRipple3Time: { value: -99.0 },
    uRipple4Origin: { value: new THREE.Vector2(0, 0) }, uRipple4Time: { value: -99.0 },
  }), [])

  useFrame((_, delta) => {
    if (!matRef.current || document.hidden) return

    timeRef.current += delta
    const u  = matRef.current.uniforms
    const rs = ripples.current

    u.uTime.value = timeRef.current

    // Advance ripple timers — direct mutation, no GC
    for (let i = 0; i < 5; i++) {
      rs[i].t = rs[i].t >= 0 ? rs[i].t + delta : -99.0
      if (rs[i].t > 4.0) rs[i].t = -99.0
    }

    u.uRipple0Origin.value.set(rs[0].x, rs[0].y); u.uRipple0Time.value = rs[0].t
    u.uRipple1Origin.value.set(rs[1].x, rs[1].y); u.uRipple1Time.value = rs[1].t
    u.uRipple2Origin.value.set(rs[2].x, rs[2].y); u.uRipple2Time.value = rs[2].t
    u.uRipple3Origin.value.set(rs[3].x, rs[3].y); u.uRipple3Time.value = rs[3].t
    u.uRipple4Origin.value.set(rs[4].x, rs[4].y); u.uRipple4Time.value = rs[4].t

    mouseActiveRef.current = THREE.MathUtils.lerp(
      mouseActiveRef.current,
      isMovingRef.current ? 1.0 : 0.0,
      isMovingRef.current ? 0.06 : 0.025
    )
    u.uMouseActive.value = mouseActiveRef.current

    // Unproject pointer to world plane z=-6
    _vec.current.set(pointerRef.current.x, pointerRef.current.y, 0.5)
    _vec.current.unproject(camera)
    _dir.current.copy(_vec.current).sub(camera.position).normalize()
    const d = (-6 - camera.position.z) / _dir.current.z
    _pos.current.copy(camera.position).addScaledVector(_dir.current, d)
    targetMousePos.current.lerp(_pos.current, 0.07)
    u.uMousePos.value.copy(targetMousePos.current)

    // ── Camera parallax sway ────────────────────────────────────────────
    // chat: look slightly right to account for sidebar occupying left side
    const lookTargetX = variant === "chat" ? 1.5 : 0
    // Sway relative to initial camera position — not hardcoded
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, baseCamX.current + pointerRef.current.x * 0.4, 0.04)
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, baseCamY.current + pointerRef.current.y * 0.3, 0.04)
    // lookAt every frame — converts position shift into proper rotation parallax
    camera.lookAt(lookTargetX, 0, -6)
  })

  return (
    <mesh position={[0, 0, -6]}>
      <planeGeometry args={[80, 50, SEGMENTS_X, SEGMENTS_Y]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={gridVertexShader}
        fragmentShader={gridFragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

// ── CSS fallback — brand colors + variant support ─────────────────────────
function LowEndFallback({ variant }) {
  return (
    <div style={{
      position:      "fixed",
      inset:         0,
      zIndex:        0,
      pointerEvents: "none",
      background: variant === "auth"
        ? `radial-gradient(ellipse 80% 55% at 50% 105%, rgba(16,185,129,0.22) 0%, rgba(16,185,129,0.06) 45%, transparent 68%),
           radial-gradient(ellipse 40% 25% at 20% 85%,  rgba(16,185,129,0.07) 0%, transparent 60%),
           #09090b`
        : `radial-gradient(ellipse 110% 50% at 50% 105%, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0.04) 50%, transparent 72%),
           radial-gradient(ellipse 50%  28% at 15% 65%,  rgba(16,185,129,0.06) 0%, transparent 55%),
           #09090b`,
    }} />
  )
}

// ── WebGL crash recovery ──────────────────────────────────────────────────
let webglCrashCount = 0
const MAX_CRASHES   = 3

function RecoverableCanvas({ variant }) {
  const [contextLost, setContextLost] = useState(false)

  function handleCreated({ gl }) {
    gl.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault()
      webglCrashCount++
      setContextLost(true)
    }, { once: true })
  }

  if (contextLost) return <LowEndFallback variant={variant} />

  return (
    <Canvas
      camera={{ position: [0, -4, 9], fov: 58 }}
      dpr={[1, 1]}
      style={{ position: "absolute", inset: 0 }}
      onCreated={handleCreated}
      gl={{
        powerPreference:              "default",   // "default" not "high-performance" — avoids mobile crashes
        antialias:                    false,
        alpha:                        false,
        preserveDrawingBuffer:        false,
        failIfMajorPerformanceCaveat: false,
      }}
    >
      {/* auth: full aurora; chat: dimmer so it doesn't fight the UI */}
      <AuroraShader opacity={variant === "auth" ? 1.0 : 0.55} />
      <InteractiveGrid variant={variant} />
    </Canvas>
  )
}

// ── Main export ───────────────────────────────────────────────────────────
export default function Background3D({ variant = "chat" }) {
  // Use cached value — never call isLowEndDevice() per render
  if (isLowEndCached || webglCrashCount >= MAX_CRASHES) {
    return <LowEndFallback variant={variant} />
  }

  return (
    <div style={{
      position:      "fixed",
      inset:         0,
      zIndex:        0,
      background:    "#09090b",
      overflow:      "hidden",
      pointerEvents: "none",
    }}>
      <WebGLErrorBoundary fallback={<LowEndFallback variant={variant} />}>
        <RecoverableCanvas variant={variant} />
      </WebGLErrorBoundary>
    </div>
  )
}