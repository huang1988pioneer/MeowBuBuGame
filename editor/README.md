# 喵布布編輯器（Avalonia UI）

關卡／地圖／戰役／場景編輯器，匯出 JSON 供 HTML5 遊戲 `game.js` 載入。

## 需求

- [.NET 8 SDK](https://dotnet.microsoft.com/download) 或更新
- Windows / Linux / macOS

## 啟動

```bash
cd editor/MeowBuBu.Editor
dotnet run
```

或：

```bash
dotnet run --project editor/MeowBuBu.Editor
```

（請在含 `game.js` 的專案根目錄執行，以便自動偵測 `data/` 路徑。）

## 功能

| 分頁 | 用途 |
|------|------|
| **關卡／地圖** | 放置平台、敵人、魚、愛心、Boss、玩家出生點；縮放／平移；屬性面板 |
| **戰役** | 編輯關卡順序、對應 `state` / `levelId`、序章場景 ID |
| **場景／序章** | 編輯序章對白與背景 |

### 快捷鍵（關卡畫布聚焦時）

| 鍵 | 功能 |
|----|------|
| `1`–`7` / `0` | 選取 / 平台 / 敵人 / 魚 / 愛心 / Boss / 出生點 / 橡皮擦 |
| 滾輪 | 縮放 |
| 中鍵拖曳 | 平移 |
| `Delete` | 刪除選取 |
| `G` | 網格開關 |
| `Ctrl+F` | 重設視圖 |

## 資料格式（`data/`）

```
data/
  campaign.json          # 戰役流程
  levels/
    level1.json
    level2.json
    boss.json
  scenes/
    prologue.json
```

選單 **檔案 → 匯出到 data/** 會寫入上述結構。  
遊戲啟動時會 `fetch` 這些檔案；失敗則回退內建程序化關卡。

### 關卡 JSON 欄位

- `id`, `name`, `width`, `groundY`, `bg` (`forest`|`castle`|`boss`|…), `type` (`normal`|`boss`)
- `playerSpawn`: `{ x, y }`
- `platforms[]`: `{ x, y, w, h, oneWay }`
- `enemies[]` / `fish[]`: `{ x, y }`
- `hearts[]`: `{ x, y, heal }`（1 小 / 2 大）
- `boss`: `{ x, y }` 或 `null`

## 與遊戲整合

`game.js` 內 `CampaignData.load()` 會在素材載入時一併讀取 JSON，  
`loadLevelForState('LEVEL1'|'LEVEL2'|'BOSS')` 優先使用編輯器資料。
