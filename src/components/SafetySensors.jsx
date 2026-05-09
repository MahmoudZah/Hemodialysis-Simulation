import { useEffect, useRef } from 'react'
import { SAFE_TEMP_MIN, SAFE_TEMP_MAX } from '../hooks/useDialysisState.js'

/**
 * Non-visual safety/telemetry component.
 *
 * The actual *enforcement* (status -> CRITICAL, flow -> 0) lives inside the
 * central `useDialysisState` hook so every consumer sees a consistent state
 * the moment a fault occurs. This component is the place teammates can add
 * extra sensor logic: console telemetry, audio alarms, network reporting,
 * watchdog timers, etc.
 *
 * It is rendered (returns null) so it can subscribe to state via props.
 */
export default function SafetySensors({ state, onAlarm }) {
  const wasCriticalRef = useRef(false)

  useEffect(() => {
    const tempOutOfRange =
      state.dialysateTemp < SAFE_TEMP_MIN || state.dialysateTemp > SAFE_TEMP_MAX
    const isCritical =
      state.isAirDetected || state.isLeakDetected || tempOutOfRange

    if (isCritical && !wasCriticalRef.current) {
      wasCriticalRef.current = true
      const reasons = []
      if (state.isAirDetected) reasons.push('AIR_IN_LINE')
      if (state.isLeakDetected) reasons.push('BLOOD_LEAK')
      if (tempOutOfRange) reasons.push('DIALYSATE_TEMP_OUT_OF_RANGE')

      // Console telemetry for the team's video demo.
      console.warn('[SafetySensors] CRITICAL fault:', reasons.join(', '))

      if (typeof onAlarm === 'function') onAlarm(reasons)
    }

    if (!isCritical && wasCriticalRef.current) {
      wasCriticalRef.current = false
      console.info('[SafetySensors] System back to OPERATIONAL.')
    }
  }, [
    state.isAirDetected,
    state.isLeakDetected,
    state.dialysateTemp,
    onAlarm,
  ])

  return null
}
