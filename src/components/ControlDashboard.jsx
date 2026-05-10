import { useState } from 'react'

/**
 * Compact side HUD overlay.
 *
 * Keeps the machine center visible by stacking panels on the left and right
 * edges instead of spreading a wide strip across the bottom.
 */
export default function ControlDashboard({
  state,
  setParam,
  triggerAir,
  triggerLeak,
  toggleClamp,
  resetAlarms,
  toggleMute,
  silenceAlarm,
}) {
  const [panelsOpen, setPanelsOpen] = useState(true)
  const dialysateFlowRate = state.bloodFlowRate > 0
    ? Math.min(800, Math.max(500, (state.nominalFlowRate ?? state.bloodFlowRate) * 2))
    : 0
  const clearancePct = Math.round(100 - state.chemistry.urea)

  const statusColor =
    state.systemStatus === 'CRITICAL'
      ? 'bg-med-crit'
      : state.systemStatus === 'WARNING'
        ? 'bg-med-warn'
        : 'bg-med-good'

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 md:p-4">
      <div className="pointer-events-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-xl bg-med-panel/80 px-3 py-2 backdrop-blur">
          <span className={`h-2.5 w-2.5 animate-pulse rounded-full ${statusColor}`} />
          <span className="text-xs font-semibold tracking-[0.18em] text-white/90">
            HEMODIALYSIS SIM
          </span>
          <span className="rounded-md bg-black/30 px-2 py-0.5 text-[10px] font-mono text-white/80">
            {state.systemStatus}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelsOpen((p) => !p)}
            className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-white/20"
            title={panelsOpen ? 'Hide control panels' : 'Show control panels'}
          >
            {panelsOpen ? 'HIDE PANELS' : 'SHOW PANELS'}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className={`flex h-8 w-8 items-center justify-center rounded-lg shadow transition ${
              state.isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title={state.isMuted ? 'Unmute' : 'Mute'}
          >
            {state.isMuted ? 'M' : 'S'}
          </button>

          {state.systemStatus === 'CRITICAL' && !state.isAlarmSilenced && (
            <button
              type="button"
              onClick={silenceAlarm}
              className="rounded-lg bg-orange-500/80 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-orange-500"
              title="Silence current alarm"
            >
              SILENCE
            </button>
          )}

          <button
            type="button"
            onClick={resetAlarms}
            className="rounded-lg bg-med-accent/90 px-3 py-2 text-xs font-semibold text-slate-900 shadow hover:bg-med-accent"
          >
            RESET
          </button>
        </div>
      </div>

      <div
        className={`pointer-events-none absolute inset-x-3 top-20 bottom-3 transition-all duration-300 ease-out md:inset-x-4 ${
          panelsOpen ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden={!panelsOpen}
      >
        <div className="flex h-full items-end justify-between">
          <div className={`pointer-events-auto flex flex-col gap-3 transition-transform duration-300 ${
            panelsOpen ? 'translate-x-0' : '-translate-x-8'
          }`}>
            <Panel title="LIVE">
              <Readout label="Blood Flow" value={`${state.bloodFlowRate} mL/min`} />
              <Readout
                label="Dialysate Flow"
                value={`${dialysateFlowRate.toFixed(0)} mL/min`}
                sub={dialysateFlowRate > 0 ? 'COUNTERCURRENT' : 'STANDBY'}
                subColor={dialysateFlowRate > 0 ? 'text-cyan-300' : 'text-slate-400'}
              />
              <Readout
                label="Pump Speed"
                value={`${(state.bloodFlowRate / 8).toFixed(1)} RPM`}
                sub={state.bloodFlowRate > 0 ? 'RUNNING' : 'STOPPED'}
                subColor={state.bloodFlowRate > 0 ? 'text-med-good' : 'text-med-crit'}
              />
              <Readout
                label="Exchange"
                value={`${clearancePct}% cleared`}
                sub={state.isLeakDetected ? 'LEAK DETECTED ON OUTLET' : 'FRESH IN, SPENT OUT'}
                subColor={state.isLeakDetected ? 'text-red-400' : 'text-cyan-300'}
              />
            </Panel>

            <Panel title="BLOOD">
              <Readout label="Hematocrit" value={`${state.hematocrit} %`} />
              <Readout label="Density" value={`${state.bloodDensity} kg/m3`} />
              <Readout label="Viscosity" value={`${state.bloodViscosity.toFixed(2)} cP`} />
              <Readout label="Volume" value={`${state.totalBloodVolume} mL`} />
            </Panel>
          </div>

          <div className={`pointer-events-auto flex flex-col gap-3 transition-transform duration-300 ${
            panelsOpen ? 'translate-x-0' : 'translate-x-8'
          }`}>
            <Panel title="CONTROLS">
              <Slider
                label="Blood Flow"
                min={0}
                max={500}
                step={10}
                value={state.bloodFlowRate}
                disabled={state.systemStatus === 'CRITICAL'}
                onChange={(v) => setParam('bloodFlowRate', v)}
                unit="mL/min"
              />
              <Slider
                label="Dialysate Temp"
                min={34}
                max={44}
                step={0.1}
                value={state.dialysateTemp}
                onChange={(v) => setParam('dialysateTemp', Number(v.toFixed(1)))}
                unit="C"
              />
              <Slider
                label="Hematocrit"
                min={25}
                max={55}
                step={1}
                value={state.hematocrit}
                onChange={(v) => {
                  setParam('hematocrit', v)
                  setParam('bloodDensity', Math.round(1000 + v * 1.45))
                  setParam('bloodViscosity', Number((1.4 + v * 0.05).toFixed(2)))
                }}
                unit="%"
              />
            </Panel>

            <Panel title="TRIGGERS">
              <TriggerButton
                label="Trigger Air Detection"
                active={state.isAirDetected}
                onClick={triggerAir}
              />
              <TriggerButton
                label="Trigger Blood Leak"
                active={state.isMembraneLeaking || state.isLeakDetected}
                onClick={triggerLeak}
              />
              <TriggerButton
                label={state.isClamped ? 'Release Clamp' : 'Simulate Occlusion'}
                active={state.isClamped}
                onClick={toggleClamp}
              />
              <TriggerButton
                label="Force Temp Fault"
                active={state.dialysateTemp >= 42 || state.dialysateTemp <= 35}
                onClick={() => setParam('dialysateTemp', 43.0)}
              />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <div className="w-[200px] max-w-[calc(100vw-2rem)] rounded-xl border border-white/5 bg-med-panel/82 p-2 shadow-xl backdrop-blur">
      <div className="mb-2 text-[9px] font-bold tracking-[0.18em] text-med-accent">
        {title}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function Readout({ label, value, sub, subColor = 'text-white/70' }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-black/25 px-2 py-1.5">
      <span className="text-[8px] uppercase text-white/60">{label}</span>
      <div className="text-right">
        <span className="font-mono text-[12px] text-white">{value}</span>
        {sub && (
          <div className={`text-[7px] font-bold tracking-wider ${subColor}`}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

function Slider({ label, min, max, step, value, onChange, unit, disabled }) {
  return (
    <label className={`block ${disabled ? 'opacity-50' : ''}`}>
      <div className="mb-0.5 flex items-center justify-between text-[8px] text-white/70">
        <span>{label}</span>
        <span className="font-mono text-[11px] text-white">
          {typeof value === 'number' ? value : ''} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-med-accent"
      />
    </label>
  )
}

function TriggerButton({ label, onClick, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2 py-1.5 text-[10px] font-semibold transition ${
        active
          ? 'bg-med-crit text-white shadow-inner'
          : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      {label}
    </button>
  )
}
