import pako from 'pako'

function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * Splits an array into smaller chunks.
 */
function chunkArray(array, chunkSize) {
  const chunks = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

/**
 * Compresses JSON objects in chunks properly.
 */
export function zipJSONChunks(objects, chunkSize = 1000) {
  const chunks = chunkArray(objects, chunkSize)
  return chunks.map((chunk, index) => {
    const jsonString = JSON.stringify(chunk)
    const originalSize = new TextEncoder().encode(jsonString).length / (1024 * 1024) // Original size in bytes

    const compressed = pako.deflate(jsonString) // Returns Uint8Array
    const compressedBase64 = btoa(arrayBufferToBase64(compressed))
    const compressedSize = new TextEncoder().encode(compressedBase64).length / (1024 * 1024) // Compressed size in bytes

    console.log(
      `Chunk ${
        index + 1
      }: Original Size = ${originalSize} MB, Compressed Size = ${compressedSize} MB`
    )

    return compressedBase64
  })
}

/**
 * Decompresses JSON chunks properly.
 */
export function unzipJSONChunks(compressedChunks) {
  return compressedChunks.flatMap((compressedStr) => {
    const binaryString = atob(compressedStr) // Decode from Base64
    const byteArray = base64ToArrayBuffer(binaryString)

    const decompressed = pako.inflate(byteArray, { to: 'string' })
    return JSON.parse(decompressed)
  })
}

/**
 * Decompresses a single JSON chunk properly.
 */
export function unzipJSONChunk(compressedChunk) {
  const binaryString = atob(compressedChunk) // Decode from Base64
  const byteArray = base64ToArrayBuffer(binaryString)

  const decompressed = pako.inflate(byteArray, { to: 'string' })
  return JSON.parse(decompressed)
}
