import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * Peristaltic Blood Pump -- mechanism only.
 *
 * The actual blood-filled tube (raceway loop + the inlet/outlet running
 * down to the patient) is now drawn as ONE continuous BloodTube curve in
 * MachineCanvas, so the blood path is unbroken: hand -> 340° loop in the
 * pump -> hand. This component renders only the mechanical parts:
 *   - White cylindrical housing
 *   - Recessed inner raceway + steel rim (where the tube wraps)
 *   - Yellow rotor with two opposing rollers
 *   - Strain-relief block over the bottom slot (where the tube enters/exits)
 *   - Steel mounting base
 *   - Status LED
 *
 * Public API:
 *   <PumpModel bloodFlowRate={number} position={[x,y,z]} />
 *
 * IMPORTANT: the exported geometry constants (raceway radius, inlet/outlet
 * positions, tube-face Z) are RELATIVE to the pump's `position` prop. To
 * place a tube end on the pump in world space, add `PUMP_POSITION + offset`.
 */

// Whole-pump scale factor. The pump head is now a compact peristaltic
// pump-head sized to mount on the cabinet front, not a wall-sized rotor.
const SCALE = 0.4

// Geometry constants the rest of the app needs to plug into. All are
// expressed in WORLD UNITS but RELATIVE to the pump's own position.
export const PUMP_RACEWAY_RADIUS = 1.15 * SCALE                 // 0.46
export const PUMP_TUBE_FACE_OFFSET_Z = 0.27 * SCALE              // 0.108
export const PUMP_INLET_OFFSET = [0.22 * SCALE, -1.85 * SCALE, 0.27 * SCALE]
export const PUMP_OUTLET_OFFSET = [-0.22 * SCALE, -1.85 * SCALE, 0.27 * SCALE]
// Half-depth of the housing in the Z direction (so the pump back face is
// at  position.z - PUMP_HALF_DEPTH ).
export const PUMP_HALF_DEPTH = 0.25 * SCALE                       // 0.10

export default function PumpModel({ bloodFlowRate = 0, position = [0, 0, 0] }) {
  const rotorRef = useRef(null)

  useFrame((_, delta) => {
    if (!rotorRef.current) return
    const radPerSec = ((bloodFlowRate / 8) * Math.PI * 2) / 60
    rotorRef.current.rotation.z += radPerSec * delta
  })

  const isRunning = bloodFlowRate > 0
  const ledColor = isRunning ? '#10b981' : '#ef4444'

  return (
    <group position={position}>
      {/* Whole pump-head scaled down from its original "wall-sized" size
          so it reads as a real peristaltic pump head mounted on the
          machine cabinet, not a piece of furniture. All internal numbers
          stay in their original local frame; the SCALE wrapper handles
          the rest. The exported offsets above already include SCALE. */}
      <group scale={SCALE}>
        {/* ===== HOUSING (white plastic body) ===== */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.5, 1.5, 0.5, 64]} />
          <meshStandardMaterial color="#f3f4f6" metalness={0.3} roughness={0.45} />
        </mesh>

        {/* Steel rim (decorative ring marking the inner raceway boundary) */}
        <mesh position={[0, 0, 0.255]}>
          <torusGeometry args={[1.4, 0.03, 14, 80]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.85} roughness={0.25} />
        </mesh>

        {/* ===== ROTOR (yellow hub + two opposing rollers) ===== */}
        <group ref={rotorRef} position={[0, 0, 0.31]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.85, 0.85, 0.18, 48]} />
            <meshStandardMaterial color="#facc15" metalness={0.55} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.105]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.06, 24]} />
            <meshStandardMaterial color="#1f2937" metalness={0.85} roughness={0.25} />
          </mesh>
          {[0, Math.PI].map((angle, i) => (
            <mesh
              key={i}
              position={[Math.cos(angle) * 1.05, Math.sin(angle) * 1.05, 0.02]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
            >
              <cylinderGeometry args={[0.17, 0.17, 0.32, 24]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.15} />
            </mesh>
          ))}
        </group>

        {/* Strain-relief / clamp over the bottom slot where the tube enters & exits.
            Renders OPAQUE on top of the tube so the tube appears to disappear into
            the pump body cleanly at this point. */}
        <mesh position={[0, -1.55, 0.27]} castShadow>
          <boxGeometry args={[0.85, 0.22, 0.45]} />
          <meshStandardMaterial color="#334155" metalness={0.55} roughness={0.45} />
        </mesh>

        {/* ===== PUMP BASE / MOUNT ===== */}
        <mesh position={[0, -1.85, -0.1]} castShadow receiveShadow>
          <boxGeometry args={[2.1, 0.3, 0.9]} />
          <meshStandardMaterial color="#374151" metalness={0.4} roughness={0.65} />
        </mesh>

        {/* ===== STATUS LED ===== */}
        <mesh position={[1.0, -1.05, 0.6]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial
            color={ledColor}
            emissive={ledColor}
            emissiveIntensity={1.8}
          />
        </mesh>
      </group>

      {/* Light is OUTSIDE the scaled group so its world distance/intensity
          stay sensible. Position is the LED's world location relative to
          this pump (LED local position 1.0, -1.05, 0.7 -> *SCALE). */}
      <pointLight
        position={[1.0 * SCALE, -1.05 * SCALE, 0.7 * SCALE]}
        color={ledColor}
        intensity={0.4}
        distance={0.6}
      />
    </group>
  )
}
