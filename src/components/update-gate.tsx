import { useEffect, useRef, useState } from 'react';
import { showToast } from '@/lib/toast';
import { AppState, Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  checkForUpdate,
  currentVersionName,
  downloadUpdate,
  installUpdate,
  iosDownloadUrl,
  type UpdateInfo,
} from '@/lib/updater';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** 设置页「检查更新」入口：由 UpdateGate 注册实现。 */
let manualCheck: (() => void) | null = null;
export function requestUpdateCheck() {
  manualCheck?.();
}

/** 启动和回到前台时检查更新；发现新版本弹窗，应用内下载后交给系统安装器。 */
export function UpdateGate() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const checking = useRef(false);
  const lastCheck = useRef(0);

  const check = async (force = false) => {
    if (checking.current) return;
    if (!force && Date.now() - lastCheck.current < CHECK_INTERVAL_MS) return;
    checking.current = true;
    lastCheck.current = Date.now();
    try {
      const found = await checkForUpdate();
      if (found) {
        setError(null);
        setProgress(-1);
        setInfo(found);
      }
    } finally {
      checking.current = false;
    }
  };

  useEffect(() => {
    manualCheck = () => {
      void (async () => {
        if (checking.current) return;
        checking.current = true;
        lastCheck.current = Date.now();
        try {
          const found = await checkForUpdate();
          if (found) {
            setError(null);
            setProgress(-1);
            setInfo(found);
          } else {
            showToast(`当前已是最新版本 v${currentVersionName()}`);
          }
        } catch {
          showToast('检查更新失败，请稍后再试');
        } finally {
          checking.current = false;
        }
      })();
    };
    const timer = setTimeout(() => void check(), 3000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      manualCheck = null;
      clearTimeout(timer);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (!info) return;
    if (Platform.OS === 'ios') {
      // iOS 无法应用内安装：打开 IPA 下载页，交给 TrollStore/Sideloadly 安装
      const url = iosDownloadUrl(info);
      setInfo(null);
      try {
        await Linking.openURL(url);
      } catch {
        setError('打不开下载链接');
      }
      return;
    }
    setError(null);
    setProgress(0);
    try {
      const file = await downloadUpdate(info, setProgress);
      setProgress(-1);
      setInfo(null);
      await installUpdate(file);
    } catch (e) {
      setProgress(-1);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!info) return null;

  const downloading = progress >= 0;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => !downloading && setInfo(null)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ThemedText style={styles.title}>发现新版本 v{info.versionName}</ThemedText>
          <ThemedText style={styles.body}>
            当前版本 v{currentVersionName()}
            {info.notes ? `\n\n${info.notes}` : ''}
          </ThemedText>
          {downloading ? (
            <View style={styles.progressBox}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <ThemedText style={styles.progressText}>下载中 {progress}%</ThemedText>
            </View>
          ) : null}
          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.secondary]}
              disabled={downloading}
              onPress={() => setInfo(null)}>
              <ThemedText style={styles.secondaryText}>稍后</ThemedText>
            </Pressable>
            <Pressable style={styles.button} disabled={downloading} onPress={() => void start()}>
              <ThemedText style={styles.primaryText}>
                {downloading ? '下载中…' : '立即更新'}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#1d2935',
    borderRadius: 16,
    padding: 20,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  body: { color: '#b9c6d2', fontSize: 14, lineHeight: 20, marginTop: 10 },
  progressBox: { marginTop: 16 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.18)' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: '#3b82f6' },
  progressText: { color: '#b9c6d2', fontSize: 12, marginTop: 8 },
  error: { color: '#f87171', fontSize: 13, marginTop: 12 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  button: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    minWidth: 92,
    alignItems: 'center',
  },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#3a4a58' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryText: { color: '#b9c6d2', fontSize: 15 },
});
