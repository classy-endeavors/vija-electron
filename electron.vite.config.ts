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
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          preload: resolve('src/preload/preload.ts'),
          overlayPreload: resolve('src/preload/overlayPreload.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [react(), electronRendererStripCrossorigin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/main-window')
      }
    }
  }
})
