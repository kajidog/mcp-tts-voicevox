/** Play アイコン SVG */
export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Play">
      <title>Play</title>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

/** Pause アイコン SVG */
export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Pause">
      <title>Pause</title>
      <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
    </svg>
  )
}

/** Speaker アイコン SVG */
export function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Speaker" className="speaker-icon">
      <title>Speaker</title>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
    </svg>
  )
}

/** Equalizer アイコン (再生中インジケーター) */
export function EqualizerIcon() {
  return (
    <div className="equalizer" aria-label="Playing">
      <div className="equalizer-bar" />
      <div className="equalizer-bar" />
      <div className="equalizer-bar" />
    </div>
  )
}

/** Repeat アイコン (連続再生トグル) */
export function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Repeat">
      <title>Repeat</title>
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
    </svg>
  )
}

/** 次へアイコン */
export function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Next">
      <title>Next</title>
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  )
}

/** 前へアイコン */
export function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Previous">
      <title>Previous</title>
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  )
}

/** Chevron Down アイコン */
export function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Expand">
      <title>Expand</title>
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
    </svg>
  )
}

/** Rewind to Start アイコン */
export function RewindIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-label="Rewind">
      <title>Rewind</title>
      <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
    </svg>
  )
}
