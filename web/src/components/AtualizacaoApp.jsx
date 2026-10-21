import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

/** Faixa "Versão nova disponível" quando o sistema foi atualizado no servidor. */
export default function AtualizacaoApp() {
  const [reg, setReg] = useState(null)
  useEffect(() => {
    const h = (e) => setReg(e.detail)
    window.addEventListener('app-atualizacao', h)
    return () => window.removeEventListener('app-atualizacao', h)
  }, [])
  if (!reg?.waiting) return null
  return (
    <div className="banner-versao nao-imprimir" role="status">
      <span>Versão nova do sistema disponível</span>
      <button className="btn btn-primario" onClick={() => reg.waiting.postMessage('SKIP_WAITING')}><RefreshCw size={16} aria-hidden /> Atualizar</button>
    </div>
  )
}
