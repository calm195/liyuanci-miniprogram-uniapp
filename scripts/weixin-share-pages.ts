import { isUniPageSfcFile } from '@dcloudio/uni-cli-shared'
import { MagicString, parse } from 'vue/compiler-sfc'
import type { Plugin } from 'vite'

/** 给微信页面统一安装分享入口。组件和 H5 继续使用各自原来的生命周期。 */
export function weixinSharePages(): Plugin {
  return {
    name: 'weixin-share-pages',
    enforce: 'pre',
    apply: () => process.env.UNI_PLATFORM === 'mp-weixin',
    transform(source, id) {
      if (id.startsWith('uniPage://')) {
        const call = 'wx.createPage(MiniProgramPage)'
        if (!source.includes(call)) this.error(`未识别微信页面注册入口：${id}`)
        return `import { withPageShare } from '@/utils/weixin-page-share'\n${source.replace(call, 'wx.createPage(withPageShare(MiniProgramPage))')}`
      }
      if (!id.endsWith('.vue') || !isUniPageSfcFile(id)) return
      const { template, scriptSetup } = parse(source, { filename: id }).descriptor
      if (!template || !scriptSetup) this.error(`微信页面缺少模板或 setup：${id}`)
      const page = new MagicString(source)
      page.appendLeft(
        scriptSetup.loc.start.offset,
        "\nimport BrandSharePreview from '@/components/BrandSharePreview.vue'\n",
      )
      // 原生 view 上的 wx:if 直接写入 WXML。微信在 onLoad 确认模式前不挂载任一视图。
      page.appendLeft(
        template.loc.start.offset,
        `<view wx:if="{{shareView === 'brand'}}"><BrandSharePreview /></view>
<view wx:if="{{shareView === 'page'}}">`,
      )
      page.appendLeft(template.loc.end.offset, '</view>')
      return { code: page.toString(), map: page.generateMap({ hires: true }) }
    },
  }
}
