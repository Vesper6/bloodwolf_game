import { Game } from './game/Game'

document.getElementById('start-btn')!.addEventListener('click', () => {
  document.getElementById('start-screen')!.classList.add('hidden')
  new Game()
})

document.getElementById('restart-btn')!.addEventListener('click', () => {
  location.reload()
})
