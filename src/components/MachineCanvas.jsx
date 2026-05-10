import { Suspense, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, PerspectiveCamera, Html } from '@react-three/drei'
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
import FlowSensor from './FlowSensor.jsx'

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
// forward into the room. The dialyzer is the main exchange cartridge and
// sits flush on the cabinet face.
const CABINET_FRONT_Z = -0.85
const PUMP_POSITION = [-0.7, -0.6, CABINET_FRONT_Z + 0.10]   // -0.75; back at cabinet
const DIALYZER_POSITION = [0.4, -0.3, CABINET_FRONT_Z + 0.32] // -0.53
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

// To guarantee perfect placement on the tube, we compute the clamp and flow sensor
// transforms directly from a static version of the venous return curve.
const staticVenousCurve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(1.1, -1.09, -0.67),   // airTrapBottom
    new THREE.Vector3(1.3, -0.85, -0.3),    // c1
    new THREE.Vector3(1.7, -0.05, 0.5),     // c2
    new THREE.Vector3(2.7, 0.5, 1.0),       // c3
    new THREE.Vector3(3.7, 0.3, 1.3),       // c4
    new THREE.Vector3(4.05, -0.16, 1.35),   // venousPort
  ],
  false,
  'centripetal',
)

function getCurveTransform(t) {
  const pos = staticVenousCurve.getPoint(t)
  const tangent = staticVenousCurve.getTangent(t).normalize()
  // Align object's +X axis with the curve tangent
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    tangent,
  )
  const e = new THREE.Euler().setFromQuaternion(q)
  return {
    position: pos.toArray(),
    rotation: [e.x, e.y, e.z],
  }
}

// Ultrasonic Air Detector Clamp — at t=0.55 along the venous line
const CLAMP_TRANSFORM = getCurveTransform(0.55)

// Flow Sensor — right next to the clamp at t=0.62, perfectly inline
const FLOW_SENSOR_TRANSFORM = getCurveTransform(0.64)

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

const DIALYSATE_SOURCE_POSITION = [-1.25, -1.28, CABINET_FRONT_Z + 0.38]
const DIALYSATE_DRAIN_POSITION = [-1.25, 0.92, CABINET_FRONT_Z + 0.38]

export default function MachineCanvas({
  bloodFlowRate = 0,
  hematocrit = 42,
  bloodViscosity = 3.5,
  isMembraneLeaking = false,
  isLeakDetected = false,
  triggerLeak,
  isClamped = false,
  toggleClamp,
  isAirDetected = false,
  isBubbleActive = false,
  isOccluded = false,
  triggerAir,
  confirmAirAlarm,
  confirmLeakAlarm,
  onLearnMore,
  chemistry,
  alarmActive = false,
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
  const dialyzerInflowPressure = (isClamped ? 550 : 50) + flowRatio * viscRatio * 200
  const venousPressureLive = (isClamped ? 420 : 50) + flowRatio * viscRatio * 100
  const dialysateFlowRate = bloodFlowRate > 0
    ? Math.min(800, Math.max(500, bloodFlowRate * 2))
    : 0
  const clearanceMix = chemistry
    ? THREE.MathUtils.clamp((100 - chemistry.urea) / 70, 0, 1)
    : 0

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
      <MachineCabinet alarmActive={alarmActive} />

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
        isClamped={isClamped}
        toggleClamp={toggleClamp}
      />

      {/* ===== BLOOD PUMP ===== */}
      <PumpModel bloodFlowRate={bloodFlowRate} position={PUMP_POSITION} />

      {/* ===== DIALYZER (artificial kidney) ===== */}
      {/* ===== DIALYZER (artificial kidney) ===== */}
      <group>
        <Dialyzer
          position={DIALYZER_POSITION}
          active={isMembraneLeaking || isLeakDetected}
          bloodFlowRate={bloodFlowRate}
          dialysateFlowRate={dialysateFlowRate}
          wasteMix={clearanceMix}
          onPuncture={triggerLeak}
          onLearnMore={onLearnMore}
        />
        <ComponentCard
          position={[DIALYZER_POSITION[0], DIALYZER_POSITION[1] + 0.8, DIALYZER_POSITION[2]]}
          title="Dialyzer (Artificial Kidney)"
          description="A bundle of thousands of hollow fibers where blood and dialysate exchange waste products via diffusion."
        />
      </group>

      <DialysateSubsystem
        dialysateIn={dialysateIn}
        dialysateOut={dialysateOut}
        flowRate={dialysateFlowRate}
        wasteMix={clearanceMix}
        isMembraneLeaking={isMembraneLeaking}
        isLeakDetected={isLeakDetected}
        onLeakDetected={confirmLeakAlarm}
        onLearnMore={onLearnMore}
      />

      {/* ===== INLINE AIR-DETECTOR CLAMP ===== */}

      {/* ===== FLOW SENSOR (YF-S201 style) ===== */}
      {/* Placed on the venous return line — detects occlusion when flow drops >50% */}
      {/* ===== AIR TRAP / DRIP CHAMBER ===== */}
      <group>
        <AirTrap
          position={AIR_TRAP_POSITION}
          active={isAirDetected}
          flowRate={bloodFlowRate}
          onLearnMore={onLearnMore}
        />
        <ComponentCard
          position={[AIR_TRAP_POSITION[0], AIR_TRAP_POSITION[1] + 0.6, AIR_TRAP_POSITION[2]]}
          title="Air Trap / Drip Chamber"
          description="Removes any air bubbles from the blood return line before it enters the patient."
        />
      </group>

      {/* ===== INLINE AIR-DETECTOR CLAMP ===== */}
      <group>
        <AirDetectorClamp
          position={CLAMP_TRANSFORM.position}
          rotation={CLAMP_TRANSFORM.rotation}
          active={isAirDetected}
          onTrigger={triggerAir}
          onLearnMore={onLearnMore}
        />
        <ComponentCard
          position={[CLAMP_TRANSFORM.position[0], CLAMP_TRANSFORM.position[1] + 0.35, CLAMP_TRANSFORM.position[2]]}
          title="Ultrasonic Air Detector"
          description="A final safety sensor that stops the machine if even a tiny air bubble passes through."
        />
      </group>

      {/* ===== FLOW SENSOR (YF-S201 style) ===== */}
      {/* Placed on the venous return line — detects occlusion when flow drops >50% */}
      <FlowSensor
        position={FLOW_SENSOR_TRANSFORM.position}
        rotation={FLOW_SENSOR_TRANSFORM.rotation}
        flowRate={bloodFlowRate}
        nominalFlow={300}
        active={isOccluded}
      />

      {/* Animated Air Bubble Bolus */}
      <AirBubble
        path={circuitPath}
        bloodFlowRate={bloodFlowRate}
        isBubbleActive={isBubbleActive}
        isAirDetected={isAirDetected}
        onDetectorHit={confirmAirAlarm}
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
/*  Animated Air Bubble                                                */
/* ------------------------------------------------------------------ */

/**
 * Renders a visual air bubble that travels through the venous tube.
 * It monitors its own position and calls onDetectorHit when it passes
 * through the clamp's detection zone.
 */
function AirBubble({ path, bloodFlowRate, isBubbleActive, isAirDetected, onDetectorHit }) {
  const bubbleRef = useRef()
  const progressRef = useRef(0)
  const isHitRef = useRef(false)

  // The venous line starts at the Air Trap Bottom.
  // In our 7-segment path, the venous line is the last segment.
  const venousRange = useMemo(() => {
    const lengths = path.getCurveLengths()
    const totalLength = lengths[lengths.length - 1]
    const startLength = lengths[lengths.length - 2]
    return {
      start: startLength / totalLength,
      end: 1.0
    }
  }, [path])

  // Find the exact 't' for the clamp position (c3 of segment 7).
  const detectorT = useMemo(() => {
    const clampPos = new THREE.Vector3(2.7, 0.5, 1.0)
    let bestT = venousRange.start
    let minDist = Infinity
    // Sample the venous segment to find the closest point to the clamp box
    for (let i = 0; i <= 100; i++) {
      const t = venousRange.start + (i / 100) * (venousRange.end - venousRange.start)
      const p = path.getPoint(t)
      const d = p.distanceTo(clampPos)
      if (d < minDist) {
        minDist = d
        bestT = t
      }
    }
    return bestT
  }, [path, venousRange])

  useFrame((state, delta) => {
    if (!bubbleRef.current) return

    if (isBubbleActive && !isAirDetected) {
      // Move bubble at speed proportional to flow
      const speed = bloodFlowRate / 4000
      progressRef.current += speed * delta

      const currentT = venousRange.start + progressRef.current
      
      if (currentT >= venousRange.end) {
        progressRef.current = 0
        isHitRef.current = false
      }

      const pos = path.getPoint(Math.min(currentT, 0.999))
      bubbleRef.current.position.copy(pos)
      bubbleRef.current.visible = true

      // Detection logic: Hit the clamp!
      if (currentT >= detectorT && !isHitRef.current) {
        isHitRef.current = true
        onDetectorHit()
      }
    } else if (isAirDetected) {
      // Stay at the detector position when machine stops
      const pos = path.getPoint(detectorT)
      bubbleRef.current.position.copy(pos)
      bubbleRef.current.visible = true
    } else {
      bubbleRef.current.visible = false
      progressRef.current = 0
      isHitRef.current = false
    }
  })

  return (
    <mesh ref={bubbleRef} visible={false}>
      <sphereGeometry args={[0.07, 16, 16]} />
      <meshStandardMaterial 
        color="#ffffff" 
        emissive="#ffffff" 
        emissiveIntensity={0.5}
        transparent 
        opacity={0.8}
        roughness={0}
        metalness={0.5}
      />
    </mesh>
  )
}

/**
 * Educational info card — a tiny glowing dot that reveals a label on hover.
 * Uses a real (visible) tiny mesh so it doesn't secretly eat pointer events.
 */
function ComponentCard({ position, title, description }) {
  const [hovered, setHovered] = useState(false)
  return (
    <group position={position}>
      {/* Small glowing dot as the hover target */}
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial
          color="#22d3ee"
          emissive="#22d3ee"
          emissiveIntensity={hovered ? 3 : 1.2}
          toneMapped={false}
        />
      </mesh>

      {hovered && (
        <Html center distanceFactor={8} zIndexRange={[100, 0]}>
          <div className="pointer-events-none w-48 rounded-lg bg-slate-900/90 p-3 text-white shadow-xl backdrop-blur-sm border border-cyan-400/40">
            <h4 className="mb-1 text-[10px] font-black uppercase tracking-tighter text-cyan-300">
              {title}
            </h4>
            <p className="text-[9px] leading-snug text-slate-200">
              {description}
            </p>
          </div>
        </Html>
      )}
    </group>
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

function MachineCabinet({ alarmActive }) {
  const beaconMatRef = useRef()

  useFrame(({ clock }) => {
    if (beaconMatRef.current) {
      if (alarmActive) {
        // Fast pulse for alarm
        const pulse = 2.5 + Math.sin(clock.elapsedTime * 10) * 1.5
        beaconMatRef.current.emissiveIntensity = pulse
        beaconMatRef.current.color.set('#ef4444')
        beaconMatRef.current.emissive.set('#dc2626')
      } else {
        // Steady glow for normal
        beaconMatRef.current.emissiveIntensity = 1.0
        beaconMatRef.current.color.set('#22c55e')
        beaconMatRef.current.emissive.set('#16a34a')
      }
    }
  })

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

      {/* Alarm Beacon on top */}
      <group position={[0, 2.6, 0]}>
        {/* Base */}
        <mesh position={[0, -0.05, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.1, 16]} />
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </mesh>
        {/* Bulb */}
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.3, 16]} />
          <meshStandardMaterial 
            ref={beaconMatRef}
            color="#22c55e"
            emissive="#16a34a"
            emissiveIntensity={1.0}
            transparent
            opacity={0.9}
            toneMapped={false}
          />
        </mesh>
      </group>
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

function curveFromPoints(points) {
  return new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(...point)),
    false,
    'centripetal',
  )
}

function getTransformOnCurve(curve, t) {
  const pos = curve.getPoint(t)
  const tangent = curve.getTangent(t).normalize()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    tangent,
  )
  const euler = new THREE.Euler().setFromQuaternion(quaternion)
  return {
    position: pos.toArray(),
    rotation: [euler.x, euler.y, euler.z],
  }
}

function DialysateSubsystem({
  dialysateIn,
  dialysateOut,
  flowRate,
  wasteMix,
  isMembraneLeaking,
  isLeakDetected,
  onLeakDetected,
  onLearnMore,
}) {
  const freshColor = '#8be9ff'
  const freshEmissive = '#22d3ee'
  const spentColor = isMembraneLeaking || isLeakDetected
    ? '#fb7185'
    : wasteMix > 0.35
      ? '#2b7a8a'
      : '#5eead4'
  const spentEmissive = isMembraneLeaking || isLeakDetected
    ? '#be123c'
    : wasteMix > 0.35
      ? '#164e63'
      : '#0f766e'

  const freshSupplyPoints = useMemo(
    () => ([
      DIALYSATE_SOURCE_POSITION,
      [-0.92, -1.18, CABINET_FRONT_Z + 0.35],
      [-0.46, -1.02, CABINET_FRONT_Z + 0.40],
      dialysateIn,
    ]),
    [dialysateIn],
  )

  const wasteReturnPoints = useMemo(
    () => ([
      dialysateOut,
      [-0.46, 0.92, CABINET_FRONT_Z + 0.18],
      [-0.92, 0.86, CABINET_FRONT_Z + 0.28],
      DIALYSATE_DRAIN_POSITION,
    ]),
    [dialysateOut],
  )

  const wasteCurve = useMemo(
    () => curveFromPoints(wasteReturnPoints),
    [wasteReturnPoints],
  )
  const detectorT = 0.16
  const leakSensorTransform = useMemo(
    () => getTransformOnCurve(wasteCurve, detectorT),
    [wasteCurve, detectorT],
  )

  return (
    <group>
      <DialysateManifold
        position={DIALYSATE_SOURCE_POSITION}
        color={freshColor}
        emissive={freshEmissive}
        isActive={flowRate > 0}
      />
      <DialysateTube
        points={freshSupplyPoints}
        flowRate={flowRate}
        color={freshColor}
        emissive={freshEmissive}
        particleColor="#e0f2fe"
        radius={0.05}
        particleRadius={0.019}
        markers={4}
        opacity={0.36}
        reverse={true}
      />
      <DialysateManifold
        position={DIALYSATE_DRAIN_POSITION}
        color={spentColor}
        emissive={spentEmissive}
        isActive={flowRate > 0}
      />
      <DialysateTube
        points={wasteReturnPoints}
        flowRate={flowRate}
        color={spentColor}
        emissive={spentEmissive}
        particleColor={isMembraneLeaking || isLeakDetected ? '#fecaca' : wasteMix > 0.35 ? '#99f6e4' : '#cffafe'}
        radius={0.05}
        particleRadius={0.019}
        markers={4}
        opacity={0.5}
        reverse={true}
      />

      <BloodLeakSensor
        position={leakSensorTransform.position}
        rotation={leakSensorTransform.rotation}
        active={isLeakDetected}
        watching={isMembraneLeaking && !isLeakDetected}
        onLearnMore={onLearnMore}
      />

      <DialysateLeakBolus
        path={wasteCurve}
        flowRate={flowRate}
        isLeaking={isMembraneLeaking}
        isDetected={isLeakDetected}
        detectorT={detectorT}
        onDetectorHit={onLeakDetected}
      />
    </group>
  )
}

function DialysateManifold({ position, color, emissive, isActive }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[0.18, 0.18, 0.14]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.22} roughness={0.55} />
      </mesh>
      <mesh position={[0.08, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.16, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={isActive ? 0.85 : 0.12}
          transparent
          opacity={0.92}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

function BloodLeakSensor({
  position,
  rotation,
  active,
  watching,
  onLearnMore,
}) {
  const ledRef = useRef(null)

  useFrame((state) => {
    if (!ledRef.current) return
    const pulse = active
      ? 1.8 + Math.sin(state.clock.elapsedTime * 8) * 0.9
      : watching
        ? 0.65 + Math.sin(state.clock.elapsedTime * 4) * 0.2
        : 0.18
    ledRef.current.material.emissiveIntensity = pulse
  })

  return (
    <group
      position={position}
      rotation={rotation}
      onClick={(e) => {
        e.stopPropagation()
        onLearnMore?.('bloodLeakDetector')
      }}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = 'auto' }}
    >
      {/* Optical clip body: LED emitter on one side, photodiode receiver opposite. */}
      <mesh castShadow>
        <boxGeometry args={[0.13, 0.055, 0.095]} />
        <meshStandardMaterial color="#111827" metalness={0.3} roughness={0.38} />
      </mesh>

      {/* Saddle clamp under the tube */}
      <mesh position={[0, -0.03, 0]}>
        <boxGeometry args={[0.12, 0.018, 0.085]} />
        <meshStandardMaterial color="#0f172a" metalness={0.25} roughness={0.42} />
      </mesh>

      {/* Emitter and receiver jaws that face across the transparent tube */}
      <mesh position={[0.048, 0.006, 0]} castShadow>
        <boxGeometry args={[0.024, 0.09, 0.05]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.55} roughness={0.24} />
      </mesh>
      <mesh position={[-0.048, 0.006, 0]} castShadow>
        <boxGeometry args={[0.024, 0.09, 0.05]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.55} roughness={0.24} />
      </mesh>

      {/* Optical windows */}
      <mesh position={[0.036, 0.006, 0]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.011, 0.011, 0.012, 16]} />
        <meshStandardMaterial color="#93c5fd" emissive="#60a5fa" emissiveIntensity={0.35} toneMapped={false} />
      </mesh>
      <mesh position={[-0.036, 0.006, 0]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.011, 0.011, 0.012, 16]} />
        <meshStandardMaterial color="#cbd5e1" emissive="#94a3b8" emissiveIntensity={0.18} toneMapped={false} />
      </mesh>

      {/* Top status lamp */}
      <mesh ref={ledRef} position={[0, 0.048, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.018, 0.02, 16]} />
        <meshStandardMaterial
          color={active ? '#ef4444' : watching ? '#fbbf24' : '#22c55e'}
          emissive={active ? '#ef4444' : watching ? '#f59e0b' : '#16a34a'}
          emissiveIntensity={1}
          toneMapped={false}
        />
      </mesh>

      {/* Short cable tail to make it read as a real electronic sensor */}
      <mesh position={[0, 0.012, -0.055]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.05, 8]} />
        <meshStandardMaterial color="#0f172a" roughness={0.8} />
      </mesh>
    </group>
  )
}

function DialysateLeakBolus({
  path,
  flowRate,
  isLeaking,
  isDetected,
  detectorT,
  onDetectorHit,
}) {
  const bolusRef = useRef(null)
  const progressRef = useRef(0)
  const isHitRef = useRef(false)

  useFrame((_, delta) => {
    if (!bolusRef.current) return

    if (isLeaking && !isDetected) {
      const speed = Math.max(0.12, flowRate / 2600)
      progressRef.current = Math.min(detectorT, progressRef.current + speed * delta)
      const pos = path.getPoint(progressRef.current)
      bolusRef.current.position.copy(pos)
      bolusRef.current.visible = true

      if (progressRef.current >= detectorT && !isHitRef.current) {
        isHitRef.current = true
        onDetectorHit?.()
      }
    } else if (isDetected) {
      const pos = path.getPoint(detectorT)
      bolusRef.current.position.copy(pos)
      bolusRef.current.visible = true
    } else {
      bolusRef.current.visible = false
      progressRef.current = 0
      isHitRef.current = false
    }
  })

  return (
    <mesh ref={bolusRef} visible={false}>
      <sphereGeometry args={[0.038, 12, 12]} />
      <meshStandardMaterial
        color="#f87171"
        emissive="#dc2626"
        emissiveIntensity={1.25}
        transparent
        opacity={0.95}
        toneMapped={false}
      />
    </mesh>
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

  // ----- 7) Air-trap bottom -> hand venous -------------------------------
  const airTrapToHand = new THREE.CatmullRomCurve3(
    [
      v(airTrapBottom),
      v([1.3, -0.85, -0.3]),
      v([1.7, -0.05, 0.5]),
      v([2.7, 0.5, 1.0]),
      v([3.7, 0.3, 1.3]),
      v(venousPort),
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

function DialysateTube({
  points,
  flowRate = 600,
  color = '#22d3ee',
  emissive = '#0e7490',
  particleColor = '#cffafe',
  opacity = 0.45,
  radius = 0.035,
  particleRadius = 0.017,
  particles = 12,
  markers = 3,
  reverse = false,
}) {
  const particleRefs = useRef([])
  const offsetRef = useRef(0)

  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        points.map((point) => new THREE.Vector3(...point)),
        false,
        'centripetal',
      ),
    [points],
  )

  const geom = useMemo(
    () => new THREE.TubeGeometry(curve, 72, radius, 12, false),
    [curve, radius],
  )

  const markerTransforms = useMemo(
    () =>
      Array.from({ length: markers }, (_, i) => {
        const t = (i + 0.45) / (markers + 0.2)
        const pos = curve.getPoint(t)
        const tangent = curve.getTangent(t).normalize()
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          tangent,
        )
        const euler = new THREE.Euler().setFromQuaternion(quaternion)
        return {
          position: pos.toArray(),
          rotation: [euler.x, euler.y, euler.z],
        }
      }),
    [curve, markers],
  )

  useFrame((_, delta) => {
    const speed = flowRate > 0 ? Math.max(0.02, flowRate / 12000) : 0
    offsetRef.current = (offsetRef.current + speed * delta) % 1

    for (let i = 0; i < particles; i++) {
      const mesh = particleRefs.current[i]
      if (!mesh) continue
      if (flowRate <= 0) {
        mesh.visible = false
        continue
      }
      // reverse=true: particles travel end→start (top→down in dialysate supply)
      const rawT = ((i / particles) + offsetRef.current) % 1
      const t = reverse ? 1 - rawT : rawT
      const point = curve.getPoint(t)
      mesh.visible = true
      mesh.position.copy(point)
    }
  })

  return (
    <group>
      <mesh geometry={geom} castShadow raycast={() => null}>
        <meshStandardMaterial
          color={color}
          roughness={0.3}
          metalness={0.08}
        emissive={emissive}
        emissiveIntensity={flowRate > 0 ? 0.6 : 0.12}
        transparent
        opacity={opacity}
      />
      </mesh>

      {markerTransforms.map((marker, i) => (
        <mesh
          key={`marker-${i}`}
          position={marker.position}
          rotation={marker.rotation}
          raycast={() => null}
        >
          <coneGeometry args={[radius * 1.35, radius * 3.6, 10]} />
          <meshStandardMaterial
            color={particleColor}
            emissive={particleColor}
            emissiveIntensity={0.85}
            transparent
            opacity={0.65}
            toneMapped={false}
          />
        </mesh>
      ))}

      {Array.from({ length: particles }).map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            particleRefs.current[i] = el
          }}
          raycast={() => null}
        >
          <sphereGeometry args={[particleRadius, 8, 8]} />
          <meshStandardMaterial
            color={particleColor}
            emissive={particleColor}
            emissiveIntensity={1.25}
            roughness={0.18}
            metalness={0.05}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}
