import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { VoicevoxPlayer } from './components/VoicevoxPlayer'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VoicevoxPlayer />
  </StrictMode>
)
