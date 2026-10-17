// T009 / REQ-002、018：真实会话仅留内存，合成身份不能进入请求头。
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
