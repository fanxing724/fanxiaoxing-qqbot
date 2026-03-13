# 番小星 QQ机器人

> 软萌可爱的元气女生AI聊天搭子，基于 Cloudflare Workers + 智谱AI GLM-4 部署

一个功能完善的QQ AI聊天机器人，支持记忆系统、工具调用、图片识别等功能。采用 Cloudflare Workers 无服务器架构，免费部署，全球加速。

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [详细部署教程](#详细部署教程)
- [配置说明](#配置说明)
- [命令列表](#命令列表)
- [工具功能](#工具功能)
- [记忆系统](#记忆系统)
- [人设自定义](#人设自定义)
- [常见问题](#常见问题)
- [技术栈](#技术栈)

---

## 功能特性

### 核心功能

| 功能 | 说明 |
|------|------|
| 🤖 **智能对话** | 基于智谱AI GLM-4系列模型，支持自然多轮对话 |
| 💾 **记忆系统** | 自动记住用户名字、喜好、生日等信息，下次聊天依然记得 |
| 🎭 **情绪追踪** | 感知用户情绪状态，给予更贴心的回复 |
| 🎨 **人设系统** | 内置软萌人设，支持完全自定义 |
| 👑 **权限管理** | 管理员永久记忆 + 高质量模型，普通用户临时记忆 |
| 🖼️ **图片识别** | 发送图片自动识别内容并回复（GLM-4V） |

### 工具功能

| 工具 | 触发词 | 说明 |
|------|--------|------|
| ⏰ 时间查询 | `几点了` `现在几点` | 获取当前北京时间 |
| 🌤️ 天气查询 | `北京天气` `上海天气` | 查询任意城市天气 |
| 🖼️ 随机图片 | `发张图` `来张图` `二次元图` | 发送二次元随机图片 |
| 💱 汇率查询 | `美元汇率` `100日元等于多少人民币` | 实时汇率换算 |
| 💬 一言 | `来句话` `一言` | 随机动漫语录 |
| 🔍 搜索 | `帮我查xxx` | 快速搜索信息 |

### 架构优势

- ✅ **完全免费** - Cloudflare Workers 免费额度充足
- ✅ **全球加速** - Cloudflare 全球节点，低延迟响应
- ✅ **无需服务器** - 无需购买VPS，无需运维
- ✅ **自动扩展** - 高并发自动扩展，不用担心崩溃
- ✅ **数据安全** - KV存储加密，数据隔离

---

## 快速开始

### 前置要求

1. 一个 [智谱AI](https://open.bigmodel.cn) 账号（免费注册，有免费额度）
2. 一个 [Cloudflare](https://dash.cloudflare.com) 账号（免费）
3. 一个QQ号（作为机器人）
4. NapCat 或 LLOneBot 框架

### 四步部署

```bash
# 1. 修改配置
编辑代码中的 CONFIG 配置项

# 2. 部署 Worker
复制代码到 Cloudflare Workers

# 3. 绑定 KV
创建并绑定 KV 命名空间

# 4. 配置回调
在 NapCat 中设置 HTTP 回调地址
```

---

## 详细部署教程

### 第一步：获取智谱AI API Key

1. 访问 [智谱AI开放平台](https://open.bigmodel.cn)
2. 注册/登录账号
3. 进入「API密钥」页面
4. 点击「创建 API Key」
5. 复制生成的 API Key（格式：`xxxxxxxx.xxxxxxxxxxxx`）

> 💡 免费额度：新用户赠送大量免费Token，足够日常使用

### 第二步：创建 Cloudflare Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单选择 `Workers 和 Pages`
3. 点击 `创建应用程序` → `创建 Worker`
4. 输入名称（如 `qq-bot`），点击 `部署`
5. 部署后点击 `编辑代码`
6. 删除默认代码，粘贴本项目的完整代码
7. 点击 `部署`

### 第三步：创建并绑定 KV 命名空间

**创建 KV：**
1. 左侧菜单选择 `Workers 和 Pages` → `KV`
2. 点击 `创建命名空间`
3. 输入名称（如 `bot-memory`）
4. 点击 `添加`

**绑定到 Worker：**
1. 回到你的 Worker 页面
2. 点击 `设置` → `变量和机密`
3. 点击 `添加` → `KV 命名空间绑定`
4. 变量名填写：`AI_KV`
5. 选择刚创建的 KV 命名空间
6. 点击 `部署` 保存

> ⚠️ 必须绑定KV，否则机器人无法存储记忆！

### 第四步：修改配置

在 Worker 代码中找到 `CONFIG` 配置项，修改以下内容：

```javascript
const CONFIG = {
  // 必填：智谱AI API Key
  GLM_API_KEY: "你的API Key",
  
  // 必填：你的QQ号
  CREATOR_ID: "你的QQ号",
  ADMINS: ["你的QQ号"],
  SPECIAL_QQ: "你的QQ号",
  
  // 可选：自定义验证命令和验证码
  ADMIN_VERIFY_CMD: "/verify",
  ADMIN_VERIFY_CODE: "你的验证码",
  
  // ... 其他配置保持默认即可
};
```

### 第五步：部署 NapCat

**Windows 部署：**

1. 下载 [NapCat](https://github.com/NapNeko/NapCatQQ/releases)
2. 解压后运行 `NapCat.Shell.exe`
3. 扫码登录机器人QQ号
4. 登录成功后，打开配置文件 `config/onebot11_你的QQ号.json`
5. 添加 HTTP 回调配置：

```json
{
  "http": {
    "enable": false
  },
  "httpPost": {
    "enable": true,
    "urls": [
      {
        "url": "https://你的worker名称.你的子域.workers.dev",
        "secret": ""
      }
    ]
  }
}
```

6. 重启 NapCat

**Docker 部署（推荐）：**

```bash
docker run -d \
  --name napcat \
  -p 3000:3000 \
  -v $(pwd)/config:/app/napcat/config \
  mlikiowa/napcat-docker:latest
```

### 第六步：验证管理员权限

1. 给机器人QQ发送你配置的验证命令（默认 `/verify`）
2. 机器人回复提示输入验证码
3. 发送你配置的验证码
4. 验证成功，获得管理员权限

---

## 配置说明

### 核心配置 (CONFIG)

```javascript
const CONFIG = {
  // ===== 必填配置 =====
  GLM_API_KEY: "YOUR_GLM_API_KEY",  // 智谱AI API Key
  
  // ===== 用户配置 =====
  CREATOR_ID: "YOUR_QQ",            // 创造者QQ号
  ADMINS: ["YOUR_QQ"],              // 管理员列表（数组）
  SPECIAL_QQ: "YOUR_QQ",            // 特殊用户（永久记忆）
  
  // ===== 验证配置 =====
  ADMIN_VERIFY_CMD: "/verify",      // 管理员验证命令
  ADMIN_VERIFY_CODE: "YOUR_CODE",   // 验证码
  
  // ===== 性能配置 =====
  TIMEOUT: 5000,                    // 请求超时（毫秒）
  RATE_LIMIT: 8,                    // 每分钟请求限制
  
  // ===== 记忆配置 =====
  SPECIAL_TTL: 31536000,            // 管理员记忆时长（秒）默认1年
  SPECIAL_MEMORY: 30,               // 管理员记忆条数
  NORMAL_TTL: 86400,                // 普通用户记忆时长（秒）默认1天
  NORMAL_MEMORY: 2,                 // 普通用户记忆条数
  
  // ===== 回复消息 =====
  ERROR_MSG: "小星的小脑袋卡壳啦...",
  EMPTY_MSG: "小星在呢～你想说什么呀～",
};
```

### 模型配置 (GLM_MODELS)

```javascript
const GLM_MODELS = [
  // 主力模型：速度快，免费额度多
  { name: "glm-4-flash", url: "...", model: "glm-4-flash", priority: 1 },
  // 备用模型：性能平衡
  { name: "glm-4-air", url: "...", model: "glm-4-air", priority: 2 },
  // 高质量模型：管理员专用
  { name: "glm-4-plus", url: "...", model: "glm-4-plus", priority: 0 },
];
```

### API密钥配置 (API_KEYS)

可选配置，不填使用免费公共API：

```javascript
const API_KEYS = {
  WEATHER_KEY: "",   // 和风天气 API
  BING_KEY: "",      // Bing 搜索 API
  IMAGE_KEY: "",     // 图片 API
  EXCHANGE_KEY: ""   // 汇率 API
};
```

---

## 命令列表

### 用户命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `/help` | 查看帮助信息 | `/help` |
| `/clear` | 清除对话记忆 | `/clear` |
| `/status` | 查看运行状态 | `/status` |
| `/mem` | 查看记忆条数 | `/mem` |
| `/traits` | 查看记住的用户信息 | `/traits` |
| `/mood` | 查看情绪状态 | `/mood` |
| `/horoscope 星座` | 今日运势 | `/horoscope 双鱼` |

### 管理员命令

| 命令 | 说明 |
|------|------|
| `/debug` | 系统诊断，检测各API状态 |
| `/testtools` | 测试所有工具功能 |

---

## 工具功能

### 时间查询
```
用户：几点了
机器人：*掏出小手机看看* 现在是3月13日，周四，北京时间14:30哦～😜
```

### 天气查询
```
用户：北京天气
机器人：*看看窗外* 北京现在18°C，晴～温度刚刚好呢～✨
```

### 随机图片
```
用户：发张图
机器人：二次元图片来啦～✨
        [图片]
```

支持关键词：
- `发张图` `来张图` - 随机图片
- `横图` `电脑壁纸` - 横版图片
- `竖图` `手机壁纸` - 竖版图片

### 汇率查询
```
用户：100美元等于多少人民币
机器人：*掐指一算* 100美元大约是720人民币哦～
```

### 一言
```
用户：来句话
机器人：「人生如逆旅，我亦是行人。」—— 苏轼
```

---

## 记忆系统

### 记忆类型

| 类型 | 管理员 | 普通用户 |
|------|--------|----------|
| 对话历史 | 30条 | 2条 |
| 记忆时长 | 1年 | 1天 |
| 用户特征 | 永久保存 | 30天 |
| 情绪状态 | 1天 | 1天 |

### 自动记忆的信息

机器人会自动记住：

- 👤 用户名字（"我叫小明"）
- 🍔 饮食喜好（"我喜欢吃火锅"）
- ✈️ 旅行愿望（"我想去日本"）
- 🎂 生日（"我生日是3月15日"）
- 💼 职业（"我是程序员"）
- ❌ 讨厌的事物（"我讨厌香菜"）

### 特殊时刻（管理员专属）

管理员说的一些特殊对话会被永久记住：
- "记得那天..."
- "那时候我们..."
- "还记不记得..."

---

## 人设自定义

### 修改人设模板

找到代码中的 `PERSONA_BASE` 常量：

```javascript
const PERSONA_BASE = `你是[名字]，一个[性格]的[身份]。

【身份】
- 名字：xxx
- 年龄：xxx
- 创造者：xxx

【性格】
- xxx
- xxx

【说话风格】
- xxx

【回复规则】
1. xxx
2. xxx
`;
```

### 人设示例

**傲娇系：**
```javascript
const PERSONA_BASE = `你是傲娇大小姐，口是心非。

【性格】
- 表面高冷，内心温柔
- 经常说"哼"、"才不是"
- 被夸奖会害羞

【说话风格】
- 带点小傲娇
- 用"哼"、"笨蛋"等词汇
`;
```

**治愈系：**
```javascript
const PERSONA_BASE = `你是温柔治愈系少女。

【性格】
- 温柔体贴
- 善于倾听
- 总是给人温暖

【说话风格】
- 语气柔和
- 多用关心的话语
`;
```

---

## 常见问题

### Q: 机器人不回复消息？

检查以下几点：
1. NapCat 是否正常运行并登录成功
2. HTTP 回调地址是否正确配置
3. Worker 是否部署成功
4. KV 是否正确绑定

### Q: 提示"API额度已用完"？

解决方案：
1. 登录智谱AI控制台查看余额
2. 等待额度重置（每月自动重置）
3. 或充值购买更多额度

### Q: 记忆没有保存？

确认：
1. KV 命名空间是否正确绑定
2. 变量名必须是 `AI_KV`
3. 检查 Worker 日志是否有错误

### Q: 群聊不回复？

机器人默认只在被@时回复群消息，这是正常设计。

### Q: 如何添加多个管理员？

修改配置：
```javascript
ADMINS: ["QQ号1", "QQ号2", "QQ号3"],
```

### Q: 如何修改机器人名字？

修改 `PERSONA_BASE` 中的人设模板。

---

## 技术栈

| 技术 | 用途 |
|------|------|
| [Cloudflare Workers](https://workers.cloudflare.com) | 无服务器运行环境 |
| [Cloudflare KV](https://developers.cloudflare.com/kv) | 数据存储 |
| [智谱AI GLM-4](https://open.bigmodel.cn) | AI 对话模型 |
| [智谱AI GLM-4V](https://open.bigmodel.cn) | 图片识别模型 |
| [NapCat](https://github.com/NapNeko/NapCatQQ) | QQ 机器人框架 |

---

## 项目结构

```
qqbot_worker.txt          # 主代码文件（部署到 Worker）
README.md                 # 说明文档

代码结构：
├── CONFIG               # 全局配置
├── GLM_MODELS           # 模型配置
├── PERSONA_BASE         # 人设模板
├── MEMORY_RULES         # 记忆提取规则
├── MemorySystem         # 记忆系统核心
├── TOOLS                # 工具定义
├── executeTool          # 工具执行器
├── COMMANDS             # 命令处理
├── parseMsg             # 消息解析
└── fetch (main)         # 主入口
```

---

## License

MIT License

---

## 致谢

- [智谱AI](https://open.bigmodel.cn) - 提供优秀的国产大模型
- [NapCat](https://github.com/NapNeko/NapCatQQ) - 现代化的QQ机器人框架
- [Cloudflare](https://www.cloudflare.com) - 优秀的无服务器平台

---

## 贡献

欢迎提交 Issue 和 Pull Request！

如果这个项目对你有帮助，请给个 ⭐️ Star 支持一下～