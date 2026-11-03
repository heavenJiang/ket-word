# 内容与媒体流程

词表怎么来、内容怎么写、插画和录音怎么生成与核对。产品介绍见 [README](../README.md)。

## 数据流程

```
.local/source/a2-key-vocabulary-list-2025.pdf   官方词表（不入库，从 cambridgeenglish.org 下载）
  └─ scripts/ket/parse_wordlist.py  → data/ket-wordlist.json   词条、词性、例句、英美变体、25 个话题、词组集合
      └─ scripts/ket/build_words.py → data/ket-words.json      规范化（展开 yog(h)urt、a/an，合并重复），标注话题（核心词按 data/core-islands.json 分岛），匹配 Word Atlas
                                    → data/coverage.md         复用与缺口报告
content/topics/<topic>.json          人工审校的儿童内容：中文释义、音节、例句（固定角色 Lily 和小狗 Max）
content/media/svg/<id>.svg           手绘矢量插画（Word Atlas 色板与构图），补 Word Atlas 缺失或不可用的图
  └─ scripts/ket/render_svg.mjs     → content/media/img/       渲染为 512px WebP，统一叠加纸张颗粒质感（需本机 Chrome）
  └─ scripts/ket/gen_comfy.py       → .local/gen/qwen-image/ → content/media/ai/    局域网生图机上的 ComfyUI（Qwen-Image 2512，儿童绘本风格，固定角色形象）按 scene 字段出候选图，--sheet 出联系表人工挑选，--pick 放入，构建时优先于手绘版；新内容攒一批后用 --missing 统一出图
  └─ scripts/ket/gen_images.py      → content/media/ai/        可选：用 OpenAI 兼容的图像 API 生成
scripts/ket/gen_mascot.py           → public/media/ui/         吉祥物小狗 Max 的表情与成长阶段（同一套 Qwen-Image 设置），人工挑选后 --pick 放入
scripts/ket/gen_audio.py            → public/media/sent/       例句录音：局域网 Higgs Audio 合成，Whisper 逐句核对，不合格换种子重录（最多 5 次）
scripts/ket/check_sentences.py      （`npm run data` 时自动运行，不合格直接报错）例句和故事的用词都在 KET 词表内、每个词都有能挖空的句子
content/stories/<id>.json           岛屿故事：页面文字、插图描述（gen_comfy.py 按 story-<id>-<页> 出图）、理解题
  └─ scripts/ket/build_app_data.py  → public/data/             应用数据（自有插画优先于 Word Atlas）
                                    → public/media/            Word Atlas 插画与发音（缓存在 .local/media）
```

话题匹配允许话题表里的复数对应单数词条（shoes → shoe），但复数本身是独立词条时不算（news、shorts）；PDF 未归类或拆分有误的短语在 `build_words.py` 的 `FORMS_OVERRIDE`、`TOPIC_EXTRA` 里手工指定（如 give somebody a call/ring 归通讯科技）。不属于任何话题的 770 个核心词按意思分成 20 座小岛（我和你、小词、在哪里、动起来……），分组写在 `data/core-islands.json`，每岛自带 emoji；新增核心词必须先放进某个岛，否则 `build_words.py` 报错。提前写好、还没开放的岛的内容放在 `content/drafts/`。

`build_words.py` 需要 Word Atlas 数据：把 `https://raw.githubusercontent.com/designfuchen/word-atlas/main/data/word-atlas.json` 放到 `.local/word-atlas/word-atlas.json`。解析脚本需要 `pip install pdfplumber`。

新增一个话题：写 `content/topics/<topic>.json`（格式同 `food.json`），再运行 `npm run data`。构建会校验内容与官方话题词表一一对应、音节拼回原词、易混组只引用本话题的词，并删除不再引用的媒体。

每个词都必须有插画，缺图时构建直接报错；唯一的例外是画不出来的词（a、the、because、believe），内容里写 `"picture": false`，只用 emoji，应用里不出看图题（看图选词换成选中文，听句子选图换成听词，配对游戏显示中文）。插画必须逐张人工核对（用联系表一屏看完）。平时在卡册里看到不对的图，点卡片详情底部的“这张图看不懂 / 画错了？”标记；家长中心“要重画的插画”列出所有标记，并给出 `gen_comfy.py --only …` 命令，攒一批统一重画。Word Atlas 面向成人，同形异义和画面偏差都要用 `"atlasImage": false` 屏蔽，例如：

| 词 | 问题 |
| --- | --- |
| bear | Word Atlas 是动词“忍受” |
| can / break | 情态动词“能” / 动词“打破”，KET 食物话题是“罐头” / “课间休息” |
| oil / glass | 插画是石油 / 玻璃板 |
| dish / dessert / pepper | 画面看不出词义 |

已开放：全部 28 座话题岛和 20 座核心小岛，共 2080 张词卡。

## 例句录音（Higgs Audio）

单词发音用 Word Atlas 的英美发音录音（Word Atlas 用 ElevenLabs 合成）；例句用局域网生图机上的 Higgs Audio v2（端口 7861）预先合成，打包进应用，离线可用。没有录音的句子退回浏览器朗读。

2026-10-29 与之前用的 ChatTTS 对比（36 句，旁白、大人、孩子各 12 句，含 ChatTTS 要多次重录的难句；Whisper 转写比对原句）：Higgs 每句只录 1 次就有 31/36 合格，与 ChatTTS 最多录 5 次取最好的结果持平，旁白和大人 12/12 全对；不再吞掉句尾最后一个词，一句约 2 秒。

- 参数用服务默认值：`temperature=0.3, top_p=0.95, top_k=50, scene_prompt=quiet_indoor`；不合格时换 seed 重录
- 音色按说话人区分（`content/audio/speakers.json`，未列出的句子为旁白），都是内置音色：旁白 `en_woman`（女声），大人对孩子说的话 `en_man`（男声），孩子说的话 `belinda`（音高约 260Hz，语速偏慢）
- 比对时把 Whisper 的美式拼写（Mom、color、favorite、gray）换成内容里的英式拼写，避免误判

运行：`WHISPER_MODEL=<faster-whisper small.en 目录> python3 scripts/ket/gen_audio.py`（需要 `pip install faster-whisper numpy` 和 ffmpeg；模型可从 hf-mirror.com 下载）。已录过且没改动的句子会跳过，改了句子或换了音色会重录。

故事每页也用 Higgs 录音（`scripts/ket/gen_story_audio.py`，旁白音色，按句录、每句 Whisper 挑最好的一遍、句间停 0.35 秒），并用 Whisper 逐词时间戳生成 `marks`，阅读时按播放进度点亮正在读的词；清单在 `content/audio/stories.json`，文件在 `public/media/story/`。没有录音的页才退回浏览器语音。

Word Atlas 没有发音的 287 个词（two、the、bus stop、Dr……）也用 Higgs 补录（`scripts/ket/gen_word_audio.py`，旁白音色，缩写按读法录：Dr → doctor、CD → C D），放在 `content/media/word/`，构建时只给缺发音的词用，英音美音共用这一条。
