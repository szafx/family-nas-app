import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  resolveUploadAuth,
  subscribeUploadAuth,
  verifyUploadPass,
} from '@/lib/upload-auth';

/** 上传密码弹窗：上传/写入前验证，通过后才放行；下载与浏览不需要。 */
export function UploadAuthHost() {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => subscribeUploadAuth(setVisible), []);

  const cancel = () => {
    setValue('');
    setError('');
    resolveUploadAuth(null);
  };

  const submit = async () => {
    const candidate = value.trim();
    if (!candidate || checking) return;
    setChecking(true);
    const ok = await verifyUploadPass(candidate);
    setChecking(false);
    if (ok) {
      setValue('');
      setError('');
      resolveUploadAuth(candidate);
    } else {
      setError('密码错误，请重试');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ThemedText type="subtitle">需要上传密码</ThemedText>
          <ThemedText type="caption">
            上传、新建、改名、删除等写操作需要密码，下载和浏览不受限制。
          </ThemedText>
          <TextInput
            value={value}
            onChangeText={(t) => {
              setValue(t);
              if (error) setError('');
            }}
            placeholder="请输入上传密码"
            placeholderTextColor="rgba(255,255,255,0.4)"
            secureTextEntry
            autoFocus
            onSubmitEditing={() => void submit()}
            style={styles.input}
          />
          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
          <View style={styles.buttons}>
            <Pressable onPress={cancel} style={styles.btn} hitSlop={8}>
              <ThemedText style={styles.btnGhost}>取消</ThemedText>
            </Pressable>
            <Pressable onPress={() => void submit()} style={styles.btn} hitSlop={8} disabled={checking}>
              {checking ? (
                <ActivityIndicator color="#22d3ee" />
              ) : (
                <ThemedText style={styles.btnPrimary}>确定</ThemedText>
              )}
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
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.medium,
    backgroundColor: '#18212b',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 16,
  },
  error: { color: '#ef4444' },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.four },
  btn: { minWidth: 64, height: 40, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { color: 'rgba(255,255,255,0.7)' },
  btnPrimary: { color: '#22d3ee', fontWeight: '700' },
});
