import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { get } from './api'

/**
 * Fica olhando se chegou pedido novo (a cada 15 s) em qualquer tela do sistema.
 * Quando chega: toca um som, mostra aviso e marca o menu.
 */
const Ctx = createContext({ novos: 0, andamento: 0, lojaAberta: true, recarregar: () => {} })

let audio = null
export function tocarAlerta() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)()
    if (audio.state === 'suspended') audio.resume()
    const t0 = audio.currentTime
    ;[0, 0.22, 0.44].forEach((d, i) => {
      const o = audio.createOscillator()
      const g = audio.createGain()
      o.type = 'sine'
      o.frequency.value = i === 2 ? 1175 : 880
      g.gain.setValueAtTime(0.0001, t0 + d)
      g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18)
      o.connect(g).connect(audio.destination)
      o.start(t0 + d); o.stop(t0 + d + 0.2)
    })
  } catch {}
}

// Navegadores só liberam som depois de um clique na página
if (typeof window !== 'undefined') {
  const liberar = () => { try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume() } catch {} }
  window.addEventListener('pointerdown', liberar, { once: true })
}

export function PedidosAlertaProvider({ children, onNovo }) {
  const [estado, setEstado] = useState({ novos: 0, andamento: 0, lojaAberta: true })
  const ultimo = useRef(null)
  const onNovoRef = useRef(onNovo)
  onNovoRef.current = onNovo

  const recarregar = useCallback(() => get('/pedidos/resumo').then((r) => {
    setEstado({ novos: r.novos, andamento: r.andamento, lojaAberta: r.loja_aberta })
    if (ultimo.current !== null && r.ultimo_novo > ultimo.current) {
      tocarAlerta()
      onNovoRef.current?.(r.novos)
    }
    ultimo.current = Math.max(ultimo.current ?? 0, r.ultimo_novo)
  }).catch(() => {}), [])

  useEffect(() => {
    recarregar()
    const t = setInterval(recarregar, 15000)
    // enquanto há pedido novo esperando, lembra com som a cada 1 min
    const lembrete = setInterval(() => setEstado((e) => { if (e.novos > 0) tocarAlerta(); return e }), 60000)
    return () => { clearInterval(t); clearInterval(lembrete) }
  }, [recarregar])

  return <Ctx.Provider value={{ ...estado, recarregar }}>{children}</Ctx.Provider>
}

export const usePedidosAlerta = () => useContext(Ctx)
