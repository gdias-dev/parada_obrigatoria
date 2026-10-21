// Cliente da API. O token fica no localStorage do aparelho.
const TOKEN_KEY = 'parada.token'

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t) } catch {} },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY) } catch {} },
}

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.erro || 'Não foi possível concluir. Verifique a conexão.')
    this.status = status
    this.data = data || {}
  }
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { Accept: 'application/json' }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(`/api${path}`, { method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError(0, { erro: 'Sem conexão com o servidor. Verifique a internet.' })
  }

  let data = null
  try { data = await res.json() } catch {}

  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') onUnauthorized()
    throw new ApiError(res.status, data)
  }
  return data
}

export const get = (p, o) => api(p, o)
export const post = (p, body) => api(p, { method: 'POST', body })
export const put = (p, body) => api(p, { method: 'PUT', body })
export const del = (p) => api(p, { method: 'DELETE' })

/** Baixa um arquivo da API (com o login) e salva no aparelho. */
export async function baixarArquivo(path, nomePadrao) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } }).catch(() => null)
  if (!res) throw new ApiError(0, { erro: 'Sem conexão com o servidor. Verifique a internet.' })
  if (!res.ok) {
    let data = null
    try { data = await res.json() } catch {}
    if (res.status === 401) onUnauthorized()
    throw new ApiError(res.status, data)
  }
  const nome = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || nomePadrao
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: nome })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return { nome, tamanho: blob.size }
}
