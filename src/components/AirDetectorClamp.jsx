import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Inline air-detector clamp (ultrasonic bubble detector).
 *
 * Two black plastic halves clip around the venous return tube AFTER the
 * air trap. The sensor inside the clamp watches for any bubbles that
 * escaped the drip chamber. A green LED on the front face confirms a
 * clear line; on detection the LED switches to a pulsing red and the
 * safety chain trips (bloodFlowRate -> 0, systemStatus -> CRITICAL).
 *
 * The clamp's local +X axis is the TUBE AXIS -- align it with the local
 * tube tangent via the `rotation` prop so the tube appears to pass
 * through the channel between the two halves.
 *
 * Click to inject an air bolus (test trigger).
 */

// All geometry expressed in the clamp's local frame, with +X = tube axis.
const BODY_W = 0.18 // length along the tube
const BODY_H = 0.14 // half thickness (each jaw)
const BODY_D = 0.18 // perpendicular to tube
const TUBE_GAP = 0.06 // gap between the two halves where the tube sits

export default function AirDetectorClamp({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  active = false,
  onTrigger,
}) {
  const [hovered, setHovered] = useState(false)
  const ledMatRef = useRef(null)

  useFrame((state) => {
    const m = ledMatRef.current
    if (!m) return
    if (active) {
      m.color.setRGB(1.0, 0.18, 0.18)
      m.emissive.setRGB(1.0, 0.05, 0.05)
      m.emissiveIntensity = 1.6 + Math.sin(state.clock.elapsedTime * 7) * 0.7
    } else {
      m.color.setRGB(0.18, 0.85, 0.4)
      m.emissive.setRGB(0.05, 0.7, 0.2)
      m.emissiveIntensity = 0.7
    }
  })

  const events = {
    onPointerOver: (e) => {
      e.stopPropagation()
      setHovered(true)
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: (e) => {
      e.stopPropagation()
      setHovered(false)
      document.body.style.cursor = 'auto'
    },
    onClick: (e) => {
      e.stopPropagation()
      if (!active) onTrigger?.()
    },
  }

  const bodyColor = hovered ? '#2a2a2a' : '#141414'

  return (
    <group position={position} rotation={rotation} {...events}>
      {/* ===== Top jaw ===== */}
      <mesh position={[0, BODY_H / 2 + TUBE_GAP / 2, 0]} castShadow>
        <boxGeometry args={[BODY_W, BODY_H, BODY_D]} />
        <meshStandardMaterial
          color={bodyColor}
          metalness={0.2}
          roughness={0.65}
        />
      </mesh>

      {/* ===== Bottom jaw ===== */}
      <mesh position={[0, -BODY_H / 2 - TUBE_GAP / 2, 0]} castShadow>
        <boxGeometry args={[BODY_W, BODY_H, BODY_D]} />
        <meshStandardMaterial
          color={bodyColor}
          metalness={0.2}
          roughness={0.65}
        />
      </mesh>

      {/* ===== Hinge / parting strip on the back face ===== */}
      <mesh position={[0, 0, -BODY_D / 2 + 0.005]} raycast={skipRaycast}>
        <boxGeometry args={[BODY_W * 0.9, TUBE_GAP + 0.01, 0.01]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
      </mesh>

      {/* ===== Front status LED ===== */}
      <mesh
        position={[0, BODY_H * 0.55 + TUBE_GAP / 2, BODY_D / 2 + 0.001]}
        raycast={skipRaycast}
      >
        <sphereGeometry args={[0.022, 14, 14]} />
        <meshStandardMaterial
          ref={ledMatRef}
          color="#10b981"
          emissive="#10b981"
          emissiveIntensity={0.7}
          toneMapped={false}
        />
      </mesh>

      {/* ===== Tiny silver label stripe under the LED ===== */}
      <mesh
        position={[0, BODY_H * 0.05 + TUBE_GAP / 2, BODY_D / 2 + 0.001]}
        raycast={skipRaycast}
      >
        <planeGeometry args={[BODY_W * 0.55, 0.018]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.7} />
      </mesh>

      {/* ===== Sensor cable trailing off the side ===== */}
      <SensorCable />

      {/* ===== Hover hint ring (around the tube channel) ===== */}
      {!active && (
        <mesh
          rotation={[0, 0, Math.PI / 2]}
          position={[BODY_W / 2 + 0.025, 0, 0]}
          raycast={skipRaycast}
        >
          <torusGeometry args={[0.07, 0.012, 12, 36]} />
          <meshStandardMaterial
            color="#fbbf24"
            transparent
            opacity={hovered ? 0.9 : 0.28}
            emissive="#f59e0b"
            emissiveIntensity={hovered ? 1.5 : 0.4}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* ===== Active alarm pulse ring ===== */}
      {active && <AlarmRing />}
    </group>
  )
}

/* ----- Helpers ----------------------------------------------------- */

function SensorCable() {
  const geom = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-BODY_W / 2 - 0.005, BODY_H * 0.3, 0),
        new THREE.Vector3(-BODY_W / 2 - 0.10, BODY_H * 0.1, 0.06),
        new THREE.Vector3(-BODY_W / 2 - 0.18, -BODY_H * 0.2, 0.10),
        new THREE.Vector3(-BODY_W / 2 - 0.28, -BODY_H * 0.7, 0.12),
      ],
      false,
      'centripetal',
    )
    return new THREE.TubeGeometry(curve, 32, 0.008, 8, false)
  }, [])

  return (
    <mesh geometry={geom} raycast={skipRaycast} castShadow>
      <meshStandardMaterial color="#3a3a3a" metalness={0.15} roughness={0.7} />
    </mesh>
  )
}

function AlarmRing() {
  const ref = useRef(null)
  useFrame((s) => {
    const m = ref.current
    if (!m) return
    const t = s.clock.elapsedTime
    m.material.emissiveIntensity = 1.0 + Math.sin(t * 7) * 0.6
    const sc = 1 + Math.sin(t * 7) * 0.05
    m.scale.set(sc, sc, sc)
  })
  return (
    <mesh
      ref={ref}
      rotation={[0, 0, Math.PI / 2]}
      position={[BODY_W / 2 + 0.025, 0, 0]}
      raycast={skipRaycast}
    >
      <torusGeometry args={[0.075, 0.018, 14, 36]} />
      <meshStandardMaterial
        color="#ef4444"
        emissive="#dc2626"
        emissiveIntensity={1.4}
        toneMapped={false}
      />
    </mesh>
  )
}

function skipRaycast() {}
