/**
 * Supabase Edge Function — 翻译代理
 *
 * 调用百度翻译 API，保护 API 密钥不暴露到前端。
 *
 * 部署方式：
 * 1. 安装 Supabase CLI: npm install -g supabase
 * 2. 登录: supabase login
 * 3. 链接项目: supabase link --project-ref <your-project-ref>
 * 4. 部署: supabase functions deploy translate
 *
 * 环境变量配置（Supabase Dashboard > Project Settings > Edge Functions）：
 * - BAIDU_APP_ID: 百度翻译 API 的 APP ID
 * - BAIDU_SECRET_KEY: 百度翻译 API 的密钥
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

interface BaiduTranslateResponse {
  from: string;
  to: string;
  trans_result: Array<{
    src: string;
    dst: string;
  }>;
  error_code?: string;
  error_msg?: string;
}

// MD5 哈希（百度翻译 API 需要）
async function md5(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('MD5', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { word } = await req.json();

    if (!word || typeof word !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid "word" parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const appId = Deno.env.get('BAIDU_APP_ID');
    const secretKey = Deno.env.get('BAIDU_SECRET_KEY');

    if (!appId || !secretKey) {
      return new Response(
        JSON.stringify({ error: 'Translation service not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 构建百度翻译 API 请求
    const salt = Date.now().toString();
    const sign = await md5(appId + word + salt + secretKey);

    const params = new URLSearchParams({
      q: word,
      from: 'en',
      to: 'zh',
      appid: appId,
      salt: salt,
      sign: sign,
    });

    const response = await fetch(`https://fanyi-api.baidu.com/api/trans/vip/translate?${params.toString()}`);
    const data: BaiduTranslateResponse = await response.json();

    if (data.error_code) {
      return new Response(
        JSON.stringify({ error: data.error_msg || `Baidu API error: ${data.error_code}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const translation = data.trans_result?.[0]?.dst || '';

    return new Response(
      JSON.stringify({
        word,
        translation,
        from: data.from,
        to: data.to,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
