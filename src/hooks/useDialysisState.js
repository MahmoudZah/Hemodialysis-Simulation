import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Centralized "Source of Truth" hook for the Hemodialysis Machine Simulation.
 */

export const SAFE_TEMP_MIN = 35
export const SAFE_TEMP_MAX = 42

// Occlusion is detected when measured flow drops below this fraction of nominal
const OCCLUSION_THRESHOLD = 0.5  // 50%

const DEFAULT_STATE = {
  bloodFlowRate: 300,
  nominalFlowRate: 300,   // the user-set target flow (unaffected by clamping)
  dialysateTemp: 37.0,
  venousPressure: 150,
  isAirDetected: false,
  isLeakDetected: false,
  isOccluded: false,       // NEW: flow-sensor occlusion alarm
  isBubbleActive: false,
  isClamped: false,
  systemStatus: 'OPERATIONAL',
  alarmCause: null,        // 'AIR' | 'LEAK' | 'OCCLUSION' | 'TEMP' | null
  isMuted: false,
  isAlarmSilenced: false,

  // Blood Chemistry (Educational)
  chemistry: {
    urea: 100,
    creatinine: 100,
    potassium: 100,
  },

  // Blood (patient-side) physical parameters.
  hematocrit: 42,
  bloodDensity: 1060,
  bloodViscosity: 3.5,
  bloodTemp: 36.8,
  totalBloodVolume: 5000,
}

export function useDialysisState() {
  const [state, setState] = useState(DEFAULT_STATE)

  const lastSafeFlowRef = useRef(DEFAULT_STATE.bloodFlowRate)

  // ---- Setters ------------------------------------------------------------
  const setParam = useCallback((key, value) => {
    setState((prev) => {
      if (key === 'bloodFlowRate' && value > 0 && prev.systemStatus === 'OPERATIONAL') {
        lastSafeFlowRef.current = value
      }
      // When user adjusts bloodFlowRate via slider, also update nominalFlowRate
      const extra = key === 'bloodFlowRate' ? { nominalFlowRate: value } : {}
      return { ...prev, [key]: value, ...extra }
    })
  }, [])

  const triggerAir = useCallback(() => {
    setState((prev) => ({ ...prev, isBubbleActive: true, isAirDetected: false }))
  }, [])

  const confirmAirAlarm = useCallback(() => {
    setState((prev) => ({ ...prev, isAirDetected: true, isBubbleActive: false }))
  }, [])

  const triggerLeak = useCallback(() => {
    setState((prev) => ({ ...prev, isLeakDetected: true }))
  }, [])

  const toggleClamp = useCallback(() => {
    setState((prev) => ({ ...prev, isClamped: !prev.isClamped }))
  }, [])

  const resetAlarms = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isAirDetected: false,
      isLeakDetected: false,
      isOccluded: false,
      isBubbleActive: false,
      isClamped: false,
      isAlarmSilenced: false,
      alarmCause: null,
      dialysateTemp: 37.0,
      bloodFlowRate: lastSafeFlowRef.current || 300,
      nominalFlowRate: lastSafeFlowRef.current || 300,
      systemStatus: 'OPERATIONAL',
    }))
  }, [])

  const toggleMute = useCallback(() => {
    setState((prev) => ({ ...prev, isMuted: !prev.isMuted }))
  }, [])

  const silenceAlarm = useCallback(() => {
    setState((prev) => ({ ...prev, isAlarmSilenced: true }))
  }, [])

  // ---- Blood Chemistry Simulation -----------------------------------------
  const flowRateRef = useRef(state.bloodFlowRate)
  const statusRef   = useRef(state.systemStatus)
  useEffect(() => {
    flowRateRef.current = state.bloodFlowRate
    statusRef.current   = state.systemStatus
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const flow   = flowRateRef.current
      const status = statusRef.current
      if (flow <= 0 || status !== 'OPERATIONAL') return
      const reduction = (flow / 300) * 0.08
      setState((prev) => ({
        ...prev,
        chemistry: {
          urea:       Math.max(12, prev.chemistry.urea       - reduction),
          creatinine: Math.max(18, prev.chemistry.creatinine - reduction * 0.8),
          potassium:  Math.max(30, prev.chemistry.potassium  - reduction * 1.2),
        },
      }))
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  // ---- Flow-Sensor Occlusion Detection ------------------------------------
  // When the tube is clamped the actual flow drops to 0.
  // If measured flow < 50% of nominal → isOccluded = true.
  useEffect(() => {
    // Ignore flow drops that happen because the machine intentionally stopped the pump during an alarm
    if (state.systemStatus !== 'OPERATIONAL') return;

    const measuredFlow = state.isClamped ? 0 : state.bloodFlowRate
    const nominal      = state.nominalFlowRate || 300
    const ratio        = measuredFlow / nominal
    const shouldBeOccluded = ratio < OCCLUSION_THRESHOLD && nominal > 0

    setState((prev) => {
      if (prev.isOccluded === shouldBeOccluded) return prev   // no-op
      return { ...prev, isOccluded: shouldBeOccluded }
    })
  }, [state.isClamped, state.bloodFlowRate, state.nominalFlowRate, state.systemStatus])

  // ---- The Global Safety Monitor ------------------------------------------
  // Only depends on fault FLAGS, not on bloodFlowRate/systemStatus (avoids loops).
  useEffect(() => {
    const tempOutOfRange =
      state.dialysateTemp < SAFE_TEMP_MIN || state.dialysateTemp > SAFE_TEMP_MAX

    let cause = null
    if (state.isAirDetected)  cause = 'AIR'
    else if (state.isLeakDetected) cause = 'LEAK'
    else if (state.isOccluded)     cause = 'OCCLUSION'
    else if (tempOutOfRange)       cause = 'TEMP'

    const isCritical = cause !== null

    if (isCritical) {
      setState((prev) => {
        if (prev.systemStatus === 'CRITICAL' && prev.alarmCause === cause && prev.bloodFlowRate === 0) return prev
        return { ...prev, systemStatus: 'CRITICAL', bloodFlowRate: 0, alarmCause: cause }
      })
    } else {
      setState((prev) => {
        if (prev.systemStatus !== 'CRITICAL') return prev
        return {
          ...prev,
          systemStatus: 'OPERATIONAL',
          alarmCause: null,
          bloodFlowRate: lastSafeFlowRef.current || 300,
        }
      })
    }
  }, [
    state.isAirDetected,
    state.isLeakDetected,
    state.isOccluded,
    state.dialysateTemp,
  ])

  const alarmActive = useMemo(
    () => state.systemStatus === 'CRITICAL',
    [state.systemStatus],
  )

  return {
    state,
    setParam,
    triggerAir,
    confirmAirAlarm,
    triggerLeak,
    toggleClamp,
    resetAlarms,
    toggleMute,
    silenceAlarm,
    alarmActive,
  }
}
