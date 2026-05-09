import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'

/**
 * Patient forearm + hand loaded from /public/models/Arm.glb.
 *
 * The outer <group position={position}> defines the rig origin used by the
 * blood circuit -- ARTERIAL_PORT_LOCAL / VENOUS_PORT_LOCAL are coordinates
 * inside this group, NOT inside the GLB. Adjust `armRotation`, `armScale`
 * and `armOffset` (passed from MachineCanvas) until the model lines up with
 * the two visible red port markers; the tubes will then plug in correctly.
 */

const MODEL_URL = '/models/Arm.glb'

export default function PatientHand({
  position = [4, -0.4, 1.2],
  /** Rotate the GLB to match Three.js's +Y up / -Z forward convention. */
  armRotation = [0, 0, 0],
  /** Uniform scale applied to the GLB. */
  armScale = 1,
  /** Local offset of the GLB inside the rig group. */
  armOffset = [0, 0, 0],
  /** Toggle the small red marker spheres at the access ports. */
  showPortMarkers = true,
}) {
  const { scene } = useGLTF(MODEL_URL)

  useEffect(() => {
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })
  }, [scene])

  return (
    <group position={position}>
      {/* The loaded arm model. Rotation / scale / offset are tunable so you
          can line the model's wrist up with the access ports below. */}
      <group position={armOffset} rotation={armRotation} scale={armScale}>
        <primitive object={scene} />
      </group>

      {/* ===== Fistula access ports (where the needles sit) =====
          These positions are the SOURCE OF TRUTH for the blood circuit.
          Adjust the arm transform above (not these) to make the model
          align with these markers. */}
      {showPortMarkers && (
        <>
          <PortMarker position={ARTERIAL_PORT_LOCAL} />
          <PortMarker position={VENOUS_PORT_LOCAL} />
        </>
      )}
    </group>
  )
}

function PortMarker({ position }) {
  return (
    <group position={position}>
      {/* Tape patch sitting on the skin */}
      <mesh position={[0, -0.085, 0]}>
        <boxGeometry args={[0.18, 0.015, 0.14]} />
        <meshStandardMaterial color="#fef3c7" roughness={0.9} />
      </mesh>
      {/* Cannula going from skin up into the luer lock */}
      <mesh position={[0, -0.045, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.08, 12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Luer lock / connector at the port -- this is where the tube ends */}
      <mesh castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.035, 14]} />
        <meshStandardMaterial color="#7f1d1d" metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  )
}

/* Local positions of the two access ports inside the PatientHand group.
   IMPORTANT: arterial and venous must be at DIFFERENT locations on the
   forearm (otherwise both blood tubes converge into a single point inside
   the arm geometry). y is back at 0.34 so the port sits JUST INSIDE the
   arm surface -- the tubes terminate inside the skin and visibly "enter"
   the arm. The PortMarker (luer + cannula + tape) is mostly hidden by
   arm geometry, only the luer hub shows above the skin. */
const ARTERIAL_PORT_LOCAL = [0.15, 0.34, 0.35] // proximal (elbow side)
const VENOUS_PORT_LOCAL = [0.45, 0.34, 0.35]   // distal (wrist side)

/** Helper: world coordinates of the arterial port given the hand's origin. */
export function arterialPortWorld(handPosition) {
  return [
    handPosition[0] + ARTERIAL_PORT_LOCAL[0],
    handPosition[1] + ARTERIAL_PORT_LOCAL[1],
    handPosition[2] + ARTERIAL_PORT_LOCAL[2],
  ]
}

/** Helper: world coordinates of the venous port given the hand's origin. */
export function venousPortWorld(handPosition) {
  return [
    handPosition[0] + VENOUS_PORT_LOCAL[0],
    handPosition[1] + VENOUS_PORT_LOCAL[1],
    handPosition[2] + VENOUS_PORT_LOCAL[2],
  ]
}

useGLTF.preload(MODEL_URL)
