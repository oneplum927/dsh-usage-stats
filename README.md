# dsh-usage-stats

> 在 DeepSeek Harness 侧边栏的**账号行上方**增加「使用统计」入口，点击后查看本机历史 Token 用量：总量卡片、每日折线图、各模型折线图、各模型明细表。

一个零依赖、无构建步骤的 DSH 插件（bundle）。clone 下来即可安装使用。

---

## 目录

- [功能](#功能)
- [安装](#安装)
- [数据从哪来](#数据从哪来)
- [用量口径](#用量口径)
- [界面说明](#界面说明)
- [接口](#接口)
- [隐私](#隐私)
- [卸载与清零](#卸载与清零)
- [文件清单](#文件清单)
- [原理与实现要点](#原理与实现要点)
- [自定义](#自定义)
- [常见问题](#常见问题)

---

## 功能

| 区域 | 内容 |
|---|---|
| 侧边栏 | 「使用统计」入口，固定在账号行**上方**（`order: -10`），当前页高亮（`aria-current`），窄栏下自动收成 36×36 圆形图标 |
| 统计卡片 | 总 Token、计费输入、输出 Token、缓存命中、调用次数、会话数 —— 超长自动缩写（`K/M/B/T`），悬停显示精确值 |
| 每日折线图 | 按自然日的总 Token 合计（Fritsch–Carlson 单调三次样条，不过冲） |
| 各模型折线图 | 每个模型一条线；超过 5 个模型时自动折叠为「其他模型」（中性色 + 虚线），**同一张图内颜色两两不同** |
| 各模型用量表 | 模型 / 调用 / 总 Token / 计费输入 / 输出，窄屏可横向滚动 |
| 页脚元信息 | 统计范围（起止日期）、统计时间、跳过的不可读会话数 |

界面文案跟随 Harness 语言设置（中/英），跟随浅色/深色主题（只用 `--dsw-alias-*` 主题 token，无硬编码颜色）。

---

## 安装

先获取源码：`git clone <仓库地址>` 或直接下载 ZIP 解压到任意目录（路径可含中文和空格）。

### 方式一：侧边栏 Plugins 页（推荐）

侧边栏 → **Plugins** → **添加插件**，输入其一：

- 本地绝对路径，例如 `C:\tools\dsh-usage-stats`
- Git 地址
- npm 包名或 tarball

安装完成后按页面提示启用该 bundle。若结果提示需要重启，重启 DSH 即可。

### 方式二：让 agent 装

在 DSH 里对 agent 说「把 `<路径或 Git 地址>` 装成插件」，它会调用 `plugin_manager`：

```jsonc
{ "action": "install_bundle", "target": "C:\\tools\\dsh-usage-stats" }
```

`target` 必须是**解压后目录的绝对路径**。返回 `application: "applied"` 表示已即时生效；`restart-required` 表示要重启。

### ⚠️ 不要这样做

**不要手写 profile 的 `package.json` / `cordis.patch.yml`，也不要在 profile 目录里跑 `pnpm`。** 那两个文件由 DSH 自己管理（profile 的 `cordis.yml` 每次启动都会重写），手改会被覆盖或污染 profile 状态。`install_bundle` 会自己完成包安装和 bundle 选择，不要用 shell 步骤去复现它。

**依赖**：无。插件不装任何包，也没有 `node_modules` 或 lockfile。要求 DSH **0.2.0-rc.2** 或更高（依赖 `sessionQuery.readSession()` 与客户端的 `slots` / `layout` / `locale` 服务）。

---

## 数据从哪来

插件**不保存任何数据**，也没有数据库。它在打开页面时现场扫描会话日志并聚合：

```
点开「使用统计」
  → Host 遍历全部会话，读原始日志
  → 在内存中折叠 token 用量（总量 / 按模型 / 按天）
  → 返回 JSON → 页面渲染
  → 内存缓存 30 秒
```

原始数据是 Harness 自己的会话日志（zstd 压缩的 JSONL）：

```
%DSH_HOME%\sessions\<工作区>\<会话 ID>\session.v4.jsonl.zstd
```

`%DSH_HOME%` 默认是 `C:\Users\<你>\.dsh`。日志由 Harness 自己写入和维护，插件**只读**。

结果：**卸载插件不会丢任何数据；插件本身不占额外磁盘。**

---

## 用量口径

统计的唯一来源是每个 `assistant/message` 事件里 provider 上报的用量：

```
event.type === 'assistant/message'
  event.data.usage    = { inputTokens, outputTokens, totalTokens?, cacheReadTokens?, cacheWriteTokens?, reasoningTokens? }
  event.data.message.source = { provider, model }
  event.time          = 事件时间（epoch 毫秒），用于按天分组
```

几个容易误解的地方：

- **`inputTokens` 只统计未命中缓存的输入。** 所以「计费输入」= `inputTokens + cacheReadTokens + cacheWriteTokens`，卡片和表格里的这一列就是这个值。
- **单条总量优先取 provider 上报的 `totalTokens`**；provider 没给（值为 0）时，才用四项相加重算。两种情况都用同一个「有效总量」参与所有聚合，保证 `总 = Σ模型 = Σ天`。
- **按本地时区分天。** 跨零点的会话归到事件发生的那一天。
- **模型键是 `provider/model`**（例如 `deepseek-account/deepseek-flash`），缺失时记为 `unknown`。
- **`reasoningTokens` 不单独成列** —— 它已包含在 provider 上报的总量里，重复计会虚高。
- **读不出来的会话会被跳过并计数**，页脚显示「N 个会话日志无法读取，已跳过」，不会让整页失败。
- **日期轴上限 200 天**（`MAX_FILLED_DAYS`）；跨度更长时只保留实际有用量的日期点。

---

## 界面说明

- **超长数字**：`1.2M` 这种缩写形式，超过 11 个字符才缩写；悬停显示完整数字（`title`）。表格里始终是精确值。
- **图表悬停**：每个数据点下方有一个不可见的放大命中圈（`r=7`），悬停显示 `日期 · 模型名: 精确数字`；超过 60 个日期点时自动省略数据点（曲线仍在）。
- **坐标轴**：Y 轴 5 条网格线（0 / 25% / 50% / 75% / 100%），X 轴日期标签缩写成 `MM-DD` 并自动抽稀（保证不重叠）。
- **数字太多放不下**：卡片用 `repeat(auto-fit, minmax(148px, 1fr))` 自适应重排；表格容器 `overflow-x:auto` 可横向滚动；图表宽度 100% 自适应。
- **窄侧边栏**：入口自动变成圆形图标，保留 `aria-current` 高亮与 `aria-label`。
- **切换页面**：再次点击入口返回会话页（`selectPanel` 接受 `null` 回到 Conversation）。

---

## 接口

插件在已认证的 `/api` 通道上注册一条精确路由：

```
GET /api/usage-stats
GET /api/usage-stats?refresh=1     # 跳过 30 秒缓存，强制重新扫描
```

响应：

```jsonc
{
  "ok": true,
  "generatedAt": 1760000000000,        // 统计时间（epoch 毫秒）
  "scanned": {
    "sessions": 128,                    // 扫描到的会话数
    "unreadableSessions": 0,            // 读失败、已跳过的会话数
    "firstDay": "2026-01-03",           // 首个有用量的日期
    "lastDay": "2026-01-12"             // 最后有用量的日期
  },
  "totals": {
    "calls": 4120,
    "inputTokens": 4123000,             // 未命中缓存的输入
    "outputTokens": 903000,
    "cacheReadTokens": 71000000,
    "cacheWriteTokens": 1200000,
    "totalTokens": 77246000             // 有效总量
  },
  "models": [                            // 按总量降序，列全所有模型
    {
      "key": "deepseek-account/deepseek-flash",
      "calls": 3900,
      "inputTokens": 300000,
      "outputTokens": 850000,
      "cacheReadTokens": 69000000,
      "cacheWriteTokens": 1100000,
      "totalTokens": 71250000
    }
  ],
  "days": [ { "date": "2026-01-03", "totalTokens": 6100000 } ],
  "series": [                            // 最多 5 个独立 + 1 个 other
    { "key": "deepseek-account/deepseek-flash", "values": [6100000, 5800000] },
    { "key": "other", "other": true, "values": [0, 0] }
  ]
}
```

恒等式（每次聚合都成立）：`Σdays.totalTokens === Σmodels.totalTokens === totals.totalTokens`，每条 `series.values` 与日期轴等长。

失败时返回 `500` + `{ "ok": false, "error": "<消息>" }`；页面显示错误并提供「重试」。

并发去重：多个请求同时到达只会触发一次扫描（共享同一个 in-flight Promise）。

---

## 隐私

- **不产生任何 token 消耗** —— 插件不调用模型、不发请求给任何外部服务，只在本机读 Harness 自己写的日志。
- **不出网** —— 唯一的 HTTP 是页面自己请求本机的 `/api/usage-stats`。
- **不落盘** —— 没有缓存文件、没有数据库、没有遥测。
- **只读** —— 不修改、不删除、不重写会话日志。

唯一持久化的东西就是这个插件自己的文件：4 个源码 + 本 README。

---

## 卸载与清零

在 DSH 的 Plugins 页禁用或移除该 bundle 即可。侧边栏入口和页面消失，**会话日志完全不受影响**（插件本来就没碰过它们）。

想让统计归零，取决于你删什么：

| 目标 | 做法 |
|---|---|
| 让某个会话不计入 | 在 Harness 里归档该会话，然后点「刷新」 |
| 清空全部统计 | 归档/删除全部会话，然后点「刷新」 |
| 彻底清掉用量痕迹 | 先退出 DSH → 删除 `%DSH_HOME%\sessions\` → 重启 |

⚠️ 删 `%DSH_HOME%\sessions\` 会同时删掉**所有历史会话对话记录**，不只是统计。运行中的 DSH 正对这些文件追加写，手删有损坏风险 —— 一定要先退出应用。

归档后统计不会立刻变，因为有 30 秒缓存；点页面上的「**刷新**」会带 `?refresh=1` 立即重算。

---

## 文件清单

```
dsh-usage-stats/
├── package.json         649 B    包名、exports、客户端注入声明
├── cordis.patch.yml     181 B    插件入口注册
├── index.js           7,823 B    Host 半包：扫描 + 聚合 + HTTP 路由
├── client.js         25,659 B    Client 半包：入口 + 页面 + 内联 CSS
└── README.md         15,233 B    本文件
```

源码共 **34,312 B（约 34 KB）**，无构建、无依赖、无 `node_modules`、无 lockfile。

---

## 原理与实现要点

给想改代码的人：

**双半包结构。** `index.js` 在 Host（Node）侧跑，`client.js` 在浏览器侧跑，由 `package.json` 的 `dsh.client.platform: "web"` + `dsh.bundle.patch` 串起来。

**Host 侧**（`index.js`）

- `export const inject = ['connection']`，在 `apply(ctx)` 里用 `ctx.connection.fetch.register()` 注册路由 —— 这是普通 bundle 的正确做法（`host.call` 只对 dynamic 插件闭包有效）。
- 路由 `path` 里的每一段必须匹配 `^[A-Za-z0-9_$.-]+$`，所以用 `/api/usage-stats` 而不是带斜杠的子路径。
- 用 `ctx.get('sessionQuery')` → `listSessions()` + `readSession(id)` 拿**完整原始日志**。注意：`listEvents` / `filterEvents` 拿不到 `data` 字段，`readSurface` 会漏掉被 compaction 遮蔽的用量 —— 只有 `readSession` 完整。
- 30 秒内存缓存 + in-flight 去重；`?refresh=1` 强制重算。

**Client 侧**（`client.js`）

- 手写 `window.__ModuleLoader__.load({ id, factory })`，工厂返回 `{ inject, apply }`。
- **只 `require('react')`**，用 `React.createElement`（无 JSX）。不 import 任何 `@deepseek-ai/dsh-client-ui-*`：官方明确说这些包可能随版本变化，一旦组件抛错会**静默让插槽条目变空白**。
- `inject = ['slots', 'layout', 'locale']`。
- 插槽：`ctx.slots.inject('main', …)` 注册 keyed 面板（key `usage-stats`），`ctx.slots.inject('sidebar.footer.action', …)` 注册侧边栏条目（`order: -10`）。
- 翻译：`ctx.locale.register('usageStats', { zh, en })`，`zh` 是 key 集合的事实来源，`en` 按它对齐；`t` 用 `typeof props.t === 'function' ? props.t : (key) => key` 兜底，避免 locale 服务没就绪时抛错。
- 样式：内联 CSS 数组 → 运行时注入一个 `<style>`，用 `data-plugin-css` 标记 identity，重载时先复用/后清理。颜色一律用 `--dsw-alias-*` token，跟随主题。
- SVG 折线用 Fritsch–Carlson 单调三次样条（切线斜率按邻段斜率钳制，**不会在采样点之间凭空冲出数据范围**，平滑不造值）；`stroke` 走 `style={{ stroke }}` 而不是 presentation attribute。
- 滚动列的子元素必须 `flex: none`（否则 Flexbox 会压缩它们，`min-height: auto` 只对 `overflow: visible` 生效 —— 这是本插件踩过的一个真实回归）。

---

## 自定义

**改颜色**：`client.js` 里的 `SERIES_COLORS`（5 个主题 token）+ `OTHER_COLOR`。长度必须和 Host 的 `MAX_SERIES` 对齐，否则两条线会撞色。

**改折线数量上限**：同时改 `index.js` 的 `MAX_SERIES` 和 `client.js` 的 `SERIES_COLORS` 长度。

**改缓存时长**：`index.js` 的 `DEFAULT_CACHE_MS`（默认 `30_000`）。

**改天数上限**：`index.js` 的 `MAX_FILLED_DAYS`（默认 `200`）。

**改文案**：`client.js` 的 `zh` / `en` 两个字典（key 必须一一对应）。

**换包名**：三处必须同步改 —— `package.json` 的 `name`、`cordis.patch.yml` 的 `name:`、`client.js:13` 的 `id`（建议连 `client.js:25` 的 `CSS_ID` 一起改）。改完重装 bundle。

**加卡片 / 加表列**：在 `client.js` 的 `UsagePage` 里加 —— 卡片加进 `cards` 数组，表格加 `<th>` 和对应的 `<td>`；底层数字在 Host 的 `emptyBucket()` 里加字段。

改完记得重启 DSH（或用 `plugin_manager set_bundle` 关/开强制重新发布）—— HMR 只监听 `cordis.patch.yml`，不监听模块文件。

---

## 常见问题

**Q：会消耗 token 吗？**
不会。插件不调用模型，只在本机读日志。

**Q：统计的数据存在哪？**
插件不存。数据源是 `%DSH_HOME%\sessions\` 下 Harness 自己的会话日志，统计是现场算的（结果只在内存缓存 30 秒）。

**Q：怎么清零 / 删除统计？**
见上面 [卸载与清零](#卸载与清零) 的表格。核心：插件不存数据，所以删会话日志才会变。

**Q：数字太大显示不下？**
自动缩写成 `K/M/B/T`（4 位有效数字 + 1 个单位字母），超 11 个字符才缩写，悬停看精确值；卡片网格自适应重排，表格可横向滚动。

**Q：第一次打开很慢？**
首次要扫描全部会话日志，几秒属正常。之后 30 秒内走缓存，点「刷新」强制重算。

**Q：图表上某个点没有 tooltip？**
超过 60 个日期时会省略圆点（曲线不受影响）。有圆点时，悬停显示 `日期 · 模型名: 精确数字`。

**Q：为什么某个模型不画线？**
折线图最多画 5 个模型（按总量前 5），其余合并成「其他模型」（灰色虚线）。**表格里仍然列全所有模型**，不会丢数据。

**Q：某些会话没被统计？**
页脚会显示「N 个会话日志无法读取，已跳过」。通常是日志正在写入或已损坏，不影响其余统计。

**Q：怎么改主题色 / 深色模式有问题？**
所有颜色都走 `--dsw-alias-*` token，自动跟随主题。如果你改了 `SERIES_COLORS` 用了硬编码颜色，深色模式下可能看不清。

**Q：能在多台机器/多账号之间合并统计吗？**
不能。统计范围就是本机 `%DSH_HOME%` 下的会话日志。

**Q：安全吗？**
插件只做两件事：读本机会话日志、在已认证的 `/api` 通道上返一个聚合数字。不写任何文件，不联网。

---

## 许可

MIT