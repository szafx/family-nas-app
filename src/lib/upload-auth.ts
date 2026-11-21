import { getBaseUrl } from '@/api/client';

/**
 * 上传密码会话状态：
 * 上传（写操作）前若没有密码，弹窗让用户输入；密码随 X-Upload-Pass 头发给服务端校验。
 * 下载与浏览不需要密码。密码只保存在内存里，App 重启后重新输入。
 */

let pass: string | null = null;
let showListener: ((show: boolean) => void) | null = null;
let waiters: Array<(pass: string | null) => void> = [];

export function getUploadPass(): string | null {
  return pass;
}

export function clearUploadPass() {
  pass = null;
}

export function subscribeUploadAuth(listener: (show: boolean) => void) {
  showListener = listener;
  return () => {
    if (showListener === listener) showListener = null;
  };
}

/** 确保拿到上传密码：有则直接返回，没有则弹窗等待用户输入；取消返回 null。 */
export function ensureUploadPass(): Promise<string | null> {
  if (pass) return Promise.resolve(pass);
  showListener?.(true);
  return new Promise((resolve) => {
    waiters.push(resolve);
  });
}

/** 弹窗结果回填：pass 为 null 表示用户取消。 */
export function resolveUploadAuth(next: string | null) {
  if (next) pass = next;
  showListener?.(false);
  const pending = waiters;
  waiters = [];
  for (const resolve of pending) resolve(next);
}

/** 用服务端的 /__upload_auth 接口校验密码是否正确。 */
export async function verifyUploadPass(candidate: string): Promise<boolean> {
  const base = getBaseUrl();
  if (!base) return false;
  try {
    const res = await fetch(`${base}/__upload_auth?pwd=${encodeURIComponent(candidate)}`, {
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}
