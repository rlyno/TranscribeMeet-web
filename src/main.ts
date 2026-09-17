import './style.css'
import { App } from './app'

declare global {
  interface Window {
    transcribemeet?: App
  }
}

window.transcribemeet = new App()
