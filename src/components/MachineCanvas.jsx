import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import PumpModel, {
  PUMP_INLET_OFFSET,
  PUMP_OUTLET_OFFSET,
  PUMP_RACEWAY_RADIUS,
  PUMP_TUBE_FACE_OFFSET_Z,
} from './PumpModel.jsx'
import PatientHand, {
  arterialPortWorld,
  venousPortWorld,
} from './PatientHand.jsx'
import BloodTube from './BloodTube.jsx'
import Dialyzer, {
  DIALYZER_BLOOD_IN_OFFSET,
  DIALYZER_BLOOD_OUT_OFFSET,
  DIALYZER_DIALYSATE_IN_OFFSET,
  DIALYZER_DIALYSATE_OUT_OFFSET,
  dialyzerPort,
} from './Dialyzer.jsx'
import AirTrap, {
  AIR_TRAP_TOP_OFFSET,
  AIR_TRAP_BOTTOM_OFFSET,
  airTrapPort,
} from './AirTrap.jsx'
import AirDetectorClamp from './AirDetectorClamp.jsx'
import PressureMonitor from './PressureMonitor.jsx'

/**
 * Closed blood circuit:
 *
 *   hand.arterial --[arterial line, FRONT route]--> pump bottom slot
 *                                                    │
 *                                                    ▼
 *                                            340° loop in raceway
 *                                                    │
 *                                                    ▼
 *                                       pump bottom slot --[venous line, BACK route]--> hand.venous
 *
 * Arterial and venous lines are routed at clearly different Z so they never
 * cross in 3D. The whole circuit is a single THREE.CurvePath driving a single
 * BloodTube, so one stream of red-cell particles flows continuously.
 */

const HAND_POSITION = [3.6, -0.5, 1]

// Cabinet front face is at z = -0.85. Everything mounted on the cabinet
// has its BACK at that plane. The pump head is small (~0.4 of its old
// size) so its back face touches the cabinet and the rotor protrudes
// forward into the room. The dialyzer (cap radius 0.32) and air-trap
// (cap radius 0.18) are positioned so their back edges land on z=-0.85
// too, giving a clean panel-mounted look.
const CABINET_FRONT_Z = -0.85
const PUMP_POSITION = [-0.7, -0.6, CABINET_FRONT_Z + 0.10]   // -0.75; back at cabinet
const DIALYZER_POSITION = [0.4, -0.3, CABINET_FRONT_Z + 0.32] // -0.53
// Pulled INWARD (x=1.1, not 1.5) so the air-trap cap (radius 0.18) clears
// the cabinet's right side bezel at x~1.55. Otherwise the bezel would
// poke through the transparent air-trap shell.
const AIR_TRAP_POSITION = [1.1, -0.3, CABINET_FRONT_Z + 0.18] // -0.67

// Pump inlet/outlet/loop centre in WORLD coordinates, derived from the
// current PUMP_POSITION + the relative offsets the pump model exports.
const PUMP_INLET_WORLD = [
  PUMP_POSITION[0] + PUMP_INLET_OFFSET[0],
  PUMP_POSITION[1] + PUMP_INLET_OFFSET[1],
  PUMP_POSITION[2] + PUMP_INLET_OFFSET[2],
]
const PUMP_OUTLET_WORLD = [
  PUMP_POSITION[0] + PUMP_OUTLET_OFFSET[0],
  PUMP_POSITION[1] + PUMP_OUTLET_OFFSET[1],
  PUMP_POSITION[2] + PUMP_OUTLET_OFFSET[2],
]
const PUMP_LOOP_CENTER = [
  PUMP_POSITION[0],
  PUMP_POSITION[1],
  PUMP_POSITION[2] + PUMP_TUBE_FACE_OFFSET_Z,
]

// Inline air-detector clamp placement. The position MUST equal the c3
// control point of the airtrap->hand sub-curve (so the tube actually
// passes through the clamp's channel). The rotation aligns the clamp's
// local +X (tube axis) with the curve tangent at that point.
const CLAMP_TRANSFORM = (() => {
  const pos = new THREE.Vector3(2.7, 0.5, 1.0) // <-- == airtrap->hand c3
  // Tangent ~= (c4 - c2) normalised, with c4=(3.7,0.3,1.3), c2=(1.7,-0.05,0.5).
  // (c4-c2) = (2.0, 0.35, 0.8); |v| = sqrt(4 + 0.1225 + 0.64) = sqrt(4.7625) = 2.182
  const tangent = new THREE.Vector3(0.917, 0.160, 0.367).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    tangent,
  )
  const e = new THREE.Euler().setFromQuaternion(q)
  return {
    position: pos.toArray(),
    rotation: [e.x, e.y, e.z],
  }
})()

// ----- Pressure monitor placements ---------------------------------------
// Now panel-mounted INSTRUMENTS, integrated into the cabinet's front face
// in a horizontal row above the consumables (between the dialyzer/airtrap
// tops at y=0.78 and the cabinet status stripe at y=1.275). Z is just in
// front of the cabinet face (-0.85) so the panels read as flush-mounted.
const PM_ROW_Y = 1.02
const PM_ROW_Z = -0.81
const ARTERIAL_PM_POSITION = [-1.0, PM_ROW_Y, PM_ROW_Z]    // above pump head
const DIALYZER_INFLOW_PM_POSITION = [-0.05, PM_ROW_Y, PM_ROW_Z] // above dialyzer
const VENOUS_PM_POSITION = [0.95, PM_ROW_Y, PM_ROW_Z]      // above air trap

export default function MachineCanvas({
  bloodFlowRate = 0,
  hematocrit = 42,
  bloodViscosity = 3.5,
  isLeakDetected = false,
  triggerLeak,
  isAirDetected = false,
  triggerAir,
}) {
  const arterialPort = arterialPortWorld(HAND_POSITION)
  const venousPort = venousPortWorld(HAND_POSITION)
  const dialyzerBloodIn = dialyzerPort(
    DIALYZER_BLOOD_IN_OFFSET,
    DIALYZER_POSITION,
  )
  const dialyzerBloodOut = dialyzerPort(
    DIALYZER_BLOOD_OUT_OFFSET,
    DIALYZER_POSITION,
  )
  const dialysateIn = dialyzerPort(
    DIALYZER_DIALYSATE_IN_OFFSET,
    DIALYZER_POSITION,
  )
  const dialysateOut = dialyzerPort(
    DIALYZER_DIALYSATE_OUT_OFFSET,
    DIALYZER_POSITION,
  )
  const airTrapTop = airTrapPort(AIR_TRAP_TOP_OFFSET, AIR_TRAP_POSITION)
  const airTrapBottom = airTrapPort(AIR_TRAP_BOTTOM_OFFSET, AIR_TRAP_POSITION)

  // ----- Live pressure measurements -------------------------------------
  // Reactive to BOTH bloodFlowRate and bloodViscosity (Poiseuille: dP ~ Q * mu).
  // Whenever the slider moves -- pump speed or hematocrit -- the monitors
  // re-render with the new digits.
  //   - Arterial pressure is suction (negative) before the pump:
  //       baseline -100 mmHg, scaled by flow*viscosity
  //   - Dialyzer inflow is pump-side push pressure:
  //       baseline +50 mmHg, scaled by flow*viscosity
  //   - Venous pressure is return-side resistance:
  //       baseline +50 mmHg, scaled by flow*viscosity
  const flowRatio = bloodFlowRate / 300
  const viscRatio = bloodViscosity / 3.5
  const arterialPressure = -100 - flowRatio * viscRatio * 100
  const dialyzerInflowPressure = 50 + flowRatio * viscRatio * 200
  const venousPressureLive = 50 + flowRatio * viscRatio * 100

  const circuitPath = useMemo(
    () =>
      buildCircuitPath({
        arterialPort,
        venousPort,
        pumpInlet: PUMP_INLET_WORLD,
        pumpOutlet: PUMP_OUTLET_WORLD,
        loopCenter: PUMP_LOOP_CENTER,
        loopRadius: PUMP_RACEWAY_RADIUS,
        dialyzerIn: dialyzerBloodIn,
        dialyzerOut: dialyzerBloodOut,
        airTrapTop,
        airTrapBottom,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <Canvas shadows dpr={[1, 2]} className="!absolute inset-0">
      <PerspectiveCamera makeDefault position={[6, 2.4, 7]} fov={42} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        minDistance={3}
        maxDistance={18}
        target={[1.6, -0.3, 0.5]}
      />

      <ambientLight intensity={0.45} />
      <directionalLight
        position={[6, 8, 6]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      {/* Soft fill from the patient side */}
      <directionalLight position={[-4, 4, -3]} intensity={0.35} />

      <Environment preset="studio" />

      {/* ===== ROOM ===== */}
      <Room />

      {/* ===== MACHINE CABINET (the pump is mounted on this) ===== */}
      <MachineCabinet />

      {/* ===== PATIENT BEDSIDE TABLE / ARMREST ===== */}
      <BedsideTable position={[3.6, -1.275, 1.3]} />

      {/* ===== ONE continuous blood circuit (3 sub-curves stitched). ===== */}
      <BloodTube
        curve={circuitPath}
        flowRate={bloodFlowRate}
        viscosity={bloodViscosity}
        hematocrit={hematocrit}
        radius={0.05}
        particles={26}
        tubularSegments={320}
      />

      {/* ===== BLOOD PUMP ===== */}
      <PumpModel bloodFlowRate={bloodFlowRate} position={PUMP_POSITION} />

      {/* ===== DIALYZER (artificial kidney) =====
          Mounted between the pump and the patient. Blood flows up through
          the hollow fibres; dialysate flows around them in the opposite
          direction. Click the dialyzer to simulate a membrane rupture:
          the dialysate tints pink, the BLD trips (isLeakDetected=true),
          the safety monitor zeroes blood-flow and raises CRITICAL. */}
      <Dialyzer
        position={DIALYZER_POSITION}
        active={isLeakDetected}
        onPuncture={triggerLeak}
      />

      {/* ===== Decorative dialysate inflow / outflow tubes =====
          Now that the dialyzer's back is flush with the cabinet face, the
          dialysate quick-connects can terminate directly at the cabinet
          surface a short distance from the side ports -- no more long
          loops that crossed the pump area. */}
      <DialysateTube
        from={dialysateIn}
        to={[
          DIALYZER_POSITION[0] + 0.55,
          DIALYZER_POSITION[1] + 0.6,
          CABINET_FRONT_Z,
        ]}
      />
      <DialysateTube
        from={dialysateOut}
        to={[
          DIALYZER_POSITION[0] + 0.55,
          DIALYZER_POSITION[1] - 0.6,
          CABINET_FRONT_Z,
        ]}
      />

      {/* ===== AIR TRAP / DRIP CHAMBER (passive) =====
          Sits on the venous return line between the dialyzer and the
          inline air-detector clamp. Bubbles rise to the meniscus and pop;
          air detection itself is now handled by the clamp downstream. */}
      <AirTrap
        position={AIR_TRAP_POSITION}
        active={isAirDetected}
        flowRate={bloodFlowRate}
      />

      {/* ===== INLINE AIR-DETECTOR CLAMP =====
          Ultrasonic bubble detector clipped onto the venous tube AFTER the
          air trap. Position + rotation are placed exactly on the c2 control
          point of the airtrap->hand curve so the tube appears to thread
          through the clamp's channel. Click to inject an air bolus. */}
      <AirDetectorClamp
        position={CLAMP_TRANSFORM.position}
        rotation={CLAMP_TRANSFORM.rotation}
        active={isAirDetected}
        onTrigger={triggerAir}
      />

      {/* ===== DIGITAL PRESSURE MONITORS =====
          All three values are derived from `bloodFlowRate` so the digits
          update live whenever the pump speed changes (slider or safety
          trip). Warning / critical bands pulse the readout amber / red. */}
      <PressureMonitor
        position={ARTERIAL_PM_POSITION}
        label="ARTERIAL"
        value={arterialPressure}
        warnAt={250}
        critAt={300}
      />
      <PressureMonitor
        position={DIALYZER_INFLOW_PM_POSITION}
        label="DIALYZER IN"
        value={dialyzerInflowPressure}
        warnAt={300}
        critAt={400}
      />
      <PressureMonitor
        position={VENOUS_PM_POSITION}
        label="VENOUS"
        value={venousPressureLive}
        warnAt={200}
        critAt={260}
      />

      {/* ===== PATIENT HAND (Arm.glb) =====
          Suspense fallback shows nothing while the GLB streams in.
          armRotation / armScale / armOffset are tuning knobs -- adjust them
          here until the model lines up with the two red port markers. */}
      <Suspense fallback={null}>
        <PatientHand
          position={HAND_POSITION}
          armRotation={[0, -30, 0]}
          armScale={4}
          armOffset={[0, 0, 0]}
        />
      </Suspense>

      {/*
        TEAM PLUG-IN ZONE:
        Drop additional meshes below (dialyzer, drip-chamber, sensors, ...).
        Reuse PUMP_INLET_WORLD / PUMP_OUTLET_WORLD and arterialPortWorld() /
        venousPortWorld() to attach them to the circuit.
      */}
    </Canvas>
  )
}

/* ------------------------------------------------------------------ */
/*  Environment                                                        */
/* ------------------------------------------------------------------ */

function Room() {
  return (
    <group>
      {/* Floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -2.0, 0]}
        receiveShadow
      >
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#1e293b" roughness={1} />
      </mesh>

      {/* Subtle floor grid */}
      <gridHelper
        args={[40, 40, '#334155', '#1e293b']}
        position={[0, -1.99, 0]}
      />

      {/* Back wall */}
      <mesh position={[0, 4, -10]} receiveShadow>
        <planeGeometry args={[40, 14]} />
        <meshStandardMaterial color="#243044" roughness={0.95} />
      </mesh>

      {/* Left wall (behind / left of the pump) */}
      <mesh
        rotation={[0, Math.PI / 2, 0]}
        position={[-10, 4, 0]}
        receiveShadow
      >
        <planeGeometry args={[20, 14]} />
        <meshStandardMaterial color="#243044" roughness={0.95} />
      </mesh>
    </group>
  )
}

function MachineCabinet() {
  return (
    <group position={[0, 0.5, -1.25]}>
      {/* Main cabinet body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3.5, 5, 0.8]} />
        <meshStandardMaterial color="#f1f5f9" metalness={0.3} roughness={0.5} />
      </mesh>

      {/* Display panel */}
      <mesh position={[0, 1.7, 0.42]}>
        <boxGeometry args={[2.6, 1.3, 0.05]} />
        <meshStandardMaterial
          color="#0f172a"
          emissive="#1e3a8a"
          emissiveIntensity={0.35}
        />
      </mesh>

      {/* Status indicator stripe */}
      <mesh position={[0, 0.85, 0.42]}>
        <boxGeometry args={[2, 0.15, 0.05]} />
        <meshStandardMaterial
          color="#22d3ee"
          emissive="#0891b2"
          emissiveIntensity={0.7}
        />
      </mesh>

      {/* Small detail bezels on the sides */}
      <mesh position={[1.55, 0, 0.42]}>
        <boxGeometry args={[0.15, 4.4, 0.05]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-1.55, 0, 0.42]}>
        <boxGeometry args={[0.15, 4.4, 0.05]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Brand strip at the bottom */}
      <mesh position={[0, -2.2, 0.42]}>
        <boxGeometry args={[2.5, 0.25, 0.05]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </mesh>
    </group>
  )
}

function BedsideTable({ position = [0, 0, 0] }) {
  return (
    <group position={position}>
      {/* Pedestal body */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[3.2, 1.45, 1.3]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.2} roughness={0.7} />
      </mesh>

      {/* Soft top cushion (where the patient's arm rests) */}
      <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.3, 0.12, 1.4]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.9} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/*  Circuit curve construction                                         */
/* ------------------------------------------------------------------ */

function v(arr) {
  return new THREE.Vector3(arr[0], arr[1], arr[2])
}

/**
 * Builds the full closed blood circuit as a CurvePath of 7 sub-curves:
 *
 *   1) arterial          hand.arterial  -> pump inlet         FRONT (z > 0)
 *   2) pump loop         pump inlet -> 340° -> pump outlet
 *   3) pump -> dialyzer  pump outlet -> dialyzer blood IN     BEHIND (z < 0)
 *   4) dialyzer column   dialyzer IN -> dialyzer OUT          (vertical, internal)
 *   5) dialyzer -> trap  dialyzer OUT -> air-trap top         short arc, both at z=0.5
 *   6) air-trap column   air-trap top -> air-trap bottom      (vertical, internal)
 *   7) trap -> hand      air-trap bottom -> hand.venous       OVER the table
 *
 * Table occupies x=[2.0, 5.2], y=[-2.0, -0.55], z=[0.65, 1.95]. All external
 * legs are routed so they never enter that volume. Arterial uses positive
 * z (front); the pump->dialyzer leg dips into negative z (behind the pump)
 * to keep clear of the arterial line; the final airtrap->hand leg rises
 * above the table top before crossing into the table footprint.
 */
function buildCircuitPath({
  arterialPort,
  venousPort,
  pumpInlet,
  pumpOutlet,
  loopCenter,
  loopRadius,
  dialyzerIn,
  dialyzerOut,
  airTrapTop,
  airTrapBottom,
}) {
  // ----- 1) Arterial: hand -> pump inlet ----------------------------------
  // Rises HIGH ABOVE the arm (y >= 0) immediately after leaving the port
  // so the tube never cuts through the forearm volume. Then it descends
  // in front of the cabinet, drops below the consumables and slides left
  // along the cabinet base into the pump inlet.
  const arterial = new THREE.CatmullRomCurve3(
    [
      v(arterialPort),                                  // (3.75, -0.16, 1.35) -- in arm
      v([3.4, 0.55, 1.5]),                              // c1: lift WELL above arm + slightly forward
      v([1.6, 0.05, 1.05]),                             // c2: still above arm, descending toward cabinet
      v([0.0, -1.4, 0.0]),                              // c3: drop below components, sliding left
      v([pumpInlet[0] + 0.4, pumpInlet[1] + 0.05, pumpInlet[2] + 0.4]),
      v(pumpInlet),
    ],
    false,
    'centripetal',
  )

  // ----- 2) Pump loop: 340° arc with short slot transitions ----------------
  const startAngle = -Math.PI / 2 + 0.13
  const endAngle = startAngle + 2 * Math.PI - 0.26
  const arcSegs = 48

  const loopPts = []
  loopPts.push(v(pumpInlet))
  loopPts.push(v([pumpInlet[0] - 0.02, pumpInlet[1] + 0.14, pumpInlet[2]]))
  for (let i = 0; i <= arcSegs; i++) {
    const t = i / arcSegs
    const angle = startAngle + t * (endAngle - startAngle)
    loopPts.push(
      v([
        loopCenter[0] + Math.cos(angle) * loopRadius,
        loopCenter[1] + Math.sin(angle) * loopRadius,
        loopCenter[2],
      ]),
    )
  }
  loopPts.push(v([pumpOutlet[0] + 0.02, pumpOutlet[1] + 0.14, pumpOutlet[2]]))
  loopPts.push(v(pumpOutlet))
  const pumpLoop = new THREE.CatmullRomCurve3(loopPts, false, 'centripetal')

  // ----- 3) Pump -> dialyzer (short hop along the cabinet face) -----------
  // Both endpoints are at the bottom of the cabinet, just a metre apart in
  // x. The tube ducks slightly below the dialyzer's bottom nozzle and
  // sweeps right to enter the dialyzer at its blood inlet.
  const pumpToDialyzer = new THREE.CatmullRomCurve3(
    [
      v(pumpOutlet),                                     // (-0.79, -1.34, -0.64)
      v([pumpOutlet[0] + 0.2, pumpOutlet[1] - 0.05, pumpOutlet[2] + 0.05]),
      v([0.0, -1.45, -0.55]),                            // mid, slightly below dialyzer base
      v([0.3, -1.42, -0.53]),                            // approach dialyzer inlet
      v(dialyzerIn),                                     // (0.4, -1.38, -0.53)
    ],
    false,
    'centripetal',
  )

  // ----- 4) Dialyzer internal column (straight vertical) -------------------
  const dialyzerColumn = new THREE.LineCurve3(v(dialyzerIn), v(dialyzerOut))

  // ----- 5) Dialyzer -> Air-trap top (short arc above both caps) ----------
  // Dialyzer top at (0.4, 0.78, -0.53); air-trap top at (1.5, 0.49, -0.67).
  // Arc lifts to y~0.95 (clear of both caps) and stays well below the
  // cabinet display panel (which starts at y=1.05).
  const dialyzerToAirTrap = new THREE.CatmullRomCurve3(
    [
      v(dialyzerOut),
      v([dialyzerOut[0] + 0.2, dialyzerOut[1] + 0.18, dialyzerOut[2] - 0.05]),
      v([airTrapTop[0] - 0.2, airTrapTop[1] + 0.22, airTrapTop[2] + 0.05]),
      v(airTrapTop),
    ],
    false,
    'centripetal',
  )

  // ----- 6) Air-trap internal column (straight vertical) ------------------
  const airTrapColumn = new THREE.LineCurve3(v(airTrapTop), v(airTrapBottom))

  // ----- 7) Air-trap bottom -> hand venous (rises HIGH over the arm) ----
  // The line rises out of the air trap, clears the table top, then arches
  // WELL ABOVE the forearm (y >= 0.3) so it never cuts through the arm
  // volume on its way to the venous port. Final descent drops onto the
  // wrist port from straight above, entering the skin cleanly. Control
  // point c3 is the air-detector clamp mount (see CLAMP_TRANSFORM).
  const airTrapToHand = new THREE.CatmullRomCurve3(
    [
      v(airTrapBottom),                                  // (1.1, -1.09, -0.67)
      v([1.3, -0.85, -0.3]),                             // c1: rise + come forward
      v([1.7, -0.05, 0.5]),                              // c2: above table top, clearing forward
      v([2.7, 0.5, 1.0]),                                // c3: HIGH above arm -- CLAMP location
      v([3.7, 0.3, 1.3]),                                // c4: still above arm, approaching port
      v(venousPort),                                     // (4.05, -0.16, 1.35) -- in arm
    ],
    false,
    'centripetal',
  )

  const path = new THREE.CurvePath()
  path.add(arterial)
  path.add(pumpLoop)
  path.add(pumpToDialyzer)
  path.add(dialyzerColumn)
  path.add(dialyzerToAirTrap)
  path.add(airTrapColumn)
  path.add(airTrapToHand)
  return path
}

/* ------------------------------------------------------------------ */
/*  Decorative static dialysate tube                                   */
/* ------------------------------------------------------------------ */

/**
 * A simple cyan tube connecting two points (no animated particles).
 * Used to draw the dialysate inflow / outflow lines from the dialyzer's
 * side ports back to the machine cabinet so the closed dialysate loop
 * is visible in the scene.
 */
function DialysateTube({ from, to }) {
  const geom = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(...from),
        new THREE.Vector3(
          (from[0] + to[0]) / 2 + 0.1,
          (from[1] + to[1]) / 2,
          (from[2] + to[2]) / 2 - 0.15,
        ),
        new THREE.Vector3(...to),
      ],
      false,
      'centripetal',
    )
    return new THREE.TubeGeometry(curve, 40, 0.04, 12, false)
  }, [from, to])

  return (
    <mesh geometry={geom} castShadow raycast={() => null}>
      <meshStandardMaterial
        color="#22d3ee"
        roughness={0.35}
        metalness={0.1}
        emissive="#0e7490"
        emissiveIntensity={0.25}
      />
    </mesh>
  )
}
