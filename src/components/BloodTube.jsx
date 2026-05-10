import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Blood-filled tube along an arbitrary THREE.Curve.
 *
 * Clamping: clicking the tube places a LOCAL pinch jaw at the EXACT point
 * clicked. The tube geometry never changes — we overlay a "clamp jaw" mesh
 * at only that spot. This matches real medical tube clamping where only the
 * pressed section is occluded.
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
  isClamped = false,
  toggleClamp,
}) {
  const offsetRef      = useRef(0)
  const particleRefs   = useRef([])
  // Local position where the user clicked (null = no clamp)
  const [clampPos, setClampPos] = useState(null)
  const [clampT,   setClampT]   = useState(null)

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
    const r = Math.round(230 - t * 80)
    return `rgb(${r}, 28, 28)`
  }, [hematocrit])

  const glow = Math.min(0.35, 0.08 + (flowRate / 500) * 0.3)

  // ---- Find closest t on curve to a 3D point (for click detection) --------
  const findClosestT = (point) => {
    if (!finalCurve) return 0.5
    let best = 0, bestDist = Infinity
    for (let i = 0; i <= 200; i++) {
      const t = i / 200
      const p = finalCurve.getPoint(t)
      const d = point.distanceTo(p)
      if (d < bestDist) { bestDist = d; best = t }
    }
    return best
  }

  // ---- Click handler: find clicked point on curve and store it ------------
  const handleClick = (e) => {
    e.stopPropagation()
    if (!toggleClamp) return
    if (isClamped) {
      // Release
      setClampPos(null)
      setClampT(null)
      toggleClamp()
    } else {
      // Find the clicked location on the tube path
      const clickedPt = e.point.clone()
      const t = findClosestT(clickedPt)
      const posOnCurve = finalCurve.getPoint(t)
      setClampPos(posOnCurve)
      setClampT(t)
      toggleClamp()
    }
  }

  // Clear clamp visual when externally reset
  useMemo(() => {
    if (!isClamped) {
      setClampPos(null)
      setClampT(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClamped])

  useFrame((_state, delta) => {
    if (!finalCurve) return
    const visc  = Math.max(1, viscosity)
    const speed = isClamped
      ? 0
      : (flowRate / 1000 / (visc / 3.5)) * (reverse ? -1 : 1)
    offsetRef.current = (offsetRef.current + speed * delta) % 1

    for (let i = 0; i < particles; i++) {
      const mesh = particleRefs.current[i]
      if (!mesh) continue
      if (isClamped) { mesh.visible = false; continue }
      mesh.visible = true
      const t = ((i / particles) + offsetRef.current + 1) % 1
      const p = finalCurve.getPoint(t)
      mesh.position.set(p.x, p.y, p.z)
    }
  })

  // Tangent at clamp point — used to orient the jaw perpendicular to tube
  const clampTangent = useMemo(() => {
    if (!finalCurve || clampT === null) return null
    return finalCurve.getTangent(clampT).normalize()
  }, [finalCurve, clampT])

  if (!tubeGeom) return null

  return (
    <group>
      {/* Tube shell — geometry never deforms */}
      <mesh
        geometry={tubeGeom}
        castShadow
        onClick={handleClick}
        onPointerOver={() => { if (toggleClamp) document.body.style.cursor = 'crosshair' }}
        onPointerOut={() =>  { if (toggleClamp) document.body.style.cursor = 'auto'      }}
      >
        <meshStandardMaterial
          color={tubeColor}
          roughness={0.25}
          metalness={0.1}
          emissive={tubeColor}
          emissiveIntensity={glow}
          transparent
          opacity={0.55}
        />
      </mesh>

      {/* Red blood cell droplets */}
      {Array.from({ length: particles }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { particleRefs.current[i] = el }}
          raycast={skipRaycast}
        >
          <sphereGeometry args={[radius * 0.65, 9, 9]} />
          <meshStandardMaterial
            color="#cc1111"
            emissive="#ff2222"
            emissiveIntensity={1.8}
            roughness={0.3}
            metalness={0.1}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* LOCAL PINCH JAW — only at the exact clicked point, tube unchanged */}
      {isClamped && clampPos && clampTangent && (
        <ClampJaw position={clampPos} tangent={clampTangent} radius={radius} />
      )}
    </group>
  )
}

/**
 * Two flat jaw plates that appear to squish the tube at a single point.
 * Oriented perpendicular to the tube tangent so the jaws clamp across
 * the tube cross-section, not along it.
 */
function ClampJaw({ position, tangent, radius }) {
  const jawRef = useRef(null)

  // Build a rotation that makes Y point along the tube tangent.
  // The jaws extend in the plane perpendicular to the tube axis.
  const quaternion = useMemo(() => {
    const q = new THREE.Quaternion()
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent)
    return q
  }, [tangent])

  const eulerArr = useMemo(() => {
    const e = new THREE.Euler().setFromQuaternion(quaternion)
    return [e.x, e.y, e.z]
  }, [quaternion])

  // Pulsing glow so it's obvious the clamp is active
  useFrame((s) => {
    if (!jawRef.current) return
    jawRef.current.children.forEach((child) => {
      if (child.material) {
        child.material.emissiveIntensity = 1.2 + Math.sin(s.clock.elapsedTime * 6) * 0.5
      }
    })
  })

  return (
    <group ref={jawRef} position={[position.x, position.y, position.z]} rotation={eulerArr}>
      {/* Top jaw */}
      <mesh position={[0, 0.01, radius * 0.7]} castShadow>
        <boxGeometry args={[radius * 2.8, radius * 0.15, radius * 1.4]} />
        <meshStandardMaterial
          color="#c0392b"
          emissive="#e74c3c"
          emissiveIntensity={1.2}
          metalness={0.5}
          roughness={0.3}
          toneMapped={false}
        />
      </mesh>
      {/* Bottom jaw */}
      <mesh position={[0, 0.01, -radius * 0.7]} castShadow>
        <boxGeometry args={[radius * 2.8, radius * 0.15, radius * 1.4]} />
        <meshStandardMaterial
          color="#c0392b"
          emissive="#e74c3c"
          emissiveIntensity={1.2}
          metalness={0.5}
          roughness={0.3}
          toneMapped={false}
        />
      </mesh>
      {/* Centre indicator ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 1.1, radius * 0.08, 8, 24]} />
        <meshStandardMaterial
          color="#ff4444"
          emissive="#ff0000"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

function skipRaycast() {}

function midpoint(a, b, offset = [0, 0, 0]) {
  return [
    (a[0] + b[0]) / 2 + offset[0],
    (a[1] + b[1]) / 2 + offset[1],
    (a[2] + b[2]) / 2 + offset[2],
  ]
}
