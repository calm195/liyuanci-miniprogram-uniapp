import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

// DCloud 插件使用 CommonJS；显式读取 default，兼容 ESM 配置。
const require = createRequire(import.meta.url)
const uni = require('@dcloudio/vite-plugin-uni')
  .default as typeof import('@dcloudio/vite-plugin-uni').default
const projectRoot = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    uni(),
    // 小程序不能直接使用浏览器 CSS，插件负责转换选择器与尺寸单位。
    WeappTailwindcss({
      cssEntries: [resolve(projectRoot, 'src/styles/tailwind.css')],
      cssOptions: { rem2rpx: true },
    }),
  ],
  resolve: { alias: { '@': resolve(projectRoot, 'src') } },
})
