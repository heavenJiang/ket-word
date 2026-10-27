# KET 单词岛

给小学生的剑桥 A2 Key（KET）背词应用：按官方词表、按话题岛屿学习，每个词分“认识 / 听懂 / 会拼”三项独立记忆，用 FSRS 间隔复习，答题自动评分。

```bash
npm install
npm run dev      # http://localhost:5199
npm test
npm run build
```

## 学习模型

- **每日计划**：先复习到期的词，再学新词（默认 8 个）。复习每天有上限（默认 30，含当天已做的），积压时暂停新词，避免几天没学后被几百个复习吓退。
- **新词**：4 个一组。先“初见”（插画、发音、音节拆分、例句、跟读录音），再打乱顺序看图回忆。
- **三项技能**：认识（看图/选中文）→ 第二天起解锁听音辨词 → 词义进入长期记忆后解锁字母块拼写。三项各自一张 FSRS 卡片，家长能看出孩子是“认识但不会拼”还是“会拼但听不出”。
- **自动评分**：答错 → Again；答对但慢、用提示或拼错一次 → Hard；答对 → Good；拼写又快又准 → Easy。“慢”的阈值按年龄放宽。孩子不需要自己给自己打分。
- **只有首次作答计分**：答错的词隔 3 题换一种题型再练（最多 2 次），重试不计分。
- **掌握**：稳定度 ≥ 21 天（三周后仍有约 90% 把握）。三项都掌握 = 金卡。

## 数据流程

```
.local/source/a2-key-vocabulary-list-2025.pdf   官方词表（不入库，从 cambridgeenglish.org 下载）
  └─ scripts/ket/parse_wordlist.py  → data/ket-wordlist.json   词条、词性、例句、英美变体、24 个话题、词组集合
      └─ scripts/ket/build_words.py → data/ket-words.json      规范化（展开 yog(h)urt、a/an，合并重复），标注话题，匹配 Word Atlas
                                    → data/coverage.md         复用与缺口报告
content/topics/<topic>.json          人工审校的儿童内容：中文释义、音节、例句（固定角色 Lily 和小狗 Max）
  └─ scripts/ket/build_app_data.py  → public/data/             应用数据
                                    → public/media/            Word Atlas 插画与发音（缓存在 .local/media）
```

`build_words.py` 需要 Word Atlas 数据：把 `https://raw.githubusercontent.com/designfuchen/word-atlas/main/data/word-atlas.json` 放到 `.local/word-atlas/word-atlas.json`。解析脚本需要 `pip install pdfplumber`。

新增一个话题：写 `content/topics/<topic>.json`（格式同 `animals.json`），再运行 `npm run data`。Word Atlas 里的同形异义词要人工核对插画，例如 `bear` 在 Word Atlas 中是动词“忍受”，已用 `"atlasImage": false` 屏蔽。

## 授权与署名

- 词表依据 Cambridge English *A2 Key and A2 Key for Schools Vocabulary List*（August 2025），© UCLES。
- 插画与发音录音来自 [Word Atlas](https://github.com/designfuchen/word-atlas)：**Word Atlas contributors — CC BY 4.0**。应用的家长中心页底部显示该署名，发布时请保留。
