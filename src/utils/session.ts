import { ref } from 'vue'

// 真实会话令牌仅保存在内存中，合成身份不得用于接口认证。
let token = ''
const epoch = ref(0)
export const session = {
  getToken: () => token,
  getEpoch: () => epoch.value,
  setToken(value: string) {
    token = value
    epoch.value++
  },
  clear() {
    token = ''
    epoch.value++
  },
}
