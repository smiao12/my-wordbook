# 我的单词本

一个可以添加到手机/平板桌面的 PWA 单词记忆应用，支持查词、例句记录、复习和云端同步。

## 功能

- **PWA 安装** — 可添加到 Android / iPad 桌面，像原生 App 一样使用
- **查词录入** — 输入英文单词，自动获取中文释义（支持音标）
- **例句关联** — 记录查词时的原文句子，加深记忆
- **单词列表** — 卡片式展示，支持搜索、标签筛选
- **复习模式** — 卡片翻转复习，支持手势滑动切换，自动保存进度
- **复习中添词** — 复习时遇到新词，可直接添加无需退出
- **批量导入** — 支持文本/JSON 格式批量导入已有单词
- **云端同步** — 登录后单词自动同步到所有设备（可选）
- **数据导出** — 随时导出 JSON 备份
- **多彩主题** — 6 种主题可选，每种配有独特装饰图案

## 快速开始（本地模式，无需配置）

1. 用浏览器打开 `index.html`
2. 点击「本地模式（无需登录）」
3. 直接开始使用！

数据保存在浏览器 IndexedDB 中，清除浏览器数据会丢失。

## 添加到桌面

### Android (Chrome)
1. 打开网页 → 点击菜单（⋮）→「添加到主屏幕」
2. 确认添加，桌面会出现图标

### iPad (Safari)
1. 打开网页 → 点击分享按钮 →「添加到主屏幕」
2. 确认添加

## 云端同步配置（可选）

### 1. 创建 Supabase 项目

1. 访问 [supabase.com](https://supabase.com) 注册/登录
2. 创建新项目，记录 **Project URL** 和 **anon public API key**
3. 在 SQL Editor 中执行以下 SQL：

```sql
-- 创建单词表
CREATE TABLE words (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  word        TEXT NOT NULL,
  meaning     TEXT NOT NULL,
  example     TEXT,
  phonetic    TEXT,
  tags        TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 启用行级安全
ALTER TABLE words ENABLE ROW LEVEL SECURITY;

-- 创建安全策略
CREATE POLICY "Users can only access their own words"
  ON words FOR ALL
  USING (auth.uid() = user_id);
```

4. 开启 Email Auth：Authentication → Providers → Email → 启用

### 2. 配置前端

在浏览器控制台执行：

```javascript
localStorage.setItem('sb_url', 'https://your-project.supabase.co');
localStorage.setItem('sb_key', 'your-anon-key');
location.reload();
```

### 3. 部署翻译 Edge Function（可选，用于更稳定的查词）

```bash
# 安装 Supabase CLI
npm install -g supabase

# 登录
supabase login

# 链接项目
supabase link --project-ref your-project-ref

# 部署翻译函数
supabase functions deploy translate

# 配置环境变量（百度翻译 API）
supabase secrets set BAIDU_APP_ID=your-app-id
supabase secrets set BAIDU_SECRET_KEY=your-secret-key
```

百度翻译 API 申请：[https://fanyi-api.baidu.com](https://fanyi-api.baidu.com)

### 4. 部署前端

将项目文件上传到任意静态托管服务：

- **Vercel**: `npm i -g vercel && vercel --prod`
- **Netlify**: 拖拽文件夹到 [netlify.com](https://netlify.com)
- **GitHub Pages**: 推送到仓库，开启 Pages
- **腾讯云/阿里云 OSS**: 上传文件并开启静态网站

## 主题切换

设置中提供 6 种主题，每种配有专属漂浮装饰：

| 主题 | 风格 | 装饰 |
|------|------|------|
| 明亮 | 简洁蓝白 | 无 |
| 暗黑 | 深夜护眼 | 无 |
| 浅紫 | 薰衣草紫 | 🪻 薰衣草花 |
| 暖黄 | 温暖阳光 | 🐤 小鸭子 |
| 樱粉 | 浪漫樱花 | 🌸 樱花瓣 |
| 抹茶 | 清新自然 | 🐱 小猫咪 |

## 复习模式

- **卡片翻转**：点击卡片查看释义，再次点击翻回
- **手势滑动**：左右滑动切换上一个/下一个单词
- **进度保存**：退出复习模式后，再次进入会从上次位置继续
- **随机排序**：点击「随机」按钮打乱复习顺序
- **中途添词**：复习时遇到新词，点击绿色 + 按钮直接添加，新词会插入到当前位置之后

## 使用技巧

### 批量导入格式

**文本导入**（每行一个）：
```
abandon | 放弃；抛弃 | She abandoned her car.
apple | 苹果
banana
```

**JSON 导入**：
```json
[
  {"word": "abandon", "meaning": "放弃；抛弃", "example": "She abandoned her car."},
  {"word": "apple", "meaning": "苹果"}
]
```

### 标签分类

给单词添加标签，如：
- `阅读真题` — 真题阅读中遇到的生词
- `考研` — 考研词汇
- `CET6` — 六级词汇
- `2024-05` — 按时间分类

## 技术栈

- 前端：HTML5 + CSS3 + Vanilla JS（PWA）
- 数据存储：IndexedDB（本地）/ Supabase（云端）
- 翻译：MyMemory API（免费）/ 百度翻译 API（Edge Function）

## 免费额度

| 服务 | 免费额度 | 说明 |
|------|---------|------|
| MyMemory 翻译 | 5000 字符/天 | 个人使用足够 |
| Supabase 数据库 | 500MB | 个人单词本远小于此 |
| Supabase Auth | 无限 MAU | 个人使用 |

## 更新日志

### v1.1（2025-06）

- 新增 3 种主题：暖黄、樱粉、抹茶，每种配有可爱的漂浮装饰
- 浅紫主题补充薰衣草装饰
- 复习模式支持中途添加新词（绿色 + 按钮）
- 复习进度自动保存，退出后再进入继续上次位置

### v1.0

- 初始版本：PWA 单词本，支持查词、复习、导入、云端同步

## 注意事项

1. **本地模式**数据存储在浏览器中，清除浏览器数据会丢失，建议定期导出备份
2. **查词 API** 有免费额度限制，高峰期可能响应慢，可手动输入释义
3. **PWA 离线**只能浏览已加载的单词，新增/编辑需要网络
