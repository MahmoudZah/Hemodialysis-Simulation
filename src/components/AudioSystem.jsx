import { useEffect, useRef } from 'react'

/**
 * AudioSystem Component
 *
 * Uses the Web Audio API to generate synthesized sounds for the simulation.
 * - Machine Hum: Pitch and volume scale with blood flow rate.
 * - Alarm Beep: Pulsing warning sound for critical conditions.
 * - Mute: Master volume control.
 */
export default function AudioSystem({ 
  bloodFlowRate, 
  alarmActive, 
  isMuted, 
  isAlarmSilenced 
}) {
  const audioCtxRef = useRef(null)
  const masterGainRef = useRef(null)
  
  // Alarm sound nodes
  const alarmIntervalRef = useRef(null)

  // Initialize Audio Context on first interaction or when needed
  const initAudio = () => {
    if (audioCtxRef.current) return
    
    console.log('🔊 [AudioSystem] Initializing Mechanical Hybrid Audio...')
    const AudioContext = window.AudioContext || window.webkitAudioContext
    const ctx = new AudioContext()
    audioCtxRef.current = ctx

    // Master Gain (Final Output)
    const masterGain = ctx.createGain()
    masterGain.connect(ctx.destination)
    masterGain.gain.setValueAtTime(isMuted ? 0 : 1, ctx.currentTime)
    masterGainRef.current = masterGain

    if (ctx.state === 'suspended') ctx.resume()
  }

  // Handle Mute State
  useEffect(() => {
    if (!masterGainRef.current || !audioCtxRef.current) return
    const now = audioCtxRef.current.currentTime
    masterGainRef.current.gain.setTargetAtTime(isMuted ? 0 : 1, now, 0.05)
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
  }, [isMuted])


  // Handle Alarm Beeps
  useEffect(() => {
    const shouldBeep = alarmActive && !isAlarmSilenced && !isMuted

    if (shouldBeep) {
      if (!audioCtxRef.current) initAudio()
      
      console.log('🚨 [AudioSystem] Alarm Started Beeping')
      
      // Start rhythmic beeping
      if (!alarmIntervalRef.current) {
        alarmIntervalRef.current = setInterval(() => {
          if (!audioCtxRef.current || !masterGainRef.current) return
          
          const ctx = audioCtxRef.current
          const now = ctx.currentTime
          
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          
          osc.type = 'sine'
          osc.frequency.setValueAtTime(880, now)
          
          gain.gain.setValueAtTime(0, now)
          gain.gain.linearRampToValueAtTime(0.2, now + 0.05)
          gain.gain.linearRampToValueAtTime(0, now + 0.3)
          
          osc.connect(gain)
          gain.connect(masterGainRef.current)
          
          osc.start(now)
          osc.stop(now + 0.3)
        }, 600)
      }
    } else {
      // Stop beeping
      if (alarmIntervalRef.current) {
        console.log('🔇 [AudioSystem] Alarm Stopped/Silenced')
        clearInterval(alarmIntervalRef.current)
        alarmIntervalRef.current = null
      }
    }

    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current)
        alarmIntervalRef.current = null
      }
    }
  }, [alarmActive, isAlarmSilenced, isMuted])

  return null // Headless component
}
