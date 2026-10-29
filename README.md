# KET 单词岛

给小学生的剑桥 A2 Key（KET）背词应用：按官方词表、按话题岛屿学习，每个词分“认识 / 听懂 / 会拼”三项独立记忆，用 FSRS 间隔复习，答题自动评分。

```bash
npm install
npm run dev      # http://localhost:5199
npm test
npm run build
```

## 离线与安装

正式构建（`npm run build`）带 Service Worker（`public/sw.js`）和 Web App Manifest：平板浏览器里“添加到主屏幕”后像 App 一样全屏打开，图标是小狗 Max。

- 程序本身首次访问即缓存，之后没有网络也能打开
- 词库数据联网时取最新、离线时用缓存，新岛屿上线后自动拿到
- 图片和录音用到时缓存；家长中心“离线使用”可一次下载全部（约 1200 个文件、16 MB）
- 开发模式（`npm run dev`）不注册 Service Worker，以免缓存挡住修改
- 部署在子路径时（`KET_BASE=/ket/ npm run build`）缓存路径会跟着变

## 学习模型

- **每日计划**：先复习到期的词（覆盖所有已开放岛屿，换岛不会丢下旧词），再从当前岛学新词（默认 8 个）。复习每天有上限（默认 30，含当天已做的），积压时暂停新词，避免几天没学后被几百个复习吓退。
- **新词**：4 个一组。先“初见”（插画、发音、音节拆分、例句、跟读录音），再玩一轮不计分的图词配对游戏，然后打乱顺序看图回忆。听音题和拼写题可用 🐢 慢速重听。
- **三项技能**：认识（看图/选中文）→ 第二天起解锁听音辨词 → 词义进入长期记忆后解锁字母块拼写。三项各自一张 FSRS 卡片，家长能看出孩子是“认识但不会拼”还是“会拼但听不出”。
- **自动评分**：答错 → Again；答对但慢、用提示或拼错一次 → Hard；答对 → Good；拼写又快又准 → Easy。“慢”的阈值按年龄放宽。孩子不需要自己给自己打分。
- **只有首次作答计分**：答错的词隔 3 题换一种题型再练（最多 2 次），重试不计分。
- **公平的干扰项**：内容文件里的 `confusable` 组（如 plate / dish / bowl、dog / puppy）互不作为错误选项，避免图片本身分不清的题。
- **岛屿故事**：每座岛有几篇 3 页的小故事（`content/stories/`），主角是 Lily 和 Max。故事里本岛的单词都学过后解锁；阅读时可以点任何学过的词看卡片，或让应用朗读并逐词高亮；读完有 3 道理解题（判断对错、三选一），第一次读完得 5 ⭐ 加答对题数。故事不计入单词记忆，只是又一次和学过的词见面。
- **一词多义**：内容里给多义词列出义项（`senses`），本岛教的意思在前；意思不相关又都要考的（can 罐头 / 能，break，Miss，light）另有一张"新意思卡"（`can.2`），原意思进入长期记忆后才解锁。
- **掌握**：稳定度 ≥ 21 天（三周后仍有约 90% 把握）。三项都掌握 = 金卡。

## 数据流程

```
.local/source/a2-key-vocabulary-list-2025.pdf   官方词表（不入库，从 cambridgeenglish.org 下载）
  └─ scripts/ket/parse_wordlist.py  → data/ket-wordlist.json   词条、词性、例句、英美变体、25 个话题、词组集合
      └─ scripts/ket/build_words.py → data/ket-words.json      规范化（展开 yog(h)urt、a/an，合并重复），标注话题，匹配 Word Atlas
                                    → data/coverage.md         复用与缺口报告
content/topics/<topic>.json          人工审校的儿童内容：中文释义、音节、例句（固定角色 Lily 和小狗 Max）
content/media/svg/<id>.svg           手绘矢量插画（Word Atlas 色板与构图），补 Word Atlas 缺失或不可用的图
  └─ scripts/ket/render_svg.mjs     → content/media/img/       渲染为 512px WebP，统一叠加纸张颗粒质感（需本机 Chrome）
  └─ scripts/ket/gen_comfy.py       → .local/gen/qwen-image/ → content/media/ai/    局域网生图机上的 ComfyUI（Qwen-Image 2512，儿童绘本风格，固定角色形象）按 scene 字段出候选图，--sheet 出联系表人工挑选，--pick 放入，构建时优先于手绘版；新内容攒一批后用 --missing 统一出图
  └─ scripts/ket/gen_images.py      → content/media/ai/        可选：用 OpenAI 兼容的图像 API 生成
scripts/ket/gen_mascot.py           → public/media/ui/         吉祥物小狗 Max 的表情与成长阶段（同一套 Qwen-Image 设置），人工挑选后 --pick 放入
scripts/ket/gen_audio.py            → public/media/sent/       例句录音：局域网 Higgs Audio 合成，Whisper 逐句核对，不合格换种子重录（最多 5 次）
scripts/ket/check_sentences.py      （构建时自动运行）           例句和故事的用词都在 KET 词表内、每个词都有能挖空的句子
content/stories/<id>.json           岛屿故事：页面文字、插图描述（gen_comfy.py 按 story-<id>-<页> 出图）、理解题
  └─ scripts/ket/build_app_data.py  → public/data/             应用数据（自有插画优先于 Word Atlas）
                                    → public/media/            Word Atlas 插画与发音（缓存在 .local/media）
```

话题匹配允许话题表里的复数对应单数词条（shoes → shoe），但复数本身是独立词条时不算（news、shorts）；PDF 未归类或拆分有误的短语在 `build_words.py` 的 `FORMS_OVERRIDE`、`TOPIC_EXTRA` 里手工指定（如 give somebody a call/ring 归通讯科技）。提前写好、还没开放的岛的内容放在 `content/drafts/`。

`build_words.py` 需要 Word Atlas 数据：把 `https://raw.githubusercontent.com/designfuchen/word-atlas/main/data/word-atlas.json` 放到 `.local/word-atlas/word-atlas.json`。解析脚本需要 `pip install pdfplumber`。

新增一个话题：写 `content/topics/<topic>.json`（格式同 `food.json`），再运行 `npm run data`。构建会校验内容与官方话题词表一一对应、音节拼回原词、易混组只引用本话题的词，并删除不再引用的媒体。

每个词都必须有插画，缺图时构建直接报错。插画必须逐张人工核对（用联系表一屏看完）。Word Atlas 面向成人，同形异义和画面偏差都要用 `"atlasImage": false` 屏蔽，例如：

| 词 | 问题 |
| --- | --- |
| bear | Word Atlas 是动词“忍受” |
| can / break | 情态动词“能” / 动词“打破”，KET 食物话题是“罐头” / “课间休息” |
| oil / glass | 插画是石油 / 玻璃板 |
| dish / dessert / pepper | 画面看不出词义 |

已开放：动物（47 词）、食物饮料（106 词）。

## 例句录音（Higgs Audio）

单词发音用 Word Atlas 的真人录音；例句用局域网生图机上的 Higgs Audio v2（端口 7861）预先合成，打包进应用，离线可用。没有录音的句子退回浏览器朗读。

2026-10-29 与之前用的 ChatTTS 对比（36 句，旁白、大人、孩子各 12 句，含 ChatTTS 要多次重录的难句；Whisper 转写比对原句）：Higgs 每句只录 1 次就有 31/36 合格，与 ChatTTS 最多录 5 次取最好的结果持平，旁白和大人 12/12 全对；不再吞掉句尾最后一个词，一句约 2 秒。

- 参数用服务默认值：`temperature=0.3, top_p=0.95, top_k=50, scene_prompt=quiet_indoor`；不合格时换 seed 重录
- 音色按说话人区分（`content/audio/speakers.json`，未列出的句子为旁白），都是内置音色：旁白 `en_woman`（女声），大人对孩子说的话 `en_man`（男声），孩子说的话 `belinda`（音高约 260Hz，语速偏慢）
- 比对时把 Whisper 的美式拼写（Mom、color、favorite、gray）换成内容里的英式拼写，避免误判

运行：`WHISPER_MODEL=<faster-whisper small.en 目录> python3 scripts/ket/gen_audio.py`（需要 `pip install faster-whisper numpy` 和 ffmpeg；模型可从 hf-mirror.com 下载）。已录过且没改动的句子会跳过，改了句子或换了音色会重录。

## 授权与署名

- 词表依据 Cambridge English *A2 Key and A2 Key for Schools Vocabulary List*（August 2025），© UCLES。
- 发音录音来自 [Word Atlas](https://github.com/designfuchen/word-atlas)：**Word Atlas contributors — CC BY 4.0**。应用的家长中心页底部显示该署名，发布时请保留；若有词仍沿用 Word Atlas 插画，构建会自动在署名中加上插画。
- 插画为本项目用 FLUX.1-dev（2026-10-29 之前）和 Qwen-Image 2512 生成并逐张人工挑选。
