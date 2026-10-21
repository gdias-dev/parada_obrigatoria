import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, X } from 'lucide-react'

/** Campo de senha com o "olhinho" para mostrar/esconder o que foi digitado. */
export function InputSenha({ value, onChange, extra, ...props }) {
  const [ver, setVer] = useState(false)
  return (
    <div className="senha-wrap">
      <input {...props} className="input" type={ver ? 'text' : 'password'} value={value} onChange={onChange} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      <div className="senha-botoes">
        {extra}
        <button type="button" className="btn btn-texto btn-icone" onClick={() => setVer(!ver)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'} title={ver ? 'Esconder senha' : 'Mostrar senha'} aria-pressed={ver}>
          {ver ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}

export function Campo({ rotulo, dica, erro, children, id }) {
  const auto = useId()
  const fid = id || auto
  const child = typeof children === 'function' ? children({ id: fid, 'aria-invalid': erro ? 'true' : undefined }) : children
  return (
    <div className="campo">
      {rotulo && <label htmlFor={fid}>{rotulo}</label>}
      {child}
      {erro ? <span className="erro-campo">{erro}</span> : dica ? <span className="dica">{dica}</span> : null}
    </div>
  )
}

export function Botao({ carregando, children, variante = 'primario', className = '', ...props }) {
  return (
    <button className={`btn btn-${variante} ${className}`} disabled={carregando || props.disabled} {...props}>
      {carregando && <Loader2 size={18} className="girando" aria-hidden />}
      {children}
    </button>
  )
}

export function Alerta({ tipo = 'erro', children }) {
  if (!children) return null
  const Icone = tipo === 'ok' ? CheckCircle2 : AlertCircle
  return (
    <div className={`alerta alerta-${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      <Icone size={18} aria-hidden />
      <span>{children}</span>
    </div>
  )
}

export function Modal({ titulo, aberto, onFechar, children, rodape, largura }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto) return
    const anterior = document.activeElement
    const onKey = (e) => e.key === 'Escape' && onFechar?.()
    document.addEventListener('keydown', onKey)
    // foca o primeiro campo do modal
    setTimeout(() => ref.current?.querySelector('input, select, textarea, button:not(.fechar)')?.focus(), 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      anterior?.focus?.()
    }
  }, [aberto, onFechar])
  if (!aberto) return null
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} ref={ref} style={largura ? { maxWidth: largura } : undefined}>
        <div className="modal-cab">
          <h2>{titulo}</h2>
          <button className="btn btn-texto btn-icone fechar" onClick={onFechar} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  )
}

const ToastCtx = createContext(() => {})

export function ToastProvider({ children }) {
  const [itens, setItens] = useState([])
  const mostrar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random()
    setItens((l) => [...l, { id, texto, tipo }])
    setTimeout(() => setItens((l) => l.filter((t) => t.id !== id)), tipo === 'erro' ? 4500 : 2200)
    setItens((l) => l.slice(-3))
  }, [])
  return (
    <ToastCtx.Provider value={mostrar}>
      {children}
      <div className="toasts" aria-live="polite">
        {itens.map((t) => (
          <div key={t.id} className={`toast ${t.tipo}`}>
            {t.tipo === 'erro' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            {t.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

export function iniciais(nome = '') {
  const p = nome.trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

/** Campo de valor em reais: aceita vírgula, teclado numérico no celular. */
export const InputDinheiro = forwardRef(function InputDinheiro({ value, onChange, ...props }, ref) {
  return (
    <div className="input-prefixo">
      <span aria-hidden>R$</span>
      <input {...props} ref={ref} className="input" inputMode="decimal" autoComplete="off" value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d,.]/g, ''))} placeholder={props.placeholder ?? '0,00'} />
    </div>
  )
})

/** Campo de quantidade (aceita decimal para KG/L). */
export function InputQtd({ value, onChange, sufixo, ...props }) {
  return (
    <div className={sufixo ? 'input-sufixo' : undefined}>
      <input {...props} className="input" inputMode="decimal" autoComplete="off" value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d,.]/g, ''))} />
      {sufixo && <span aria-hidden>{sufixo}</span>}
    </div>
  )
}
