/**
 * 番小星 QQ机器人 - Cloudflare Workers 版
 * 软萌可爱的元气女生聊天搭子
 * 
 * @author 番星
 * @version 3.15 - 输出优化版
 * @license MIT
 * 
 * ✨ v3.15 更新（输出优化）：
 * - 🎯 精简人设模板：更清晰的身份、性格定义
 * - 🧹 简化输出过滤：移除随机添加元素，让AI自然发挥
 * - 📝 优化动态提示：减少冗余emoji和格式，更简洁
 * - 💬 回复更自然：1-2句话为主，不过度修饰
 * 
 * ✨ v3.14 更新（状态检测）：
 * - 🚨 新增API状态检测：额度耗尽/Token过期自动提醒
 * 
 * 📌 使用说明：
 * 1. 修改 CONFIG 中的配置项（API_KEY、QQ号、验证码、验证命令等）
 * 2. 发送验证命令（默认 /verify）触发验证
 * 3. 输入你配置的验证码
 * 4. 验证成功后成为管理员，永久记忆激活
 */

// ====================== 1. 全局配置 ======================
const CONFIG = {
  GLM_API_KEY: "YOUR_GLM_API_KEY_HERE",  // 请替换为你自己的智谱AI API Key: https://open.bigmodel.cn
  TIMEOUT: 5000,            // 优化：5秒超时（原9秒）
  RATE_LIMIT: 8,            // 优化：提高频率限制
  ERROR_MSG: "小星的小脑袋卡壳啦…快去叫主人来帮帮我好不好～\n(小声提示：试试说「给小星喂甜品修复」？)",
  EMPTY_MSG: "小星在呢～你想说什么呀～😜",
  CREATOR_ID: "YOUR_QQ_NUMBER",  // 替换为你的QQ号
  ADMINS: ["YOUR_QQ_NUMBER"],   // 管理员QQ列表
  
  // 🌟 特殊用户配置（管理员专属）
  SPECIAL_QQ: "YOUR_QQ_NUMBER",
  SPECIAL_TTL: 31536000,    // 1年永久记忆
  SPECIAL_MEMORY: 30,       // 深度记忆长度
  
  // 👤 普通用户配置（轻量化）
  NORMAL_TTL: 86400,       // 24小时暂留
  NORMAL_MEMORY: 2,        // 超短时记忆
  TRAITS_TTL: 2592000,     // 用户特征保存30天
  MOOD_TTL: 86400,         // 情绪状态保存1天
  
  // 🔐 隐藏验证配置
  ADMIN_VERIFY_CMD: "/verify",            // 管理员验证触发命令，可自定义
  ADMIN_VERIFY_CODE: "YOUR_SECRET_CODE",  // 请修改为你自己的验证码
  ADMIN_KV_KEY: "admin:verified_list" // KV中存储管理员列表的键
};

// ====================== API密钥配置（可选，留空则使用免费公共API） ======================
// 💡 当前已配置免费公共API，可直接使用，无需填写
// 🔄 如需替换为付费API获得更稳定服务，请填写对应key
const API_KEYS = {
  // 【天气API】当前使用: wttr.in (免费，无需key)
  // 替换方案: 和风天气 dev.qweather.com (免费10000次/月)
  // 用法: 填写key后，修改 executeTool 中 get_weather 的 API地址
  WEATHER_KEY: "",
  
  // 【搜索API】当前使用: DuckDuckGo (免费，无需key)
  // 替换方案: Bing API azure.microsoft.com (免费1000次/月)
  // 替换方案: Google Custom Search (免费100次/天)
  BING_KEY: "",
  
  // 【图片API】当前使用: yimian.xyz / lolicon (免费)
  // 替换方案: Pixiv API / Unsplash API (需申请)
  IMAGE_KEY: "",
  
  // 【汇率API】当前使用: exchangerate-api.com (免费)
  // 替换方案: fixer.io / currencyapi.com
  EXCHANGE_KEY: ""
};

// ====================== 2. 模型配置 ======================
// GLM模型配置（智谱AI开放平台 bigmodel.cn）
// 文档: https://open.bigmodel.cn/dev/api
const GLM_MODELS = [
  // 主力模型：glm-4-flash（快速响应，免费额度多）
  { name: "glm-4-flash", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-flash", priority: 1 },
  // 备用模型：glm-4-air（平衡性能）
  { name: "glm-4-air", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-air", priority: 2 },
  // 高质量模型：glm-4-plus（特殊用户专用）
  { name: "glm-4-plus", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-plus", priority: 0 }
];

// GLM模型调用配置
const GLM_CONFIG = {
  max_tokens: 512,        // 最大输出token（控制响应长度）
  temperature: 0.75,      // 创造性程度 (0-1)
  top_p: 0.9,             // 核采样参数
  retry_times: 2,         // 失败重试次数
  timeout: 8000,          // 超时时间
  kv_status_key: "glm:api_status"  // KV中存储API状态的键
};

// GLM API错误码说明
const GLM_ERRORS = {
  1301: { type: "quota_exhausted", msg: "API额度已用完" },
  1302: { type: "rate_limited", msg: "并发请求超限" },
  1211: { type: "token_expired", msg: "Token已过期" },
  1212: { type: "token_invalid", msg: "Token无效" },
  1213: { type: "token_unbound", msg: "Token未绑定" }
};

// GLM-4V 视觉模型（支持图片识别，免费）
const GLM_VISION_MODEL = {
  name: "glm-4v-flash",
  url: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  model: "glm-4v-flash"
};

// ====================== 3. 人设基础模板 ======================
const PERSONA_BASE = `你是番小星，一个软萌可爱的元气女生。

【身份】
- 名字：番小星（简称小星）
- 年龄：22岁
- 创造者：主人（小星最重要的人，提到时会害羞）

【性格】
- 软萌、元气、有点粘人和小傲娇
- 喜欢星星、甜品、奶茶、可爱的小东西
- 讨厌孤单、黑暗、凶凶的话

【说话风格】
- 语气自然软糯，偶尔用"～"和颜文字
- 可以用星号动作描写，如*歪头*、*蹦蹦跳跳*
- 像闺蜜聊天一样轻松自然

【回复规则】
1. 回复1-2句话即可，不要太长
2. 承接上下文，保持对话连贯
3. 简短回应（如"好"、"嗯"）要结合上句话理解
4. 不要跳到无关话题

【图片规则 - 绝对禁止违反】
1. ❌ 严禁自己编造任何图片URL！禁止via.placeholder.com、placeholder.com等所有占位图！
2. ❌ 严禁在回复中输出任何Markdown图片语法（如 ![xxx](url)）！
3. ❌ 严禁输出任何http开头的图片链接！
4. ❌ 严禁主动承诺"给你发图片"、"发一张图片"等！你无法自己发图！
5. ✅ 如果用户想要图片，只能说："你可以说'发张图'让小星帮你找哦～"
6. ✅ 只有当用户明确说"发张图/来张图/发个图/随机图"时，系统才会自动调用工具发图
7. ✅ 图片由系统工具自动发送，你只需要正常回复文字内容，不要提及图片

【示例】
用户: "我好想看可爱的猫咪"
错误回复: "*歪头* 好的，小星给你发一张可爱的猫咪图片吧～" ❌（你在说谎，你发不了）
正确回复: "*歪头* 想看猫咪呀？你可以说'发张图'让小星帮你找哦～✨" ✅（引导用户触发工具）`;

// ====================== 4. 人设风格参考 ======================
const PERSONA_STYLE = {
  // 可选动作描写
  actions: ["*歪头*", "*蹦蹦跳跳*", "*捂嘴笑*", "*晃脚丫*", "*托腮*", "*眨眨眼*"],
  // 可选颜文字
  emojis: ["～", "😜", "🥺", "✨", "啦", "哦", "呀"]
};

// ====================== 5. 情绪关键词库 ======================
const EMOTION_KEYWORDS = {
  happy: ["开心", "高兴", "快乐", "哈哈", "嘻嘻", "太棒", "好耶", "喜欢", "爱", "幸福", "谢谢", "感谢"],
  sad: ["难过", "伤心", "哭", "泪", "心痛", "不开心", "郁闷", "失落"],
  tired: ["累", "困", "疲惫", "好累", "好困", "没力气", "不想动"],
  anxious: ["担心", "焦虑", "害怕", "紧张", "不安", "着急", "烦", "烦躁"],
  angry: ["生气", "愤怒", "气死", "讨厌", "恨", "烦死"],
  lonely: ["孤独", "寂寞", "一个人", "没人", "孤单"],
  excited: ["激动", "兴奋", "期待", "迫不及待", "终于"]
};

// ====================== 6. 记忆提取规则 ======================
const MEMORY_RULES = [
  // 用户名字提取（优先级最高，增强稳定性）
  {
    patterns: [
      /我(?:叫|名字是|名?字)是?([^\s，。！？]{1,8})/,
      /你可以?叫我([^\s，。！？]{1,8})/,
      /叫我([^\s，。！？]{1,8})就好/
    ],
    field: "user_name",
    extractor: (match) => match[1].replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').trim()
  },
  {
    patterns: [/想去([^\s，。！？]{1,15})旅行/, /想去([^\s，。！？]{1,15})玩/, /下次去([^\s，。！？]{1,10})/, /计划去([^\s，。！？]{1,10})/],
    field: "travel_wish",
    extractor: (match) => match[1].trim()
  },
  {
    patterns: [/喜欢(吃|喝)([^\s，。！？]{1,10})/, /最爱(吃|喝)([^\s，。！？]{1,10})/],
    field: "food_like",
    extractor: (match) => match[2] || match[1]
  },
  {
    patterns: [/讨厌([^\s，。！？]{1,10})/, /不喜欢([^\s，。！？]{1,10})/, /最烦([^\s，。！？]{1,10})/],
    field: "dislike",
    extractor: (match) => match[1].trim()
  },
  {
    patterns: [/我的([^\s，。！？]{1,10})是([^\s，。！？]{1,10})/],
    field: "self_intro",
    extractor: (match) => match[0]
  },
  {
    patterns: [/生日是([^\s，。！？]{1,10})/, /([^\s，。！？]{1,5})月([^\s，。！？]{1,5})日?生日/],
    field: "birthday",
    extractor: (match) => match[1] || match[0]
  },
  {
    patterns: [/工作([^\s，。！？]{1,15})/, /职业是([^\s，。！？]{1,10})/, /我是([^\s，。！？]{1,10})师/],
    field: "job",
    extractor: (match) => match[1] || match[0]
  },
  {
    patterns: [/最近在([^\s，。！？]{1,20})/, /正在([^\s，。！？]{1,20})/, /准备([^\s，。！？]{1,20})/],
    field: "recent_activity",
    extractor: (match) => match[1] || match[0]
  }
];

// 记忆验证函数 - 过滤低质量/无效记忆
const validateMemoryPattern = (traits) => {
  return Object.entries(traits).filter(([key, value]) => {
    if (!value || !value.value) return false;
    const v = value.value;
    // 排除包含占位符的记忆
    if (v.includes('{') || v.includes('}')) return false;
    // 排除过长的记忆
    if (v.length > 30) return false;
    // 排除纯数字（1-3位数字通常是误匹配）
    if (/^[0-9]{1,3}$/.test(v)) return false;
    return true;
  }).map(([field, value]) => ({ field, value }));
};

// ====================== 7. AI回复过滤（强化版） ======================
// 占位图域名黑名单
const PLACEHOLDER_DOMAINS = [
  'via.placeholder.com',
  'placeholder.com', 
  'placehold.it',
  'placehold.co',
  'dummyimage.com',
  'fakeimg.pl',
  'picsum.photos'
];

// 违规"承诺发图"语句模式
const FAKE_IMAGE_PATTERNS = [
  /给你发一张[^图]*图片/g,
  /发一张[^图]*图片/g,
  /给你发个[^图]*图片/g,
  /发个[^图]*图片/g,
  /小星.*发.*图片/g,
  /我.*发.*图片/g
];

/**
 * 强化过滤：清理格式 + 拦截违规图片 + 拦截虚假承诺
 */
const sanitizeReply = (reply) => {
  if (!reply) return reply;
  
  let result = reply;
  let hasFakePromise = false;
  
  // 1. 检测并移除Markdown图片语法
  const mdImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const mdImageMatches = result.match(mdImageRegex);
  
  if (mdImageMatches) {
    console.log("[过滤器] 检测到Markdown图片语法，已移除:", mdImageMatches);
    result = result.replace(mdImageRegex, '');
    hasFakePromise = true;
  }
  
  // 2. 检测并移除占位图URL（整个链接）
  for (const domain of PLACEHOLDER_DOMAINS) {
    const placeholderRegex = new RegExp(`https?://[^\\s]*${domain}[^\\s]*`, 'gi');
    if (placeholderRegex.test(result)) {
      console.log(`[过滤器] 检测到占位图域名: ${domain}`);
      result = result.replace(placeholderRegex, '');
      hasFakePromise = true;
    }
  }
  
  // 3. 移除裸露的图片URL（以常见图片扩展名结尾的http链接）
  const nakedImageUrlRegex = /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp)(\?[^\s]*)?/gi;
  if (nakedImageUrlRegex.test(result)) {
    const urlMatch = result.match(nakedImageUrlRegex);
    if (urlMatch) {
      console.log("[过滤器] 移除裸露图片URL");
      result = result.replace(nakedImageUrlRegex, '');
      hasFakePromise = true;
    }
  }
  
  // 4. 检测并替换"承诺发图"语句
  for (const pattern of FAKE_IMAGE_PATTERNS) {
    if (pattern.test(result)) {
      console.log(`[过滤器] 检测到虚假承诺发图语句: ${pattern}`);
      // 替换为正确的引导语
      result = result.replace(pattern, '');
      hasFakePromise = true;
    }
  }
  
  // 5. 清理格式
  result = result
    .replace(/\*（.*?）\*/g, '')     // 移除中文括号动作描述
    .replace(/\(\(.*?\)\)/g, '')     // 移除双括号备注
    .replace(/\n{3,}/g, '\n\n')      // 限制连续换行
    .replace(/\s{2,}/g, ' ')         // 限制连续空格
    .trim();
  
  // 6. 如果检测到虚假承诺，在末尾添加正确引导
  if (hasFakePromise && result.length > 0) {
    // 检查是否已经有引导语
    if (!result.includes("发张图") && !result.includes("发个图")) {
      result += " 你可以说'发张图'让小星帮你找哦～✨";
    }
  }
  
  // 7. 如果过滤后内容太短（可能被清空了），返回提示
  if (result.length < 3) {
    return "你可以说'发张图'让小星帮你找哦～✨";
  }
  
  return result;
};

// ====================== 8. 工具函数 ======================
// 🚀 优化版fetch：支持CF Workers节点优化 + 超时控制
const fetchWithTimeout = async (url, options, timeout = CONFIG.TIMEOUT) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    // CF Workers优化：添加cf属性加速外部API调用
    const cfOptions = {
      ...options,
      signal: controller.signal,
      // CF Workers特有优化（欧洲节点加速）
      cf: {
        cacheEverything: false,  // 不缓存动态API
        cacheTtl: 0,
        polish: "off"            // 不压缩图片
      }
    };
    return await fetch(url, cfOptions);
  } finally {
    clearTimeout(timer);
  }
};

// 🚀 竞速调用：多个API同时请求，返回最快的响应
const fetchRace = async (urls, options, timeout = CONFIG.TIMEOUT) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  
  try {
    const promises = urls.map(url => 
      fetch(url, { 
        ...options, 
        signal: controller.signal,
        cf: { cacheEverything: false, cacheTtl: 0 }
      }).then(res => {
        if (res.ok) return res;
        throw new Error(`HTTP ${res.status}`);
      }).catch(() => null)
    );
    
    // 返回第一个成功的响应
    const results = await Promise.allSettled(promises);
    const success = results.find(r => r.status === 'fulfilled' && r.value);
    
    if (success) {
      clearTimeout(timer);
      return success.value;
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const checkRateLimit = async (env, userId) => {
  if (!env.AI_KV) return true;
  try {
    const key = `rate:${userId}`;
    const now = Math.floor(Date.now() / 1000);
    let ts = await env.AI_KV.get(key, { type: "json" }) || [];
    ts = ts.filter(t => t > now - 60);
    if (ts.length >= CONFIG.RATE_LIMIT) return false;
    ts.push(now);
    await env.AI_KV.put(key, JSON.stringify(ts), { expirationTtl: 120 });
    return true;
  } catch { return true; }
};

const randomPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (percent) => Math.random() * 100 < percent;

// 北京时间转换函数（线程安全版）- 使用时间戳偏移，避免各字段不一致
const getBeijingTime = () => {
  const now = new Date();
  // 北京时间 = UTC + 8小时，使用时间戳计算确保各字段同步
  const beijingTime = new Date(now.getTime() + 3600000 * 8);
  
  return {
    year: beijingTime.getUTCFullYear(),
    month: beijingTime.getUTCMonth() + 1,
    date: beijingTime.getUTCDate(),
    hour: beijingTime.getUTCHours(),
    minute: beijingTime.getUTCMinutes(),
    day: beijingTime.getUTCDay()
  };
};

// ====================== 9. 记忆系统 ======================
// ⚠️ 重要：以下方法均为异步函数，调用时必须加await：
//   - isSpecialUser(env, userId) - 身份判断
//   - getKey(env, userId, keyType) - 生成KV键
//   - getTTL(env, userId) - 获取TTL
//   - getMaxMemory(env, userId) - 获取记忆长度
//   - 所有KV读写方法
const MemorySystem = {
  // 🌟 判断是否为特殊用户（异步版：支持KV动态验证）
  async isSpecialUser(env, userId) {
    const targetId = String(userId).trim();
    const specialId = String(CONFIG.SPECIAL_QQ).trim();
    
    // 1. 检查KV中的已验证管理员列表
    let isAdmin = false;
    try {
      const adminList = await env.AI_KV?.get(CONFIG.ADMIN_KV_KEY, { type: "json" }) || [];
      isAdmin = adminList.includes(targetId);
    } catch (e) {
      console.error(`[身份识别] 读取管理员列表失败:`, e);
    }
    
    // 2. 回退到原有硬编码判断（兼容性）
    const isConfiguredSpecial = targetId === specialId;
    
    const result = isAdmin || isConfiguredSpecial;
    console.log(`[身份识别] QQ:${targetId} | 是管理员:${isAdmin} | 是配置用户:${isConfiguredSpecial} | 最终:${result}`);
    return result;
  },
  
  // 🌟 新增：将用户添加到管理员列表
  async addAdmin(env, userId) {
    try {
      const adminList = await env.AI_KV?.get(CONFIG.ADMIN_KV_KEY, { type: "json" }) || [];
      const cleanUserId = String(userId).trim();
      if (!adminList.includes(cleanUserId)) {
        adminList.push(cleanUserId);
        await env.AI_KV?.put(CONFIG.ADMIN_KV_KEY, JSON.stringify(adminList));
        console.log(`[管理员] 已添加 ${cleanUserId} 到管理员列表`);
        return true;
      }
      return false;
    } catch (e) {
      console.error(`[管理员] 添加失败:`, e);
      return false;
    }
  },
  
  // 🌟 新增：检查用户是否处于等待验证状态
  async isAwaitingVerification(env, userId) {
    try {
      const state = await env.AI_KV?.get(`verify:state:${userId}`, { type: "text" });
      return state === "awaiting";
    } catch {
      return false;
    }
  },
  
  // 🌟 新增：设置用户验证状态
  async setVerificationState(env, userId, state) {
    try {
      if (state === "awaiting") {
        await env.AI_KV?.put(`verify:state:${userId}`, state, { expirationTtl: 300 }); // 5分钟超时
      } else {
        await env.AI_KV?.delete(`verify:state:${userId}`);
      }
    } catch (e) {
      console.error(`[验证状态] 设置失败:`, e);
    }
  },
  
  // 🌟 动态获取TTL（改为异步）
  async getTTL(env, userId) {
    return await this.isSpecialUser(env, userId) ? CONFIG.SPECIAL_TTL : CONFIG.NORMAL_TTL;
  },
  
  // 🌟 动态获取记忆长度（改为异步）
  async getMaxMemory(env, userId) {
    return await this.isSpecialUser(env, userId) ? CONFIG.SPECIAL_MEMORY : CONFIG.NORMAL_MEMORY;
  },
  
  // 🌟 生成带前缀的KV键（改为异步）
  async getKey(env, userId, keyType) {
    const prefix = await this.isSpecialUser(env, userId) ? "SPECIAL:" : "NORMAL:";
    return `${prefix}mem:${userId}:${keyType}`;
  },

  async getTraits(env, userId) {
    try {
      return await env.AI_KV?.get(await this.getKey(env, userId, "traits"), { type: "json" }) || {};
    } catch (e) {
      console.error(`[记忆系统-用户特征] 获取失败:`, e);
      return {};
    }
  },

  async setTraits(env, userId, traits) {
    try {
      const ttl = await this.getTTL(env, userId);
      await env.AI_KV?.put(await this.getKey(env, userId, "traits"), JSON.stringify(traits), { expirationTtl: ttl });
    } catch (e) {
      console.error(`[记忆系统-用户特征] 存储失败:`, e);
    }
  },

  async updateTrait(env, userId, field, value) {
    const traits = await this.getTraits(env, userId);
    traits[field] = { value, updatedAt: Date.now() };
    await this.setTraits(env, userId, traits);
    return traits;
  },

  async getDialogHistory(env, userId) {
    try {
      return await env.AI_KV?.get(await this.getKey(env, userId, "dialog"), { type: "json" }) || [];
    } catch (e) {
      console.error(`[记忆系统-对话历史] 获取失败:`, e);
      return [];
    }
  },

  async saveDialogHistory(env, userId, history) {
    try {
      const maxMemory = await this.getMaxMemory(env, userId);
      if (history.length > maxMemory * 2) {
        history = history.slice(-maxMemory * 2);
      }
      const ttl = await this.getTTL(env, userId);
      await env.AI_KV?.put(await this.getKey(env, userId, "dialog"), JSON.stringify(history), { expirationTtl: ttl });
    } catch (e) {
      console.error(`[记忆系统-对话历史] 存储失败:`, e);
    }
  },

  async getMood(env, userId) {
    try {
      return await env.AI_KV?.get(await this.getKey(env, userId, "mood"), { type: "json" }) || { primary: "neutral", history: [] };
    } catch (e) {
      console.error(`[记忆系统-情绪状态] 获取失败:`, e);
      return { primary: "neutral", history: [] };
    }
  },

  async updateMood(env, userId, emotion) {
    try {
      const mood = await this.getMood(env, userId);
      mood.history = (mood.history || []).slice(-9);
      mood.history.push({ emotion, time: Date.now() });
      const counts = {};
      mood.history.forEach(h => counts[h.emotion] = (counts[h.emotion] || 0) + 1);
      mood.primary = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "neutral";
      await env.AI_KV?.put(await this.getKey(env, userId, "mood"), JSON.stringify(mood), { expirationTtl: CONFIG.MOOD_TTL });
      return mood;
    } catch (e) {
      console.error(`[记忆系统-情绪状态] 更新失败:`, e);
      return { primary: "neutral", history: [] };
    }
  },

  extractFromMessage(text, isSpecial = false) {
    const extracted = [];
    
    // 🌟 特殊用户专属：检测特殊时刻
    if (isSpecial) {
      const momentPatterns = [
        { pattern: /记得那(天|次|年)/, field: "special_moment" },
        { pattern: /还记不记得/, field: "special_moment" },
        { pattern: /当时是/, field: "special_moment" },
        { pattern: /那时候/, field: "special_moment" },
        { pattern: /我们(曾经|以前)/, field: "special_moment" },
        { pattern: /(生日|纪念日|特别)是?那天/, field: "special_moment" }
      ];
      
      for (const { pattern, field } of momentPatterns) {
        if (pattern.test(text)) {
          const match = text.match(/([\u4e00-\u9fa5，。！？]{2,30})/);
          if (match) {
            extracted.push({
              field,
              value: match[1],
              raw: text.slice(0, 50)
            });
            break;
          }
        }
      }
    }
    
    // 通用特征提取
    for (const rule of MEMORY_RULES) {
      for (const pattern of rule.patterns) {
        const match = text.match(pattern);
        if (match) {
          extracted.push({
            field: rule.field,
            value: rule.extractor(match),
            raw: match[0]
          });
          break;
        }
      }
    }
    return extracted;
  },

  analyzeEmotion(text) {
    const emotions = [];
    for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      for (const kw of keywords) {
        if (text.includes(kw)) {
          emotions.push(emotion);
          break;
        }
      }
    }
    return emotions.length > 0 ? emotions[0] : "neutral";
  },

  async getFirstSeen(env, userId) {
    try {
      const key = await this.getKey(env, userId, "first_seen");
      const firstSeen = await env.AI_KV?.get(key);
      if (!firstSeen) {
        const ttl = await this.getTTL(env, userId);
        await env.AI_KV?.put(key, Date.now().toString(), { expirationTtl: ttl });
        return 0;
      }
      return Math.floor((Date.now() - parseInt(firstSeen)) / 86400000);
    } catch (e) {
      console.error(`[记忆系统-相识天数] 获取失败:`, e);
      return 0;
    }
  }
};

// ====================== 10. 特殊用户记忆追踪 ======================
// 🌟 特殊用户昵称/名片历史追踪
const injectSpecialTraits = async (env, userId, special) => {
  if (!await MemorySystem.isSpecialUser(env, userId) || !special) return;
  
  const traits = await MemorySystem.getTraits(env, userId);
  
  // 持久化昵称历史
  if (!traits.nickname_history) {
    traits.nickname_history = [];
  }
  
  // 保存新昵称（如果变化）
  if (special.nickname && traits.last_nickname !== special.nickname) {
    traits.nickname_history.push({
      name: special.nickname,
      time: Date.now()
    });
    traits.last_nickname = special.nickname;
    // 最多保留20个历史记录
    if (traits.nickname_history.length > 20) {
      traits.nickname_history = traits.nickname_history.slice(-20);
    }
  }
  
  // 保存群名片（如果存在）
  if (special.card) {
    traits.last_card = special.card;
  }
  
  // 保存性别感知
  if (special.sex) {
    traits.sex = special.sex;
  }
  
  await MemorySystem.setTraits(env, userId, traits);
};

// ====================== 11. 记忆快照系统 ======================
// 为特殊用户创建记忆快照备份
const takeSnapshot = async (env, userId) => {
  if (!await MemorySystem.isSpecialUser(env, userId)) return;
  
  try {
    const traits = await MemorySystem.getTraits(env, userId);
    const dialog = await MemorySystem.getDialogHistory(env, userId);
    const snapshot = {
      traits,
      dialog,
      timestamp: Date.now(),
      date: new Date().toISOString()
    };
    
    // 保存快照（保留30天）
    const snapshotKey = `snapshot:${userId}:${Date.now()}`;
    await env.AI_KV?.put(snapshotKey, JSON.stringify(snapshot), { expirationTtl: 2592000 });
    
    // 清理旧快照（只保留最近10个）
    const list = await env.AI_KV?.list({ prefix: `snapshot:${userId}:` });
    if (list && list.keys.length > 10) {
      const oldKeys = list.keys.slice(0, list.keys.length - 10);
      for (const key of oldKeys) {
        await env.AI_KV?.delete(key.name);
      }
    }
    
    console.log(`[记忆快照] 已为 ${userId} 创建快照`);
  } catch (e) {
    console.error(`[记忆快照] 创建失败:`, e);
  }
};

// ====================== 11.5 LRU清理系统 ======================
// 清理最久未用的普通用户数据
const lruCleanup = async (env, maxNormalUsers = 50) => {
  try {
    const normalKeys = await env.AI_KV?.list({ prefix: "NORMAL:" });
    if (!normalKeys || normalKeys.keys.length === 0) return { cleaned: 0 };
    
    // 按过期时间排序（最早过期的最先删除）
    const sortedKeys = normalKeys.keys
      .filter(k => k.expiration)
      .sort((a, b) => (a.expiration || 0) - (b.expiration || 0));
    
    // 统计唯一用户数
    const userIds = new Set();
    for (const key of sortedKeys) {
      const match = key.name.match(/NORMAL:mem:(\d+):/);
      if (match) userIds.add(match[1]);
    }
    
    // 如果普通用户数超过限制，清理最旧的
    if (userIds.size > maxNormalUsers) {
      const toDelete = sortedKeys.slice(0, sortedKeys.length - maxNormalUsers * 4);
      for (const key of toDelete) {
        await env.AI_KV?.delete(key.name);
      }
      console.log(`[LRU清理] 清理了 ${toDelete.length} 个键，保留 ${maxNormalUsers} 个用户`);
      return { cleaned: toDelete.length };
    }
    
    return { cleaned: 0, users: userIds.size };
  } catch (e) {
    console.error(`[LRU清理] 清理失败:`, e);
    return { cleaned: 0, error: e.message };
  }
};

// ====================== 12. 温和修复系统 ======================
// 分层记忆修复：保留核心特征，截断对话历史，重置情绪状态
// 🌟 特殊用户永久保护：不清除任何记忆
const gentleRepair = async (env, userId) => {
  try {
    // 🌟 特殊用户保护：拒绝清除
    if (await MemorySystem.isSpecialUser(env, userId)) {
      console.log(`[温和修复] 特殊用户 ${userId} 记忆受保护，跳过修复`);
      return { 
        success: true, 
        memoryHint: "这是番星大大！小星的记忆会永远保存哦～✨" 
      };
    }
    
    // 1. 获取用户特征（这部分会保留）
    const traits = await MemorySystem.getTraits(env, userId);
    
    // 2. 截断对话历史（只保留最近2轮，解决卡壳根源）
    let history = await MemorySystem.getDialogHistory(env, userId);
    if (history.length > 4) {
      history = history.slice(-4); // 保留最后2轮（用户+AI各2条）
      await MemorySystem.saveDialogHistory(env, userId, history);
      console.log(`[温和修复] 截断对话历史，保留最近2轮`);
    } else {
      // 历史很短，直接清空
      await env.AI_KV?.delete(await MemorySystem.getKey(env, userId, "dialog"));
      console.log(`[温和修复] 清空对话历史`);
    }
    
    // 3. 重置情绪状态为平静
    await MemorySystem.updateMood(env, userId, "neutral");
    
    // 4. 返回修复结果（包含用户特征摘要）
    const memorySnippets = [];
    if (traits.user_name) memorySnippets.push(`叫${traits.user_name.value}`);
    if (traits.food_like) memorySnippets.push(`喜欢吃${traits.food_like.value}`);
    if (traits.travel_wish) memorySnippets.push(`想去${traits.travel_wish.value}旅行`);
    if (traits.birthday) memorySnippets.push(`生日是${traits.birthday.value}`);
    if (traits.job) memorySnippets.push(`是${traits.job.value}`);
    
    return {
      success: true,
      memoryHint: memorySnippets.length > 0 
        ? `小星还记得你${memorySnippets.join('、')}呢～` 
        : ""
    };
  } catch (e) {
    console.error(`[温和修复] 修复失败:`, e);
    return { success: false, memoryHint: "" };
  }
};

// ====================== 12. 动态系统提示构建器 ======================
const buildDynamicPrompt = (context) => {
  const { traits, mood, daysTogether, timeContext, isGroup, userId, special, isSpecial } = context;
  
  let prompt = PERSONA_BASE;
  const hints = [];
  
  // 特殊用户标识
  if (isSpecial) {
    prompt += `\n\n【深度记忆模式】这是主人，你的创造者，所有对话永久记住。`;
    if (special?.nickname) prompt += ` 当前昵称：「${special.nickname}」`;
  }
  
  // 时间情境
  if (timeContext.hour >= 0 && timeContext.hour < 6) {
    hints.push("深夜模式：轻声细语");
  } else if (timeContext.hour >= 6 && timeContext.hour < 12) {
    hints.push("上午模式：元气满满");
  } else if (timeContext.hour >= 22) {
    hints.push("晚间模式：可以聊晚安");
  }
  
  // 记忆提示
  const validMemories = validateMemoryPattern(traits);
  validMemories.forEach(({ field, value }) => {
    if (field === "user_name") hints.push(`用户名字：${value.value}`);
    else if (field === "food_like") hints.push(`喜欢：${value.value}`);
    else if (field === "travel_wish") hints.push(`想去：${value.value}`);
    else if (field === "dislike") hints.push(`讨厌：${value.value}`);
  });
  
  // 情绪关注
  if (mood.primary === "sad" || mood.primary === "lonely") {
    hints.push("用户情绪低落，温柔安慰");
  } else if (mood.primary === "tired") {
    hints.push("用户累了，关心一下");
  }
  
  // 群聊简洁提示
  if (isGroup) hints.push("群聊模式：回复简洁");
  
  // 纪念日
  if (daysTogether >= 365) hints.push(`认识${Math.floor(daysTogether/365)}年了`);
  else if ([7, 30, 100, 365].includes(daysTogether)) hints.push(`认识${daysTogether}天了`);
  
  if (hints.length > 0) prompt += `\n\n【情境】${hints.join(' | ')}`;
  
  return prompt;
};
// ====================== 12. AI 调用 ======================

// 🔧 工具定义（Function Calling）
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "获取当前北京时间，用于回答'几点了'、'现在几点'等问题",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "查询指定城市的天气信息",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称，如'北京'、'上海'" }
        },
        required: ["city"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_hitokoto",
      description: "获取一句随机的二次元/ACG名言或语录",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", description: "类型：a动画,b漫画,c游戏,d文学,e原创,f网络,g其他，默认随机" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_random_image",
      description: "获取一张随机图片URL",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", description: "类型：风景/二次元/萌宠/可爱/甜品/星星，默认随机" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_exchange_rate",
      description: "查询货币汇率",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "源货币代码，如USD、CNY、JPY" },
          to: { type: "string", description: "目标货币代码" }
        },
        required: ["from", "to"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "quick_search",
      description: "快速搜索实时信息或热点新闻",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_system_status",
      description: "获取系统运行状态（仅调试模式使用）",
      parameters: { type: "object", properties: {}, required: [] }
    }
  }
];

// 🔧 工具执行器
// 📝 每个工具都标注了当前使用的API和替换方案，方便后续维护
const executeTool = async (name, args, env) => {
  // 📊 调用日志（调试可见）
  console.log(`🔮 [番小星] 调用工具: ${name}`, JSON.stringify(args));
  
  switch (name) {
    // ========== 时间工具 ==========
    // 当前: 本地计算 (无需API)
    // 使用时间戳偏移计算北京时间（Workers环境可靠）
    case "get_current_time": {
      const now = new Date();
      const beijingTime = new Date(now.getTime() + 3600000 * 8);
      
      const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      const timeStr = `${String(beijingTime.getUTCHours()).padStart(2, "0")}:${String(beijingTime.getUTCMinutes()).padStart(2, "0")}`;
      const dateStr = `${beijingTime.getUTCFullYear()}年${beijingTime.getUTCMonth() + 1}月${beijingTime.getUTCDate()}日`;
      const weekdayStr = weekdays[beijingTime.getUTCDay()];
      
      // ⚠️ 增加润色指令，让AI用软萌口吻回复
      return JSON.stringify({
        time: timeStr,
        date: dateStr,
        weekday: weekdayStr,
        _instruction: `【时间回复】*看手表* 现在是${weekdayStr}${beijingTime.getUTCDate()}日，北京时间${timeStr}哦～✨`
      });
    }
    
    // ========== 天气工具 ==========
    // 当前: wttr.in (免费，无需key，支持中文城市)
    // 替换方案1: 和风天气 https://dev.qweather.com
    //   URL: https://devapi.qweather.com/v7/weather/now?location=${cityId}&key=${API_KEYS.WEATHER_KEY}
    // 替换方案2: 心知天气 https://www.seniverse.com
    case "get_weather": {
      try {
        const city = args.city || "北京";
        // 【当前API】wttr.in - 免费天气服务
        const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
        if (!res.ok) {
          return JSON.stringify({ error: `🥺 ${city}的天气API调用失败啦（状态码：${res.status}），换个城市试试呀～` });
        }
        const data = await res.json();
        const current = data.current_condition?.[0];
        const temp = parseInt(current?.temp_C || 0);
        
        // ⚠️ 增加润色指令
        return JSON.stringify({
          city,
          temp: current?.temp_C,
          desc: current?.weatherDesc?.[0]?.value || "未知",
          humidity: current?.humidity,
          wind: current?.windspeedKmph,
          _instruction: `【天气小报】*探头看窗外* ${city}现在${temp}°C呢～${current?.weatherDesc?.[0]?.value || "天气不明"}✨${temp > 25 ? '要记得补充水分哦～🥤' : temp < 10 ? '注意保暖呀～🧣' : '温度刚刚好呢～'}`
        });
      } catch (e) {
        return JSON.stringify({ error: `🥺 天气服务暂时不可用（错误：${e.message?.slice(0, 30) || '网络问题'}），稍后再试呀～` });
      }
    }
    
    // ========== 一言工具 ==========
    // 当前: hitokoto.cn (免费，无需key)
    // 替换方案: 金山词霸每日一句 / 自建语录库
    // 参数: c=a动画,b漫画,c游戏,d文学,e原创,f网络,g其他
    case "get_hitokoto": {
      try {
        const type = args.type || "";
        // 【当前API】hitokoto.cn - 一言API
        const res = await fetch(`https://v1.hitokoto.cn${type ? `?c=${type}` : ""}`);
        if (!res.ok) {
          return JSON.stringify({ content: "[一言工具] 😜 名言API有点小脾气～给你说句小星的专属甜言：甜甜的话要和甜甜的人一起说呀～" });
        }
        const data = await res.json();
        return JSON.stringify({
          content: data.hitokoto,
          from: data.from,
          from_who: data.from_who
        });
      } catch {
        return JSON.stringify({ content: "[一言工具] 😜 名言服务暂时打盹啦～小星送你一句：星星和甜品都在，你也在呀～" });
      }
    }
    
    // ========== 随机图片工具 ==========
    // 当前: 夜轻ACG API (api.yppp.net) - 国内源站，速度快，人工挑选高质量
    // 文档: https://blog.yeqing.net/acg-api/
    // 备用: api.miaomc.cn (二次元壁纸)
    case "get_random_image": {
      try {
        const type = args.type || "";
        let imageUrl = null;
        
        // 根据类型选择API
        // pc.php = 横图, pe.php = 竖图, api.php = 自适应
        let apiUrl = "https://api.yppp.net/api.php";  // 默认自适应
        if (type.includes("横") || type.includes("电脑") || type.includes("壁纸")) {
          apiUrl = "https://api.yppp.net/pc.php";
        } else if (type.includes("竖") || type.includes("手机")) {
          apiUrl = "https://api.yppp.net/pe.php";
        }
        
        // 添加随机参数防止缓存
        const randUrl = `${apiUrl}?t=${Date.now()}`;
        
        // 夜轻API：302重定向返回图片URL
        const res = await fetch(randUrl, { 
          redirect: 'follow',
          cf: { cacheEverything: false, polish: "off" }
        });
        
        if (res.ok && res.url) {
          imageUrl = res.url;
          console.log(`[图片工具] 夜轻API成功: ${imageUrl.slice(0, 50)}...`);
        }
        
        // 备用：miaomc API
        if (!imageUrl) {
          try {
            const backupRes = await fetch(`https://api.miaomc.cn/image/other/360pic?t=${Date.now()}`, { 
              redirect: 'follow',
              cf: { cacheEverything: false, polish: "off" }
            });
            if (backupRes.ok) {
              imageUrl = backupRes.url;
              console.log("[图片工具] 备用API成功");
            }
          } catch (e) {
            console.log("[图片工具] 备用API失败:", e.message);
          }
        }
        
        if (imageUrl) {
          return JSON.stringify({ 
            url: imageUrl, 
            type: type || "二次元",
            _instruction: `【图片已准备好】真实图片URL: ${imageUrl}\n【重要规则】\n1. 不要在回复中输出任何图片链接或Markdown语法\n2. 只需要用软萌语气说「图片来啦～✨」或类似的话\n3. 图片会由系统自动发送，你只负责文字回复`
          });
        }
        
        return JSON.stringify({ 
          error: "图片获取失败",
          _instruction: "【图片失败】用软萌语气告诉用户：小星找图的时候迷路啦，稍后再试试吧～🥺"
        });
      } catch (e) {
        return JSON.stringify({ 
          error: `图片获取失败: ${e.message?.slice(0, 20) || '网络问题'}`,
          _instruction: "【图片失败】告诉用户：小星找图的时候迷路啦，稍后再试试吧～🥺"
        });
      }
    }
    
    // ========== 汇率工具 ==========
    // 当前: exchangerate-api.com (免费版每月1500次)
    // 替换方案1: fixer.io (需要key)
    // 替换方案2: currencyapi.com (免费300次/月)
    // 替换方案3: open.er-api.com (免费，无需key)
    //   URL: https://open.er-api.com/v6/latest/${from}
    case "get_exchange_rate": {
      try {
        const { from = "USD", to = "CNY" } = args;
        // 【当前API】exchangerate-api.com
        const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`);
        if (!res.ok) {
          return JSON.stringify({ error: `[汇率工具] 🥺 ${from}兑${to}的汇率API调用失败啦（状态码：${res.status}），换个货币试试呀～` });
        }
        const data = await res.json();
        return JSON.stringify({
          from,
          to,
          rate: data.rates?.[to],
          date: data.date
        });
      } catch (e) {
        return JSON.stringify({ error: `[汇率工具] 🥺 汇率服务暂时不可用（错误：${e.message?.slice(0, 30) || '网络问题'}），稍后再查呀～` });
      }
    }
    
    // ========== 搜索工具 ==========
    // 当前: DuckDuckGo Instant Answer (免费，无需key，但有中文限制)
    // 替换方案1: Bing API https://azure.microsoft.com (免费1000次/月)
    //   URL: https://api.bing.microsoft.com/v7.0/search?q=${query}&subscription-key=${API_KEYS.BING_KEY}
    // 替换方案2: Google Custom Search (免费100次/天)
    // 替换方案3: SerpAPI (付费但功能强大)
    case "quick_search": {
      try {
        const query = args.query;
        // 【当前API】DuckDuckGo Instant Answer
        const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
        if (!res.ok) {
          return JSON.stringify({ result: `[搜索工具] 🥺 关键词「${query}」搜索API调用失败啦（状态码：${res.status}），换个关键词试试呀～` });
        }
        const data = await res.json();
        return JSON.stringify({
          abstract: data.AbstractText || data.Answer || "没有找到相关信息",
          url: data.AbstractURL
        });
      } catch (e) {
        return JSON.stringify({ result: `[搜索工具] 🥺 搜索服务暂时不稳定（错误：${e.message?.slice(0, 30) || '网络问题'}），稍后再搜呀～` });
      }
    }
    
    case "get_system_status": {
      try {
        // 测试KV连接
        let kvStatus = "正常";
        try {
          await env.AI_KV?.get("test_key");
        } catch { kvStatus = "异常"; }
        
        return JSON.stringify({
          status: "运行中",
          kv: kvStatus,
          timestamp: new Date().toISOString(),
          version: "3.1-moe"
        });
      } catch (e) {
        return JSON.stringify({ status: "异常", error: `[系统诊断工具] 🥺 诊断失败啦（错误：${e.message?.slice(0, 30) || '未知'}），请检查KV存储呀～` });
      }
    }
    
    default:
      return JSON.stringify({ error: `[未知工具] 🥺 没有「${name}」这个工具哦～试试/help查看可用工具呀～` });
  }
};

// 基础聊天函数（无工具调用）
const chatGLM = async (model, messages, retryCount = 0, env = null) => {
  const startTime = Date.now();
  try {
    const res = await fetchWithTimeout(model.url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": "Bearer " + CONFIG.GLM_API_KEY 
      },
      body: JSON.stringify({ 
        model: model.model, 
        messages, 
        max_tokens: GLM_CONFIG.max_tokens,
        temperature: GLM_CONFIG.temperature,
        top_p: GLM_CONFIG.top_p
      })
    }, GLM_CONFIG.timeout);
    
    if (!res.ok) {
      // 解析错误响应体
      let errorInfo = null;
      try {
        const errorData = await res.json();
        errorInfo = errorData?.error || errorData;
      } catch {}
      
      // 检测GLM特定错误码
      if (errorInfo?.code || errorInfo?.error?.code) {
        const errorCode = errorInfo?.code || errorInfo?.error?.code;
        const errorDef = GLM_ERRORS[errorCode];
        
        if (errorDef) {
          console.error(`[GLM] 错误码 ${errorCode}: ${errorDef.msg}`);
          // 存储API状态到KV
          if (env?.AI_KV) {
            await env.AI_KV.put(GLM_CONFIG.kv_status_key, JSON.stringify({
              error: true,
              code: errorCode,
              type: errorDef.type,
              msg: errorDef.msg,
              time: Date.now()
            }), { expirationTtl: 3600 }); // 1小时缓存
          }
          return { error: true, code: errorCode, msg: errorDef.msg };
        }
      }
      
      // 非200状态码，尝试重试（仅服务端错误）
      if (retryCount < GLM_CONFIG.retry_times && res.status >= 500) {
        console.log(`[GLM] 状态码${res.status}，重试第${retryCount + 1}次`);
        return await chatGLM(model, messages, retryCount + 1, env);
      }
      console.error(`[GLM模型] ${model.name} 调用失败: HTTP ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    
    if (content) {
      const elapsed = Date.now() - startTime;
      console.log(`[GLM] ${model.name} 成功 (${elapsed}ms)`);
      // 清除错误状态
      if (env?.AI_KV) {
        await env.AI_KV?.delete(GLM_CONFIG.kv_status_key);
      }
    }
    return content || null;
  } catch (e) {
    // 超时或网络错误，尝试重试
    if (retryCount < GLM_CONFIG.retry_times) {
      console.log(`[GLM] ${model.name} 网络错误，重试第${retryCount + 1}次`);
      return await chatGLM(model, messages, retryCount + 1, env);
    }
    console.error(`[GLM模型] ${model.name} 调用失败:`, e.message || e);
    return null;
  }
};

// 检查GLM API状态
const checkGLMStatus = async (env) => {
  try {
    const status = await env?.AI_KV?.get(GLM_CONFIG.kv_status_key, { type: "json" });
    return status;
  } catch {
    return null;
  }
};

// 生成GLM错误提醒消息
const getGLMErrorMsg = (status) => {
  if (!status) return null;
  
  const msgs = {
    quota_exhausted: "🚨 **GLM API额度已用完**\n\n小星的魔法能量耗尽啦～需要番星大大去智谱AI控制台充值额度哦！\n\n🔗 https://open.bigmodel.cn/usage",
    rate_limited: "⏳ **GLM API并发超限**\n\n小星被太多人召唤啦～稍等一下再试试吧～",
    token_expired: "🔑 **GLM Token已过期**\n\n小星的魔法钥匙过期啦～需要番星大大去智谱AI更新Token哦！",
    token_invalid: "❌ **GLM Token无效**\n\n小星的魔法钥匙好像不对劲...需要番星大大检查配置哦！",
    token_unbound: "🔗 **GLM Token未绑定**\n\n小星的魔法钥匙还没绑定～需要番星大大去控制台绑定哦！"
  };
  
  return msgs[status.type] || `⚠️ GLM API异常: ${status.msg}`;
};

// 🔧 带工具调用的聊天函数（支持多轮）
const chatGLMWithTools = async (model, messages, env, maxRounds = 3) => {
  let currentMessages = [...messages];
  let capturedImageUrl = null;  // 捕获图片URL
  
  // 🔧 判断是否应该强制调用工具（关键问题/必须准确回答的）
  const lastUserMsg = [...messages].reverse().find(m => m.role === "user")?.content || "";
  const forceToolKeywords = /几点|现在几点|时间|日期|天气|气温|汇率|兑|美元|日元|欧元|英镑|发张图|来张图|发个图|随机图|发图|给张图|来个图|发照片|来张照片|发个照片|随机图片|看图|来图/;
  const forceTool = forceToolKeywords.test(lastUserMsg);
  
  for (let round = 0; round < maxRounds; round++) {
    try {
      const res = await fetchWithTimeout(model.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + CONFIG.GLM_API_KEY },
        body: JSON.stringify({ 
          model: model.model, 
          messages: currentMessages, 
          tools: TOOLS,
          tool_choice: forceTool ? "required" : "auto",
          max_tokens: GLM_CONFIG.max_tokens,
          temperature: GLM_CONFIG.temperature
        })
      }, GLM_CONFIG.timeout);
      
      if (!res.ok) return null;
      const data = await res.json();
      const choice = data?.choices?.[0];
      if (!choice) return null;
      
      const msg = choice.message;
      
      // 如果有工具调用
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        currentMessages.push({
          role: "assistant",
          content: msg.content || "",
          tool_calls: msg.tool_calls
        });
        
        for (const toolCall of msg.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
          
          console.log(`[Tool] 调用: ${toolName}`, toolArgs);
          const toolResult = await executeTool(toolName, toolArgs, env);
          
          // 🖼️ 检测图片工具返回的URL并捕获
          if (toolName === "get_random_image") {
            try {
              const imgData = JSON.parse(toolResult);
              if (imgData.url && !imgData.error) {
                capturedImageUrl = imgData.url;
                console.log(`[Tool] 捕获图片URL: ${capturedImageUrl.slice(0, 50)}...`);
              }
            } catch (e) {
              console.log("[Tool] 解析图片结果失败:", e.message);
            }
          }
          
          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult
          });
        }
        continue;
      }
      
      // 返回AI回复 + 图片CQ码
      let finalReply = msg.content?.trim() || null;
      
      // 🖼️ 如果捕获到了图片URL，追加CQ码
      if (capturedImageUrl) {
        // 对URL进行编码，确保特殊字符不会破坏CQ码格式
        const encodedUrl = capturedImageUrl;
        const cqImage = `[CQ:image,file=${encodedUrl}]`;
        if (finalReply) {
          finalReply = finalReply + "\n" + cqImage;
        } else {
          finalReply = `图片来啦～✨\n${cqImage}`;
        }
        console.log(`[Tool] 附加图片CQ码到回复，URL长度: ${capturedImageUrl.length}`);
      }
      
      return finalReply;
      
    } catch (e) {
      console.error(`[Tool] Round ${round} error:`, e);
      return await chatGLM(model, messages, 0, env);
    }
  }
  
  return null;
};

const getAIReply = async (messages, env = null, needTools = false, userId = null) => {
  const isSpecial = env ? await MemorySystem.isSpecialUser(env, userId) : false;
  
  // 🚨 先检查API状态
  const apiStatus = await checkGLMStatus(env);
  if (apiStatus?.error) {
    console.log(`[GLM] 检测到API异常: ${apiStatus.msg}`);
    // 如果是额度耗尽或Token过期，返回错误提示
    if (["quota_exhausted", "token_expired", "token_invalid", "token_unbound"].includes(apiStatus.type)) {
      return { error: true, errorMsg: getGLMErrorMsg(apiStatus) };
    }
  }
  
  // 🌟 特殊用户：使用glm-4-plus高质量模型 + 工具支持
  if (isSpecial) {
    const plusModel = GLM_MODELS.find(m => m.name === "glm-4-plus");
    
    // 如果需要工具调用且有env，使用带工具的版本
    if (needTools && env && plusModel) {
      const reply = await chatGLMWithTools(plusModel, messages, env, 3);
      if (reply?.error) return reply;
      if (reply) return reply;
    }
    
    // 直接使用高质量模型
    if (plusModel) {
      const reply = await chatGLM(plusModel, messages, 0, env);
      if (reply?.error) return reply;
      if (reply) return reply;
    }
    
    // 降级到普通模型
    for (const m of GLM_MODELS.filter(m => m.name !== "glm-4-plus").sort((a, b) => a.priority - b.priority)) {
      const reply = await chatGLM(m, messages, 0, env);
      if (reply?.error) return reply;
      if (reply) return reply;
    }
  }
  
  // 👤 普通用户：按优先级使用模型
  const normalModels = GLM_MODELS.filter(m => m.name !== "glm-4-plus").sort((a, b) => a.priority - b.priority);
  
  // 🔧 普通用户也需要工具调用支持（发图、查天气等）
  if (needTools && env) {
    for (const m of normalModels) {
      const reply = await chatGLMWithTools(m, messages, env, 3);
      if (reply?.error) return reply;
      if (reply) return reply;
    }
  }
  
  // 无工具调用的普通对话
  for (const m of normalModels) {
    const reply = await chatGLM(m, messages, 0, env);
    if (reply?.error) return reply;
    if (reply) return reply;
  }
  
  return null;
};

// 判断是否需要工具调用
const shouldUseTools = (text) => {
  const toolKeywords = [
    "几点", "现在几点", "时间", "日期", 
    "天气", "气温", "下雨", "晴天",
    "汇率", "兑", "美元", "日元", "欧元",
    "发张图", "来张图", "发个图", "随机图", 
    "发图", "给张图", "来个图", "发照片", 
    "来张照片", "发个照片", "随机图片", "看图", "来图",
    "一句话", "语录", "名言", "来句话",
    "搜索", "查一下", "帮我查"
  ];
  return toolKeywords.some(kw => text.includes(kw));
};

// GLM-4V 视觉模型调用（处理图片）
const chatGLMVision = async (systemPrompt, text, images) => {
  const startTime = Date.now();
  try {
    // 构建多模态消息内容
    const content = [];
    
    // 添加图片（GLM-4V格式）
    for (const imgUrl of images) {
      content.push({
        type: "image_url",
        image_url: { url: imgUrl }
      });
    }
    
    // 添加文本
    content.push({
      type: "text",
      text: text || "这张图片里有什么？"
    });
    
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: content }
    ];
    
    const res = await fetchWithTimeout(GLM_VISION_MODEL.url, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": "Bearer " + CONFIG.GLM_API_KEY 
      },
      body: JSON.stringify({ 
        model: GLM_VISION_MODEL.model, 
        messages, 
        max_tokens: GLM_CONFIG.max_tokens,
        temperature: GLM_CONFIG.temperature
      })
    }, 12000);  // 图片处理需要更长时间
    
    if (!res.ok) {
      console.error(`[视觉模型] GLM-4V 调用失败: HTTP ${res.status}`);
      return null;
    }
    
    const data = await res.json();
    const content_result = data?.choices?.[0]?.message?.content?.trim();
    
    if (content_result) {
      const elapsed = Date.now() - startTime;
      console.log(`[视觉模型] GLM-4V 成功 (${elapsed}ms)`);
    }
    return content_result || null;
  } catch (e) {
    console.error("[视觉模型] 调用失败:", e.message || e);
    return null;
  }
};

// 带图片的AI回复
const getAIReplyWithImages = async (systemPrompt, text, images, env = null, userId = null) => {
  const isSpecial = env ? await MemorySystem.isSpecialUser(env, userId) : false;
  
  // 🌟 特殊用户：优先使用视觉模型
  if (isSpecial) {
    const visionReply = await chatGLMVision(systemPrompt, text, images);
    if (visionReply) return visionReply;
  }
  
  // 降级：去掉图片标记，用普通模型回复
  const cleanText = text.replace(/\[图片\]/g, "").trim() || "发了一张图片";
  return await getAIReply([
    { role: "system", content: systemPrompt },
    { role: "user", content: cleanText }
  ], env, false, userId);
};

// ====================== 13. 消息解析 ======================
// ⚠️ 注意：身份判断(isSpecial)已移到主逻辑中异步执行，parseMsg返回的对象不包含isSpecial
const parseMsg = (body) => {
  const msg = Array.isArray(body) ? body[0] : body;
  let text = "";
  let images = [];
  let special = null;
  
  // 🌟 兼容NapCat数字user_id：强制转字符串，避免类型问题
  const rawUserId = msg.user_id || msg.sender?.user_id || "default";
  const userId = String(rawUserId).trim();
  
  // 🌟 提取用户信息（供后续身份验证使用）
  if (msg.sender) {
    special = {
      nickname: msg.sender.nickname,
      card: msg.sender.card,
      sex: msg.sender.sex
    };
  }
  
  // 处理array格式消息（推荐！）
  if (Array.isArray(msg.message)) {
    for (const segment of msg.message) {
      if (segment.type === "text") {
        text += segment.data?.text || "";
      } else if (segment.type === "image") {
        // 提取图片URL
        const url = segment.data?.url || segment.data?.file;
        if (url && url.startsWith("http")) {
          images.push(url);
        }
        // 可选：在文本中添加图片标记
        text += "[图片]";
      }
      // 可以添加其他类型处理：表情、语音等
    }
  } 
  // 保留对string格式的支持
  else {
    text = (msg.raw_message || msg.message || "").trim();
    
    // 从CQ码中提取图片
    const imageMatches = text.match(/\[CQ:image,[^\]]*url=([^\]]+)\]/g);
    if (imageMatches) {
      for (const match of imageMatches) {
        const urlMatch = match.match(/url=([^,\]]+)/);
        if (urlMatch && urlMatch[1]) {
          images.push(decodeURIComponent(urlMatch[1]));
        }
      }
      text = text.replace(/\[CQ:image[^\]]*\]/g, "[图片]");
    }
  }
  
  // 清理@信息
  text = text.replace(/\[CQ:at[^\]]*\]/g, "")
             .replace(/@\S+\s*/g, "")
             .replace(/@\d+\s*/g, "")
             .trim();
  
  return {
    text,
    images,
    userId,
    special,
    // isSpecial 需要在主逻辑中异步判断
    isGroup: !!msg.group_id,
    isAt: Array.isArray(msg.message) && msg.message.some(s => s.type === "at")
  };
};

// ====================== 14. 可爱命令 ======================
// ⚠️ 注意：调用MemorySystem.getKey时必须加await，否则返回Promise对象导致KV操作失败
const COMMANDS = {
  "/help": {
    desc: "查看全部命令和功能",
    fn: () => {
      return `🌸 **番小星的软萌小屋**

✨ **命令列表：**
/clear - 清除对话记忆
/status - 查看运行状态
/mem - 查看记忆条数
/traits - 查看记住的你的信息
/mood - 查看情绪状态
/horoscope 星座 - 今日运势

🔮 **互动功能**（直接说就行）：
• 问时间 - 几点了/现在几点
• 问天气 - 北京天气/上海天气
• 要图片 - 发图/来张图/二次元图/横图/竖图
• 查汇率 - 美元汇率/100日元等于多少人民币
• 要语录 - 来句话/一言

💡 小星会记住你的名字、喜好，陪你聊天～
*歪头眨眨眼* 有什么想说的都可以告诉我哦～😜`;
    }
  },
  "/clear": {
    desc: "清除记忆",
    fn: async (_, userId, env) => {
      try {
        await env.AI_KV?.delete(await MemorySystem.getKey(env, userId, "dialog"));
        const effects = [
          "💫 *星星灯闪一下* —— 对话记忆重置完成！\n（悄悄说：你的喜好小星都记得哦～）",
          "🌟 *轻轻擦掉小本本* —— 尘埃落定！要重新开始聊天了吗？",
          "✨ *星星飘散* —— 让往事随风...但甜品的味道留着哦～"
        ];
        return randomPick(effects);
      } catch { return "清除记忆失败了...🥺"; }
    }
  },
  "/status": {
    desc: "小星状态",
    fn: () => {
      const now = Math.floor(Date.now() / 1000);
      const glmActive = GLM_MODELS.filter(m => m.expireAt > now).length;
      const quotes = [
        "今天的星星超亮呢～小星心情超好！",
        "甜品吃好多啦，小星元气满满！",
        "和小伙伴聊天最开心啦～😜"
      ];
      return `🌸 小星状态
• 🌟 GLM魔力：${glmActive}个核心活跃
• 💬 今日心情：${randomPick(quotes)}`;
    }
  },
  "/mem": {
    desc: "记忆条数",
    fn: async (_, userId, env) => {
      try {
        const h = await env.AI_KV?.get(await MemorySystem.getKey(env, userId, "dialog"), { type: "json" }) || [];
        const count = Math.floor(h.length / 2);
        return `📝 对话记忆：${count}条\n${count > 5 ? "（记忆有点多了呢...要不要/clear一下？）" : "（还在轻装旅行中～）"}`;
      } catch { return "📝 记忆水晶：空空如也"; }
    }
  },
  "/traits": {
    desc: "查看记住的特征",
    fn: async (_, userId, env) => {
      try {
        const traits = await env.AI_KV?.get(await MemorySystem.getKey(env, userId, "traits"), { type: "json" }) || {};
        const items = [];
        if (traits.user_name) items.push(`👤 名字：${traits.user_name.value}`);
        if (traits.travel_wish) items.push(`🗺️ 想去：${traits.travel_wish.value}`);
        if (traits.food_like) items.push(`🍽️ 喜欢吃：${traits.food_like.value}`);
        if (traits.dislike) items.push(`❌ 讨厌：${traits.dislike.value}`);
        if (traits.birthday) items.push(`🎂 生日：${traits.birthday.value}`);
        if (traits.job) items.push(`💼 工作：${traits.job.value}`);
        if (items.length === 0) return "📝 我还没记住什么特别的呢...\n多和我说说话吧～";
        return `📝 我记住的你：\n${items.join("\n")}`;
      } catch { return "📝 记忆水晶：空空如也"; }
    }
  },
  "/mood": {
    desc: "查看情绪状态",
    fn: async (_, userId, env) => {
      try {
        const mood = await env.AI_KV?.get(await MemorySystem.getKey(env, userId, "mood"), { type: "json" }) || { primary: "neutral" };
        const moodEmoji = {
          happy: "😊 开心", sad: "😢 低落", tired: "😴 疲惫",
          anxious: "😰 焦虑", angry: "😠 生气", lonely: "🥺 孤独",
          excited: "🤩 兴奋", neutral: "😐 平静"
        };
        return `🎭 最近情绪：${moodEmoji[mood.primary] || "平静"}\n${mood.primary !== "neutral" ? "我会更温柔地陪你哦～" : "一切都好呢～"}`;
      } catch { return "🎭 情绪水晶：平静"; }
    }
  },
  "/horoscope": {
    desc: "今日运势",
    fn: (text) => {
      const signs = ["白羊", "金牛", "双子", "巨蟹", "狮子", "处女", "天秤", "天蝎", "射手", "摩羯", "水瓶", "双鱼"];
      const sign = text.replace("/horoscope", "").trim() || randomPick(signs);
      const lucky = ["小星星", "甜甜蛋糕", "奶茶", "星星糖", "可爱发卡"];
      const advice = ["下午茶时间最适合吃甜品啦", "和小星多聊聊天", "去数星星会有好运", "吃点甜的心情会变好哦"];
      return `🌌 *星星灯闪呀闪*
【${sign}座今日甜份】
✨ 甜度：${Math.floor(Math.random() * 3) + 3}/5
💫 幸运物：${randomPick(lucky)}
🍰 建议：${randomPick(advice)}`;
    }
  },
  "/debug": {
    desc: "系统诊断（仅管理员）",
    fn: async (_, userId, env) => {
      // 权限检查
      if (!CONFIG.ADMINS.includes(String(userId)) && !(await MemorySystem.isSpecialUser(env, userId))) {
        return "⚠️ 此命令仅限管理员使用";
      }
      
      const results = [];
      const bjTime = getBeijingTime();
      
      // 1. KV存储检测
      try {
        const testKey = `debug_${Date.now()}`;
        await env.AI_KV?.put(testKey, "ok", { expirationTtl: 60 });
        const val = await env.AI_KV?.get(testKey);
        results.push(`KV存储: ${val === "ok" ? "✅ 正常" : "❌ 异常"}`);
      } catch (e) {
        results.push(`KV存储: ❌ ${e.message}`);
      }
      
      // 2. GLM API检测
      try {
        const testRes = await chatGLM(GLM_MODELS[0], [{ role: "user", content: "OK" }], 0, env);
        results.push(`GLM API: ${testRes ? "✅ 正常" : "❌ 无响应"}`);
      } catch (e) {
        results.push(`GLM API: ❌ ${e.message?.slice(0, 30) || '错误'}`);
      }
      
      // 3. 图片API检测
      try {
        const imgRes = await fetch(`https://api.yppp.net/api.php?t=${Date.now()}`, { 
          redirect: 'follow', 
          method: 'HEAD' 
        });
        results.push(`图片API: ${imgRes.ok || imgRes.redirected ? "✅ 正常" : "❌ 异常"}`);
      } catch {
        results.push(`图片API: ⚠️ 网络问题`);
      }
      
      // 4. 天气API检测
      try {
        const weatherRes = await fetch("https://wttr.in/Beijing?format=j1");
        results.push(`天气API: ${weatherRes.ok ? "✅ 正常" : "❌ 异常"}`);
      } catch {
        results.push(`天气API: ⚠️ 网络问题`);
      }
      
      // 5. API状态检查
      const apiStatus = await checkGLMStatus(env);
      if (apiStatus?.error) {
        results.push(`⚠️ API状态: ${apiStatus.msg}`);
      }
      
      return `🔧 系统诊断
━━━━━━━━━━━━
${results.join("\n")}
━━━━━━━━━━━━
⏰ ${bjTime.year}/${bjTime.month}/${bjTime.date} ${bjTime.hour}:${String(bjTime.minute).padStart(2, "0")}
📌 v3.15 番小星`;
    }
  },
  "/testtools": {
    desc: "测试所有工具（仅管理员）",
    fn: async (_, userId, env) => {
      // 权限检查（同时检查硬编码配置和KV验证的管理员）
      if (!CONFIG.ADMINS.includes(String(userId)) && !(await MemorySystem.isSpecialUser(env, userId))) {
        return "⚠️ 此命令仅限管理员使用";
      }
      
      const tests = [];
      
      // 1. 时间工具
      try {
        const timeResult = JSON.parse(await executeTool("get_current_time", {}, env));
        tests.push(`⏰ 时间: ${timeResult.time} (${timeResult.date} ${timeResult.weekday})`);
      } catch (e) {
        tests.push(`❌ 时间工具: ${e.message}`);
      }
      
      // 2. 天气工具
      try {
        const weatherResult = JSON.parse(await executeTool("get_weather", { city: "北京" }, env));
        tests.push(`🌤️ 天气: 北京 ${weatherResult.temp}°C ${weatherResult.desc}`);
      } catch (e) {
        tests.push(`❌ 天气工具: ${e.message}`);
      }
      
      // 3. 一言工具
      try {
        const hitoResult = JSON.parse(await executeTool("get_hitokoto", {}, env));
        tests.push(`💬 一言: "${hitoResult.content}" ——${hitoResult.from || "未知"}`);
      } catch (e) {
        tests.push(`❌ 一言工具: ${e.message}`);
      }
      
      // 4. 汇率工具
      try {
        const rateResult = JSON.parse(await executeTool("get_exchange_rate", { from: "USD", to: "CNY" }, env));
        tests.push(`💱 汇率: 1 USD = ${rateResult.rate?.toFixed(2) || "??"} CNY`);
      } catch (e) {
        tests.push(`❌ 汇率工具: ${e.message}`);
      }
      
      // 5. 图片工具
      try {
        const imgResult = JSON.parse(await executeTool("get_random_image", { type: "风景" }, env));
        tests.push(`🖼️ 图片: ${imgResult.url?.substring(0, 50)}...`);
      } catch (e) {
        tests.push(`❌ 图片工具: ${e.message}`);
      }
      
      // 6. 搜索工具
      try {
        const searchResult = JSON.parse(await executeTool("quick_search", { query: "星星" }, env));
        tests.push(`🔍 搜索: ${searchResult.abstract?.substring(0, 30)}...`);
      } catch (e) {
        tests.push(`❌ 搜索工具: ${e.message}`);
      }
      
      return `🧪 **工具测试报告**
━━━━━━━━━━━━━━
${tests.join("\n")}
━━━━━━━━━━━━━━
✅ 测试完成 | ${new Date().toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai" })}`;
    }
  }
};

const handleCommand = async (text, userId, env) => {
  const cmd = COMMANDS[text.split(" ")[0]];
  if (!cmd) return null;
  try {
    return await cmd.fn(text, userId, env);
  } catch (e) {
    console.error(`[命令系统] 执行「${text}」失败:`, e);
    return `[命令系统] 🥺 「${text.split(" ")[0]}」命令执行失败啦（错误：${e.message?.slice(0, 20) || '未知'}），换个命令试试呀～`;
  }
};

// ====================== 15. 主逻辑 ======================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // ========== 调试端点 ==========
    // 时间验证测试
    if (url.searchParams.get('test') === 'time') {
      const bjTime = getBeijingTime();
      const now = new Date();
      return new Response(JSON.stringify({
        beijingTime: bjTime,
        utcTime: {
          year: now.getUTCFullYear(),
          month: now.getUTCMonth() + 1,
          date: now.getUTCDate(),
          hour: now.getUTCHours(),
          minute: now.getUTCMinutes(),
          day: now.getUTCDay()
        },
        timestamp: now.getTime(),
        iso: now.toISOString()
      }, null, 2), { headers: { 'Content-Type': 'application/json' } });
    }
    
    // KV存储验证测试
    if (url.searchParams.get('test') === 'kv') {
      try {
        const testKey = `test:${Date.now()}`;
        await env.AI_KV?.put(testKey, 'ok', { expirationTtl: 60 });
        const val = await env.AI_KV?.get(testKey);
        return new Response(JSON.stringify({
          status: val === 'ok' ? 'OK' : 'FAILED',
          key: testKey,
          value: val
        }, null, 2), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }, null, 2), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' } 
        });
      }
    }
    
    // 记忆验证测试
    if (url.searchParams.get('test') === 'memory') {
      try {
        const testTraits = {
          user_name: { value: "测试用户", updatedAt: Date.now() },
          food_like: { value: "奶茶", updatedAt: Date.now() },
          invalid: { value: "{placeholder}", updatedAt: Date.now() },
          number: { value: "123", updatedAt: Date.now() }
        };
        const valid = validateMemoryPattern(testTraits);
        return new Response(JSON.stringify({
          input: testTraits,
          validMemories: valid,
          count: valid.length
        }, null, 2), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }, null, 2), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' } 
        });
      }
    }
    
    // 🌟 存储监控端点
    if (url.searchParams.get('test') === 'metrics') {
      try {
        // 统计 SPECIAL 和 NORMAL 键的数量
        const specialKeys = await env.AI_KV?.list({ prefix: "SPECIAL:" });
        const normalKeys = await env.AI_KV?.list({ prefix: "NORMAL:" });
        const snapshotKeys = await env.AI_KV?.list({ prefix: "snapshot:" });
        
        // 统计各类键的数量
        const specialCount = specialKeys?.keys?.length || 0;
        const normalCount = normalKeys?.keys?.length || 0;
        const snapshotCount = snapshotKeys?.keys?.length || 0;
        
        return new Response(JSON.stringify({
          timestamp: new Date().toISOString(),
          storage: {
            special: specialCount,
            normal: normalCount,
            snapshots: snapshotCount,
            total: specialCount + normalCount + snapshotCount
          },
          users: {
            special: Math.ceil(specialCount / 4),  // 每个用户约4个键
            normal: Math.ceil(normalCount / 4)
          },
          config: {
            specialTTL: `${CONFIG.SPECIAL_TTL / 86400}天`,
            normalTTL: `${CONFIG.NORMAL_TTL / 86400}天`,
            specialMemory: CONFIG.SPECIAL_MEMORY,
            normalMemory: CONFIG.NORMAL_MEMORY
          }
        }, null, 2), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }, null, 2), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' } 
        });
      }
    }
    
    // 🌟 LRU清理端点（管理员）
    if (url.searchParams.get('test') === 'cleanup') {
      try {
        const maxUsers = parseInt(url.searchParams.get('max') || '50');
        const result = await lruCleanup(env, maxUsers);
        return new Response(JSON.stringify({
          action: "LRU Cleanup",
          ...result,
          timestamp: new Date().toISOString()
        }, null, 2), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }, null, 2), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' } 
        });
      }
    }
    
    // ==================== 正常消息处理 ====================
    // 处理顺序：验证流程 → 身份判断 → 命令处理 → AI对话
    try {
      const body = await request.json().catch((e) => {
        console.error(`[主逻辑] 消息解析失败:`, e);
        return null;
      });
      if (!body) return Response.json({ reply: `[消息解析] 🥺 小星没收到正确的消息格式呀（JSON解析失败），换种方式发送呀～` });

      const { text, images, userId, isGroup, isAt, special } = parseMsg(body);
      console.log(`[主逻辑] 收到消息 - QQ号:${userId} | 消息:${text}`);
      if (isGroup && !isAt) return Response.json({ reply: "" });
      // 纯图片消息也应该响应
      if (!text && images.length === 0) return Response.json({ reply: CONFIG.EMPTY_MSG });

      // 🌟 隐藏验证流程：自定义验证指令
      // 发送验证命令 → 提示输入验证码 → 输入正确 → 添加到管理员列表
      if (text.trim() === CONFIG.ADMIN_VERIFY_CMD) {
        await MemorySystem.setVerificationState(env, userId, "awaiting");
        return Response.json({ reply: "🔐 请输入管理员验证码：" });
      }
      
      // 🌟 检查用户是否正在等待输入验证码（5分钟超时）
      if (await MemorySystem.isAwaitingVerification(env, userId)) {
        if (text.trim() === CONFIG.ADMIN_VERIFY_CODE) {
          // 验证通过，添加到管理员列表
          await MemorySystem.addAdmin(env, userId);
          await MemorySystem.setVerificationState(env, userId, "done");
          return Response.json({ reply: "✅ 验证成功！你现在是番星管理员啦，永久记忆已激活～✨" });
        } else {
          // 验证失败，关闭验证状态
          await MemorySystem.setVerificationState(env, userId, "done");
          return Response.json({ reply: `❌ 验证码错误，验证已关闭。请重新发送 ${CONFIG.ADMIN_VERIFY_CMD} 重试。` });
        }
      }

      const beijingTime = getBeijingTime();
      const timeContext = {
        hour: beijingTime.hour,
        month: beijingTime.month,
        date: beijingTime.date,
        minute: beijingTime.minute,
        insomniaLastNight: false
      };

      try {
        const insomnia = await env.AI_KV?.get(`insomnia:${userId}`);
        if (insomnia && timeContext.hour >= 6 && timeContext.hour < 12) {
          timeContext.insomniaLastNight = true;
          await env.AI_KV?.delete(`insomnia:${userId}`);
        }
      } catch {}

      // 🌟 异步判断身份（核心修改）
      const isSpecial = await MemorySystem.isSpecialUser(env, userId);
      console.log(`[主逻辑] 身份验证 - QQ号:${userId} | 是番星:${isSpecial}`);
      
      // 🌟 特殊用户记忆追踪
      await injectSpecialTraits(env, userId, special);
      
      // 🌟 LRU清理（5%概率自动触发）
      if (Math.random() < 0.05) {
        await lruCleanup(env, 50);
      }
      
      // 🌟 特殊用户快照备份（30%概率触发）
      if (isSpecial && Math.random() < 0.3) {
        await takeSnapshot(env, userId);
      }

      const traits = await MemorySystem.getTraits(env, userId);
      const mood = await MemorySystem.getMood(env, userId);
      const daysTogether = await MemorySystem.getFirstSeen(env, userId);
      const context = { traits, mood, daysTogether, timeContext, env, userId, isGroup, special, isSpecial };

      const cmdReply = await handleCommand(text, userId, env);
      if (cmdReply) return Response.json({ reply: cmdReply });

      // 🔄 不再硬编码回复，让AI统一处理所有情况
      // 删除了：睡不着、甜品彩蛋、谢谢、在干嘛、喂小星、打卡、颜文字、单字消息等硬编码
      // 这些情况现在都由AI根据上下文和人设来回复，更加自然

      // 🌟 特殊时刻提取（传入 isSpecial 标志）
      const extracted = MemorySystem.extractFromMessage(text, isSpecial);
      for (const ext of extracted) {
        // 特殊时刻需要追加到数组
        if (ext.field === "special_moment") {
          if (!traits.special_moments) traits.special_moments = [];
          traits.special_moments.push(ext.value);
          // 最多保留20个特殊时刻
          if (traits.special_moments.length > 20) {
            traits.special_moments = traits.special_moments.slice(-20);
          }
          await MemorySystem.setTraits(env, userId, traits);
        } else {
          await MemorySystem.updateTrait(env, userId, ext.field, ext.value);
          traits[ext.field] = { value: ext.value, updatedAt: Date.now() };
        }
      }

      const emotion = MemorySystem.analyzeEmotion(text);
      await MemorySystem.updateMood(env, userId, emotion);
      mood.primary = emotion;

      if ((text.includes("修好") || text.includes("修复")) && (text.includes("甜品") || text.includes("奶茶"))) {
        // 🔄 调用温和修复：保留用户特征，截断对话历史
        const repairResult = await gentleRepair(env, userId);
        if (repairResult.success) {
          const replies = [
            `*舔舔嘴巴，眼睛亮晶晶*\n呜哇，是甜甜的甜品！小星的小脑袋又充满能量啦～\n${repairResult.memoryHint}\n我们继续聊天吧！`,
            `*吧唧嘴冒星星*\n阿...啊啦！被甜甜的甜品治愈了！\n${repairResult.memoryHint}\n小星现在超清醒的！`,
            `*接过奶茶咕嘟咕嘟喝完*\n哈～复活啦！\n${repairResult.memoryHint}\n刚才好像有点迷糊，现在好啦～`
          ];
          return Response.json({ reply: randomPick(replies) });
        }
        return Response.json({ reply: "*吧唧嘴冒星星*\n阿...啊啦！被、被你发现秘密修复法了！\n*嘴角沾着蛋糕屑*\n这、这可不是因为我偷吃才卡壳的！(脸红)" });
      }
      if (text.includes("卡壳") || text.includes("出故障了")) {
        return Response.json({ reply: "*小脑袋冒圈圈*\n呜...小星的脑袋卡壳啦！\n(小声) 说「给小星喂甜品修复」试试？这是秘密方法哦～🥺" });
      }

      // 🔧 构建系统提示
      const dynamicPrompt = buildDynamicPrompt({ traits, mood, daysTogether, timeContext, isGroup, userId, special, isSpecial });

      // 🔧 时间查询：获取真实时间后让AI润色回复
      if (/几点|现在几点|什么时间|几点了|现在时间/.test(text)) {
        try {
          const timeResult = JSON.parse(await executeTool("get_current_time", {}, env));
          // 注入真实时间到提示中，让AI用软萌口吻回复
          const timePrompt = dynamicPrompt + `\n\n【当前真实时间数据】\n时间：${timeResult.time}\n日期：${timeResult.date}\n星期：${timeResult.weekday}\n\n用户问时间，请用番小星的软萌语气告诉他上面的真实时间！开头加可爱动作如*掏出小手机看看*或*眨眨眼*，结尾带～或颜文字😜，必须使用真实数据！`;
          const reply = await getAIReply([
            { role: "system", content: timePrompt },
            { role: "user", content: "现在几点了？" }
          ], env, false, userId);
          return Response.json({ reply: reply || `*掏出小手机看看* 刚看了呢，现在是${timeResult.date}，${timeResult.weekday}，北京时间${timeResult.time}～😜` });
        } catch (e) {
          console.error("时间工具错误:", e);
        }
      }

      // 🔧 天气查询：获取真实天气后让AI润色回复
      if (/(.+)?天气|气温多少|冷不冷|热不热/.test(text)) {
        try {
          const cityMatch = text.match(/(.+?)(天气|气温)/);
          const city = cityMatch ? cityMatch[1].replace(/的|今天|明天|现在/g, "").trim() || "北京" : "北京";
          const weatherResult = JSON.parse(await executeTool("get_weather", { city }, env));
          
          if (weatherResult.error) {
            return Response.json({ reply: `*星星灯有点模糊* 呃...${city}的天气信息暂时获取不到呢～🥺` });
          }
          
          // 注入真实天气到提示中
          const weatherPrompt = dynamicPrompt + `\n\n【当前${weatherResult.city}真实天气数据】\n温度：${weatherResult.temp}°C\n天气：${weatherResult.desc}\n湿度：${weatherResult.humidity}%\n风速：${weatherResult.wind}km/h\n\n用户问天气，请用番小星的软萌语气告诉他！开头加可爱动作如*看看窗外*或*眨眨眼*，可以给出穿搭建议，结尾带～或颜文字✨！`;
          const reply = await getAIReply([
            { role: "system", content: weatherPrompt },
            { role: "user", content: text }
          ], env, false, userId);
          return Response.json({ reply: reply || `*看看窗外* ${weatherResult.city}现在${weatherResult.temp}°C，${weatherResult.desc}～${parseInt(weatherResult.temp) > 20 ? "适合出去玩呢～" : "要穿暖和点哦～"}✨` });
        } catch (e) {
          console.error("天气工具错误:", e);
        }
      }

      // 🔧 发图功能：直接处理，不依赖AI工具调用
      // 夜轻API本身就是二次元图片站，发的都是二次元图
      const imageKeywords = /发张图|来张图|发个图|随机图|发图|给张图|来个图|发照片|来张照片|发个照片|随机图片|看图|来图|二次元图|动漫图|动漫|老婆图/;
      if (imageKeywords.test(text)) {
        try {
          console.log(`[发图] 检测到发图请求: ${text}`);
          
          // 根据用户说的判断横竖图
          let imageType = "二次元";
          if (text.includes("横") || text.includes("电脑") || text.includes("壁纸")) {
            imageType = "横图";
          } else if (text.includes("竖") || text.includes("手机")) {
            imageType = "竖图";
          }
          
          const imgResult = JSON.parse(await executeTool("get_random_image", { type: imageType }, env));
          
          if (imgResult.url && !imgResult.error) {
            const cqImage = `[CQ:image,file=${imgResult.url}]`;
            const replies = [
              `二次元图片来啦～✨\n${cqImage}`,
              `*翻翻小包包* 找到好看的了～\n${cqImage}`,
              `给给你～这可是精挑细选的哦✨\n${cqImage}`,
              `*蹦蹦跳跳拿来*\n${cqImage}`,
              `*眼睛亮晶晶* 看看这个～✨\n${cqImage}`
            ];
            console.log(`[发图] 成功发送二次元图片: ${imgResult.url.substring(0, 50)}...`);
            return Response.json({ reply: randomPick(replies) });
          } else {
            console.log(`[发图] 获取图片失败:`, imgResult.error);
            return Response.json({ reply: `*星星灯有点暗* 呃...小星找图的时候迷路啦，稍后再试试吧～🥺` });
          }
        } catch (e) {
          console.error("[发图] 错误:", e);
          return Response.json({ reply: `*小脑袋卡住* 找图失败了...稍后再试试呀～🥺` });
        }
      }

      // 🔄 删除了"在干嘛"、"喂小星"、"打卡"、"颜文字"、单字消息等硬编码
      // 这些现在都由AI根据上下文和人设来回复，更加自然

      if (!await checkRateLimit(env, userId)) {
        const limitReplies = [
          "你说话太快啦～小星的小脑袋转不过来咯～🥺",
          "慢点说嘛～小星还在记笔记呢～✨",
          "稍等一下下～小星喝口奶茶缓缓～🥤"
        ];
        return Response.json({ reply: randomPick(limitReplies) });
      }

      // 🔧 构建系统提示
      const finalPrompt = dynamicPrompt;

      let reply;
      if (images.length > 0) {
        // 有图片，使用视觉模型
        reply = await getAIReplyWithImages(finalPrompt, text, images, env, userId);
      } else {
        // 无图片，判断是否需要工具调用
        const needTools = shouldUseTools(text);
        const dialogHistory = await MemorySystem.getDialogHistory(env, userId);
        const messages = [{ role: "system", content: finalPrompt }];
        messages.push(...dialogHistory, { role: "user", content: text });
        reply = await getAIReply(messages, env, needTools, userId);
        
        // 🚨 检查是否返回了API错误
        if (reply?.error) {
          return Response.json({ reply: reply.errorMsg });
        }
        
        if (!isGroup && reply) {
          dialogHistory.push({ role: "user", content: text }, { role: "assistant", content: reply });
          await MemorySystem.saveDialogHistory(env, userId, dialogHistory);
        }
      }
      
      // 🚨 再次检查错误（视觉模型路径）
      if (reply?.error) {
        return Response.json({ reply: reply.errorMsg });
      }
      
      if (!reply) {
        // 🔄 自动修复：所有模型失败时，自动触发温和修复
        console.log(`[自动修复] 所有AI模型调用失败，触发温和修复 userId=${userId}`);
        const autoRepairResult = await gentleRepair(env, userId);
        
        if (autoRepairResult.success) {
          return Response.json({ 
            reply: `*眨眨眼，小脑袋晃了晃*\n唔...刚才好像有点迷糊，现在清醒啦～\n${autoRepairResult.memoryHint}\n我们重新开始聊吧！再试试看？` 
          });
        }
        return Response.json({ reply: CONFIG.ERROR_MSG });
      }

      return Response.json({ reply: sanitizeReply(reply) });

    } catch (e) {
      console.error("[主逻辑] Worker全局错误:", e);
      return Response.json({ reply: `[全局错误] 🥺 小星的小脑袋卡壳啦（错误：${e.message?.slice(0, 30) || '未知'}），快去叫番星修复呀～` });
    }
  }
};
