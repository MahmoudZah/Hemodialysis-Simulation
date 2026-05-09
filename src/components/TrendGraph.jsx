import { useEffect, useRef } from 'react'

/**
 * TrendGraph -- a lightweight <canvas>-based live line chart.
 *
 * Draws a single time-series with:
 *   • Translucent filled area beneath the line
 *   • Grid lines + axis labels
 *   • Live value badge in the top-right corner
 *   • Warning / critical band shading (optional)
 *
 * Props:
 *   history   : array of sample objects (must contain `t` and `dataKey`)
 *   dataKey   : the property name to plot (e.g. 'bloodFlowRate')
 *   label     : human-readable title
 *   unit      : unit string ('mL/min', '°C', …)
 *   color     : CSS colour for the line
 *   min / max : Y-axis range
 *   warnAt    : optional – threshold for amber band
 *   critAt    : optional – threshold for red band
 */
export default function TrendGraph({
  history,
  dataKey,
  label,
  unit,
  color,
  min,
  max,
  warnAt,
  critAt,
}) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    // Make the canvas crisp on high-DPI screens.
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const W = rect.width
    const H = rect.height
    const PAD_L = 44
    const PAD_R = 12
    const PAD_T = 8
    const PAD_B = 22
    const plotW = W - PAD_L - PAD_R
    const plotH = H - PAD_T - PAD_B

    // ---- Background ----
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.roundRect(0, 0, W, H, 8)
    ctx.fill()

    // ---- Warning / Critical bands ----
    const yForVal = (v) => PAD_T + plotH - ((v - min) / (max - min)) * plotH
    if (critAt != null) {
      const y0 = Math.max(PAD_T, yForVal(max))
      const y1 = yForVal(critAt)
      if (y1 > y0) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.08)'
        ctx.fillRect(PAD_L, y0, plotW, y1 - y0)
      }
    }
    if (warnAt != null && critAt != null) {
      const y0 = yForVal(critAt)
      const y1 = yForVal(warnAt)
      if (y1 > y0) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.06)'
        ctx.fillRect(PAD_L, y0, plotW, y1 - y0)
      }
    }

    // ---- Grid lines ----
    const steps = 4
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 0.5
    ctx.font = '9px ui-monospace, monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.textAlign = 'right'
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps
      const y = PAD_T + plotH * frac
      ctx.beginPath()
      ctx.moveTo(PAD_L, y)
      ctx.lineTo(PAD_L + plotW, y)
      ctx.stroke()
      const val = max - frac * (max - min)
      ctx.fillText(Number.isInteger(val) ? val : val.toFixed(1), PAD_L - 5, y + 3)
    }

    // ---- No-data guard ----
    if (history.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Waiting for data…', W / 2, H / 2)
      return
    }

    // ---- Time axis labels ----
    const tMin = history[0].t
    const tMax = history[history.length - 1].t
    const tRange = Math.max(tMax - tMin, 1)
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.textAlign = 'center'
    ctx.font = '9px ui-monospace, monospace'
    for (let i = 0; i <= 4; i++) {
      const frac = i / 4
      const tVal = tMin + frac * tRange
      const x = PAD_L + frac * plotW
      ctx.fillText(`${tVal.toFixed(0)}s`, x, H - 4)
    }

    // ---- Plot the line + filled area ----
    ctx.save()
    ctx.beginPath()
    ctx.rect(PAD_L, PAD_T, plotW, plotH)
    ctx.clip()

    const pts = history.map((s) => {
      const x = PAD_L + ((s.t - tMin) / tRange) * plotW
      const raw = s[dataKey] ?? 0
      const y = PAD_T + plotH - ((raw - min) / (max - min)) * plotH
      return { x, y }
    })

    // Filled area
    ctx.beginPath()
    ctx.moveTo(pts[0].x, PAD_T + plotH)
    pts.forEach((p) => ctx.lineTo(p.x, p.y))
    ctx.lineTo(pts[pts.length - 1].x, PAD_T + plotH)
    ctx.closePath()
    ctx.fillStyle = hexToRGBA(color, 0.15)
    ctx.fill()

    // Line
    ctx.beginPath()
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Glow
    ctx.shadowColor = color
    ctx.shadowBlur = 6
    ctx.beginPath()
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.strokeStyle = hexToRGBA(color, 0.5)
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.shadowBlur = 0

    // Dot at the latest point
    const last = pts[pts.length - 1]
    ctx.beginPath()
    ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.2
    ctx.stroke()

    ctx.restore()

    // ---- Live value badge (top-right) ----
    const liveVal = history[history.length - 1][dataKey] ?? 0
    const displayVal = Number.isInteger(liveVal) ? liveVal : liveVal.toFixed(1)
    const badge = `${displayVal} ${unit}`
    ctx.font = 'bold 11px ui-monospace, monospace'
    ctx.textAlign = 'right'
    const badgeW = ctx.measureText(badge).width + 14
    const bx = W - PAD_R - 2
    const by = PAD_T + 4
    ctx.fillStyle = hexToRGBA(color, 0.2)
    ctx.beginPath()
    ctx.roundRect(bx - badgeW, by, badgeW, 18, 4)
    ctx.fill()
    ctx.fillStyle = color
    ctx.fillText(badge, bx - 6, by + 13)
  }, [history, dataKey, label, unit, color, min, max, warnAt, critAt])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-1">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
          {label}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="h-[100px] w-full rounded-lg"
        style={{ imageRendering: 'auto' }}
      />
    </div>
  )
}

/* ---- util ---- */
function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
