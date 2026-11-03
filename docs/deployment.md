# 发布与离线

产品介绍见 [README](../README.md)。

## 在线发布

推送到 `main` 后 GitHub Actions 自动测试、构建并发布到 GitHub Pages（`.github/workflows/pages.yml`）：**https://heavenjiang.github.io/ket-word/**

## 离线与安装

正式构建（`npm run build`）带 Service Worker（`public/sw.js`）和 Web App Manifest：平板浏览器里“添加到主屏幕”后像 App 一样全屏打开，图标是小狗 Max。

- 程序本身首次访问即缓存，之后没有网络也能打开
- 词库数据联网时取最新、离线时用缓存，新岛屿上线后自动拿到
- 图片和录音用到时缓存；家长中心“离线使用”可一次下载全部（约 1.1 万个文件、170 MB：插画、单词发音、例句录音、故事插图）
- 媒体路径带内容 hash（`media/img/cat.webp?v=1a2b3c4d`，`build_app_data.py` 生成）：换了插画或重录了句子，地址跟着变，已缓存的设备会重新下载并替换旧版本
- 录音的分段请求（Range）由 Service Worker 从缓存的完整文件里切出来，回 206，Safari 离线也能播放
- 进度存在浏览器本地：启动时申请持久存储（避免 Safari 长时间不用后清理网站数据）；保存失败时页面顶部提示家长；读不出来的旧进度会单独留一份，不会被新进度覆盖，家长中心可以下载。家长中心显示上次导出备份是几天前，建议每周导出一次
- 开发模式（`npm run dev`）不注册 Service Worker，以免缓存挡住修改
- 部署在子路径时（`KET_BASE=/ket/ npm run build`）缓存路径会跟着变
