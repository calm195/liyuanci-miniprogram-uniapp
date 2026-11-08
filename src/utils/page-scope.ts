// 同时绑定页面代次、会话和主体；离页或换会话后旧请求不能回填界面。
export function pageTicket(
  visible: () => boolean,
  generation: () => number,
  epoch: () => number,
  owner: () => unknown = () => undefined,
): () => boolean {
  const started = generation()
  const session = epoch()
  const subject = owner()
  return () => visible() && started === generation() && session === epoch() && subject === owner()
}
