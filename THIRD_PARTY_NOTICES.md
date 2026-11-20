# 第三方组件与许可

本仓库原创部分的非商业许可见 [LICENSE](LICENSE)。下表组件、其字体和随附数据遵循各自的许可。项目作者只能单独授权其拥有权利的部分。

| 组件 | 在本项目中的用途 | 上游及条款 |
| --- | --- | --- |
| PDF.js / pdfjs-dist | 读取 PDF、处理字形及渲染指令 | [Mozilla · Apache-2.0](https://github.com/mozilla/pdf.js/blob/master/LICENSE)。CMap 和标准字体目录另含各自声明 |
| pdf-lib | PDF 页面和附件读写，Windows 本机服务也使用此库 | [上游](https://github.com/Hopding/pdf-lib) · [随附的 MIT 许可](vendor/pdf-lib-LICENSE.txt) |
| @pdf-lib/fontkit | 读取字体名称、字形映射及字重 | [上游 fork](https://github.com/Hopding/fontkit) · [MIT](vendor/fontkit-LICENSE.txt) |
| PDFKit | 输出 PDF 图形与文字 | [foliojs/pdfkit · MIT](https://github.com/foliojs/pdfkit) |
| SVG-to-PDFKit | 将矢量元素写入 PDF | [alafr/SVG-to-PDFKit · MIT](https://github.com/alafr/SVG-to-PDFKit)。构建时替换逐字定位循环，项目适配代码在 [pdf-text-runs.js](online/pdf-text-runs.js) |
| ag-psd | PSD 读写 | [Agamnentzar/ag-psd · MIT](https://github.com/Agamnentzar/ag-psd) |
| DOMPurify | 清理导入 SVG 的不安全元素 | [cure53/DOMPurify · Apache-2.0 或 MPL-2.0](https://github.com/cure53/DOMPurify) |
| Noto Sans SC | 可嵌入的中文回退字库 | Noto Sans SC Medium · [随附的 SIL OFL 1.1 与字体版权说明](assets/fonts/OFL.txt) |
| fflate / fzstd | 读写画板交接包、读取支持的 Illustrator 布局压缩流 | [fflate](https://github.com/101arrowz/fflate)、[fzstd](https://github.com/101arrowz/fzstd)，均为 MIT |
| Microsoft WebView2 SDK | Windows 便携版的 WinForms 控件与加载器 | [Microsoft.Web.WebView2](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.3650.58)。包内附 SDK 原始 LICENSE 和 NOTICE，运行时由用户系统提供 |
| Ghostscript WebAssembly | 在独立 Web Worker 中运行 PostScript/EPS 命令行转换 | [发布包 0.0.2](https://www.npmjs.com/package/@jspawn/ghostscript-wasm/v/0.0.2) · [对应构建源码及其上游子模块](https://github.com/jsscheller/ghostscript-wasm/tree/d45193808b707ebefb3df7560586b3d404d64c39) · AGPL-3.0 |

Ghostscript 的编译产物在构建时从锁定的 npm 包复制到站点。本仓库不重新许可这些文件。分发含有该转换器的构建时，应按上游条款提供许可、相应源代码和适用的通知。需要使用 Artifex 商业条款时，请直接联系 [Artifex](https://artifex.com/licensing/)；本项目作者的商业许可不能代替上游授权。

`online/package-lock.json` 记录 npm 依赖版本与完整性校验。构建将主要组件的许可写入 `dist/licenses/`，PDF.js 的 CMap 与标准字体许可随对应目录复制。使用者自行安装的 Adobe Illustrator、自己导入的图稿及本机字体均有各自的使用条件。Adobe、Illustrator 和 Photoshop 为其权利人的商标。
