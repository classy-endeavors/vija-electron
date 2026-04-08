import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/** Vite adds `crossorigin` to built assets; with `loadFile()` (file://) that often blocks ES module loads in Electron → blank window. */
function electronRendererStripCrossorigin(): Plugin {
  return {
    name: 'electron-renderer-strip-crossorigin',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/\s+crossorigin(?:=["']anonymous["'])?/g, '')
      }
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), electronRendererStripCrossorigin()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer')
      }
    }
  }
})
