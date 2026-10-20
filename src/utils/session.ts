// 真实会话令牌仅保存在内存中，合成身份不得用于接口认证。
let token = ''
let epoch = 0
export const session = {
  getToken: () => token,
  getEpoch: () => epoch,
  setToken(value: string) {
    token = value
    epoch++
  },
  clear() {
    token = ''
    epoch++
  },
}
