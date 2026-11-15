# 更新日志

从 NapCatQQ 上游 fork 开始维护 napig 的更新记录。后续变更应随对应提交同步更新本文件，
使用日期作为变更标题前缀，新的记录写在前面。

## 2026-11-15 移除在线更新

- 移除新版本提示、版本选择、升级与降级操作，以及上游 Release 信息查询。
- 删除在线更新 API 和启动时应用待更新文件的逻辑。更新运行代码统一通过构建并替换镜像完成。
- 系统信息继续显示当前构建、QQ、WebUI 和系统信息，不再提供版本管理入口。
  相关代码：[system_info.tsx](packages/napcat-webui-frontend/src/components/system_info.tsx)、
  [BaseInfo.ts](packages/napcat-webui-backend/src/api/BaseInfo.ts)。

## 2026-11-15 移除运行时插件系统

- 删除插件管理、插件商店、扩展页面和配套的前端组件、控制器及类型。
- 删除插件 API、配置与安装接口、动态路由，以及插件页面和静态资源的服务与缓存策略。
- 删除插件扫描与加载器、生命周期和消息分发逻辑、内置示例插件，以及对应的配置定义、路径和构建步骤。
- 保留 OneBot 的 HTTP、WebSocket、反向 WebSocket 及核心消息处理。旧配置中的插件字段在加载时被忽略，
  既有网络客户端配置继续使用。
  相关代码：[OneBot 入口](packages/napcat-onebot/index.ts)、
  [OneBot 配置](packages/napcat-onebot/config/config.ts)、
  [WebUI 入口](packages/napcat-webui-backend/index.ts)。

## 2026-11-15 移除上游社区资源入口

- 删除“关于我们”中的“相关资源”卡片、入群密码计算和账号选择逻辑。
- 删除仅用于入群密码的文件哈希接口及前端调用。保留项目介绍、技术栈和版权信息。
  相关代码：[about.tsx](packages/napcat-webui-frontend/src/pages/dashboard/about.tsx)。

## 2026-11-15 修复登录启动竞态和二维码刷新状态

### 修复

- **修复保留 QQ 数据重启后无法生成登录二维码的问题。** 存在 MSF 配置缓存时，
  QQ Core 可能在 Napig 等待读取历史登录记录期间提前发出连接成功通知。
  旧代码此时尚未注册监听器，漏收通知后会误报连接超时，登录流程也无法继续。
  现在在初始化 QQ Core 前注册监听器，记录提前到达的连接通知，等初始化和历史记录读取完成后
  再推进登录；重复通知不会并发启动登录流程。无需清空既有 QQ 数据和缓存来绕过此问题。
  相关代码：[base.ts](packages/napcat-shell/base.ts)。
- **修复二维码刷新入口未就绪时仍等待超时的问题。** 刷新函数与登录监听器一同提前注册；
  服务尚未就绪或刷新函数尚未注册时，立即返回明确错误。
  发起刷新时若函数抛错，记录错误原因，并将仍停留在“正在生成二维码”的阶段恢复为请求前的阶段；
  如果流程已进入“正在重连”，则保留该阶段。请求已受理但未返回二维码的情况继续使用原有超时处理。
  相关代码：[base.ts](packages/napcat-shell/base.ts)、[Data.ts](packages/napcat-webui-backend/src/helper/Data.ts)。
- **改进连接等待超时的诊断信息。** 明确提示未收到连接完成事件，并记录事件到达时初始化是否完成，
  便于区分事件处理时序问题与实际的网络连接问题。
