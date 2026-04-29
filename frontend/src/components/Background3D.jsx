import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { WebGLErrorBoundary } from "./WebGLErrorBoundary"

// ── Aurora full-screen shader ─────────────────────────────────────────────
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
    for (int i = 0; i < 6; i++) {
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

    float t = uTime * 0.05;

    vec3 color = vec3(0.01, 0.01, 0.02);

    // Color palette
    vec3 emerald  = vec3(0.06, 0.73, 0.51);
    vec3 teal     = vec3(0.02, 0.45, 0.35);
    vec3 deepTeal = vec3(0.02, 0.18, 0.28);
    vec3 dark     = vec3(0.01, 0.12, 0.09);

    // Wave 1 — main emerald band
    float wave1 = 0.38 + sin(uv.x * 1.5 - t) * 0.32 + cos(uv.x * 1.0 + t * 0.5) * 0.22;
    float n1    = fbm(st * 1.5 + vec2(t * 0.15, -t * 0.1));
    float dist1 = uv.y - wave1 + (n1 - 0.5) * 0.55;
    float glow1 = exp(-abs(dist1) * 1.1);
    float core1 = exp(-abs(dist1) * 3.2);

    // Wave 2 — upper teal band
    float wave2 = 0.62 + cos(uv.x * 2.0 + t * 0.8) * 0.28 + sin(uv.x * 0.5 - t * 0.3) * 0.28;
    float n2    = fbm(st * 2.0 - vec2(t * 0.2, t * 0.18));
    float dist2 = uv.y - wave2 + (n2 - 0.5) * 0.65;
    float glow2 = exp(-abs(dist2) * 1.4);
    float core2 = exp(-abs(dist2) * 3.5);

    // Wave 3 — deep blue-teal accent layer
    float wave3 = 0.25 + sin(uv.x * 0.8 + t * 0.4) * 0.2 + cos(uv.x * 1.8 - t * 0.6) * 0.15;
    float n3    = fbm(st * 1.2 + vec2(-t * 0.1, t * 0.12));
    float dist3 = uv.y - wave3 + (n3 - 0.5) * 0.4;
    float glow3 = exp(-abs(dist3) * 1.6);

    // Horizontal color sweep (left→teal, right→emerald)
    float hSwipe = smoothstep(0.0, 1.0, uv.x + sin(t * 0.3) * 0.1);

    vec3 wave1Color = mix(teal, emerald, hSwipe + n1 * 0.4);
    color += wave1Color * glow1 * 0.42;
    color += mix(vec3(0.5, 1.0, 0.8), wave1Color, 0.4) * core1 * 0.52;

    vec3 wave2Color = mix(emerald, teal, 1.0 - hSwipe + n2 * 0.4);
    color += wave2Color * glow2 * 0.32;
    color += mix(vec3(0.4, 0.9, 0.7), wave2Color, 0.5) * core2 * 0.38;

    // Deep teal accent
    color += mix(deepTeal, teal, n3) * glow3 * 0.25;

    // Ambient flow
    float ambientFlow = fbm(st * 0.9 + vec2(t * 0.03, t * 0.05));
    color += mix(dark, teal, ambientFlow) * ambientFlow * 0.15;

    // Vignette
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
    uResolution: { value: new THREE.Vector2(size.width, size.height) },
  }), [])

  useFrame(() => {
    if (!materialRef.current) return
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

// ── Interactive dot grid ──────────────────────────────────────────────────
const gridVertexShader = `
  uniform float uTime;
  uniform vec3  uMousePos;
  uniform float uActive;
  varying float vAlpha;

  void main() {
    vec3 pos = position;

    // Idle breathing wave
    float idle = sin(uTime * 0.8 + pos.x * 0.3 + pos.y * 0.3) * 0.5 + 0.5;
    float wave = sin(pos.x * 0.2 + uTime * 0.1) * cos(pos.y * 0.2 + uTime * 0.1) * 0.02;
    pos.z += wave;

    float dist     = distance(pos.xy, uMousePos.xy);
    float radius   = 6.0;
    float strength = 0.0;

    if (dist < radius && uActive > 0.01) {
      strength = pow((radius - dist) / radius, 1.5) * uActive;
      vec2 dir = normalize(uMousePos.xy - pos.xy);
      pos.xy  += dir * strength * 0.15;
      pos.z   += strength * 0.8;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position  = projectionMatrix * mvPosition;
    gl_PointSize = (2.2 + strength * 1.8) * (15.0 / -mvPosition.z);

    float distFromCenter = length(pos.xy);
    // Breathing base alpha even when mouse is away
    float breathAlpha  = 0.08 + idle * 0.06;
    float targetAlpha  = mix(breathAlpha, 1.0, strength);
    vAlpha = smoothstep(22.0, 4.0, distFromCenter) * targetAlpha;
  }
`

const gridFragmentShader = `
  uniform vec3  uColor;
  varying float vAlpha;

  void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;
    gl_FragColor = vec4(uColor, alpha);
  }
`

function InteractiveGrid() {
  const { camera }     = useThree()
  const materialRef    = useRef(null)
  // Allocate vectors outside useFrame to avoid GC pressure
  const targetMousePos = useRef(new THREE.Vector3(0, 0, 0))
  const vecRef         = useRef(new THREE.Vector3())
  const dirRef         = useRef(new THREE.Vector3())
  const posRef         = useRef(new THREE.Vector3())
  const activeRef      = useRef(0)
  const isMovingRef    = useRef(false)
  const pointerRef     = useRef(new THREE.Vector2(0, 0))
  const timerRef       = useRef(new THREE.Timer())

  useEffect(() => {
    let timeout

    const handleMove = (e) => {
      isMovingRef.current = true
      clearTimeout(timeout)
      timeout = setTimeout(() => { isMovingRef.current = false }, 600)
      pointerRef.current.x =  (e.clientX / window.innerWidth)  * 2 - 1
      pointerRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }

    const handleLeave = () => { isMovingRef.current = false }

    window.addEventListener("pointermove", handleMove, { passive: true })
    document.addEventListener("mouseleave", handleLeave)
    return () => {
      window.removeEventListener("pointermove", handleMove)
      document.removeEventListener("mouseleave", handleLeave)
      clearTimeout(timeout)
    }
  }, [])

  const countX  = 80
  const countY  = 45
  const spacing = 0.55

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
  }, [])

  const uniforms = useMemo(() => ({
    uTime:     { value: 0 },
    uMousePos: { value: new THREE.Vector3() },
    uActive:   { value: 0 },
    uColor:    { value: new THREE.Color("#10b981") },
  }), [])

  useFrame(() => {
    if (!materialRef.current) return
    timerRef.current.update()
    materialRef.current.uniforms.uTime.value = timerRef.current.getElapsed()

    activeRef.current = THREE.MathUtils.lerp(
      activeRef.current,
      isMovingRef.current ? 1.0 : 0.0,
      isMovingRef.current ? 0.08 : 0.025
    )
    materialRef.current.uniforms.uActive.value = activeRef.current

    // Reuse allocated vectors — no GC
    vecRef.current.set(pointerRef.current.x, pointerRef.current.y, 0.5)
    vecRef.current.unproject(camera)
    dirRef.current.copy(vecRef.current).sub(camera.position).normalize()
    const distance = (-5 - camera.position.z) / dirRef.current.z
    posRef.current.copy(camera.position).addScaledVector(dirRef.current, distance)

    targetMousePos.current.lerp(posRef.current, 0.05)
    materialRef.current.uniforms.uMousePos.value.copy(targetMousePos.current)
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

// ── Mobile CSS fallback ───────────────────────────────────────────────────
function MobileFallback({ variant }) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 0,
      pointerEvents: "none",
      background: variant === "auth"
        ? "radial-gradient(ellipse 70% 45% at 50% 110%, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.04) 45%, transparent 70%), #09090b"
        : "radial-gradient(ellipse 50% 30% at 50% 110%, rgba(16,185,129,0.06) 0%, transparent 60%), #09090b",
    }} />
  )
}

// ── WebGL Canvas with context-loss recovery ───────────────────────────────
function WebGLCanvas({ variant }) {
  const [lost, setLost] = useState(false)

  function handleCreated({ gl }) {
    const canvas = gl.domElement
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault()
      setLost(true)
    })
    canvas.addEventListener("webglcontextrestored", () => {
      setLost(false)
    })
  }

  if (lost) return <MobileFallback variant={variant} />

  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 60 }}
      dpr={[1, 1.5]}
      style={{ position: "absolute", inset: 0 }}
      onCreated={handleCreated}
      gl={{ powerPreference: "high-performance", antialias: false }}
    >
      {variant === "auth"
        ? <AuroraShader />
        : <AuroraShader opacity={0.28} />
      }
      <InteractiveGrid />
    </Canvas>
  )
}

// ── Main export ───────────────────────────────────────────────────────────
export default function Background3D({ variant = "chat" }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768

  if (isMobile) return <MobileFallback variant={variant} />

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 0,
      background: "#09090b",
      overflow: "hidden",
      pointerEvents: "none",
    }}>
      <WebGLErrorBoundary fallback={<MobileFallback variant={variant} />}>
        <WebGLCanvas variant={variant} />
      </WebGLErrorBoundary>

      {/* Vignette overlay */}
      <div style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        background: variant === "chat"
          ? "radial-gradient(circle at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.92) 100%)"
          : "radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.88) 100%)",
        pointerEvents: "none",
      }} />
    </div>
  )
}