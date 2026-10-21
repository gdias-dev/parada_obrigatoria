import { useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { del, post, put } from '../../lib/api'
import { Alerta, Botao, Modal, useToast } from '../../components/ui'

export default function CategoriasModal({ aberto, categorias, onFechar, onMudou }) {
  const toast = useToast()
  const [nova, setNova] = useState('')
  const [editando, setEditando] = useState(null) // { id, nome }
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function rodar(fn, msg) {
    setOcupado(true); setErro('')
    try { await fn(); if (msg) toast(msg); onMudou() }
    catch (err) { setErro(err.message) }
    finally { setOcupado(false) }
  }

  const criar = (e) => {
    e.preventDefault()
    if (!nova.trim()) return
    rodar(async () => { await post('/categorias', { nome: nova.trim() }); setNova('') }, 'Categoria criada.')
  }
  const renomear = (e) => {
    e.preventDefault()
    const c = categorias.find((x) => x.id === editando.id)
    rodar(async () => { await put(`/categorias/${editando.id}`, { nome: editando.nome, ordem: c.ordem, visivel_online: c.visivel_online }); setEditando(null) }, 'Categoria renomeada.')
  }
  const mover = (c, dir) => {
    const i = categorias.findIndex((x) => x.id === c.id)
    const outra = categorias[i + dir]
    if (!outra) return
    rodar(async () => {
      await put(`/categorias/${c.id}`, { nome: c.nome, ordem: outra.ordem === c.ordem ? c.ordem + dir : outra.ordem })
      await put(`/categorias/${outra.id}`, { nome: outra.nome, ordem: c.ordem })
    })
  }
  const excluir = (c) => rodar(() => del(`/categorias/${c.id}`), 'Categoria excluída.')

  return (
    <Modal titulo="Categorias" aberto={aberto} onFechar={onFechar} largura={520}>
      <form className="linha-form" onSubmit={criar}>
        <input className="input" placeholder="Nova categoria" value={nova} onChange={(e) => setNova(e.target.value)} maxLength={80} aria-label="Nome da nova categoria" />
        <Botao type="submit" disabled={ocupado || !nova.trim()}><Plus size={18} aria-hidden /> Criar</Botao>
      </form>
      <Alerta>{erro}</Alerta>
      <p className="dica">A ordem aqui é a ordem em que as categorias aparecem no PDV e na loja online.</p>
      <ul className="lista-categorias">
        {categorias.map((c, i) => (
          <li key={c.id}>
            {editando?.id === c.id ? (
              <form className="linha-form" onSubmit={renomear}>
                <input className="input" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} autoFocus maxLength={80} aria-label="Novo nome" />
                <button className="btn btn-texto btn-icone" type="submit" aria-label="Salvar nome" disabled={ocupado}><Check size={18} /></button>
                <button className="btn btn-texto btn-icone" type="button" aria-label="Cancelar" onClick={() => setEditando(null)}><X size={18} /></button>
              </form>
            ) : (
              <>
                <span className="ordem">
                  <button className="btn btn-texto btn-icone" aria-label={`Subir ${c.nome}`} disabled={i === 0 || ocupado} onClick={() => mover(c, -1)}>▲</button>
                  <button className="btn btn-texto btn-icone" aria-label={`Descer ${c.nome}`} disabled={i === categorias.length - 1 || ocupado} onClick={() => mover(c, 1)}>▼</button>
                </span>
                <span className="cat-nome">{c.nome}<small>{c.produtos} produto{c.produtos === 1 ? '' : 's'}</small></span>
                <button className="btn btn-texto btn-icone" aria-label={`Renomear ${c.nome}`} onClick={() => setEditando({ id: c.id, nome: c.nome })}><Pencil size={16} /></button>
                <button className="btn btn-texto btn-icone" aria-label={`Excluir ${c.nome}`} disabled={c.produtos > 0 || ocupado}
                  title={c.produtos > 0 ? 'Mude os produtos de categoria antes de excluir' : 'Excluir'} onClick={() => excluir(c)}><Trash2 size={16} /></button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
