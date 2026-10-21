import { useCallback, useEffect, useState } from 'react'
import { UserPlus, Pencil, KeyRound, Dices } from 'lucide-react'
import { get, post, put } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dataHora } from '../lib/format'
import { Alerta, Botao, Campo, InputSenha, Modal, useToast } from '../components/ui'

const VAZIO = { nome: '', login: '', perfil: 'funcionario', senha: '', ativo: true }

// Senha provisória fácil de ditar: 4 letras + 4 números
function senhaProvisoria() {
  const letras = 'abcdefghjkmnpqrstuvwxyz'
  const n = (k) => Array.from(crypto.getRandomValues(new Uint32Array(k)))
  return n(4).map((x) => letras[x % letras.length]).join('') + n(4).map((x) => x % 10).join('')
}

export default function Usuarios() {
  const { usuario: eu, recarregar } = useAuth()
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [erroLista, setErroLista] = useState('')
  const [editando, setEditando] = useState(null)   // objeto do form, ou null
  const [redefinindo, setRedefinindo] = useState(null)

  const carregar = useCallback(() => {
    get('/usuarios').then(setLista).catch((e) => setErroLista(e.message))
  }, [])
  useEffect(carregar, [carregar])

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Usuários</h1>
          <p>Quem acessa o sistema. Funcionários não veem custos, lucro nem relatórios.</p>
        </div>
        <Botao onClick={() => setEditando({ ...VAZIO, senha: senhaProvisoria() })}>
          <UserPlus size={18} aria-hidden /> Novo usuário
        </Botao>
      </div>

      <Alerta>{erroLista}</Alerta>

      <section className="painel">
        {lista === null && !erroLista && <div className="vazio">Carregando…</div>}
        {lista && (
          <table className="tabela">
            <thead>
              <tr><th>Nome</th><th>Perfil</th><th>Último acesso</th><th><span className="sr-only">Ações</span></th></tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} className={u.ativo ? '' : 'linha-inativa'}>
                  <td>
                    <strong>{u.nome}</strong>{u.id === eu.id && ' (você)'}
                    <span className="nome-sub">usuário: {u.login}</span>
                  </td>
                  <td>
                    {!u.ativo ? <span className="etiqueta etiqueta-inativo">Desativado</span>
                      : u.perfil === 'admin' ? <span className="etiqueta etiqueta-admin">Administrador</span>
                      : <span className="etiqueta etiqueta-func">Funcionário</span>}
                    {u.ativo && u.precisa_trocar_senha && <> <span className="etiqueta etiqueta-pendente">senha provisória</span></>}
                  </td>
                  <td data-rotulo="Último acesso">{u.ultimo_acesso ? dataHora(u.ultimo_acesso) : 'Nunca entrou'}</td>
                  <td className="acoes">
                    <Botao variante="texto" onClick={() => setRedefinindo(u)} aria-label={`Redefinir senha de ${u.nome}`}>
                      <KeyRound size={16} aria-hidden /> Senha
                    </Botao>
                    <Botao variante="texto" onClick={() => setEditando({ ...u, senha: '' })} aria-label={`Editar ${u.nome}`}>
                      <Pencil size={16} aria-hidden /> Editar
                    </Botao>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <FormUsuario
        dados={editando}
        euId={eu.id}
        onFechar={() => setEditando(null)}
        onSalvo={(msg, id) => { setEditando(null); toast(msg); carregar(); if (id === eu.id) recarregar() }}
      />
      <RedefinirSenha
        usuario={redefinindo}
        onFechar={() => setRedefinindo(null)}
        onSalvo={() => { setRedefinindo(null); toast('Senha redefinida.'); carregar() }}
      />
    </div>
  )
}

function FormUsuario({ dados, euId, onFechar, onSalvo }) {
  const [f, setF] = useState(VAZIO)
  const [erro, setErro] = useState({})
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { if (dados) { setF(dados); setErro({}) } }, [dados])

  const novo = dados && !dados.id
  const souEu = dados?.id === euId
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function salvar(e) {
    e.preventDefault()
    setEnviando(true); setErro({})
    try {
      if (novo) await post('/usuarios', f)
      else await put(`/usuarios/${f.id}`, { nome: f.nome, login: f.login, perfil: f.perfil, ativo: f.ativo })
      onSalvo(novo ? `${f.nome} cadastrado. Passe a senha provisória para a pessoa.` : 'Alterações salvas.', f.id)
    } catch (err) {
      setErro({ geral: err.data?.campo ? '' : err.message, [err.data?.campo]: err.message })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      titulo={novo ? 'Novo usuário' : 'Editar nome, usuário e perfil'}
      aberto={!!dados}
      onFechar={onFechar}
      rodape={<>
        <Botao variante="borda" type="button" onClick={onFechar}>Cancelar</Botao>
        <Botao form="form-usuario" type="submit" carregando={enviando}>{novo ? 'Cadastrar' : 'Salvar alterações'}</Botao>
      </>}
    >
      <form id="form-usuario" className="grid-form" onSubmit={salvar}>
        <Alerta>{erro.geral}</Alerta>
        <Campo rotulo="Nome" erro={erro.nome}>{(p) => <input {...p} className="input" value={f.nome} onChange={set('nome')} required />}</Campo>
        <Campo rotulo="Usuário para entrar" erro={erro.login} dica="Sem espaço e sem acento. Ex.: maria, joao.caixa">
          {(p) => <input {...p} className="input" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value.toLowerCase().replace(/\s/g, '') })} autoCapitalize="none" required />}
        </Campo>
        <div className="campo">
          <label id="perfil-rotulo">Perfil</label>
          <div className="segmento" role="group" aria-labelledby="perfil-rotulo">
            <button type="button" aria-pressed={f.perfil === 'funcionario'} disabled={souEu} onClick={() => setF({ ...f, perfil: 'funcionario' })}>Funcionário</button>
            <button type="button" aria-pressed={f.perfil === 'admin'} onClick={() => setF({ ...f, perfil: 'admin' })}>Administrador</button>
          </div>
          <span className="dica">
            {f.perfil === 'admin'
              ? 'Acesso total: custos, lucro, relatórios e configurações.'
              : 'Vendas, comandas, pedidos e entregas. Sem custos nem relatórios.'}
          </span>
        </div>
        {novo && (
          <Campo rotulo="Senha provisória" erro={erro.nova_senha} dica="A pessoa cria a própria senha no primeiro acesso.">
            {(p) => (
              <InputSenha {...p} value={f.senha} onChange={set('senha')} required minLength={6} autoComplete="new-password"
                extra={<button type="button" className="btn btn-texto btn-icone" onClick={() => setF({ ...f, senha: senhaProvisoria() })} aria-label="Gerar outra senha" title="Gerar outra senha"><Dices size={18} /></button>} />
            )}
          </Campo>
        )}
        {!novo && !souEu && (
          <label className="interruptor">
            <input type="checkbox" checked={!!f.ativo} onChange={set('ativo')} />
            {f.ativo ? 'Acesso liberado' : 'Acesso bloqueado'}
          </label>
        )}
      </form>
    </Modal>
  )
}

function RedefinirSenha({ usuario, onFechar, onSalvo }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { if (usuario) { setSenha(senhaProvisoria()); setErro('') } }, [usuario])

  async function salvar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try { await post(`/usuarios/${usuario.id}/redefinir-senha`, { senha }); onSalvo() }
    catch (err) { setErro(err.message) }
    finally { setEnviando(false) }
  }

  return (
    <Modal
      titulo="Redefinir senha"
      aberto={!!usuario}
      onFechar={onFechar}
      rodape={<>
        <Botao variante="borda" type="button" onClick={onFechar}>Cancelar</Botao>
        <Botao form="form-redef" type="submit" carregando={enviando}>Redefinir senha</Botao>
      </>}
    >
      <form id="form-redef" className="grid-form" onSubmit={salvar}>
        <p>
          <strong>{usuario?.nome}</strong> vai entrar com esta senha provisória e criar uma nova.
          Se estiver logado em algum aparelho, a sessão é encerrada.
        </p>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Senha provisória">
          {(p) => (
            <InputSenha {...p} value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} autoComplete="new-password"
              extra={<button type="button" className="btn btn-texto btn-icone" onClick={() => setSenha(senhaProvisoria())} aria-label="Gerar outra senha" title="Gerar outra senha"><Dices size={18} /></button>} />
          )}
        </Campo>
      </form>
    </Modal>
  )
}
