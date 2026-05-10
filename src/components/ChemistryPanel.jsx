import React, { useState } from 'react'

/**
 * BLOOD CHEMISTRY EDUCATIONAL PANEL
 *
 * In chronic kidney disease (CKD), the kidneys can no longer filter waste.
 * Toxins accumulate in the blood between dialysis sessions. The machine
 * removes them by diffusion across the dialyzer membrane.
 *
 * Values shown are % of the patient's PRE-dialysis level.
 *   100% = session just started (blood at its most toxic, patient feels worst)
 *   ~30% = end of a standard 4-hour session (toxins removed, patient feels better)
 *
 * Real clinical targets (K/DOQI guidelines):
 *   - Urea reduction ratio (URR) should be ≥ 65%  (i.e. value drops to ≤ 35%)
 *   - Kt/V (urea clearance) should be ≥ 1.2 per session
 */

const TOXINS = [
  {
    id: 'urea',
    label: 'Urea (BUN)',
    unit: 'mg/dL',
    preDialysis: '80–100',
    postTarget: '25–35',
    normal: '7–20',
    color: '#f59e0b',
    barColor: 'bg-amber-400',
    why: 'Protein waste product. High BUN causes fatigue, nausea & confusion.',
  },
  {
    id: 'creatinine',
    label: 'Creatinine',
    unit: 'mg/dL',
    preDialysis: '8–12',
    postTarget: '3–5',
    normal: '0.6–1.2',
    color: '#10b981',
    barColor: 'bg-emerald-400',
    why: 'Muscle waste product. Marker of how well the kidneys / machine is cleaning.',
  },
  {
    id: 'potassium',
    label: 'Potassium (K⁺)',
    unit: 'mEq/L',
    preDialysis: '5.5–7.0',
    postTarget: '3.5–5.0',
    normal: '3.5–5.0',
    color: '#60a5fa',
    barColor: 'bg-blue-400',
    why: 'High K⁺ (hyperkalemia) causes dangerous heart arrhythmias — this is a life-threatening emergency.',
  },
]

export default function ChemistryPanel({ chemistry }) {
  const [isOpen, setIsOpen] = useState(false)

  if (!chemistry) return null

  const values = [
    { ...TOXINS[0], percentRemaining: chemistry.urea,       actualValue: (90 * (chemistry.urea / 100)).toFixed(1) },
    { ...TOXINS[1], percentRemaining: chemistry.creatinine, actualValue: (10 * (chemistry.creatinine / 100)).toFixed(1) },
    { ...TOXINS[2], percentRemaining: chemistry.potassium,  actualValue: (6.2 * (chemistry.potassium / 100)).toFixed(1) },
  ]

  // Determine session progress (urea is the primary marker)
  const sessionPct = Math.round(100 - chemistry.urea)
  const adequacy = sessionPct >= 65 ? 'ADEQUATE' : sessionPct >= 40 ? 'IN PROGRESS' : 'EARLY SESSION'
  const adequacyColor = sessionPct >= 65 ? 'text-emerald-400' : sessionPct >= 40 ? 'text-amber-400' : 'text-slate-400'

  return (
    <div className="absolute right-6 top-16 z-20 w-64 rounded-xl bg-slate-900/90 text-white shadow-2xl backdrop-blur-md border border-slate-700/50 transition-all duration-300">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Blood Chemistry
          </h3>
          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        <button className="text-slate-400 hover:text-white transition-colors text-xs">
          {isOpen ? '▲' : '▼'}
        </button>
      </div>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="p-3 pt-0">
          {/* Session Adequacy Badge */}
          <div className="mb-2 rounded-lg bg-slate-800/60 px-2 py-1.5 flex items-center justify-between">
            <span className="text-[8px] uppercase tracking-wider text-slate-400">Clearance</span>
            <span className={`text-[9px] font-bold ${adequacyColor}`}>{sessionPct}% — {adequacy}</span>
          </div>

          {/* Toxin bars */}
          <div className="space-y-2.5">
            {values.map((toxin) => (
              <div key={toxin.id}>
                <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
                  <span style={{ color: toxin.color }}>{toxin.label}</span>
                  <span className="text-slate-100">{toxin.actualValue} {toxin.unit}</span>
                </div>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full ${toxin.barColor} transition-all duration-700 ease-out rounded-full`}
                    style={{ width: `${toxin.percentRemaining}%` }}
                  />
                </div>
                <div className="mt-0.5 flex justify-between text-[7px] text-slate-500 leading-none">
                  <span>Pre: {toxin.preDialysis}</span>
                  <span>Target: {toxin.postTarget}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Explanation */}
          <div className="mt-3 border-t border-slate-800 pt-2 space-y-1.5">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Clinical Principles</p>
            <p className="text-[8px] leading-snug text-slate-400">
              Waste products diffuse across a semipermeable membrane (Fick's Law: <span className="font-mono text-cyan-400">J = -D(dC/dx)</span>).
            </p>
            <p className="text-[8px] leading-snug text-slate-400">
              These are <em>clinical ranges</em>; % reduction evaluates adequacy.
            </p>
            <p className="text-[8px] leading-snug text-slate-400">
              📌 <span className="text-amber-400 font-semibold italic">URR Target: ≥65% drop</span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
