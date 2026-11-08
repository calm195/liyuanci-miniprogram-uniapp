import type { ContentSearch } from '@/types/content'

export function contentSearchParams(search: ContentSearch): string {
  const keyword = search.keyword?.trim()
  return [
    ...(keyword ? ['keyword=' + encodeURIComponent(keyword)] : []),
    ...(search.sort ? ['sort=' + search.sort] : []),
  ].join('&')
}
