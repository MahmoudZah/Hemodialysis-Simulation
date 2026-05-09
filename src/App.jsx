import { useCallback, useState } from 'react'
import { useDialysisState } from './hooks/useDialysisState.js'
import { useTrendData } from './hooks/useTrendData.js'
import MachineCanvas from './components/MachineCanvas.jsx'
import SafetySensors from './components/SafetySensors.jsx'
import ControlDashboard from './components/ControlDashboard.jsx'
import LearnMoreModal from './components/LearnMoreModal.jsx'
import TrendPanel from './components/TrendPanel.jsx'

/**
 * App.jsx -- Source of Truth for the Hemodialysis Simulation.
 *
 * The central state lives in `useDialysisState`. Every subsystem (3D scene,
 * safety logic, dashboard) reads/writes through this single hook so the
 * 4 teammates can plug their own logic in without stepping on each other.
 *
 *   Teammate A (3D scene)      -> edits  <MachineCanvas /> + <PumpModel />
 *   Teammate B (Safety)        -> edits  <SafetySensors />
 *   Teammate C (UI / HUD)      -> edits  <ControlDashboard />
 *   Teammate D (Integration)   -> wires extra logic into `useDialysisState`
 */
export default function App() {
  const {
    state,
    setParam,
    triggerAir,
    triggerLeak,
    resetAlarms,
    alarmActive,
  } = useDialysisState()

  const [learnMoreTarget, setLearnMoreTarget] = useState(null)

  // ---- Derived pressures (same formulas as MachineCanvas) ----------------
  // Computed here so the trend recorder can sample them without reaching
  // into the 3D layer.
  const flowRatio = state.bloodFlowRate / 300
  const viscRatio = state.bloodViscosity / 3.5
  const arterialPressure = -100 - flowRatio * viscRatio * 100
  const dialyzerInPressure = 50 + flowRatio * viscRatio * 200
  const venousPressure = 50 + flowRatio * viscRatio * 100

  // ---- Trend data recorder -----------------------------------------------
  const sampleFn = useCallback(
    () => ({
      bloodFlowRate: state.bloodFlowRate,
      arterialPressure: Math.round(arterialPressure),
      dialyzerInPressure: Math.round(dialyzerInPressure),
      venousPressure: Math.round(venousPressure),
      dialysateTemp: state.dialysateTemp,
      hematocrit: state.hematocrit,
      bloodViscosity: state.bloodViscosity,
    }),
    [
      state.bloodFlowRate,
      arterialPressure,
      dialyzerInPressure,
      venousPressure,
      state.dialysateTemp,
      state.hematocrit,
      state.bloodViscosity,
    ],
  )

  const { history } = useTrendData(sampleFn)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-med-bg text-white">
      {/* 3D scene -- blood-related state flows from the source-of-truth hook. */}
      <MachineCanvas
        bloodFlowRate={state.bloodFlowRate}
        hematocrit={state.hematocrit}
        bloodViscosity={state.bloodViscosity}
        isLeakDetected={state.isLeakDetected}
        triggerLeak={triggerLeak}
        isAirDetected={state.isAirDetected}
        triggerAir={triggerAir}
        onLearnMore={setLearnMoreTarget}
      />

      {/* Non-visual safety/telemetry observer. */}
      <SafetySensors state={state} />

      {/* 2D Tailwind overlay HUD. */}
      <ControlDashboard
        state={state}
        setParam={setParam}
        triggerAir={triggerAir}
        triggerLeak={triggerLeak}
        resetAlarms={resetAlarms}
      />

      {/* Live trend graphs panel (left sidebar, toggleable). */}
      <TrendPanel history={history} />

      {/* Global red pulsing overlay -- only when system is CRITICAL. */}
      {alarmActive && (
        <div className="pointer-events-none absolute inset-0 z-20 animate-alarm-pulse">
          <div className="absolute inset-0 ring-8 ring-inset ring-red-500/80" />
          <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-red-600 px-6 py-2 text-sm font-bold tracking-[0.3em] text-white shadow-lg">
            ⚠ CRITICAL ALARM ⚠
          </div>
        </div>
      )}

      {/* Educational "Learn More" modal */}
      <LearnMoreModal
        componentId={learnMoreTarget}
        onClose={() => setLearnMoreTarget(null)}
      />
    </div>
  )
}
