import { useLogin } from '@/composables/use-login'
import type { useWhisperPage } from '@/composables/use-whisper-page'
import type { PublicPost } from '@/types/whispers'
import { session } from '@/utils/session'
import { canWhisperAction, whisperKey } from '@/utils/whispers'

export function useWhisperHug(
  page: ReturnType<typeof useWhisperPage>,
  find: (id: string) => PublicPost | null | undefined,
  update: (post: PublicPost, wasActive: boolean) => void,
  reload: () => Promise<void>,
) {
  const { requestLogin } = useLogin()
  async function toggle(id: string) {
    const target = find(id)
    if (!target || target.viewer_is_author) return
    if (!session.getToken()) {
      requestLogin(async () => {
        await reload()
        if (find(id) && session.getToken()) await toggle(id)
      })
      return
    }
    const hug = target.my_hug
    if (!hug || !canWhisperAction('PublicPost', target, 'whisperHugSet')) return
    await page.write(
      'whisperHugSet',
      {
        path: { post_id: id },
        data: {
          active: !hug.active,
          expected_post_version: target.version,
          expected_hug_version: hug.version,
        },
        key: whisperKey(),
      },
      (result) => {
        const current = find(id)
        if (result.post_id !== id || !current) throw new Error('抱抱回执目标不匹配，请刷新。')
        // 列表和详情均以服务端回执为准，返回列表时重新读取，避免两个页面自行累加。
        update({ ...current, hug_count: result.hug_count, my_hug: result.my_hug }, hug.active)
        page.notice.value = result.my_hug.active ? '已送出抱抱。' : '已取消抱抱。'
      },
      reload,
    )
  }

  return toggle
}
