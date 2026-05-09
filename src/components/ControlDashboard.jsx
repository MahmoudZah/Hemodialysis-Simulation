import { useState } from 'react'

/**
 * 2D HUD overlay (Tailwind).
 *
 * Read-only status panel + sliders for live parameters + "Test Trigger"
 * buttons for the video demo. The dashboard is purely a *consumer* of the
 * central state -- it dispatches updates back to App through callbacks.
 *
 * The bottom panel grid can be hidden via the "HIDE / SHOW PANELS" toggle in
 * the top bar so the user can focus on the 3D scene during the video demo.
 */
export default function ControlDashboard({
  state,
  setParam,
  triggerAir,
  triggerLeak,
  resetAlarms,
}) {
  const [panelsOpen, setPanelsOpen] = useState(true)

  const statusColor =
    state.systemStatus === 'CRITICAL'
      ? 'bg-med-crit'
      : state.systemStatus === 'WARNING'
        ? 'bg-med-warn'
        : 'bg-med-good'

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 md:p-6">
      {/* Top bar ------------------------------------------------------------ */}
      <div className="pointer-events-auto flex items-center justify-between">
        <div className="flex items-center gap-3 rounded-xl bg-med-panel/80 px-4 py-2 backdrop-blur">
          <span className={`h-3 w-3 animate-pulse rounded-full ${statusColor}`} />
          <span className="text-sm font-semibold tracking-wider text-white/90">
            HEMODIALYSIS SIM
          </span>
          <span className="ml-2 rounded-md bg-black/30 px-2 py-0.5 text-xs font-mono text-white/80">
            {state.systemStatus}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelsOpen((p) => !p)}
            className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-white/20"
            title={panelsOpen ? 'Hide control panels' : 'Show control panels'}
          >
            <span
              className={`inline-block transform transition-transform ${
                panelsOpen ? 'rotate-180' : 'rotate-0'
              }`}
              aria-hidden
            >
              ▾
            </span>
            {panelsOpen ? 'HIDE PANELS' : 'SHOW PANELS'}
          </button>

          <button
            type="button"
            onClick={resetAlarms}
            className="rounded-lg bg-med-accent/90 px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-med-accent"
          >
            RESET ALARMS
          </button>
        </div>
      </div>

      {/* Bottom panel ------------------------------------------------------- */}
      <div
        className={`pointer-events-auto grid grid-cols-1 gap-4 transition-all duration-300 ease-out md:grid-cols-2 lg:grid-cols-4 ${
          panelsOpen
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-8 opacity-0'
        }`}
        aria-hidden={!panelsOpen}>
        {/* Live readouts */}
        <Panel title="LIVE PARAMETERS">
          <Readout label="Blood Flow" value={`${state.bloodFlowRate} mL/min`} />
          <Readout
            label="Pump Speed"
            value={`${(state.bloodFlowRate / 8).toFixed(1)} RPM`}
            sub={state.bloodFlowRate > 0 ? 'RUNNING' : 'STOPPED'}
            subColor={state.bloodFlowRate > 0 ? 'text-med-good' : 'text-med-crit'}
          />
          <Readout
            label="Dialysate Temp"
            value={`${state.dialysateTemp.toFixed(1)} °C`}
          />
        </Panel>

        {/* Blood physical parameters (patient side) */}
        <Panel title="BLOOD PARAMETERS">
          <Readout label="Hematocrit" value={`${state.hematocrit} %`} />
          <Readout
            label="Density"
            value={`${state.bloodDensity} kg/m³`}
          />
          <Readout
            label="Viscosity"
            value={`${state.bloodViscosity.toFixed(2)} cP`}
          />
          <Readout
            label="Total Volume"
            value={`${state.totalBloodVolume} mL`}
          />
        </Panel>

        {/* Sliders */}
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
            unit="°C"
          />
          <Slider
            label="Hematocrit"
            min={25}
            max={55}
            step={1}
            value={state.hematocrit}
            onChange={(v) => {
              setParam('hematocrit', v)
              // Density and viscosity correlate with hematocrit -- keep them in sync.
              setParam('bloodDensity', Math.round(1000 + v * 1.45))
              setParam(
                'bloodViscosity',
                Number((1.4 + v * 0.05).toFixed(2)),
              )
            }}
            unit="%"
          />
        </Panel>

        {/* Test triggers */}
        <Panel title="TEST TRIGGERS">
          <TriggerButton
            label="Trigger Air Detection"
            active={state.isAirDetected}
            onClick={triggerAir}
          />
          <TriggerButton
            label="Trigger Blood Leak"
            active={state.isLeakDetected}
            onClick={triggerLeak}
          />
          <TriggerButton
            label="Force Temp Fault (43 °C)"
            active={state.dialysateTemp >= 42 || state.dialysateTemp <= 35}
            onClick={() => setParam('dialysateTemp', 43.0)}
          />
        </Panel>
      </div>
    </div>
  )
}

/* ---------------- Small presentational helpers ---------------- */

function Panel({ title, children }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-med-panel/85 p-3 shadow-xl backdrop-blur">
      <div className="mb-2 text-[10px] font-bold tracking-[0.2em] text-med-accent">
        {title}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function Readout({ label, value, sub, subColor = 'text-white/70' }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-black/25 px-2 py-1.5">
      <span className="text-[10px] uppercase text-white/60">{label}</span>
      <div className="text-right">
        <span className="font-mono text-sm text-white">{value}</span>
        {sub && (
          <div className={`text-[9px] font-bold tracking-wider ${subColor}`}>
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
      <div className="mb-0.5 flex items-center justify-between text-[10px] text-white/70">
        <span>{label}</span>
        <span className="font-mono text-white">
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
      className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
        active
          ? 'bg-med-crit text-white shadow-inner'
          : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      {label}
    </button>
  )
}
