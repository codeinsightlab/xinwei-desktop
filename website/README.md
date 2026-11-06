# 薪慰官网

独立的 Astro + TypeScript 静态站点。`src/content/` 集中维护中文文案、五个完整对话和虚构样例；不导入桌面 Tauri、计薪模块、配置或记录。

## 本地运行

Node 22.23.1（`.nvmrc` 与 CI 一致；最低22.12）。本目录有独立依赖锁，不在仓库根安装官网依赖。

```sh
cd website
nvm use
npm ci
npm run check
npm test
npm run build
npm run test:built
npm run test:dom
npm run preview
```

本地生产构建预览为 `http://127.0.0.1:4321/`，由 Wrangler 的本地 Workers Static Assets 运行时提供，缺失路径返回真正404。`npm run dev` 供编辑时热更新。若 Wrangler 提示文件监听不可用，构建后重启预览并刷新浏览器。

默认构建包含 noindex meta、响应头和禁止抓取的 robots；`npm run deploy` 才生成可收录的正式构建。canonical、分享链接与 sitemap 始终指向指定官网域名。

## 内容与行为

- `src/lib/demo.ts`：注入单调时钟；按已过工作秒数向下取整到分。默认14:30静止，开始后1×播放。午休不增加；18:00封顶但不自动收工；23:59:59停止当日演示。
- `src/lib/client.ts`：播放器、环境暂停、单页隐私、焦点及场景呈现。不写Cookie或Storage，不请求业务接口。
- `src/content/scenarios.ts`：五个场景、11个回复分支及各自跳过结果；没有网络对话或回复计时队列。
- `src/content/site.ts`：页面正文、七个FAQ、下载配置与托管入口。下载配置仅使用已公开并匿名下载校验的Release附件，包含版本、SHA-256和签名状态。
- `src/layouts/Base.astro`：语义元信息、OG/Twitter、WebSite/WebPage/SoftwareApplication/FAQPage JSON-LD；不编造评分、价格、版本或下载地址。结构化数据不保证搜索引擎展示富结果。

初始450.00元是已经开工日的暂停样例；1250.00元月合计模型由先前记录800元加当日450元构成，界面未额外堆叠月合计。

## 素材

原母版：仓库 `src/assets/mascot-work.svg`。本轮在官网目录制作六个SVG变体和三种装饰，清单见 `assets-manifest.json`。图片为真实矢量，不内嵌低清图、不含脚本或远程字体；未宣称还原概念稿或形成严格角色母版。

```sh
npm run assets:generate
npm run assets:og
```

角色只做整体过渡，不承诺独立关节动画。生成的OG为本地1200×630 PNG；角色原始尺寸可独立放大渲染。

## 自动化与浏览器证据

`npm test` 覆盖计算、封顶、收工、暂停、边界与每个场景分支；`npm run test:dom` 在DOM环境中运行真实客户端事件，检查后台/离屏暂停、隐私、重置、分支、减少动画。DOM模拟不等于真实浏览器或操作系统验收。

浏览器截图与本地验收结果保存在被忽略的 `artifacts/`，不随源码提交。没有把DOM模拟或概念图当作真实浏览器验收。

为了不等待现实3.5小时，可单独构建注入时钟的本地验收站：

```sh
npm run build:qa
npm run preview:qa
```

验收站在4322端口，有明确的测试时钟横条，产物位于被忽略的 `.qa-dist/`；真实部署只发布 `dist/`。构建测试断言正式客户端没有这些控件。不要把验收构建作为正式站部署。

## Cloudflare 发布

目标 Worker：`xinwei-website`；Custom Domain：`xinwei.learnaiwithcode.com`。配置见 `wrangler.jsonc`；只上传 `dist/`，不提供后端、登录、数据库或Pages项目。workers.dev和版本预览URL均关闭。

### 自动更新与一条命令发布

官网源码和 `.github/workflows/deploy-website.yml` 随本仓库维护。每次 `main` push 均会检查并自动部署；PR只校验，不部署。生产部署串行，旧提交发现main已有新提交时跳过，防止旧页面覆盖新版本。部署不触发桌面应用打包。

提交官网修改后，`git push origin main` 即可更新官网。需要重新发布远端main时，在仓库根执行：

```sh
npm run website:deploy
```

本机只需Node与已登录的GitHub CLI（`gh auth login`），不必保存Cloudflare Token。命令触发Actions并等待结果；本地未提交、未推送的内容不会被发布。Actions地址会在终端输出。

### CI凭据

凭据仅保存在 `codeinsightlab/xinwei-desktop` 的GitHub Actions Secrets：

- `CLOUDFLARE_API_TOKEN`：专用账号Token `xinwei-website-ci`，有效至2027-11-06。
- `CLOUDFLARE_ACCOUNT_ID`：目标Cloudflare账号。

Token只允许编辑 `xinwei-website`（Individual Workers Editor），账号信息只读；对 `learnaiwithcode.com` 授予DNS/Zone只读和Workers Routes写入。没有授予其他Worker编辑、DNS编辑、KV、数据库、Pages或全账号写入权限。Token创建与写入Secrets已由用户确认；轮换时保持相同范围，不把密钥写入源码、PUBLIC_变量、日志或聊天。

账号级域名列表API不接受单Worker令牌；前置检查使用该Worker自己的settings和domains/records接口，配合指定Zone的DNS及路由读取，已用实际令牌验证。域名已由控制台绑定，预览和workers.dev关闭。

### 部署过程与验证

```sh
npm run deploy:check  # 本地打包dry-run，不代表上线
npm run deploy        # 高阶本地入口，需要自行提供合法Cloudflare环境凭据
```

deploy脚本先只读核对凭据、zone与账号、目标Worker、Custom Domain、DNS和重叠Route。归属不明确时退出，不覆盖服务。通过后构建可收录版本、检查产物，再用Wrangler发布。已有同名Worker但没有目标绑定会被拦截，需要先核实归属。

发布后自动验证自定义域名HTTPS、首页构建revision、当前CSS/JS/图片、robots/sitemap/OG，以及不存在路径和内部文件均返回404。CI写入的页面revision必须对应当前GitHub提交，防止只检查到旧页面就宣称更新成功。`npm run verify:live` 可单独重新验证。

浏览器交互需另外实测，HTTP检查不替代浏览器验证。回滚可重新部署先前已验证的Worker版本，不需要回滚桌面应用或数据。Actions固定到核实的提交，依赖使用独立锁文件。

当前提供1.2.1预览版：Windows x64 NSIS和macOS Apple Silicon DMG。两个附件在GitHub Release公开后，已通过匿名完整下载、大小与SHA-256核对，才接入 `src/content/site.ts`。未代码签名/公证和原生交互未验收的边界在Release及下载区说明。

后续发布先递增并校验版本、提交修复；通过Actions的 `Build Windows installer` 指定完整源码SHA和版本，在Windows原生环境构建并测试。macOS按同一桌面源码构建并核对版本、架构和DMG完整性。两个平台附件、构建回执及 `SHA256SUMS` 齐备后再公开Release；不得覆盖同名附件交付不同代码。匿名验证下载后更新版本、URL、校验值、日期和说明，推送main自动更新官网。线上检查会同时确认两个下载入口对应当前构建且附件可公开访问。
