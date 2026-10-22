// Reduz a foto no próprio aparelho antes de enviar (foto de celular tem 3–8 MB; vira ~100 KB).
export async function reduzirImagem(arquivo, lado = 1000, qualidade = 0.82) {
  if (!/^image\//.test(arquivo.type)) throw new Error('Escolha um arquivo de imagem (foto).')
  let bitmap
  try {
    bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
  } catch {
    // navegadores antigos: carrega por <img>
    bitmap = await new Promise((ok, erro) => {
      const img = new Image()
      img.onload = () => ok(img)
      img.onerror = () => erro(new Error('Não foi possível abrir esta foto. Tente outra (JPG ou PNG).'))
      img.src = URL.createObjectURL(arquivo)
    })
  }
  const w = bitmap.width, h = bitmap.height
  const esc = Math.min(1, lado / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * esc)
  canvas.height = Math.round(h * esc)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', qualidade))
  if (!blob) throw new Error('Não foi possível preparar a foto.')
  return blob
}
