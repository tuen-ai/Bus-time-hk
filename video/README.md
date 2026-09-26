# 可可出行 · 公仔 / UI 動畫預覽片(Remotion)

用 [Remotion](https://www.remotion.dev/) 砌嘅預覽片:升級版原創熊貓 + 啡熊(眨眼、耳仔、揮手、跳、天氣 / 夜晚表情)
同 App UI 動畫(卡片彈入、頁面滑動、「最近你」chip、班次逐行滑入、車就到提示)。

**唔屬於 app build**(app 入面會用輕量 CSS / SVG 做同一套動作,唔會孭 Remotion)。

```bash
cd video
npm install
npm run studio   # 瀏覽器即時預覽 / 調參數
npm run render   # 輸出 out/koko-preview.mp4
```

> Remotion 對個人 / 3 人或以下公司免費;公司規模大過呢個要買 company license。
