import { File, Paths } from 'expo-file-system';

/**
 * 诊断用：把未捕获的 JS 错误写入 Documents/last-error.txt。
 * release 下 RN 默认会在致命错误时直接 abort（表现为闪退），这里先落盘再吞掉，
 * 便于在真机上取到错误原文。定位问题后应移除本模块。
 */
function install() {
  try {
    const g = globalThis as unknown as {
      ErrorUtils?: {
        setGlobalHandler?: (fn: (error: unknown, isFatal?: boolean) => void) => void;
      };
    };
    const EU = g.ErrorUtils;
    if (!EU?.setGlobalHandler) return;
    EU.setGlobalHandler((error: unknown, isFatal?: boolean) => {
      try {
        const e = error as { message?: string; stack?: string; name?: string } | null;
        const text = [
          `time=${new Date().toISOString()}`,
          `fatal=${String(isFatal)}`,
          `name=${e?.name ?? ''}`,
          `message=${e?.message ?? String(error)}`,
          `stack=${e?.stack ?? ''}`,
        ].join('\n');
        const f = new File(Paths.document, 'last-error.txt');
        f.write(text);
      } catch {
        // 写入失败也不能再抛
      }
      // 故意不调用原 fatal 处理器：避免 release 下直接 abort
    });
  } catch {
    // ignore
  }
}

install();
