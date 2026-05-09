import { Text } from '@react-three/drei'

/**
 * Panel-mounted digital pressure monitor.
 *
 * Designed to look like a real medical-equipment LCD module: a chunky
 * matte-black bezel with four mounting screws, an inset glowing green
 * LCD inset, and crisp 3D text rendered directly into the scene (not
 * an HTML overlay). Place these flat against the cabinet front face;
 * they integrate into the machine like real panel instruments.
 *
 * The display reacts to the parent's `value` prop -- when blood-flow
 * or viscosity changes, the digits update on the next render. A WARN /
 * CRITICAL band is reached at the configurable thresholds and the LCD
 * glow + text colour switch through green -> amber -> red (pulsing).
 *
 * Local frame:
 *   +X = panel right
 *   +Y = panel up
 *   +Z = front face of the panel (the screen faces +Z)
 */

const PANEL_W = 0.46
const PANEL_H = 0.32
const PANEL_D = 0.05

export default function PressureMonitor({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  label,
  value,
  unit = 'mmHg',
  warnAt = Infinity,
  critAt = Infinity,
}) {
  const abs = Math.abs(value)
  const level = abs >= critAt ? 'critical' : abs >= warnAt ? 'warning' : 'normal'

  const palette = {
    normal: {
      screen: '#04140a',
      screenEmissive: '#0a3318',
      screenIntensity: 0.55,
      text: '#34d399',
      label: '#10b981',
    },
    warning: {
      screen: '#1a1003',
      screenEmissive: '#7c2d12',
      screenIntensity: 0.8,
      text: '#fbbf24',
      label: '#f59e0b',
    },
    critical: {
      screen: '#1a0606',
      screenEmissive: '#991b1b',
      screenIntensity: 1.2,
      text: '#fca5a5',
      label: '#ef4444',
    },
  }[level]

  return (
    <group position={position} rotation={rotation}>
      {/* ===== Outer bezel (matte black with subtle metallic) ===== */}
      <mesh castShadow>
        <boxGeometry args={[PANEL_W, PANEL_H, PANEL_D]} />
        <meshStandardMaterial
          color="#111114"
          metalness={0.35}
          roughness={0.55}
        />
      </mesh>

      {/* ===== Inner bezel inset (slightly recessed step) ===== */}
      <mesh position={[0, 0, PANEL_D / 2 + 0.001]}>
        <boxGeometry args={[PANEL_W * 0.9, PANEL_H * 0.78, 0.005]} />
        <meshStandardMaterial color="#1f2024" roughness={0.6} />
      </mesh>

      {/* ===== LCD screen (glowing inset) ===== */}
      <mesh position={[0, 0, PANEL_D / 2 + 0.005]}>
        <boxGeometry args={[PANEL_W * 0.82, PANEL_H * 0.66, 0.004]} />
        <meshStandardMaterial
          color={palette.screen}
          emissive={palette.screenEmissive}
          emissiveIntensity={palette.screenIntensity}
          roughness={0.25}
          metalness={0.05}
          toneMapped={false}
        />
      </mesh>

      {/* ===== Mounting screws at the four corners ===== */}
      {[
        [-PANEL_W * 0.43, PANEL_H * 0.40, PANEL_D / 2 + 0.002],
        [PANEL_W * 0.43, PANEL_H * 0.40, PANEL_D / 2 + 0.002],
        [-PANEL_W * 0.43, -PANEL_H * 0.40, PANEL_D / 2 + 0.002],
        [PANEL_W * 0.43, -PANEL_H * 0.40, PANEL_D / 2 + 0.002],
      ].map((pos, i) => (
        <mesh key={i} position={pos}>
          <cylinderGeometry args={[0.012, 0.012, 0.005, 12]} />
          <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}

      {/* ===== Status LED (top-left of bezel, beside the label) ===== */}
      <mesh position={[-PANEL_W * 0.43, PANEL_H * 0.18, PANEL_D / 2 + 0.005]}>
        <sphereGeometry args={[0.013, 12, 12]} />
        <meshStandardMaterial
          color={palette.text}
          emissive={palette.text}
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>

      {/* ===== 3D Text: label (top), value (centre, big), unit (bottom) ===== */}
      <Text
        position={[0, PANEL_H * 0.30, PANEL_D / 2 + 0.012]}
        fontSize={0.034}
        color={palette.label}
        anchorX="center"
        anchorY="middle"
        fontWeight={700}
        letterSpacing={0.18}
      >
        {label}
      </Text>

      <Text
        position={[0, 0, PANEL_D / 2 + 0.012]}
        fontSize={0.105}
        color={palette.text}
        anchorX="center"
        anchorY="middle"
        fontWeight={900}
      >
        {Math.round(value)}
      </Text>

      <Text
        position={[0, -PANEL_H * 0.32, PANEL_D / 2 + 0.012]}
        fontSize={0.026}
        color={palette.label}
        anchorX="center"
        anchorY="middle"
        fontWeight={500}
      >
        {unit}
      </Text>
    </group>
  )
}
