import { useCallback, useState } from 'react'
import { useDialysisState } from './hooks/useDialysisState.js'
import { useTrendData } from './hooks/useTrendData.js'
import MachineCanvas from './components/MachineCanvas.jsx'
import SafetySensors from './components/SafetySensors.jsx'
import ControlDashboard from './components/ControlDashboard.jsx'
import LearnMoreModal from './components/LearnMoreModal.jsx'
import TrendPanel from './components/TrendPanel.jsx'
import AudioSystem from './components/AudioSystem.jsx'
import ChemistryPanel from './components/ChemistryPanel.jsx'

// Map alarm cause codes to human-readable strings
const ALARM_LABELS = {
  AIR:       { icon: '💨', text: 'AIR IN LINE DETECTED',        color: 'bg-orange-600', fix: 'Clamp venous line, aspirate air from bubble trap, remove air source and reset detector.' },
  LEAK:      { icon: '🩸', text: 'BLOOD LEAK DETECTED',         color: 'bg-red-700',    fix: 'Stop blood pump. Do NOT return blood to patient. Replace dialyzer and inspect extracorporeal circuit.' },
  OCCLUSION: { icon: '⛔', text: 'OCCLUSION — FLOW BLOCKED',    color: 'bg-red-600',    fix: 'Check for kinked lines, clotted access, or patient movement. Inspect arterial and venous pressures.' },
  TEMP:      { icon: '🌡️', text: 'DIALYSATE TEMP OUT OF RANGE', color: 'bg-yellow-600', fix: 'Check dialysate temperature, heater control, and calibration. Machine is in bypass mode to prevent hemolysis.' },
}

export default function App() {
  const {
    state,
    setParam,
    triggerAir,
    confirmAirAlarm,
    triggerLeak,
    confirmLeakAlarm,
    toggleClamp,
    resetAlarms,
    toggleMute,
    silenceAlarm,
    alarmActive,
  } = useDialysisState()

  const [learnMoreTarget, setLearnMoreTarget] = useState(null)

  // ---- Derived pressures --------------------------------------------------
  const flowRatio          = state.bloodFlowRate / 300
  const viscRatio          = state.bloodViscosity / 3.5
  const arterialPressure   = -100 - flowRatio * viscRatio * 100
  const dialyzerInPressure = 50   + flowRatio * viscRatio * 200
  const venousPressure     = 50   + flowRatio * viscRatio * 100

  // ---- Trend data recorder ------------------------------------------------
  const sampleFn = useCallback(
    () => ({
      bloodFlowRate:       state.bloodFlowRate,
      arterialPressure:    Math.round(arterialPressure),
      dialyzerInPressure:  Math.round(dialyzerInPressure),
      venousPressure:      Math.round(venousPressure),
      dialysateTemp:       state.dialysateTemp,
      hematocrit:          state.hematocrit,
      bloodViscosity:      state.bloodViscosity,
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

  const alarm = ALARM_LABELS[state.alarmCause] ?? ALARM_LABELS.AIR

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-med-bg text-white">

      {/* Live Blood Chemistry Dashboard */}
      <ChemistryPanel chemistry={state.chemistry} />

      {/* 3D simulation canvas */}
      <MachineCanvas
        bloodFlowRate={state.bloodFlowRate}
        hematocrit={state.hematocrit}
        bloodViscosity={state.bloodViscosity}
        isMembraneLeaking={state.isMembraneLeaking}
        isLeakDetected={state.isLeakDetected}
        triggerLeak={triggerLeak}
        isClamped={state.isClamped}
        toggleClamp={toggleClamp}
        isAirDetected={state.isAirDetected}
        isOccluded={state.isOccluded}
        isBubbleActive={state.isBubbleActive}
        triggerAir={triggerAir}
        confirmAirAlarm={confirmAirAlarm}
        confirmLeakAlarm={confirmLeakAlarm}
        onLearnMore={setLearnMoreTarget}
        chemistry={state.chemistry}
        alarmActive={alarmActive}
      />

      {/* Non-visual safety/telemetry observer */}
      <SafetySensors state={state} />

      {/* 2D Tailwind overlay HUD */}
      <ControlDashboard
        state={state}
        setParam={setParam}
        triggerAir={triggerAir}
        triggerLeak={triggerLeak}
        toggleClamp={toggleClamp}
        resetAlarms={resetAlarms}
        toggleMute={toggleMute}
        silenceAlarm={silenceAlarm}
      />

      {/* Audio system (headless) */}
      <AudioSystem
        bloodFlowRate={state.bloodFlowRate}
        alarmActive={alarmActive}
        isMuted={state.isMuted}
        isAlarmSilenced={state.isAlarmSilenced}
      />

      {/* Live trend graphs panel */}
      <TrendPanel history={history} />

      {/* ── Global alarm overlay — shows WHAT triggered the alarm ── */}
      {alarmActive && (
        <div className="pointer-events-auto absolute left-1/2 top-4 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
          {/* Cause badge / Notification Panel */}
          <div className="flex w-96 flex-col overflow-hidden rounded-xl bg-slate-900 shadow-2xl ring-1 ring-white/10 animate-in slide-in-from-top-10 fade-in duration-300">
            {/* Header */}
            <div className={`flex items-center gap-3 ${alarm.color} px-4 py-3`}>
              <span className="text-2xl">{alarm.icon}</span>
              <div className="flex-1">
                <div className="text-[10px] font-black tracking-[0.2em] text-white/70 uppercase">
                  Clinical Alarm
                </div>
                <div className="text-sm font-black tracking-wider text-white">
                  {alarm.text}
                </div>
              </div>
            </div>
            {/* Fix Suggestion Body */}
            <div className="bg-slate-800 px-4 py-3 text-xs text-slate-300">
              <span className="font-bold text-slate-100">Suggested Action: </span>
              {alarm.fix}
            </div>
            {/* Actions */}
            <div className="flex justify-end gap-2 bg-slate-900 px-4 py-2">
              <button
                onClick={silenceAlarm}
                className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-600 transition-colors"
              >
                Silence Audio
              </button>
            </div>
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
