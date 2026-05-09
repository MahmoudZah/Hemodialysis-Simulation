import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Renders a blood-filled tube along an arbitrary THREE.Curve (or CurvePath)
 * and animates a stream of red-blood-cell particles riding the curve.
 *
 * Pass a single curve covering the whole circuit so a single line of
 * particles flows continuously from the patient's arterial port, through
 * the pump's 340° loop, and back to the venous port.
 *
 *   <BloodTube curve={circuitPath} flowRate={300} hematocrit={42} viscosity={3.5} />
 *
 * Convenience: if no curve is given but start/end (and optional control1/control2)
 * are supplied, a CatmullRom curve is built automatically -- handy for short
 * connecting tubes the team adds later.
 */
export default function BloodTube({
  curve,
  start,
  end,
  control1,
  control2,
  flowRate = 300,
  viscosity = 3.5,
  hematocrit = 42,
  radius = 0.13,
  particles = 18,
  tubularSegments = 256,
  reverse = false,
}) {
  const offsetRef = useRef(0)
  const particleRefs = useRef([])

  const finalCurve = useMemo(() => {
    if (curve) return curve
    if (!start || !end) return null
    const c1 = control1 ?? midpoint(start, end, [0, -0.4, 0])
    const c2 = control2 ?? midpoint(end, start, [0, -0.3, 0])
    return new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(...start),
        new THREE.Vector3(...c1),
        new THREE.Vector3(...c2),
        new THREE.Vector3(...end),
      ],
      false,
      'centripetal',
    )
  }, [curve, start, end, control1, control2])

  const tubeGeom = useMemo(() => {
    if (!finalCurve) return null
    return new THREE.TubeGeometry(finalCurve, tubularSegments, radius, 16, false)
  }, [finalCurve, radius, tubularSegments])

  const tubeColor = useMemo(() => {
    const t = Math.max(0, Math.min(1, (hematocrit - 25) / 30))
    const r = Math.round(230 - t * 80) // 230 -> 150
    return `rgb(${r}, 28, 28)`
  }, [hematocrit])

  // Tubes glow more when the pump is running fast.
  const glow = Math.min(0.35, 0.08 + (flowRate / 500) * 0.3)

  useFrame((_, delta) => {
    if (!finalCurve) return
    // Particle speed scales with flow rate / viscosity (Poiseuille-style).
    // For a long combined circuit we divide by a larger constant so the
    // animation reads cleanly at typical 200-400 mL/min flows.
    const visc = Math.max(1, viscosity)
    const baseSpeed = flowRate / 1500
    const speed = (baseSpeed / (visc / 3.5)) * (reverse ? -1 : 1)
    offsetRef.current = (offsetRef.current + speed * delta + 1) % 1

    for (let i = 0; i < particles; i++) {
      const mesh = particleRefs.current[i]
      if (!mesh) continue
      const t = (i / particles + offsetRef.current + 1) % 1
      const p = finalCurve.getPoint(t)
      mesh.position.set(p.x, p.y, p.z)
    }
  })

  if (!tubeGeom) return null

  return (
    <group>
      {/* Tube mesh -- raycast disabled so OrbitControls keeps working when the
          cursor passes over it. */}
      {/* Tube wall -- semi-transparent so the particle stream inside is
          clearly visible (especially while it travels through the pump loop). */}
      <mesh geometry={tubeGeom} castShadow raycast={skipRaycast}>
        <meshStandardMaterial
          color={tubeColor}
          roughness={0.3}
          emissive={tubeColor}
          emissiveIntensity={glow}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>

      {Array.from({ length: particles }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            particleRefs.current[i] = el
          }}
          raycast={skipRaycast}
        >
          <sphereGeometry args={[radius * 0.7, 12, 12]} />
          <meshStandardMaterial
            color="#fee2e2"
            emissive="#f87171"
            emissiveIntensity={2.2}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

// No-op raycast: meshes using this never trigger pointer events, so they
// can't accidentally swallow OrbitControls drags / zooms.
function skipRaycast() {}

function midpoint(a, b, offset = [0, 0, 0]) {
  return [
    (a[0] + b[0]) / 2 + offset[0],
    (a[1] + b[1]) / 2 + offset[1],
    (a[2] + b[2]) / 2 + offset[2],
  ]
}
