import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

/**
 * Dialyzer (artificial kidney).
 *
 * Visual representation of the hollow-fibre filter where blood and
 * dialysate counter-flow across a semipermeable membrane:
 *
 *      blood OUT (top axial port)        dialysate IN (top side port)
 *              |                                |
 *           [ cap ]======================[ cap ]
 *           |                                  |
 *           |  ::::::::::::::::::::::::::::    |
 *           |  ::: hollow fibres + dialysate   |
 *           |  ::: (cyan when clean,           |
 *           |  :::  pink when membrane leaks)  |
 *           |  ::::::::::::::::::::::::::::    |
 *           |                                  |
 *           [ cap ]======================[ cap ]
 *              |                                |
 *      blood IN (bottom axial port)      dialysate OUT (bottom side port)
 *
 * Real dialysis machines have a Blood Leak Detector (BLD) on the
 * dialysate OUT line: it's an optical sensor that watches for red
 * cells crossing a ruptured membrane. We simulate that here -- when
 * `active` is true, the dialysate fluid tints pink to signal the BLD
 * has tripped, which raises CRITICAL and zeroes blood-flow.
 *
 * Click the dialyzer to simulate a membrane rupture (the "creative
 * test" for the leak detector).
 */

const HEIGHT = 1.6
const RADIUS = 0.25
const BLOOD_CORE_RADIUS = 0.105
const MEMBRANE_RADIUS = 0.145
const CAP_HEIGHT = 0.12
const CAP_RADIUS = 0.32
const NOZZLE_LEN = 0.16

// ---- Exported port offsets (relative to the dialyzer's center) -----------
// These are the WORLD-RELATIVE positions of the outer nozzle tips. Add
// `DIALYZER_POSITION` to them to get a world-space coordinate that the
// blood / dialysate tubes can plug into.
export const DIALYZER_BLOOD_IN_OFFSET = [
  0,
  -(HEIGHT / 2 + CAP_HEIGHT + NOZZLE_LEN),
  0,
]
export const DIALYZER_BLOOD_OUT_OFFSET = [
  0,
  HEIGHT / 2 + CAP_HEIGHT + NOZZLE_LEN,
  0,
]
export const DIALYZER_DIALYSATE_IN_OFFSET = [
  -(CAP_RADIUS + NOZZLE_LEN),
  -(HEIGHT / 2 - 0.04),
  0,
]
export const DIALYZER_DIALYSATE_OUT_OFFSET = [
  -(CAP_RADIUS + NOZZLE_LEN),
  HEIGHT / 2 - 0.04,
  0,
]

export function dialyzerPort(offset, position) {
  return [
    position[0] + offset[0],
    position[1] + offset[1],
    position[2] + offset[2],
  ]
}

export default function Dialyzer({
  position = [0, 0, 0],
  active = false,
  bloodFlowRate = 300,
  dialysateFlowRate = 600,
  wasteMix = 0,
  onPuncture,
  onLearnMore,
}) {
  const [hovered, setHovered] = useState(false)
  const hoverTimeoutRef = useRef(null)
  const dialysateMatRef = useRef(null)
  const bloodCoreMatRef = useRef(null)
  const bloodParticleRefs = useRef([])
  const dialysateParticleRefs = useRef([])
  const transitionRef = useRef(0) // 0 = clean cyan, 1 = bloody pink
  const bloodOffsetRef = useRef(0)
  const dialysateOffsetRef = useRef(0)

  const bloodParticles = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        angle: (i / 12) * Math.PI * 2,
        radius: BLOOD_CORE_RADIUS * (0.42 + (i % 3) * 0.14),
      })),
    [],
  )

  const dialysateParticles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        angle: (i / 18) * Math.PI * 2,
      })),
    [],
  )

  useFrame((_, delta) => {
    const target = active ? 1 : 0
    // Fade IN to bloody fast (membrane breach is sudden), fade OUT slower
    // (a fresh dialyzer has to be flushed before clarity returns).
    const speed = active ? 1.6 : 0.4
    transitionRef.current +=
      (target - transitionRef.current) * Math.min(1, speed * delta)

    const t = transitionRef.current
    const mat = dialysateMatRef.current
    if (mat) {
      const clean = new THREE.Color().setRGB(0.48, 0.93, 0.98)
      const spent = new THREE.Color().setRGB(0.17, 0.58, 0.68)
      const leak = new THREE.Color().setRGB(0.85, 0.18, 0.28)
      const base = clean.lerp(spent, THREE.MathUtils.clamp(wasteMix, 0, 1))
      const display = base.clone().lerp(leak, t)
      const { r, g, b } = display
      mat.color.setRGB(r, g, b)
      mat.emissive.setRGB(r * 0.45, g * 0.28, b * 0.2)
      mat.emissiveIntensity = 0.35 + t * 0.4
      mat.opacity = 0.45 + t * 0.25
    }

    const bloodMat = bloodCoreMatRef.current
    if (bloodMat) {
      bloodMat.emissiveIntensity = 0.35 + Math.min(0.5, bloodFlowRate / 700)
    }

    bloodOffsetRef.current =
      (bloodOffsetRef.current + Math.max(0, bloodFlowRate) * delta * 0.00055) % 1
    dialysateOffsetRef.current =
      (dialysateOffsetRef.current + Math.max(0, dialysateFlowRate) * delta * 0.00038) % 1

    bloodParticles.forEach((particle, i) => {
      const mesh = bloodParticleRefs.current[i]
      if (!mesh) return
      if (bloodFlowRate <= 0) {
        mesh.visible = false
        return
      }
      const travel = ((i / bloodParticles.length) + bloodOffsetRef.current) % 1
      const y = -HEIGHT / 2 + 0.08 + travel * (HEIGHT - 0.16)
      mesh.visible = true
      mesh.position.set(
        Math.cos(particle.angle + travel * Math.PI * 2) * particle.radius,
        y,
        Math.sin(particle.angle + travel * Math.PI * 2) * particle.radius * 0.55,
      )
    })

    dialysateParticles.forEach((particle, i) => {
      const mesh = dialysateParticleRefs.current[i]
      if (!mesh) return
      if (dialysateFlowRate <= 0) {
        mesh.visible = false
        return
      }
      const travel = ((i / dialysateParticles.length) + dialysateOffsetRef.current) % 1
      // Dialysate flows top → bottom (countercurrent to blood)
      const y = HEIGHT / 2 - 0.08 - travel * (HEIGHT - 0.16)
      const angle = particle.angle + travel * Math.PI * 1.6
      const radius = MEMBRANE_RADIUS + 0.038 + Math.sin(angle * 2) * 0.012
      mesh.visible = true
      mesh.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
    })
  })

  const events = {
    onPointerOver: (e) => {
      e.stopPropagation()
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
      setHovered(true)
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: (e) => {
      e.stopPropagation()
      document.body.style.cursor = 'auto'
      hoverTimeoutRef.current = setTimeout(() => {
        setHovered(false)
      }, 400)
    },
    onClick: (e) => {
      e.stopPropagation()
      if (!active) onPuncture?.()
    },
  }

  return (
    <group position={position} {...events}>
      {/* ===== End caps ===== */}
      <mesh position={[0, HEIGHT / 2 + CAP_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[CAP_RADIUS, CAP_RADIUS, CAP_HEIGHT, 24]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.3} roughness={0.55} />
      </mesh>
      <mesh position={[0, -HEIGHT / 2 - CAP_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[CAP_RADIUS, CAP_RADIUS, CAP_HEIGHT, 24]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.3} roughness={0.55} />
      </mesh>

      {/* ===== Dialysate compartment (the color-changing fluid) =====
          Drawn slightly inside the outer shell so it reads as a fluid
          column rather than the wall. */}
      <mesh raycast={skipRaycast}>
        <cylinderGeometry args={[RADIUS - 0.015, RADIUS - 0.015, HEIGHT, 40]} />
        <meshStandardMaterial
          ref={dialysateMatRef}
          color="#67e8f9"
          transparent
          opacity={0.5}
          emissive="#0891b2"
          emissiveIntensity={0.35}
          roughness={0.2}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* ===== Blood path inside the hollow fibres ===== */}
      <mesh raycast={skipRaycast}>
        <cylinderGeometry
          args={[BLOOD_CORE_RADIUS, BLOOD_CORE_RADIUS, HEIGHT - 0.06, 28]}
        />
        <meshStandardMaterial
          ref={bloodCoreMatRef}
          color="#7f1d1d"
          emissive="#991b1b"
          emissiveIntensity={0.45}
          transparent
          opacity={0.28}
          roughness={0.2}
          metalness={0.05}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* ===== Semipermeable membrane shell ===== */}
      <mesh raycast={skipRaycast}>
        <cylinderGeometry
          args={[MEMBRANE_RADIUS, MEMBRANE_RADIUS, HEIGHT - 0.04, 28, 1, true]}
        />
        <meshStandardMaterial
          color="#e2e8f0"
          emissive="#cbd5e1"
          emissiveIntensity={0.18}
          transparent
          opacity={0.2}
          roughness={0.15}
          metalness={0.05}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* ===== Outer transparent shell (clear plastic housing) ===== */}
      <mesh castShadow>
        <cylinderGeometry args={[RADIUS, RADIUS, HEIGHT + 0.02, 32]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.16}
          roughness={0.05}
          metalness={0.15}
          depthWrite={false}
        />
      </mesh>

      {/* ===== Hollow-fibre bundle (decorative thin verticals) ===== */}
      {Array.from({ length: 14 }).map((_, i) => {
        const angle = (i / 14) * Math.PI * 2
        const r = BLOOD_CORE_RADIUS * 0.82
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * r, 0, Math.sin(angle) * r]}
            raycast={skipRaycast}
          >
            <cylinderGeometry args={[0.004, 0.004, HEIGHT - 0.05, 4]} />
            <meshStandardMaterial
              color="#fecaca"
              roughness={0.4}
              transparent
              opacity={0.6}
            />
          </mesh>
        )
      })}

      {/* ===== Animated blood particles in the fibre lumens ===== */}
      {bloodParticles.map((particle, i) => (
        <mesh
          key={`blood-${i}`}
          ref={(el) => {
            bloodParticleRefs.current[i] = el
          }}
          raycast={skipRaycast}
        >
          <sphereGeometry args={[0.018, 10, 10]} />
          <meshStandardMaterial
            color="#ef4444"
            emissive="#f97316"
            emissiveIntensity={1.2}
            roughness={0.25}
            metalness={0.05}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* ===== Animated dialysate particles around the membrane ===== */}
      {dialysateParticles.map((particle, i) => (
        <mesh
          key={`dialysate-${i}`}
          ref={(el) => {
            dialysateParticleRefs.current[i] = el
          }}
          raycast={skipRaycast}
        >
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshStandardMaterial
            color={active ? '#fda4af' : wasteMix > 0.35 ? '#2f8fa0' : '#67e8f9'}
            emissive={active ? '#fb7185' : wasteMix > 0.35 ? '#155e75' : '#06b6d4'}
            emissiveIntensity={1.0}
            roughness={0.2}
            metalness={0.05}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* ===== Blood ports (axial, large bore, dark red) ===== */}
      <PortNozzle
        position={[0, -HEIGHT / 2 - CAP_HEIGHT - NOZZLE_LEN / 2, 0]}
        length={NOZZLE_LEN}
        radius={0.05}
        color="#7f1d1d"
        axis="y"
      />
      <PortNozzle
        position={[0, HEIGHT / 2 + CAP_HEIGHT + NOZZLE_LEN / 2, 0]}
        length={NOZZLE_LEN}
        radius={0.05}
        color="#7f1d1d"
        axis="y"
      />

      {/* ===== Dialysate ports (radial, smaller, teal) ===== */}
      <PortNozzle
        position={[-(CAP_RADIUS + NOZZLE_LEN / 2), -(HEIGHT / 2 - 0.04), 0]}
        length={NOZZLE_LEN}
        radius={0.038}
        color="#0e7490"
        axis="x"
      />
      <DialysatePortHalo position={[-(CAP_RADIUS + NOZZLE_LEN + 0.015), -(HEIGHT / 2 - 0.04), 0]} />
      <PortNozzle
        position={[-(CAP_RADIUS + NOZZLE_LEN / 2), HEIGHT / 2 - 0.04, 0]}
        length={NOZZLE_LEN}
        radius={0.038}
        color="#0e7490"
        axis="x"
      />
      <DialysatePortHalo position={[-(CAP_RADIUS + NOZZLE_LEN + 0.015), HEIGHT / 2 - 0.04, 0]} />

      {/* ===== Active leak indicator (pulsing red ring) ===== */}
      {active && <LeakRing radius={CAP_RADIUS + 0.05} />}

      {/* ===== Floating "Learn More" button on hover ===== */}
      {hovered && (
        <Html
          position={[0, HEIGHT / 2 + 0.55, 0.35]}
          center
          distanceFactor={6}
          style={{ pointerEvents: 'auto' }}
        >
          <button
            onPointerEnter={() => {
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
            }}
            onPointerLeave={() => {
              hoverTimeoutRef.current = setTimeout(() => setHovered(false), 400)
            }}
            onClick={(e) => {
              e.stopPropagation()
              onLearnMore?.('dialyzer')
            }}
            className="whitespace-nowrap rounded-full bg-med-accent/90 px-3 py-1.5 text-xs font-bold text-slate-900 shadow-lg backdrop-blur transition hover:bg-med-accent hover:scale-105"
          >
            Learn More
          </button>
        </Html>
      )}
    </group>
  )
}

/* ----- Helpers ----------------------------------------------------- */

function PortNozzle({ position, length, radius = 0.045, color, axis }) {
  const rotation =
    axis === 'x'
      ? [0, 0, Math.PI / 2]
      : axis === 'z'
        ? [Math.PI / 2, 0, 0]
        : [0, 0, 0]
  return (
    <group position={position} rotation={rotation}>
      <mesh raycast={skipRaycast} castShadow>
        <cylinderGeometry args={[radius, radius * 1.05, length, 14]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  )
}

function LeakRing({ radius }) {
  const ref = useRef(null)
  useFrame((s) => {
    const m = ref.current
    if (!m) return
    const t = s.clock.elapsedTime
    m.material.emissiveIntensity = 1.2 + Math.sin(t * 6) * 0.6
    const sc = 1 + Math.sin(t * 6) * 0.04
    m.scale.set(sc, sc, sc)
  })
  return (
    <mesh ref={ref} raycast={skipRaycast}>
      <torusGeometry args={[radius, 0.028, 14, 36]} />
      <meshStandardMaterial
        color="#ef4444"
        emissive="#dc2626"
        emissiveIntensity={1.6}
        toneMapped={false}
      />
    </mesh>
  )
}

function DialysatePortHalo({ position }) {
  return (
    <mesh position={position} rotation={[0, Math.PI / 2, 0]} raycast={skipRaycast}>
      <torusGeometry args={[0.055, 0.009, 10, 28]} />
      <meshStandardMaterial
        color="#67e8f9"
        emissive="#22d3ee"
        emissiveIntensity={1.0}
        transparent
        opacity={0.9}
        toneMapped={false}
      />
    </mesh>
  )
}

function skipRaycast() {}
