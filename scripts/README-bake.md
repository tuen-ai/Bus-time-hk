# bake-static.mjs — 重新焗 `src/data/` 靜態 JSON

`src/data/` 入面嘅 `kmbGtfs / ctbGtfs / routeFares / planGraph / gmbRoutes / gmbData / nlbData / lrData`
全部由 [hkbus/hk-bus-crawling](https://github.com/hkbus/hk-bus-crawling) 嘅 `routeFareList.min.json`(gh-pages)抽出。
2026-06-27/28 第一次係人手焗;`scripts/bake-static.mjs` 令佢可以重複再生(Node 20+,零依賴)。

```sh
node scripts/bake-static.mjs                # 抓上游 → 寫 src/data/*.json(有保護,見下)
node scripts/bake-static.mjs --check        # 只計 diff 統計,唔寫;任何檔縮細 >20% → exit 1
node scripts/bake-static.mjs --from f.json  # 用本地上游檔(離線 / debug)
node scripts/bake-static.mjs --only kmbGtfs,ctbGtfs
node scripts/bake-static.mjs --out /tmp/x   # 寫落其他 folder(比較仍然對 src/data)
node scripts/bake-static.mjs --force        # 略過「縮細 >20%」保護(「某公司少過 min(50, 舊數一半) 條線」保護唔可以略過)
```

上游候選 URL(順序試,每個 2 次,90s timeout):

1. `https://data.hkbus.app/routeFareList.min.json`
2. `https://hkbus.github.io/hk-bus-crawling/routeFareList.min.json`
3. `https://raw.githubusercontent.com/hkbus/hk-bus-crawling/gh-pages/routeFareList.min.json`

## 映射規則(同 6 月 committed 檔一致)

| 檔                                | 來源                     | 規則                                                                                                                                            |
| --------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `kmbGtfs.json` / `ctbGtfs.json`   | `routeList[*].gtfsId`    | key `route\|bound[co]\|serviceType`;**所有**有 `bound[co]`+`stops[co]` 嘅 co 都出(聯營線兩邊都有);撞 key 先到先得;key 排序                      |
| `routeFares.json`                 | `routeList[*].fares`     | 只 kmb/ctb、只 **primary co**(第一間有效 co);值 `Number()`;上游順序                                                                             |
| `planGraph.json`                  | `routeList` + `stopList` | kmb/ctb/nlb/gmb/lightRail、只 primary co;`jt` → number/null,`s` → string;`stops` 只收有用到嘅站 `[lat,lng,zh]`;有站唔喺 `stopList` 嘅線整條跳過 |
| `gmbRoutes.json` / `gmbData.json` | co=gmb                   | `uid` = `gtfsId`(冇就跳過);`stops` `{n,lat,lng}`                                                                                                |
| `nlbData.json`                    | co=nlb                   | `id` = `nlbId`(冇就跳過);bound 照上游                                                                                                           |
| `lrData.json`                     | co=lightRail             | 站 id 統一三位數(`LR60` → `LR060`,前端同 `getSchedule` 註解都係用呢個格式);`route` 保留 `*` 後綴                                                |

「primary co」:上游聯營線(kmb+ctb)`co` 會列兩間,但 `planGraph` / `routeFares` 只出第一間,免行程規劃出兩條一樣嘅車。
上游有啲聯營線 `co` 列咗 kmb 但 `bound`/`stops` 只有 ctb,呢啲會當 ctb-only。

輸出全部 minified 單行、無尾 newline(同 committed 檔一樣)。因為係單行,git diff 一定係整行換;
`--check` 嘅 per-key 統計先係真正嘅 diff。物件 key 順序:gtfs 映射 / 站表排序,路線陣列跟上游順序。
(6 月 committed 檔嘅站表順序似係 hash 順序,唔可以重現;JS 本身會將純數字 key 排前,所以 nlb/gmb 站表無論如何都係數字排序。)

## 唔處理

- `lightRail.json`:`src/` 冇任何地方 import,而且有人手寫嘅 `_note`,當佢係參考檔。
- `mtrLines.json`、`hkDistricts.json`、`quotes.ts`:人手資料。

## 保護

- 上游 `routeList` < 1000 條 → 當唔完整,唔寫。
- 任何一間公司(committed 檔有嘅)上游少過 `min(50, committed 一半)` 條線 → 拒絕寫(唔可以 `--force`)。
- 任何檔 / 站表縮細 >20% → `--check` exit 1;寫檔模式拒絕,除非 `--force`。
