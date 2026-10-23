import { Component } from 'react'

/** Se alguma tela falhar, mostra um aviso com botão em vez de deixar a tela branca. */
export default class ErroTela extends Component {
  state = { erro: null }
  static getDerivedStateFromError(erro) { return { erro } }
  componentDidCatch(erro, info) { console.error('[parada] erro na tela:', erro, info?.componentStack) }
  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="erro-tela" role="alert">
        <h1>Algo deu errado nesta tela</h1>
        <p>Seus dados estão salvos. Toque no botão para voltar ao início.</p>
        <button className="btn btn-primario" onClick={() => { window.location.href = '/' }}>Voltar ao início</button>
        <small>{String(this.state.erro?.message || this.state.erro)}</small>
      </div>
    )
  }
}
