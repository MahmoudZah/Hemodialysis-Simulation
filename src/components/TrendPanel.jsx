import { useState } from 'react'
import TrendGraph from './TrendGraph.jsx'
import { TRACKED_KEYS } from '../hooks/useTrendData.js'

/**
 * TrendPanel -- a collapsible sidebar overlay that holds multiple
 * individually toggleable live trend graphs.
 *
 * Each graph can be shown/hidden via a coloured toggle pill.
 * The entire panel can be collapsed to a small "📊" icon.
 */
export default function TrendPanel({ history }) {
  const [panelOpen, setPanelOpen] = useState(false)

  // Track which graphs are visible (default: first 4 are on).
  const [visible, setVisible] = useState(() => {
    const init = {}
    TRACKED_KEYS.forEach((k, i) => {
      init[k.key] = i < 4
    })
    return init
  })

  const toggle = (key) =>
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }))

  const visibleGraphs = TRACKED_KEYS.filter((k) => visible[k.key])

  return (
    <>
      {/* Floating toggle button */}
      <button
        type="button"
        onClick={() => setPanelOpen((p) => !p)}
        className={`pointer-events-auto fixed left-4 top-1/2 z-30 -translate-y-1/2 rounded-full p-3 text-lg shadow-xl backdrop-blur transition-all duration-300 ${
          panelOpen
            ? 'bg-med-accent/20 text-med-accent ring-1 ring-med-accent/40'
            : 'bg-med-panel/80 text-white/70 hover:bg-med-panel hover:text-white'
        }`}
        title={panelOpen ? 'Hide trend graphs' : 'Show trend graphs'}
      >
        📊
      </button>

      {/* Slide-in panel */}
      <div
        className={`pointer-events-auto fixed left-0 top-0 z-20 flex h-full flex-col transition-transform duration-300 ease-out ${
          panelOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: 'min(380px, 90vw)' }}
      >
        <div className="custom-scrollbar flex h-full flex-col overflow-y-auto bg-med-bg/95 px-4 pb-6 pt-4 shadow-2xl backdrop-blur-lg">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-[0.25em] text-med-accent">
              LIVE TRENDS
            </h2>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Toggle pills */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {TRACKED_KEYS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => toggle(k.key)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  visible[k.key]
                    ? 'bg-white/10 text-white shadow-inner ring-1 ring-white/10'
                    : 'bg-transparent text-white/30 hover:text-white/60'
                }`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full transition-opacity"
                  style={{
                    backgroundColor: k.color,
                    opacity: visible[k.key] ? 1 : 0.25,
                  }}
                />
                {k.label}
              </button>
            ))}
          </div>

          {/* Graphs */}
          {visibleGraphs.length === 0 && (
            <div className="mt-8 text-center text-xs text-white/30">
              Toggle a parameter above to display its trend graph.
            </div>
          )}
          <div className="flex flex-col gap-3">
            {visibleGraphs.map((k) => (
              <TrendGraph
                key={k.key}
                history={history}
                dataKey={k.key}
                label={k.label}
                unit={k.unit}
                color={k.color}
                min={k.min}
                max={k.max}
              />
            ))}
          </div>

          {/* Footer hint */}
          {history.length > 0 && (
            <div className="mt-4 text-center text-[9px] text-white/20">
              {history.length} samples · updated every 500 ms
            </div>
          )}
        </div>
      </div>
    </>
  )
}
