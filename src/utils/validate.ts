/** 中国大陆手机号码的基础格式校验，不代表号码已开通。 */
export const isPhone = (value: string): boolean => /^1[3-9]\d{9}$/.test(value)
export const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
export const isPassword = (value: string): boolean => value.length >= 8 && value.length <= 32
