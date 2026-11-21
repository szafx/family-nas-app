import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useSession } from '@/session/session';
import { getBaseUrl } from '@/api/client';

type Badge = { label: string; color: string };

const COLORS = {
  lan: '#059669',
  ipv6: '#2563eb',
  cf: '#f6821f',
  tunnel: '#7c3aed',
  tailscale: '#0ea5e9',
  other: '#db2777',
};

function prefix64(ip: string): string {
  const parts = ip.split(':');
  return parts.length >= 4 ? parts.slice(0, 4).join(':') : ip;
}

/** 与网页版一致的连接方式徽标：局域网 / IPv6 直连 / Cloudflare 隧道 / 隧道。 */
let savedPos: { right: number; bottom: number } | null = null;

export function ConnectionBadge() {
  const pathname = usePathname();
  const { server } = useSession();
  const [badge, setBadge] = useState<Badge | null>(null);

  useEffect(() => {
    if (!server) {
      setBadge(null);
      return;
    }
    let cancelled = false;

    const detect = async () => {
      const base = getBaseUrl();
      if (!base) return;
      // 局域网 IPv4 直连时无需探测。
      if (/^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(base)) {
        if (!cancelled) setBadge({ label: '局域网', color: COLORS.lan });
        return;
      }
      try {
        const res = await fetch(`${base}/__conn`, { cache: 'no-store' });
        const via = res.headers.get('X-Conn-Via') || '';
        const name = res.headers.get('X-Conn-Name') || '';
        const data = (await res.json()) as { client?: string; xff?: string };
        const raw = (data.xff || '').split(',')[0].trim() || data.client || '';
        const ip = raw.replace(/^\[|\]$/g, '');
        let next: Badge = { label: '公网 IPv4', color: COLORS.other };
        if (via === 'cf' || /pan-cf/.test(base)) {
          next = { label: 'Cloudflare 隧道', color: COLORS.cf };
        } else if (via === 'tunnel') {
          next = { label: `隧道 · ${name || '中转'}`, color: COLORS.tunnel };
        } else if (/^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(ip)) {
          next = { label: 'Tailscale', color: COLORS.tailscale };
        } else if (ip.includes(':')) {
          let same = false;
          try {
            const route = (await fetch(`${base}/__route.json`, { cache: 'no-store' }).then((r) =>
              r.json(),
            )) as { ipv6?: string } | null;
            same = !!route?.ipv6 && prefix64(ip) === prefix64(route.ipv6);
          } catch {
            // ignore
          }
          next = same
            ? { label: '局域网 · IPv6', color: COLORS.lan }
            : { label: 'IPv6 直连', color: COLORS.ipv6 };
        } else if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(ip)) {
          next = { label: '局域网', color: COLORS.lan };
        }
        if (!cancelled) setBadge(next);
      } catch {
        if (!cancelled) setBadge(null);
      }
    };

    void detect();
    const timer = setInterval(() => void detect(), 60_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void detect();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [server]);

  // ---- 可拖动：记住位置（本次运行内），双击还原到右下角 ----
  const { width, height } = useWindowDimensions();
  const [pos, setPos] = useState(savedPos ?? { right: 14, bottom: 150 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const dragStart = useRef(pos);
  const lastTap = useRef(0);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = posRef.current;
      },
      onPanResponderMove: (_e, g) => {
        if (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3) {
          const maxRight = width - sizeRef.current.w - 6;
          const maxBottom = height - sizeRef.current.h - 6;
          setPos({
            right: Math.min(Math.max(dragStart.current.right - g.dx, 6), Math.max(maxRight, 6)),
            bottom: Math.min(Math.max(dragStart.current.bottom - g.dy, 6), Math.max(maxBottom, 6)),
          });
        }
      },
      onPanResponderRelease: () => {
        savedPos = posRef.current;
        const now = Date.now();
        if (now - lastTap.current < 300) {
          savedPos = null;
          setPos({ right: 14, bottom: 150 });
        }
        lastTap.current = now;
      },
      onPanResponderTerminate: () => {
        savedPos = posRef.current;
      },
    }),
  ).current;

  useEffect(() => {
    // 屏幕旋转后把徽标夹回可视范围
    setPos((p) => ({
      right: Math.min(p.right, Math.max(width - size.w - 6, 6)),
      bottom: Math.min(p.bottom, Math.max(height - size.h - 6, 6)),
    }));
  }, [width, height, size.w, size.h]);

  // 播放页内隐藏：会盖住进度条/旋转按钮的触摸区域
  if (!badge || pathname?.includes('/viewer')) return null;

  return (
    <View
      style={[styles.badge, { backgroundColor: badge.color, right: pos.right, bottom: pos.bottom }]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      {...pan.panHandlers}>
      <ThemedText style={styles.text}>{badge.label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    opacity: 0.92,
    zIndex: 9999,
    elevation: 8,
  },
  text: { color: '#fff', fontSize: 12 },
});
