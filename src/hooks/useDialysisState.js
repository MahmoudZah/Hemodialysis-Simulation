import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Centralized "Source of Truth" hook for the Hemodialysis Machine Simulation.
 *
 * Tracks every shared parameter the team needs:
 *   - bloodFlowRate (Number, default: 300) ........ mL/min
 *   - dialysateTemp (Number, default: 37.0) ........ Celsius
 *   - venousPressure (Number, default: 150) ........ mmHg
 *   - isAirDetected (Boolean, default: false)
 *   - isLeakDetected (Boolean, default: false)
 *   - systemStatus (String: 'OPERATIONAL' | 'WARNING' | 'CRITICAL')
 *   - alarmActive (Boolean) -- derived flag for the global red overlay
 *
 * Teammates can:
 *   - Read state via the returned `state` object.
 *   - Update individual values via `setParam('bloodFlowRate', 250)`.
 *   - Trigger sensor faults via `triggerAir()`, `triggerLeak()`, `resetAlarms()`.
 *
 * All safety logic is centralized here so every subsystem reacts identically.
 */

export const SAFE_TEMP_MIN = 35
export const SAFE_TEMP_MAX = 42

const DEFAULT_STATE = {
  // Machine parameters
  bloodFlowRate: 300,
  dialysateTemp: 37.0,
  venousPressure: 150,
  isAirDetected: false,
  isLeakDetected: false,
  systemStatus: 'OPERATIONAL',

  // Blood (patient-side) physical parameters.
  // Reasonable adult averages -- teammates can override per-patient.
  hematocrit: 42,         // % packed red cell volume (normal: 36-50)
  bloodDensity: 1060,     // kg/m^3 (whole blood ~1050-1070)
  bloodViscosity: 3.5,    // cP at 37 °C (whole blood ~3-4)
  bloodTemp: 36.8,        // °C (patient core ~37)
  totalBloodVolume: 5000, // mL (adult ~4500-5500)
}

export function useDialysisState() {
  const [state, setState] = useState(DEFAULT_STATE)

  // Remember the last safe blood-flow value so we can restore it on reset.
  const lastSafeFlowRef = useRef(DEFAULT_STATE.bloodFlowRate)

  const setParam = useCallback((key, value) => {
    setState((prev) => ({ ...prev, [key]: value }))
  }, [])

  const triggerAir = useCallback(() => {
    setState((prev) => ({ ...prev, isAirDetected: true }))
  }, [])

  const triggerLeak = useCallback(() => {
    setState((prev) => ({ ...prev, isLeakDetected: true }))
  }, [])

  const resetAlarms = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isAirDetected: false,
      isLeakDetected: false,
      dialysateTemp: 37.0,
      bloodFlowRate: lastSafeFlowRef.current || DEFAULT_STATE.bloodFlowRate,
      systemStatus: 'OPERATIONAL',
    }))
  }, [])

  // ---- The Global Safety Monitor ------------------------------------------
  // Any unsafe condition forces CRITICAL status and zeroes blood-flow.
  useEffect(() => {
    const tempOutOfRange =
      state.dialysateTemp < SAFE_TEMP_MIN || state.dialysateTemp > SAFE_TEMP_MAX
    const isCritical =
      state.isAirDetected || state.isLeakDetected || tempOutOfRange

    if (isCritical) {
      if (state.systemStatus !== 'CRITICAL' || state.bloodFlowRate !== 0) {
        setState((prev) => ({
          ...prev,
          systemStatus: 'CRITICAL',
          bloodFlowRate: 0,
        }))
      }
    } else {
      // No fault -- remember the current flow as "safe" so resetAlarms can restore it.
      if (state.bloodFlowRate > 0) {
        lastSafeFlowRef.current = state.bloodFlowRate
      }
      if (state.systemStatus === 'CRITICAL') {
        setState((prev) => ({ ...prev, systemStatus: 'OPERATIONAL' }))
      }
    }
  }, [
    state.isAirDetected,
    state.isLeakDetected,
    state.dialysateTemp,
    state.bloodFlowRate,
    state.systemStatus,
  ])

  const alarmActive = useMemo(
    () => state.systemStatus === 'CRITICAL',
    [state.systemStatus],
  )

  return {
    state,
    setParam,
    triggerAir,
    triggerLeak,
    resetAlarms,
    alarmActive,
  }
}
