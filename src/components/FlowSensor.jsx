import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

/**
 * YF-S201 Inline Flow Sensor — exactly as in the reference images.
 *
 * The sensor body sits between two tube stubs. The blood tube is effectively
 * "cut" and the sensor is spliced in. Geometry:
 *
 *   [left tube stub] ──── [threaded inlet] [body] [threaded outlet] ──── [right tube stub]
 *
 * The local X-axis is the tube / flow axis.
 *
 * Props:
 *   position      [x,y,z]   world position of sensor centre
 *   rotation      [rx,ry,rz] euler to align X-axis with venous line tangent
 *   tubeRadius    number     radius of the blood tube (match BloodTube radius)
 *   flowRate      number     actual mL/min
 *   nominalFlow   number     expected mL/min when unoccluded
 *   active        boolean    true = occlusion alarm firing
 */
export default function FlowSensor({
  position   = [0, 0, 0],
  rotation   = [0, 0, 0],
  tubeRadius = 0.05,
  flowRate   = 300,
  nominalFlow = 300,
  active     = false,
}) {
  const ledRef      = useRef(null)
  const impRef      = useRef(null)   // impeller

  useFrame((_, delta) => {
    // Impeller spins with flow
    if (impRef.current) {
      const rpm = (flowRate / 300) * 8
      impRef.current.rotation.x += rpm * delta
    }
    // LED colour: green = ok, amber = low flow, red/pulse = occlusion
    if (ledRef.current) {
      const ratio = flowRate / Math.max(1, nominalFlow)
      if (active || ratio < 0.5) {
        ledRef.current.color.setRGB(1, 0.08, 0.08)
        ledRef.current.emissiveIntensity = 1.4 + Math.sin(Date.now() * 0.009) * 0.6
      } else if (ratio < 0.8) {
        ledRef.current.color.setRGB(1, 0.55, 0)
        ledRef.current.emissiveIntensity = 1.0
      } else {
        ledRef.current.color.setRGB(0.1, 0.95, 0.3)
        ledRef.current.emissiveIntensity = 0.7
      }
    }
  })

  const flowPct = Math.round((flowRate / Math.max(1, nominalFlow)) * 100)

  // Body dimensions (all relative to tubeRadius so it scales with tube size)
  const R  = 0.09          // body cylinder radius
  const BL = 0.18          // body length
  const PR = 0.044         // port cylinder radius
  const PL = 0.12          // port stub length (threaded section)
  const TS = 0.05          // tube stub radius (matches blood tube)

  return (
    <group position={position} rotation={rotation}>

      {/* ══════════ MAIN BODY ══════════ */}
      {/* Black cylindrical housing */}
      <mesh castShadow>
        <cylinderGeometry args={[R, R, BL, 28]} rotation={[0, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#151515" roughness={0.45} metalness={0.45} />
      </mesh>
      {/* Rotate the cylinder so its axis aligns with X (flow direction) */}
      {/* Note: Three.js CylinderGeometry axis is Y, so we tilt it */}
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[R, R, BL, 28]} />
        <meshStandardMaterial color="#151515" roughness={0.45} metalness={0.45} />
      </mesh>

      {/* ══ White label sticker on top ══ */}
      <mesh position={[0, R + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R * 0.78, 24]} />
        <meshStandardMaterial color="#f0f0f0" roughness={0.95} />
      </mesh>
      {/* Red circle inside the label */}
      <mesh position={[0, R + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[R * 0.30, R * 0.48, 24]} />
        <meshStandardMaterial color="#cc2222" roughness={0.9} />
      </mesh>

      {/* ══ 4 hex-head bolts on top face ══ */}
      {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle, i) => (
        <mesh
          key={i}
          position={[
            Math.cos(angle) * R * 0.70,
            R + 0.004,
            Math.sin(angle) * R * 0.70,
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.009, 0.009, 0.006, 6]} />
          <meshStandardMaterial color="#777" metalness={0.95} roughness={0.15} />
        </mesh>
      ))}

      {/* ══════════ LEFT THREADED INLET PORT ══════════ */}
      <group position={[-(BL / 2 + PL / 2), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[PR, PR, PL, 18]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.35} />
        </mesh>
        {/* Thread ridges */}
        {[-0.04, -0.015, 0.01, 0.035].map((dy, i) => (
          <mesh key={i} position={[0, dy, 0]}>
            <torusGeometry args={[PR + 0.003, 0.004, 8, 18]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.55} />
          </mesh>
        ))}
      </group>

      {/* ══ Left tube stub (blood tube continues from here) ══ */}
      <mesh position={[-(BL / 2 + PL + 0.04), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[TS, TS, 0.08, 12]} />
        <meshStandardMaterial color="#8b1a1a" roughness={0.3} transparent opacity={0.7} />
      </mesh>

      {/* ══════════ RIGHT THREADED OUTLET PORT ══════════ */}
      <group position={[(BL / 2 + PL / 2), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[PR, PR, PL, 18]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.35} />
        </mesh>
        {/* Thread ridges */}
        {[-0.035, -0.01, 0.015, 0.04].map((dy, i) => (
          <mesh key={i} position={[0, dy, 0]}>
            <torusGeometry args={[PR + 0.003, 0.004, 8, 18]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.55} />
          </mesh>
        ))}
      </group>

      {/* ══ Right tube stub ══ */}
      <mesh position={[(BL / 2 + PL + 0.04), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[TS, TS, 0.08, 12]} />
        <meshStandardMaterial color="#8b1a1a" roughness={0.3} transparent opacity={0.7} />
      </mesh>

      {/* ══════════ SIGNAL WIRES (red, yellow, black) ══════════ */}
      <WireLoom bodyRadius={R} />

      {/* ══ Status LED ══ */}
      <mesh position={[BL * 0.2, -R - 0.005, 0]}>
        <sphereGeometry args={[0.011, 8, 8]} />
        <meshStandardMaterial
          ref={ledRef}
          color="#00ff44"
          emissive="#00ff44"
          emissiveIntensity={0.7}
          toneMapped={false}
        />
      </mesh>

      {/* ══════════ FLOW READOUT LABEL ══════════ */}
      <Html position={[0, -R - 0.18, 0]} center distanceFactor={6} zIndexRange={[10, 0]}>
        <div className="pointer-events-none rounded bg-slate-900/90 px-2 py-1 text-center backdrop-blur" style={{ minWidth: 88 }}>
          <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">
            Flow Sensor
          </div>
          <div className={`text-[12px] font-bold leading-none ${
            flowPct < 50 ? 'text-red-400' : flowPct < 80 ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            {flowRate.toFixed(0)} <span className="text-[8px] text-slate-400">mL/min</span>
          </div>
          {flowPct < 50 && (
            <div className="mt-0.5 text-[8px] font-bold text-red-500 animate-pulse">⚠ OCCLUSION</div>
          )}
        </div>
      </Html>
    </group>
  )
}

/* ── 3-wire cable loom exactly as in reference image ── */
function WireLoom({ bodyRadius }) {
  const wireColors = ['#dc2626', '#f59e0b', '#111111']  // red, yellow, black
  return (
    <group position={[0.02, -bodyRadius, 0]}>
      {wireColors.map((color, i) => (
        <mesh key={i} position={[(i - 1) * 0.013, -0.07, 0]}>
          <cylinderGeometry args={[0.0045, 0.0045, 0.14, 6]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      ))}
      {/* JST-style connector plug */}
      <mesh position={[0, -0.155, 0]}>
        <boxGeometry args={[0.046, 0.024, 0.018]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} />
      </mesh>
    </group>
  )
}
