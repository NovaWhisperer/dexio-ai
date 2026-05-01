import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { WebGLErrorBoundary } from "./WebGLErrorBoundary"

// ── Device capability check — smarter than width-only ────────────────────
function isLowEndDevice() {
  if (typeof window === "undefined") return true
  // Very old / weak devices: low CPU cores or very low memory
  const cores  = navigator.hardwareConcurrency ?? 4
  const memory = navigator.deviceMemory       ?? 4   // GB, not available on Firefox/Safari → default 4
  if (cores <= 2 || memory <= 1) return true
  return false
}

// ── Aurora shader ─────────────────────────────────────────────────────────
const auroraVertexShader = `
  void main() {
    gl_Position = vec4(position.xy, 0.999, 1.0);
  }
`

const auroraFragmentShader = `
  uniform float uTime;
  uniform vec2  uResolution;

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
      value += amplitude * noise(st);
      st *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    vec2 st = uv;
    st.x *= uResolution.x / uResolution.y;

    float t = uTime * 0.08;
    vec3 color   = vec3(0.01, 0.01, 0.02);
    vec3 emerald = vec3(0.06, 0.73, 0.51);
    vec3 teal    = vec3(0.02, 0.45, 0.35);
    vec3 dark    = vec3(0.01, 0.12, 0.09);

    float wave1 = 0.4 + sin(uv.x * 1.5 - t) * 0.35 + cos(uv.x * 1.0 + t * 0.5) * 0.25;
    float n1    = fbm(st * 1.5 + vec2(t * 0.15, -t * 0.1));
    float dist1 = uv.y - wave1 + (n1 - 0.5) * 0.6;
    float glow1 = exp(-abs(dist1) * 1.2);
    float core1 = exp(-abs(dist1) * 3.0);

    float wave2 = 0.6 + cos(uv.x * 2.0 + t * 0.8) * 0.3 + sin(uv.x * 0.5 - t * 0.3) * 0.3;
    float n2    = fbm(st * 2.0 - vec2(t * 0.2, t * 0.2));
    float dist2 = uv.y - wave2 + (n2 - 0.5) * 0.7;
    float glow2 = exp(-abs(dist2) * 1.5);
    float core2 = exp(-abs(dist2) * 3.5);

    vec3 wave1Color = mix(emerald, teal, uv.x + n1 * 0.5);
    color += wave1Color * glow1 * 0.4;
    color += mix(vec3(0.5, 1.0, 0.8), wave1Color, 0.5) * core1 * 0.5;

    vec3 wave2Color = mix(teal, dark, 1.0 - uv.x + n2 * 0.5);
    color += wave2Color * glow2 * 0.35;
    color += mix(vec3(0.4, 0.9, 0.7), wave2Color, 0.5) * core2 * 0.4;

    float vignette = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    color *= clamp(vignette * 12.0 + 0.2, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
  }
`

function AuroraShader({ opacity = 1 }) {
  const materialRef = useRef(null)
  const { size }    = useThree()
  const timerRef    = useRef(new THREE.Timer())

  const uniforms = useMemo(() => ({
    uTime:       { value: 0 },
    uResolution: { value: new THREE.Vector2(800, 600) },
  }), [])

  useFrame((_, delta) => {
    if (!materialRef.current) return
    if (document.hidden) return   // pause when tab not visible — saves GPU + prevents mobile crash
    timerRef.current.update()
    materialRef.current.uniforms.uTime.value = timerRef.current.getElapsed()
    materialRef.current.uniforms.uResolution.value.set(size.width, size.height)
  })

  return (
    <mesh renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
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

// ── Stitch-style grid shaders ─────────────────────────────────────────────
// Supports:
//  - Up to 3 simultaneous ripples propagating outward from touch/click
//  - Per-dot random phase for organic idle breathing
//  - Color shifts warm (bright green) near ripple front, cool (deep teal) at rest
//  - Perspective scale — dots near bottom slightly larger
//  - Mouse/touch cursor pull attraction alongside ripples

const gridVertexShader = `
  uniform float uTime;
  uniform vec3  uMousePos;
  uniform float uMouseActive;

  // Ripple system — up to 3 simultaneous ripples
  uniform vec2  uRipple0Origin;
  uniform float uRipple0Time;
  uniform vec2  uRipple1Origin;
  uniform float uRipple1Time;
  uniform vec2  uRipple2Origin;
  uniform float uRipple2Time;

  varying float vAlpha;
  varying float vStrength;  // passed to fragment for color mix

  // Pseudo-random per-dot phase from position
  float hashPhase(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Single ripple contribution at a dot position
  // Returns 0..1 strength based on whether wave front has passed
  float rippleStrength(vec2 dotXY, vec2 origin, float rTime) {
    if (rTime < 0.0) return 0.0;
    float dist  = distance(dotXY, origin);
    float speed = 4.5;                        // world units per second
    float front = rTime * speed;              // how far wave has traveled
    float width = 2.5;                        // wave band width in world units
    float delta = dist - front;
    // Wave front: dot lights up when front reaches it, fades as front passes
    float wave  = exp(-delta * delta / (width * width));
    // Decay: ripple fades out over time
    float decay = exp(-rTime * 0.55);
    return wave * decay;
  }

  void main() {
    vec3 pos   = position;
    vec2 xy    = pos.xy;

    // ── Idle organic breathing ───────────────────────────────────────────
    float phase   = hashPhase(xy) * 6.2832;         // unique phase per dot
    float breathe = sin(uTime * 0.9 + phase) * 0.5 + 0.5;

    // Subtle idle position drift
    pos.z += sin(uTime * 0.4 + phase) * 0.015;

    // ── Ripple contributions (up to 3) ───────────────────────────────────
    float r0 = rippleStrength(xy, uRipple0Origin, uRipple0Time);
    float r1 = rippleStrength(xy, uRipple1Origin, uRipple1Time);
    float r2 = rippleStrength(xy, uRipple2Origin, uRipple2Time);
    float ripple = clamp(r0 + r1 + r2, 0.0, 1.0);

    // Ripple lifts dots upward (z)
    pos.z += ripple * 1.2;

    // ── Mouse / touch cursor attraction ─────────────────────────────────
    float mouseDist   = distance(xy, uMousePos.xy);
    float mouseRadius = 5.5;
    float mouseStr    = 0.0;
    if (mouseDist < mouseRadius && uMouseActive > 0.01) {
      mouseStr    = pow((mouseRadius - mouseDist) / mouseRadius, 1.8) * uMouseActive;
      vec2 dir    = normalize(uMousePos.xy - xy);
      pos.xy     += dir * mouseStr * 0.18;
      pos.z      += mouseStr * 0.9;
    }

    float totalStrength = clamp(ripple + mouseStr, 0.0, 1.0);
    vStrength = totalStrength;

    // ── Perspective scale — bottom rows slightly larger ──────────────────
    // pos.y ranges roughly -11 to +11; map to 0.85..1.15 scale
    float perspScale = 1.0 + (pos.y + 11.0) / 22.0 * 0.3 - 0.15;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position     = projectionMatrix * mvPosition;

    // Base size 2.2, grows with ripple/mouse, scaled by perspective
    gl_PointSize = (2.2 + totalStrength * 2.5) * perspScale * (16.0 / -mvPosition.z);

    // ── Alpha ────────────────────────────────────────────────────────────
    float distFromCenter = length(xy);
    // Base: idle breathing between 0.12 and 0.22
    float idleAlpha  = 0.12 + breathe * 0.10;
    float activeAlpha = mix(idleAlpha, 1.0, totalStrength);
    vAlpha = smoothstep(24.0, 3.0, distFromCenter) * activeAlpha;
  }
`

const gridFragmentShader = `
  varying float vAlpha;
  varying float vStrength;

  // Color palette
  // At rest: deep teal  rgb(0.02, 0.35, 0.28)
  // Active:  bright emerald-white  rgb(0.55, 1.0, 0.82)
  uniform vec3 uColorRest;
  uniform vec3 uColorActive;

  void main() {
    // Circular dot with soft edge
    float d     = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;
    float edge  = smoothstep(0.5, 0.2, d);

    // Colour shifts warm as strength increases
    vec3 color  = mix(uColorRest, uColorActive, vStrength);

    gl_FragColor = vec4(color, edge * vAlpha);
  }
`

// ── Ripple store — ring buffer of 3 ──────────────────────────────────────
function makeRipple() { return { x: 0, y: 0, t: -99.0 } }

function InteractiveGrid() {
  const { camera }     = useThree()
  const materialRef    = useRef(null)

  // Mouse / touch tracking
  const pointerRef     = useRef(new THREE.Vector2(0, 0))
  const targetMousePos = useRef(new THREE.Vector3(0, 0, 0))
  const _vec           = useRef(new THREE.Vector3())
  const _dir           = useRef(new THREE.Vector3())
  const _pos           = useRef(new THREE.Vector3())
  const mouseActiveRef = useRef(0)
  const isMovingRef    = useRef(false)
  const timerRef       = useRef(new THREE.Timer())

  // Ripple ring buffer
  const ripples     = useRef([makeRipple(), makeRipple(), makeRipple()])
  const rippleIdx   = useRef(0)               // next slot to write

  // Helper: unproject a screen NDC coord to world XY at z=-5
  function ndcToWorld(nx, ny) {
    _vec.current.set(nx, ny, 0.5)
    _vec.current.unproject(camera)
    _dir.current.copy(_vec.current).sub(camera.position).normalize()
    const dist = (-5 - camera.position.z) / _dir.current.z
    _pos.current.copy(camera.position).addScaledVector(_dir.current, dist)
    return { x: _pos.current.x, y: _pos.current.y }
  }

  function spawnRipple(nx, ny) {
    const { x, y } = ndcToWorld(nx, ny)
    const slot = rippleIdx.current % 3
    ripples.current[slot] = { x, y, t: 0.0 }
    rippleIdx.current++
  }

  useEffect(() => {
    let moveTimeout

    // ── Pointer (desktop) ───────────────────────────────────────────────
    function onPointerMove(e) {
      isMovingRef.current = true
      clearTimeout(moveTimeout)
      moveTimeout = setTimeout(() => { isMovingRef.current = false }, 600)
      pointerRef.current.x =  (e.clientX / window.innerWidth)  * 2 - 1
      pointerRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }

    function onMouseLeave() { isMovingRef.current = false }

    // Ripple on click
    function onClick(e) {
      const nx =  (e.clientX / window.innerWidth)  * 2 - 1
      const ny = -(e.clientY / window.innerHeight) * 2 + 1
      spawnRipple(nx, ny)
    }

    // ── Touch (mobile) ──────────────────────────────────────────────────
    function onTouchMove(e) {
      const t = e.touches[0]
      isMovingRef.current = true
      clearTimeout(moveTimeout)
      moveTimeout = setTimeout(() => { isMovingRef.current = false }, 600)
      pointerRef.current.x =  (t.clientX / window.innerWidth)  * 2 - 1
      pointerRef.current.y = -(t.clientY / window.innerHeight) * 2 + 1
    }

    function onTouchStart(e) {
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
  }, [])

  // Grid geometry
  const isMobileScreen = typeof window !== "undefined" && window.innerWidth < 768
  const countX  = isMobileScreen ? 50 : 70
  const countY  = isMobileScreen ? 30 : 40
  const spacing = isMobileScreen ? 0.6 : 0.55

  const positions = useMemo(() => {
    const pos     = new Float32Array(countX * countY * 3)
    const offsetX = (countX * spacing) / 2
    const offsetY = (countY * spacing) / 2
    let i = 0
    for (let x = 0; x < countX; x++) {
      for (let y = 0; y < countY; y++) {
        pos[i * 3]     = x * spacing - offsetX
        pos[i * 3 + 1] = y * spacing - offsetY
        pos[i * 3 + 2] = -5
        i++
      }
    }
    return pos
  }, [countX, countY])

  const uniforms = useMemo(() => ({
    uTime:          { value: 0 },
    uMousePos:      { value: new THREE.Vector3() },
    uMouseActive:   { value: 0 },
    uColorRest:     { value: new THREE.Color(0.02, 0.35, 0.28) },
    uColorActive:   { value: new THREE.Color(0.55, 1.0, 0.82) },
    // 3 ripple slots
    uRipple0Origin: { value: new THREE.Vector2(0, 0) },
    uRipple0Time:   { value: -99.0 },
    uRipple1Origin: { value: new THREE.Vector2(0, 0) },
    uRipple1Time:   { value: -99.0 },
    uRipple2Origin: { value: new THREE.Vector2(0, 0) },
    uRipple2Time:   { value: -99.0 },
  }), [])

  useFrame((_, delta) => {
    if (!materialRef.current) return
    if (document.hidden) return    // pause on hidden tab

    timerRef.current.update()
    const u = materialRef.current.uniforms

    u.uTime.value = timerRef.current.getElapsed()

    // Update ripple times
    const rs = ripples.current
    u.uRipple0Origin.value.set(rs[0].x, rs[0].y)
    u.uRipple0Time.value = rs[0].t >= 0 ? (rs[0].t += delta) : -99.0
    u.uRipple1Origin.value.set(rs[1].x, rs[1].y)
    u.uRipple1Time.value = rs[1].t >= 0 ? (rs[1].t += delta) : -99.0
    u.uRipple2Origin.value.set(rs[2].x, rs[2].y)
    u.uRipple2Time.value = rs[2].t >= 0 ? (rs[2].t += delta) : -99.0

    // Expire ripples after 4 seconds
    for (const r of rs) { if (r.t > 4.0) r.t = -99.0 }

    // Mouse active lerp
    mouseActiveRef.current = THREE.MathUtils.lerp(
      mouseActiveRef.current,
      isMovingRef.current ? 1.0 : 0.0,
      isMovingRef.current ? 0.1 : 0.03
    )
    u.uMouseActive.value = mouseActiveRef.current

    // Unproject mouse to world
    _vec.current.set(pointerRef.current.x, pointerRef.current.y, 0.5)
    _vec.current.unproject(camera)
    _dir.current.copy(_vec.current).sub(camera.position).normalize()
    const dist = (-5 - camera.position.z) / _dir.current.z
    _pos.current.copy(camera.position).addScaledVector(_dir.current, dist)
    targetMousePos.current.lerp(_pos.current, 0.06)
    u.uMousePos.value.copy(targetMousePos.current)
  })

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={gridVertexShader}
        fragmentShader={gridFragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ── CSS fallback for truly low-end devices ────────────────────────────────
function LowEndFallback({ variant }) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 0,
      pointerEvents: "none",
      background: variant === "auth"
        ? `
          radial-gradient(ellipse 80% 55% at 50% 105%, rgba(16,185,129,0.28) 0%, rgba(16,185,129,0.10) 40%, transparent 65%),
          radial-gradient(ellipse 40% 30% at 20% 80%,  rgba(16,185,129,0.08) 0%, transparent 60%),
          #09090b
        `
        : `
          radial-gradient(ellipse 110% 55% at 50% 105%, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.06) 45%, transparent 70%),
          radial-gradient(ellipse 55%  30% at 15% 60%,  rgba(16,185,129,0.07) 0%, transparent 55%),
          radial-gradient(ellipse 40%  25% at 85% 30%,  rgba(2,69,53,0.12)    0%, transparent 55%),
          #09090b
        `,
    }} />
  )
}

// ── Crash / recovery state ────────────────────────────────────────────────
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
      camera={{ position: [0, 0, 5], fov: 60 }}
      dpr={[1, 1]}              // cap at 1× DPR — most important mobile GPU saving
      style={{ position: "absolute", inset: 0 }}
      onCreated={handleCreated}
      gl={{
        powerPreference:              "default",
        antialias:                    false,
        alpha:                        false,
        preserveDrawingBuffer:        false,
        failIfMajorPerformanceCaveat: false,
      }}
    >
      {variant === "auth"
        ? <AuroraShader />
        : <AuroraShader opacity={0.45} />
      }
      <InteractiveGrid />
    </Canvas>
  )
}

// ── Main export ───────────────────────────────────────────────────────────
export default function Background3D({ variant = "chat" }) {
  // Only skip WebGL for truly weak hardware — not all mobile
  if (isLowEndDevice() || webglCrashCount >= MAX_CRASHES) {
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

      {/* Vignette */}
      <div style={{
        position:      "absolute",
        inset:         0,
        zIndex:        1,
        background:    variant === "chat"
          ? "radial-gradient(circle at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.75) 100%)"
          : "radial-gradient(circle at center, transparent 35%, rgba(0,0,0,0.88) 100%)",
        pointerEvents: "none",
      }} />
    </div>
  )
}