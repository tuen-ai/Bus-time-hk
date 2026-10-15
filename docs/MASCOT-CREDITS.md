# 公仔素材來源 / 版權

## 熊貓 + 啡熊(預設)

原創 SVG(`src/components/Mascots.tsx`),本 repo 自家設計。

## 長草顏團子(Budding Pop / 長草くん)—— 預覽,素材唔入 git

- 角色版權:北京十二栋文化傳播有限公司(长草颜团子 / Budding Pop);日本由 Mini Factory 代理(官方網站 https://www.nagakusakun.com/)。
- **冇搵到官方 GIPHY / Tenor 頻道**;官方動態貼圖喺 LINE / 微信 / QQ 貼圖商店(付費,只授權喺該 app 內使用)。
- 以下動圖來自 **Tenor 用家上載(非官方)**,Tenor 條款只容許經 Tenor 分享,**冇授權重新托管 / 放入第三方 app**:

| 檔案                   | 動作                              | Tenor 頁面                                                                       | 上載者      |
| ---------------------- | --------------------------------- | -------------------------------------------------------------------------------- | ----------- |
| `kaodango-wave.webp`   | 揮手 hello(歡迎頁 / 首頁問候)     | https://tenor.com/view/budding-pop-cute-adorable-blush-leaf-gif-15514789         | PenelopeSim |
| `kaodango-dance.webp`  | 左右跳舞(載入中)                  | https://tenor.com/view/leaf-budding-pop-dancing-left-and-right-cute-gif-15514752 | PenelopeSim |
| `kaodango-cry.webp`    | 喊(搵唔到嘢 / 出錯)               | https://tenor.com/view/budding-pop-leaf-crying-tears-sad-gif-15515903            | PenelopeSim |
| `kaodango-sleepy.webp` | 打喊露(夜晚 23:00–05:00 首頁問候) | https://tenor.com/view/budding-pop-leaf-yawn-sleepy-cute-gif-15514705            | PenelopeSim |

因此 `public/mascots/` 已加入 `.gitignore`:**唔好 commit、唔好部署**。本機預覽:

```bash
node scripts/fetch-kaodango.mjs   # 下載去 public/mascots/(動態 webp + 靜態 png)
npm run dev                       # 設定 ⚙️ → 剔「公仔換做長草顏團子(預覽)」
```

素材唔喺度(例如 GitHub Pages)揀咗團子都會自動用返熊貓啡熊。
要正式上線,需要向版權方取得授權(或者改用官方提供、明確容許嵌入嘅素材)。
