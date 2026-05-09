import { useRef, useState } from 'react'
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
  CAP_RADIUS + NOZZLE_LEN,
  HEIGHT / 2 - 0.04,
  0,
]
export const DIALYZER_DIALYSATE_OUT_OFFSET = [
  CAP_RADIUS + NOZZLE_LEN,
  -(HEIGHT / 2 - 0.04),
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
  onPuncture,
  onLearnMore,
}) {
  const [hovered, setHovered] = useState(false)
  const hoverTimeoutRef = useRef(null)
  const dialysateMatRef = useRef(null)
  const transitionRef = useRef(0) // 0 = clean cyan, 1 = bloody pink

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
      // Clean dialysate (light cyan) -> contaminated (pink)
      const r = THREE.MathUtils.lerp(0.4, 0.85, t)
      const g = THREE.MathUtils.lerp(0.85, 0.18, t)
      const b = THREE.MathUtils.lerp(0.85, 0.28, t)
      mat.color.setRGB(r, g, b)
      mat.emissive.setRGB(r * 0.4, g * 0.25, b * 0.25)
      mat.emissiveIntensity = 0.35 + t * 0.4
      mat.opacity = 0.45 + t * 0.25
    }
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
        <cylinderGeometry args={[RADIUS - 0.015, RADIUS - 0.015, HEIGHT, 32]} />
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
        const r = RADIUS - 0.07
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * r, 0, Math.sin(angle) * r]}
            raycast={skipRaycast}
          >
            <cylinderGeometry args={[0.005, 0.005, HEIGHT - 0.05, 4]} />
            <meshStandardMaterial
              color="#ecfeff"
              roughness={0.4}
              transparent
              opacity={0.55}
            />
          </mesh>
        )
      })}

      {/* ===== Brand label (decorative) ===== */}
      <mesh position={[0, 0, RADIUS + 0.001]} raycast={skipRaycast}>
        <planeGeometry args={[0.32, 0.7]} />
        <meshStandardMaterial color="#fafaf9" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.18, RADIUS + 0.002]} raycast={skipRaycast}>
        <planeGeometry args={[0.24, 0.06]} />
        <meshStandardMaterial color="#0e7490" roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.05, RADIUS + 0.002]} raycast={skipRaycast}>
        <planeGeometry args={[0.22, 0.025]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.7} />
      </mesh>

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
        position={[CAP_RADIUS + NOZZLE_LEN / 2, HEIGHT / 2 - 0.04, 0]}
        length={NOZZLE_LEN}
        radius={0.038}
        color="#0e7490"
        axis="x"
      />
      <PortNozzle
        position={[CAP_RADIUS + NOZZLE_LEN / 2, -(HEIGHT / 2 - 0.04), 0]}
        length={NOZZLE_LEN}
        radius={0.038}
        color="#0e7490"
        axis="x"
      />

      {/* ===== Hover hint ring (yellow when not leaking, invites click) ===== */}
      {!active && (
        <mesh raycast={skipRaycast}>
          <torusGeometry args={[CAP_RADIUS + 0.05, 0.018, 12, 36]} />
          <meshStandardMaterial
            color="#fbbf24"
            transparent
            opacity={hovered ? 0.95 : 0.35}
            emissive="#f59e0b"
            emissiveIntensity={hovered ? 1.6 : 0.5}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

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

function skipRaycast() {}
