import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { File, Paths, type DownloadProgress } from 'expo-file-system';

import { UPDATE_MANIFEST_FALLBACK_URL, UPDATE_MANIFEST_URL } from '@/config/builtin';

export type UpdateInfo = {
  versionCode: number;
  versionName: string;
  notes?: string;
  url: string;
  sha256?: string;
  size?: number;
};

export function currentVersionCode(): number {
  if (Platform.OS === 'ios') {
    const n = parseInt(String(Constants.expoConfig?.ios?.buildNumber ?? '0'), 10);
    return Number.isFinite(n) ? n : 0;
  }
  const code = Constants.expoConfig?.android?.versionCode;
  return typeof code === 'number' ? code : 0;
}

/** iOS 不能应用内安装，更新清单里给的是 Android APK；iOS 用同名 IPA（若清单提供 ipa 字段则优先）。 */
export function iosDownloadUrl(info: UpdateInfo): string {
  const withIpa = info as UpdateInfo & { ipa?: string };
  if (withIpa.ipa) return withIpa.ipa;
  // Gitee 的大附件上传受限：iOS 更新统一指向 GitHub Actions 的 latest-ipa 直链
  return 'https://github.com/szafx/family-nas-app/releases/download/latest-ipa/family-nas-ios.ipa';
}

export function currentVersionName(): string {
  return Constants.expoConfig?.version ?? '0';
}

/** 依次询问主地址和备用地址的更新清单；没有更新时返回 null。 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  for (const url of [UPDATE_MANIFEST_URL, UPDATE_MANIFEST_FALLBACK_URL]) {
    try {
      const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok) continue;
      const data = (await res.json()) as Partial<UpdateInfo>;
      if (data.versionCode && data.versionCode > currentVersionCode() && data.url) {
        return {
          versionCode: data.versionCode,
          versionName: data.versionName ?? '',
          notes: data.notes ?? '',
          url: data.url,
          sha256: data.sha256 ?? '',
          size: data.size ?? 0,
        };
      }
      return null;
    } catch {
      // 换备用地址再试。
    }
  }
  return null;
}

/** 下载新版 APK 到缓存目录，回调 0–100 的进度。 */
export async function downloadUpdate(
  info: UpdateInfo,
  onProgress: (percent: number) => void,
): Promise<File> {
  const dest = new File(Paths.cache, 'family-nas-update.apk');
  if (dest.exists) dest.delete();
  const task = File.createDownloadTask(info.url, dest, {
    onProgress: ({ bytesWritten, totalBytes }: DownloadProgress) => {
      if (totalBytes > 0) onProgress(Math.min(100, Math.round((bytesWritten * 100) / totalBytes)));
    },
  });
  await task.downloadAsync();
  onProgress(100);
  if (!dest.exists || (dest.size ?? 0) < 100 * 1024) {
    throw new Error('下载的安装包不完整，请重试');
  }
  return dest;
}

/** 交给系统安装器（Android 不允许静默安装，最后会弹一次系统确认框）。iOS 不走这里。 */
export async function installUpdate(file: File): Promise<void> {
  if (Platform.OS !== 'android') return;
  // expo-intent-launcher 是 Android 专用模块，iOS 上导入会抛异常，必须按需加载
  const IntentLauncher = await import('expo-intent-launcher');
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: file.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1,
  });
}
