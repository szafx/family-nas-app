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

/** 专用长期令牌：公开仓库里不含令牌，构建时由 CI 从 Secret 注入 EXPO_PUBLIC_FAMILY_TOKEN。 */
export const BUILTIN_TOKEN = process.env.EXPO_PUBLIC_FAMILY_TOKEN ?? '';

/** 更新清单：Gitee 上放同一份 JSON 即可切换过去。 */
export const UPDATE_MANIFEST_URL = 'https://gitee.com/lazy-voice-jmy/family-nas/raw/master/version.json';
export const UPDATE_MANIFEST_FALLBACK_URL = 'https://pan6.szafx.icu:18444/app/version.json';
