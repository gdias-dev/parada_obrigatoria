import { Hammer } from 'lucide-react'
import { ETAPAS } from '../menu'

export default function EmBreve({ item }) {
  return (
    <div className="pagina">
      <div className="pagina-topo"><h1>{item.rotulo}</h1></div>
      <section className="painel vazio">
        <Hammer size={36} color="var(--chope-forte)" aria-hidden />
        <h3 style={{ marginTop: 12 }}>Esta parte chega na etapa {item.etapa}</h3>
        <p>{ETAPAS[item.etapa]}</p>
      </section>
    </div>
  )
}
