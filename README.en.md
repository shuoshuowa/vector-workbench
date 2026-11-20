# Vector Workbench · 矢量快改

Edit a product manual directly on the artboard. Open a PDF, change a heading, move a clipped photo or resize a group, then export your pages as an editable PDF. The browser edition processes documents on the visitor’s device.

**[Open the live editor](https://vector.zhangshuo.work/)** · **[Download the two-page sample](https://raw.githubusercontent.com/shuoshuowa/vector-workbench/main/examples/fold-guide.pdf)** · [中文](README.md)

[![Vector Workbench editing the Fold F/01 manual](docs/images/workbench.png)](https://vector.zhangshuo.work/)

Open the sample, switch to page two and double-click the heading. Type on the artboard, drag the text frame to reflow the paragraph, or switch to its object handles to scale the lettering. Alt-drag duplicates a selection. The layer panel supports drag-to-reorder and the inspector supports multi-object sizing, alignment and text style transfer.

**Formats.** The browser edition opens PDF, PDF-compatible AI, EPS, SVG and supported PSD files. It exports multi-page PDF and current-artboard SVG, EPS or layered RGB PSD. EPS outlines text. Some PSD elements rasterize. Outlined text in an input file remains a path; complex transparency, effects and unavailable fonts can affect fidelity. Illustrator can split exported PDF text into lines or font runs. The optional Windows edition uses an installed, licensed copy of Illustrator for native AI export.

## Run locally

With Node.js 22+:

```sh
git clone https://github.com/shuoshuowa/vector-workbench.git
cd vector-workbench/online
npm ci --omit=optional --ignore-scripts
npm run build
npm start
```

Visit **http://127.0.0.1:4173/**. The generated `online/dist/` can be hosted as a static HTTPS site. For the Windows/Illustrator edition run `node server.cjs` at the repository root.

## Source and commercial licensing

Copyright © 2026 **shuoshuowa**. Original project code, documentation and examples are source-available under the **PolyForm Noncommercial License 1.0.0**. Commercial use requires separate written permission from the rights holder. Please describe your proposed use and distribution when you [email shuoshuowa@gmail.com](mailto:shuoshuowa@gmail.com?subject=Vector%20Workbench%20Commercial%20License).

[License](LICENSE) · [Required notice](NOTICE) · [Third-party terms](THIRD_PARTY_NOTICES.md)
