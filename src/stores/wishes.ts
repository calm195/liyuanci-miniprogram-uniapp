import { ref } from 'vue'
import { defineStore } from 'pinia'
import { config } from '@/config'
import type { WishInput, WishResult } from '@/types/wish'
import { validateWish } from '@/utils/wish'

// 合成业务数据仅驻内存，与真实接口列表和资格完全隔离。
export const useWishStore = defineStore('wishes', () => {
  const demoWishes = ref<WishResult[]>([])
  let sequence = 0
  function save(input: WishInput, id?: string) {
    if (!config.useMock) throw new Error('合成操作仅在开发演示可用')
    const error = validateWish(input)
    if (error) throw new Error(error)
    const existing = demoWishes.value.find((wish) => wish.id === id)
    if (existing && !['draft', 'rejected'].includes(existing.current_state))
      throw new Error('当前状态不可编辑')
    const wish: WishResult = {
      id: existing?.id || `synthetic-wish-${++sequence}`,
      version: (existing?.version || 0) + 1,
      content_version: (existing?.content_version || 0) + 1,
      current_state: 'draft',
      allowed_actions: [],
      own_content: { ...input },
    }
    if (existing) demoWishes.value.splice(demoWishes.value.indexOf(existing), 1, wish)
    else demoWishes.value.unshift(wish)
    return wish
  }
  function transition(id: string, action: 'submit' | 'approve' | 'reject' | 'publish' | 'delete') {
    if (!config.useMock) throw new Error('合成操作仅在开发演示可用')
    const wish = demoWishes.value.find((item) => item.id === id)
    if (!wish) return
    if (action === 'delete' && wish.current_state === 'draft') {
      demoWishes.value = demoWishes.value.filter((item) => item.id !== id)
      return
    }
    if (action === 'submit' && ['draft', 'rejected'].includes(wish.current_state)) {
      wish.current_state = 'pending_review'
      wish.review_result = { decision: 'pending', content_version: wish.content_version! }
    } else if (
      (action === 'approve' || action === 'reject') &&
      wish.current_state === 'pending_review'
    ) {
      wish.current_state = action === 'approve' ? 'ready' : 'rejected'
      wish.review_result = {
        decision: action === 'approve' ? 'approved' : 'rejected',
        content_version: wish.content_version!,
        ...(action === 'reject'
          ? {
              reason: '合成原因：内容需要修改',
              revision_suggestion: '合成建议：补充清晰具体的需求',
            }
          : {}),
      }
    } else if (action === 'publish' && wish.current_state === 'ready') {
      if (demoWishes.value.filter((item) => item.current_state === 'published').length >= 3)
        throw new Error('合成演示：同时上架心愿已满 3 条，保持待上架')
      wish.current_state = 'published'
      wish.public = {
        id: wish.id,
        body: wish.own_content!.body,
        content_version: wish.content_version!,
        school_related: false,
        notice_codes: [],
        notice_text: '',
        category: wish.own_content!.category,
        campus: wish.own_content!.campus,
      }
    } else {
      throw new Error('当前状态不允许此操作')
    }
    wish.version++
  }
  return { demoWishes, save, transition }
})
