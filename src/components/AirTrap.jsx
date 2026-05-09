import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

/**
 * Air trap (a.k.a. drip chamber / venous bubble trap).
 *
 * Sits AFTER the dialyzer on the venous return line. A vertical
 * cylindrical chamber, partially filled with blood (the lower 62%),
 * with an air space above (the upper 38%). Air bubbles in the blood
 * rise to the meniscus and pop -- the trapped air collects above the
 * blood line and never reaches the patient.
 *
 * The actual air DETECTION is done by a separate inline ultrasonic
 * clamp (see `AirDetectorClamp.jsx`) mounted on the venous tube
 * downstream of this chamber. When that clamp trips, more bubbles
 * burst here to read as the upstream cause of the failure.
 */

const HEIGHT = 1.1
const RADIUS = 0.14
const CAP_HEIGHT = 0.08
const CAP_RADIUS = 0.18
const NOZZLE_LEN = 0.16
const BLOOD_FRACTION = 0.62

const N_BUBBLES = 10

// World-relative offsets (add to AIR_TRAP_POSITION to get tube end-points)
export const AIR_TRAP_TOP_OFFSET = [
  0,
  HEIGHT / 2 + CAP_HEIGHT + NOZZLE_LEN,
  0,
]
export const AIR_TRAP_BOTTOM_OFFSET = [
  0,
  -(HEIGHT / 2 + CAP_HEIGHT + NOZZLE_LEN),
  0,
]

export function airTrapPort(offset, position) {
  return [
    position[0] + offset[0],
    position[1] + offset[1],
    position[2] + offset[2],
  ]
}

export default function AirTrap({
  position = [0, 0, 0],
  active = false,
  flowRate = 0,
  onLearnMore,
}) {
  const [hovered, setHovered] = useState(false)
  const hoverTimeoutRef = useRef(null)
  const bubbles = useRef(
    Array.from({ length: N_BUBBLES }, () => ({
      pos: new THREE.Vector3(),
      vel: 0,
      size: 0.012,
      life: 0,
    })),
  )
  const bubbleRefs = useRef([])

  const bloodTopY = -HEIGHT / 2 + HEIGHT * BLOOD_FRACTION
  const bloodBotY = -HEIGHT / 2

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const isFlowing = flowRate > 0

    // When the air detector is tripped we burst lots of bubbles to read as
    // an air-bolus event. Otherwise produce a sparse trickle if blood is
    // flowing -- that's the everyday "tiny micro-bubbles being trapped"
    // visual. Idle (no flow, no alarm) -> chamber sits still.
    const spawnRate = active ? 5 : isFlowing ? 0.7 : 0

    for (let i = 0; i < N_BUBBLES; i++) {
      const b = bubbles.current[i]
      const mesh = bubbleRefs.current[i]
      if (!mesh) continue

      if (b.life <= 0) {
        if (Math.random() < spawnRate * dt) {
          const angle = Math.random() * Math.PI * 2
          const r = Math.random() * (RADIUS - 0.04)
          b.pos.set(
            Math.cos(angle) * r,
            bloodBotY + 0.04,
            Math.sin(angle) * r,
          )
          b.vel = 0.18 + Math.random() * 0.28
          b.size = 0.012 + Math.random() * 0.018
          b.life = 5
          mesh.scale.setScalar(b.size)
        } else {
          mesh.visible = false
          continue
        }
      }

      b.pos.y += b.vel * dt
      b.life -= dt

      if (b.pos.y >= bloodTopY) {
        // Pop at the meniscus -- bubble disappears into the air space
        b.life = 0
        mesh.visible = false
      } else {
        mesh.position.copy(b.pos)
        mesh.visible = true
      }
    }
  })

  const hoverEvents = {
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
  }

  return (
    <group position={position} {...hoverEvents}>
      {/* ===== End caps ===== */}
      <mesh position={[0, HEIGHT / 2 + CAP_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[CAP_RADIUS, CAP_RADIUS, CAP_HEIGHT, 24]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, -HEIGHT / 2 - CAP_HEIGHT / 2, 0]} castShadow>
        <cylinderGeometry args={[CAP_RADIUS, CAP_RADIUS, CAP_HEIGHT, 24]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* ===== Outer transparent shell ===== */}
      <mesh castShadow>
        <cylinderGeometry args={[RADIUS, RADIUS, HEIGHT + 0.005, 32]} />
        <meshStandardMaterial
          color="#ffffff"
          transparent
          opacity={0.16}
          roughness={0.05}
          metalness={0.15}
          depthWrite={false}
        />
      </mesh>

      {/* ===== Lower 62%: blood column =====
          Slightly inset from the shell. Translucent so the rising bubbles
          (and the blood-tube particles passing through the chamber) are
          visible inside. */}
      <mesh
        position={[0, (bloodBotY + bloodTopY) / 2, 0]}
        raycast={skipRaycast}
      >
        <cylinderGeometry
          args={[RADIUS - 0.012, RADIUS - 0.012, bloodTopY - bloodBotY, 32]}
        />
        <meshStandardMaterial
          color="#991b1b"
          transparent
          opacity={0.78}
          emissive="#7f1d1d"
          emissiveIntensity={0.25}
          roughness={0.3}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* ===== Meniscus (visible blood-air interface disc) ===== */}
      <mesh
        position={[0, bloodTopY + 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={skipRaycast}
      >
        <circleGeometry args={[RADIUS - 0.012, 32]} />
        <meshStandardMaterial
          color="#dc2626"
          emissive="#b91c1c"
          emissiveIntensity={0.45}
          roughness={0.15}
          metalness={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ===== Rising bubbles ===== */}
      {Array.from({ length: N_BUBBLES }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            bubbleRefs.current[i] = el
          }}
          visible={false}
          raycast={skipRaycast}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial
            color="#fef9c3"
            transparent
            opacity={0.55}
            metalness={0.3}
            roughness={0.2}
          />
        </mesh>
      ))}

      {/* ===== Top inlet port (axial, dark red) ===== */}
      <PortNozzle
        position={[0, HEIGHT / 2 + CAP_HEIGHT + NOZZLE_LEN / 2, 0]}
        length={NOZZLE_LEN}
        radius={0.04}
        color="#7f1d1d"
      />

      {/* ===== Bottom outlet port (axial, dark red) ===== */}
      <PortNozzle
        position={[0, -HEIGHT / 2 - CAP_HEIGHT - NOZZLE_LEN / 2, 0]}
        length={NOZZLE_LEN}
        radius={0.04}
        color="#7f1d1d"
      />

      {/* ===== Floating "Learn More" button on hover ===== */}
      {hovered && (
        <Html
          position={[0, HEIGHT / 2 + 0.45, 0.25]}
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
              onLearnMore?.('airTrap')
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

function PortNozzle({ position, length, radius = 0.04, color }) {
  return (
    <group position={position}>
      <mesh raycast={skipRaycast} castShadow>
        <cylinderGeometry args={[radius, radius * 1.05, length, 14]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  )
}

function skipRaycast() {}
