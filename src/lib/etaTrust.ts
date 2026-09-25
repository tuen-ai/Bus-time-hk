// 班次可信度:將營辦商 rmk_tc 轉做細標籤(🕒 預定 / 🌙 尾班車),其他備註(月台、已開出…)照原文顯示。
// 實時(有 GPS)嘅班次唔加標籤。rmk_tc 寫法冇官方文件,認錯頂多少一個標籤。

export type EtaTag = 'sched' | 'last'

export interface EtaTrust {
  tags: EtaTag[]
  /** 認完標籤之後仲剩低嘅備註(冇就空字串) */
  rest: string
}

// 九巴「原定班次」、城巴 / 小巴「預定班次」、「非實時班次」、嶼巴 noGPS(bus.ts 轉咗做「預定班次」)
const SCHED = /(?:原定|預定|非實時)(?:班次)?/
// 「最後班次」「尾班車」「尾班」
const LAST = /最後班次|尾班車?/
// 頭尾淨係分隔符就剪走
const EDGE_SEP = /^[\s,，、;；·/|()（）]+|[\s,，、;；·/|()（）]+$/g

export function etaTrust(rmk: string | null | undefined): EtaTrust {
  let rest = (rmk ?? '').trim()
  const tags: EtaTag[] = []
  // split + join = 全部替換(regex 唔使加 g,冇 lastIndex 陷阱)
  if (SCHED.test(rest)) {
    tags.push('sched')
    rest = rest.split(SCHED).join(' ')
  }
  if (LAST.test(rest)) {
    tags.push('last')
    rest = rest.split(LAST).join(' ')
  }
  return { tags, rest: rest.replace(/\s+/g, ' ').replace(EDGE_SEP, '') }
}
