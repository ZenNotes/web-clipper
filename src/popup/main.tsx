import { createRoot } from 'react-dom/client'
import '../styles/index.css'
import { Popup } from './Popup'

// A phone-sized touch screen: Safari shows the popup as a sheet there. The
// screen, not the viewport, tells a phone from an iPad, whose popover
// viewport is only as large as the popup itself.
if (matchMedia('(hover: none) and (pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600) {
  document.documentElement.classList.add('zn-sheet')
}

createRoot(document.getElementById('root')!).render(<Popup />)
