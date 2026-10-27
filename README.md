# KET 单词岛

给小学生的剑桥 A2 Key（KET）背词应用：按官方词表、按话题岛屿学习，每个词分“认识 / 听懂 / 会拼”三项独立记忆，用 FSRS 间隔复习，答题自动评分。

```bash
npm install
npm run dev      # http://localhost:5199
npm test
npm run build
```

## 学习模型

- **每日计划**：先复习到期的词（覆盖所有已开放岛屿，换岛不会丢下旧词），再从当前岛学新词（默认 8 个）。复习每天有上限（默认 30，含当天已做的），积压时暂停新词，避免几天没学后被几百个复习吓退。
- **新词**：4 个一组。先“初见”（插画、发音、音节拆分、例句、跟读录音），再打乱顺序看图回忆。
- **三项技能**：认识（看图/选中文）→ 第二天起解锁听音辨词 → 词义进入长期记忆后解锁字母块拼写。三项各自一张 FSRS 卡片，家长能看出孩子是“认识但不会拼”还是“会拼但听不出”。
- **自动评分**：答错 → Again；答对但慢、用提示或拼错一次 → Hard；答对 → Good；拼写又快又准 → Easy。“慢”的阈值按年龄放宽。孩子不需要自己给自己打分。
- **只有首次作答计分**：答错的词隔 3 题换一种题型再练（最多 2 次），重试不计分。
- **公平的干扰项**：内容文件里的 `confusable` 组（如 plate / dish / bowl、dog / puppy）互不作为错误选项，避免图片本身分不清的题。
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
  └─ scripts/ket/gen_comfy.py       → .local/gen/ → content/media/ai/    局域网生图机上的 ComfyUI（FLUX.1-dev，儿童绘本风格，固定角色形象）按 scene 字段出候选图，--sheet 出联系表人工挑选，--pick 放入，构建时优先于手绘版
  └─ scripts/ket/gen_images.py      → content/media/ai/        可选：用 OpenAI 兼容的图像 API 生成
  └─ scripts/ket/build_app_data.py  → public/data/             应用数据（自有插画优先于 Word Atlas）
                                    → public/media/            Word Atlas 插画与发音（缓存在 .local/media）
```

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

## 授权与署名

- 词表依据 Cambridge English *A2 Key and A2 Key for Schools Vocabulary List*（August 2025），© UCLES。
- 发音录音来自 [Word Atlas](https://github.com/designfuchen/word-atlas)：**Word Atlas contributors — CC BY 4.0**。应用的家长中心页底部显示该署名，发布时请保留；若有词仍沿用 Word Atlas 插画，构建会自动在署名中加上插画。
- 插画为本项目用 FLUX.1-dev 生成并逐张人工挑选。
