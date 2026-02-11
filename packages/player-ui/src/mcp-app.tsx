import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { VoicevoxPlayer } from './components/VoicevoxPlayer'
import './player.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VoicevoxPlayer />
  </StrictMode>
)
