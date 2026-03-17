import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 自动检测 mkcert 生成的本地证书（用于局域网 HTTPS，启用 showSaveFilePicker 等 API）
// 生成方式：brew install mkcert && mkcert -install && mkcert localhost 127.0.0.1 ::1 你的局域网IP
function detectLocalCert() {
  const certDir = path.resolve(__dirname)
  const certFiles = [
    { key: 'localhost+3-key.pem', cert: 'localhost+3.pem' },
    { key: 'localhost-key.pem', cert: 'localhost.pem' },
  ]
  for (const { key, cert } of certFiles) {
    const keyPath = path.join(certDir, key)
    const certPath = path.join(certDir, cert)
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
    }
  }
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    https: detectLocalCert(),
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
})
