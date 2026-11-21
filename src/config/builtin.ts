import { DEFAULT_GLOBALS } from '@/api/server';
import { type ServerInfo } from '@/api/types';

/**
 * 私人家庭网盘的内置配置：安装后无需填写服务器或账号。
 * 令牌有效期一年；App 在前台会自动续期。
 */
export const BUILTIN_SERVER: ServerInfo = {
  baseUrl: 'https://pan6.szafx.icu:18444',
  ...DEFAULT_GLOBALS,
  name: '家庭网盘',
  gateway: false,
};

/** 家里局域网 IPv4 直连（最快，优先使用，仅在家里 Wi-Fi 下可达）。 */
export const BUILTIN_LAN_URL = 'http://192.168.0.111:8081';

/** IPv4-only 网络（没有 IPv6）时使用的备用地址，经 Cloudflare 隧道，较慢。 */
export const BUILTIN_FALLBACK_URL = 'https://pan-cf.szafx.icu';

export const BUILTIN_USERNAME = 'family';

/** 专用长期令牌（只存在安装包里，用于自动登录）。 */
export const BUILTIN_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJGaWxlQnJvd3NlciBRdWFudHVtIiwiZXhwIjoxODI2MjMzOTY5LCJpYXQiOjE3OTQ2OTc5NjksImp0aSI6ImVhNzU5M2FkMDQzOGYyODE0YjJkNjUyYmRlZDk5MTg5In0.Q5Fq-MXZI2MVK-XZ3Oics5MR-1hsZN5G9Ah4I8Iov0o';

/** 更新清单：Gitee 上放同一份 JSON 即可切换过去。 */
export const UPDATE_MANIFEST_URL = 'https://gitee.com/lazy-voice-jmy/family-nas/raw/master/version.json';
export const UPDATE_MANIFEST_FALLBACK_URL = 'https://pan6.szafx.icu:18444/app/version.json';
