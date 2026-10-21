import {
  Home, ShoppingCart, ClipboardList, Globe, Bike, Package, Users, UserRound,
  BarChart3, CreditCard, Settings, ShieldCheck, Wallet,
} from 'lucide-react'

// pronto: false = módulo das próximas etapas (aparece como "em breve")
// admin: true = só o administrador vê
export const MENU = [
  {
    grupo: 'Operação',
    itens: [
      { para: '/', rotulo: 'Início', icone: Home, pronto: true },
      { para: '/pdv', rotulo: 'Vender (PDV)', icone: ShoppingCart, pronto: true },
      { para: '/comandas', rotulo: 'Comandas', icone: ClipboardList, pronto: true },
      { para: '/pedidos', rotulo: 'Pedidos online', icone: Globe, pronto: true },
      { para: '/entregas', rotulo: 'Entregas', icone: Bike, pronto: true },
      { para: '/caixa', rotulo: 'Caixa', icone: Wallet, pronto: true },
    ],
  },
  {
    grupo: 'Cadastros',
    itens: [
      { para: '/produtos', rotulo: 'Produtos e estoque', icone: Package, pronto: true },
      { para: '/clientes', rotulo: 'Clientes e fiado', icone: UserRound, pronto: true },
      { para: '/entregadores', rotulo: 'Entregadores', icone: UserRound, pronto: true, admin: true },
    ],
  },
  {
    grupo: 'Gestão',
    itens: [
      { para: '/relatorios', rotulo: 'Relatórios', icone: BarChart3, admin: true, pronto: true },
      { para: '/pagamentos', rotulo: 'Formas de pagamento', icone: CreditCard, pronto: true, admin: true },
      { para: '/usuarios', rotulo: 'Usuários', icone: ShieldCheck, pronto: true, admin: true },
      { para: '/loja', rotulo: 'Dados da loja', icone: Settings, pronto: true, admin: true },
    ],
  },
]

export function menuDoUsuario(isAdmin) {
  return MENU.map((g) => ({ ...g, itens: g.itens.filter((i) => isAdmin || !i.admin) })).filter((g) => g.itens.length)
}

export const todosItens = MENU.flatMap((g) => g.itens)
export { Users }
