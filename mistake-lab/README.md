# MISTAKE LAB

Next.js + TypeScript 错题学习工作台，已实现原图精确裁剪、真实中英文 OCR、人工核对与跨页片段合并。AI Studio 仍为 Mock。

## 安装运行

需要 Node.js 24+、Tesseract 5。当前云环境已安装 Tesseract；Ubuntu 可使用系统包 `tesseract-ocr`。

```sh
cd mistake-lab
npm ci
npm run setup:ocr
npm run dev
```

开发与生产端口为 3100，本机访问 `http://localhost:3100`。云端对外预览取决于环境提供的端口入口，当前没有公网部署。生产构建前先停止占用同一 `.next` 目录的服务，再执行 `npm run build` 和 `npm start`。

`setup:ocr` 从 Tesseract 官方固定提交下载中英文模型并检查 SHA-256，不执行远程脚本。缓存默认 `/workspace/.environment-tools/mistake-lab-ocr/tessdata`，可设置 `MISTAKE_LAB_OCR_DATA` 后重启。首次下载需要 `raw.githubusercontent.com`，识别时不调用第三方，不需要 API Key。

## 少量题目的处理流程

1. `/reader` 上传少量 JPG/PNG/WebP，填写习题册、章节、原书起始页码。每张不超过 10 MB。
2. 放大或缩小后拖动框选，也支持触屏、键盘框选和范围微调。实际裁剪使用原文件，不使用缩小的阅读预览。
3. 单页题点击「识别并核对题目」；跨页题点击「保存片段，继续下一页」，继续采集同书片段，每题最多 5 段。
4. 从采集篮进入「合并核对并归档」，调整阅读顺序，查看每段原图、原书页码、比例坐标、原图尺寸与像素边界，可展开全分辨率片段。
5. 按需执行真实 OCR，选择中文优先、中英混排或英文，以及连续块/稀疏版面。原始输出只读保留，点击「应用识别建议」才更新可编辑草稿。
6. 人工核对题号、具体题型、题干和选项。单选/多选选项须从 A 连续排列；判断/填空可不填选项。知识点由用户填写。
7. 两项核对确认后才能保存；修改文字、OCR 结果或片段顺序会重置确认。归档后答案为空，不能由 OCR 自动填写或确认。
8. 在「资料与答案」独立录入解析，按书、章节、具体题型和题号产生待审候选，再人工确认。已有答案需要另行勾选替换。跨题型、不存在的选项、单选多个答案、无效判断标记会被阻止。

## 数据与边界

原文件、阅读预览、采集草稿、独立裁剪和错题保存在浏览器 IndexedDB，刷新保留。新上传原文件完整保留，阅读预览另行缩至最长边 2000 像素。裁剪边界向外取整不足一像素；跨页合成图可能缩放，各独立片段仍保留原始分辨率和位置。

仅执行 OCR 时，选中 PNG 片段临时发送到本站服务，Tesseract 完成或取消后清理临时文件，不调用外部模型。单片段最多 2000 万像素、OCR 文件最多 8 MB、请求体最多 9 MB；本站一次处理一个识别任务。引擎置信值不是准确率或正确答案保证。

默认 8 道演示题、2 张原创示例页，示例题区不是 OCR 结果。旧数据不清空；旧图片若缺失原文件，不能恢复原始像素，界面明确显示降级来源。清理站点数据会删除本地档案，可从侧栏导出 JSON；尚无恢复入口、账号或多设备同步。

教辅导入中心现支持指定 1–5 页 PDF 的渲染、文字层/OCR、规则切题和解析草稿提取。没有自动全书切题或知识点自动推断。表格、公式、水印和阅读顺序可能识别错误，必须人工核对。跨页是否属于同一道题、是否完整，由用户确认。

## 测试

```sh
npm test
npm run test:ocr
npm run test:browser
npm run typecheck
npm run build
```

浏览器测试独立使用 3107 和 `.next-test`，自动启停，与 3100/`.next` 分开。使用系统 Chromium，也可设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`。合成夹具生成需要 Python 3、Pillow、Noto CJK 字体，当前云环境均具备。测试产物不纳入 Git。

最新证据见 [模块验收记录](PROCESSING_VALIDATION.md)，数据流见 [架构说明](ARCHITECTURE.md)。聊天附图没有可下载文件进入工作区，没有声称完成这些原图的准确率验收。

## 代码入口

- `app/api/ocr/route.ts`：同源、有限大小、可取消的 OCR 接口。
- `components/reader.tsx`：原书、页码、精确框选与采集篮。
- `components/capture-review.tsx`：OCR 草稿、排序、人工核对与归档门禁。
- `components/lab-client.tsx`：个人浏览器工作区挂载，避免存储 hydration 冲突。
- `lib/capture.ts`、`lib/image-capture.ts`：坐标、片段、像素裁剪及合成预览。
- `lib/ocr-server.ts`：Tesseract、TSV 与临时文件生命周期。
- `lib/materials.ts`：题型校验、答案候选及人工确认。

视觉仍采用奶油白、森林绿、鼠尾草绿与少量雾蓝，支持桌面、手机及减少动效偏好。

## 教辅资料导入中心

打开 `/import`：选择题本或答案解析 PDF，填写统一书名、当前章节、PDF 页范围、对应纸面页码及单/双栏模式。每次仅处理 1–5 页；支持文字层提取与扫描页 OCR 回退。逐条修改、核对或合并跨页片段后，可批量归档已核对条目。匹配答案仍需在“资料整理”中逐条确认。

运行依赖 Python 3 + PyMuPDF（当前环境已有 1.26.6）；验收夹具还使用 reportlab。现有 OCR 依赖不变。文件最多 128 MiB，原始 PDF 保存在当前浏览器 IndexedDB，请留意浏览器配额；大教辅建议按章节拆分。临时服务器副本处理后删除。Word 暂不支持。

附件访问状态、边界和验收见 [PDF_IMPORT_PLAN.md](PDF_IMPORT_PLAN.md)。六份聊天附件均超过工具 32 MiB 下载上限，尚未分析其真实内容。
