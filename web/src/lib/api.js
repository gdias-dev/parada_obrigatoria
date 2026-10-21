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
