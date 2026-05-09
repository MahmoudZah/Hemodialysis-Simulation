import { useEffect } from 'react'
import dialyzerImg from '../assets/image1.png'
import airTrapImg from '../assets/image2.png'
import airDetectorImg from '../assets/image3.jpg'

/**
 * Full-screen educational modal that opens when the user clicks
 * "Learn More" on a hovered 3D component (Dialyzer, Air Trap,
 * or Air Detector Clamp).
 *
 * Props:
 *   componentId  – 'dialyzer' | 'airTrap' | 'airDetectorClamp' | null
 *   onClose      – callback to dismiss the modal
 */

const CONTENT = {
  dialyzer: {
    title: 'Dialyzer (Artificial Kidney)',
    image: dialyzerImg,
    sections: [
      {
        heading: 'What is it?',
        body: 'The dialyzer is the core component of the hemodialysis machine — often called the "artificial kidney." It is a cylindrical cartridge containing thousands of hair-thin hollow fibers made from a semipermeable membrane.',
      },
      {
        heading: 'How does it work?',
        body: "Blood from the patient flows through the inside of the hollow fibers, while a special cleansing solution called dialysate flows in the opposite direction around the outside of the fibers. This counter-current flow maximizes the concentration gradient across the membrane.",
      },
      {
        heading: 'Waste Removal',
        body: 'Waste products such as urea, creatinine, and excess potassium diffuse from the blood (high concentration) through the membrane pores into the dialysate (low concentration). Clean, filtered blood is then returned to the patient.',
      },
      {
        heading: 'Blood Leak Detection',
        body: 'A Blood Leak Detector (BLD) on the dialysate outflow line uses optical sensors to watch for red blood cells crossing a ruptured membrane. If a leak is detected, the machine immediately stops blood flow and triggers a CRITICAL alarm.',
      },
    ],
  },

  airTrap: {
    title: 'Air Trap (Drip Chamber)',
    image: airTrapImg,
    sections: [
      {
        heading: 'What is it?',
        body: 'The air trap, also known as a drip chamber or venous bubble trap, is a transparent vertical chamber on the venous return line positioned after the dialyzer. It serves as a critical safety device to prevent air embolism.',
      },
      {
        heading: 'How does it work?',
        body: 'Blood enters the chamber from the top and fills approximately the lower 60–70%. The upper portion remains as an air space. Any air bubbles entrained in the blood rise to the surface (meniscus) due to buoyancy and pop harmlessly into the air space above.',
      },
      {
        heading: 'Blood Level Monitoring',
        body: 'The blood level inside the chamber is carefully monitored. If the level drops too low, it could allow air to pass downstream. If the level is too high, there is insufficient air space to trap bubbles effectively. Maintaining the correct level is essential for patient safety.',
      },
      {
        heading: 'Transducer Connection',
        body: 'A pressure transducer is connected at the top of the air trap through a transducer protector. This measures the venous return pressure, helping detect clots, kinks, or access problems in the venous line.',
      },
    ],
  },

  airDetectorClamp: {
    title: 'Air Detector Clamp (Ultrasonic Bubble Detector)',
    image: airDetectorImg,
    sections: [
      {
        heading: 'What is it?',
        body: 'The air detector clamp is an ultrasonic sensor that clips directly onto the venous return tubing downstream of the air trap. It is the last line of defense before blood re-enters the patient, ensuring no air bubbles have escaped the drip chamber.',
      },
      {
        heading: 'How does it work?',
        body: 'The device has two jaws that sandwich the blood tubing. An ultrasonic transmitter in one jaw sends sound waves through the tube; a receiver in the opposite jaw listens. Air bubbles scatter or block the ultrasound signal, causing a detectable drop in signal strength.',
      },
      {
        heading: 'Safety Response',
        body: 'When air is detected, the machine immediately clamps the venous line shut (using an automatic venous clamp) and stops the blood pump. This prevents any air from reaching the patient\'s bloodstream, which could otherwise cause a life-threatening air embolism.',
      },
      {
        heading: 'Status Indicator',
        body: 'A green LED on the front of the clamp confirms the line is clear. When air is detected, the LED switches to a pulsing red, providing a quick visual confirmation of the alarm state to the operator.',
      },
    ],
  },
}

export default function LearnMoreModal({ componentId, onClose }) {
  const data = componentId ? CONTENT[componentId] : null

  // Close on Escape key
  useEffect(() => {
    if (!data) return
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [data, onClose])

  if (!data) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal card */}
      <div
        className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/95 to-slate-800/95 shadow-2xl backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-med-accent/20">
              <svg
                className="h-4 w-4 text-med-accent"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white">{data.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Scrollable content */}
        <div className="custom-scrollbar overflow-y-auto px-6 py-5">
          {/* Image */}
          <div className="mb-5 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-3">
            <img
              src={data.image}
              alt={data.title}
              className="mx-auto max-h-64 w-auto rounded-lg object-contain"
            />
          </div>

          {/* Educational sections */}
          <div className="flex flex-col gap-4">
            {data.sections.map((section, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/5 bg-white/5 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-med-accent/20 text-[10px] font-bold text-med-accent">
                    {i + 1}
                  </span>
                  <h3 className="text-sm font-semibold text-med-accent">
                    {section.heading}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-white/80">
                  {section.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-med-accent/90 py-2 text-sm font-semibold text-slate-900 transition hover:bg-med-accent"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
