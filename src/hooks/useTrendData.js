import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * useTrendData -- records a rolling window of simulation telemetry.
 *
 * Samples every `intervalMs` (default 500ms) and keeps the last
 * `maxPoints` readings (default 120 → 60 seconds of history).
 *
 * Each entry in the returned `history` array is an object like:
 *   { t: <elapsed seconds>, bloodFlowRate: 300, arterialP: -200, ... }
 *
 * The hook is intentionally decoupled from any rendering library so it
 * can feed a <canvas> graph, an SVG chart, or anything else.
 */

const TRACKED_KEYS = [
  { key: 'bloodFlowRate',      label: 'Blood Flow',         unit: 'mL/min', color: '#f43f5e', min: 0,    max: 500  },
  { key: 'arterialPressure',   label: 'Arterial Pressure',  unit: 'mmHg',   color: '#a78bfa', min: -450, max: 0    },
  { key: 'dialyzerInPressure', label: 'Dialyzer In',        unit: 'mmHg',   color: '#38bdf8', min: 0,    max: 500  },
  { key: 'venousPressure',     label: 'Venous Pressure',    unit: 'mmHg',   color: '#34d399', min: 0,    max: 350  },
  { key: 'dialysateTemp',      label: 'Dialysate Temp',     unit: '°C',     color: '#fbbf24', min: 34,   max: 44   },
  { key: 'hematocrit',         label: 'Hematocrit',         unit: '%',      color: '#fb923c', min: 25,   max: 55   },
  { key: 'bloodViscosity',     label: 'Blood Viscosity',    unit: 'cP',     color: '#e879f9', min: 2,    max: 5    },
]

export { TRACKED_KEYS }

export function useTrendData(sampleFn, { intervalMs = 500, maxPoints = 120 } = {}) {
  const [history, setHistory] = useState([])
  const startRef = useRef(Date.now())
  const sampleRef = useRef(sampleFn)

  // Keep the sample function reference up-to-date without re-running the effect.
  useEffect(() => {
    sampleRef.current = sampleFn
  }, [sampleFn])

  useEffect(() => {
    startRef.current = Date.now()

    const id = setInterval(() => {
      const sample = sampleRef.current()
      if (!sample) return
      const t = ((Date.now() - startRef.current) / 1000).toFixed(1)
      setHistory((prev) => {
        const next = [...prev, { t: Number(t), ...sample }]
        return next.length > maxPoints ? next.slice(next.length - maxPoints) : next
      })
    }, intervalMs)

    return () => clearInterval(id)
  }, [intervalMs, maxPoints])

  const clearHistory = useCallback(() => {
    setHistory([])
    startRef.current = Date.now()
  }, [])

  return { history, clearHistory }
}
