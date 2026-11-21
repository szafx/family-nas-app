import {
  MpvPlayerView,
  type AudioTrack,
  type MpvPlayerViewRef,
  type SubtitleTrack,
} from '@lunarr/mpv-player';
import * as Brightness from 'expo-brightness';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Spacing } from '@/constants/theme';

const WHITE = '#ffffff';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function formatTime(seconds: number) {
  const v = Math.max(0, Math.floor(seconds));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const s = v % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

type HudState = { kind: 'brightness' | 'volume' | 'speed' | 'seek'; ratio: number; text: string } | null;

type Props = {
  uri?: string;
  headers?: Record<string, string>;
  sourceError?: string | null;
};

/**
 * 内置播放器：拖动进度条、双击暂停、长按 3 倍速、左侧上下调亮度、右侧上下调音量、
 * 横竖屏切换（默认跟随视频方向）、倍速/音轨/字幕选择。控件按安全区避让导航栏。
 */
export function VideoPlayer({ uri, headers, sourceError }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const ref = useRef<MpvPlayerViewRef>(null);

  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [menu, setMenu] = useState<'none' | 'speed' | 'tracks'>('none');
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [hud, setHud] = useState<HudState>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState(0);

  // ---- refs（手势闭包用，避免过期状态） ----
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const positionRef = useRef(position);
  positionRef.current = position;
  const speedRef = useRef(1);
  const volumeRef = useRef(100);
  const brightnessRef = useRef(1);
  const widthRef = useRef(width);
  widthRef.current = width;
  const heightRef = useRef(height);
  heightRef.current = height;
  const barWidthRef = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);

  const showControls = () => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!pausedRef.current && !draggingRef.current) setControlsVisible(false);
    }, 4000);
  };
  const draggingRef = useRef(false);
  draggingRef.current = dragging;

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (hudTimer.current) clearTimeout(hudTimer.current);
      if (tapTimer.current) clearTimeout(tapTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 离开播放器恢复竖屏
  useEffect(() => {
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const mpvSource = useMemo(
    () => (uri ? { url: uri, headers, autoplay: true, cacheConfig: { cacheSeconds: 5, maxBytes: 200 } } : undefined),
    [uri, headers],
  );

  const togglePlay = async () => {
    const isPaused = await ref.current?.isPaused();
    if (isPaused) await ref.current?.play();
    else await ref.current?.pause();
    setPaused(!!isPaused ? false : true);
    showControls();
  };

  const setPlaybackSpeed = async (v: number) => {
    // 4K/大视频解码余量有限，强制封顶 2×（菜单里也不提供 3×）
    const capped = heavyVideoRef.current && v > 2 ? 2 : v;
    setSpeed(capped);
    speedRef.current = capped;
    await ref.current?.setSpeed(capped);
  };

  const showHud = (next: HudState) => {
    setHud(next);
    if (hudTimer.current) clearTimeout(hudTimer.current);
  };
  const dismissHudSoon = () => {
    if (hudTimer.current) clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => setHud(null), 650);
  };

  // ---- 全屏手势：亮度/音量拖动、长按 3 倍速、双击暂停、单击显隐控件 ----
  const gesture = useMemo(() => {
    let mode: 'none' | 'brightness' | 'volume' | 'seek' = 'none';
    let seekStart = 0;
    let seekTarget = 0;
    let startBrightness = 1;
    let startVolume = 100;
    let moved = false;
    let longActive = false;
    let longTimer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let longSpeedBefore = 1;

    const clearLong = () => {
      if (longTimer) clearTimeout(longTimer);
      longTimer = null;
    };

    const onTap = () => {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        if (tapTimer.current) clearTimeout(tapTimer.current);
        void togglePlay();
      } else {
        lastTap.current = now;
        if (tapTimer.current) clearTimeout(tapTimer.current);
        tapTimer.current = setTimeout(() => {
          setControlsVisible((v) => !v);
        }, 300);
      }
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        mode = 'none';
        moved = false;
        longActive = false;
        startX = e.nativeEvent.locationX;
        startBrightness = brightnessRef.current;
        startVolume = volumeRef.current;
        clearLong();
        longTimer = setTimeout(() => {
          if (moved || pausedRef.current) return;
          longActive = true;
          longSpeedBefore = speedRef.current;
          const boost = heavyVideoRef.current ? 2 : 3;
          void ref.current?.setSpeed(boost);
          showHud({ kind: 'speed', ratio: 1, text: `${boost}× 快进中` });
        }, 500);
      },
      onPanResponderMove: (_e, g) => {
        if (!moved && (Math.abs(g.dx) > 12 || Math.abs(g.dy) > 12)) {
          moved = true;
          clearLong();
        }
        if (!moved) return;
        // 横向拖动 = 调进度（与大多数手机播放器一致）；纵向 = 左亮度/右音量
        if (mode === 'none') {
          if (Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2) {
            mode = 'seek';
            seekStart = positionRef.current;
            seekTarget = seekStart;
          } else if (Math.abs(g.dy) > 16) {
            mode = startX < widthRef.current / 2 ? 'brightness' : 'volume';
          }
        }
        if (mode === 'seek') {
          const perPx = 120 / widthRef.current; // 横滑满屏约 ±120 秒
          seekTarget = clamp(seekStart + g.dx * perPx, 0, Math.max(durationRef.current - 1, 0));
          const delta = Math.round(seekTarget - seekStart);
          showHud({
            kind: 'seek',
            ratio: durationRef.current > 0 ? seekTarget / durationRef.current : 0,
            text: `${formatTime(seekTarget)} （${delta >= 0 ? '+' : ''}${delta}s）`,
          });
          return;
        }
        if (Math.abs(g.dy) < 16 || Math.abs(g.dy) < Math.abs(g.dx) * 1.1) return;
        const sideLeft = startX < widthRef.current / 2;
        const kind = sideLeft ? 'brightness' : 'volume';
        if (mode === 'none') mode = kind;
        const frac = -g.dy / (heightRef.current * 0.6);
        if (mode === 'brightness') {
          const v = clamp(startBrightness + frac, 0.02, 1);
          brightnessRef.current = v;
          void Brightness.setBrightnessAsync(v);
          showHud({ kind: 'brightness', ratio: v, text: `${Math.round(v * 100)}%` });
        } else if (mode === 'volume') {
          const v = clamp(startVolume + frac * 100, 0, 100);
          volumeRef.current = v;
          void ref.current?.setVolume(Math.round(v));
          showHud({ kind: 'volume', ratio: v / 100, text: `${Math.round(v)}%` });
        }
      },
      onPanResponderRelease: () => {
        clearLong();
        if (mode === 'seek') {
          setPosition(seekTarget);
          void ref.current?.seekTo(seekTarget);
          dismissHudSoon();
          mode = 'none';
          return;
        }
        if (longActive) {
          longActive = false;
          void ref.current?.setSpeed(longSpeedBefore || 1);
          dismissHudSoon();
        } else if (!moved) {
          onTap();
        } else {
          dismissHudSoon();
        }
        mode = 'none';
      },
      onPanResponderTerminate: () => {
        clearLong();
        if (longActive) {
          longActive = false;
          void ref.current?.setSpeed(longSpeedBefore || 1);
        }
        dismissHudSoon();
        mode = 'none';
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // ---- 进度条拖动 ----
  const seekFromX = (x: number) => {
    const w = barWidthRef.current;
    if (w <= 0 || durationRef.current <= 0) return 0;
    return clamp(x / w, 0, 1) * durationRef.current;
  };
  const seekPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          setDragging(true);
          setDragPos(seekFromX(e.nativeEvent.locationX));
          showControls();
        },
        onPanResponderMove: (e) => {
          setDragPos(seekFromX(e.nativeEvent.locationX));
        },
        onPanResponderRelease: (e) => {
          const target = seekFromX(e.nativeEvent.locationX);
          setDragging(false);
          setPosition(target);
          void ref.current?.seekTo(target);
          showControls();
        },
        onPanResponderTerminate: () => setDragging(false),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 起播之后再决定横竖屏：旋转会销毁并重建视频 surface，打开过程中旋转会让 mpv
  // 丢失 surface 直接结束播放，所以必须推迟到稳定播放后。尺寸来自原生 onVideoSize 事件
  // （已应用旋转元数据），不再调用会挂起的 getTechnicalInfo。
  const orientationApplied = useRef(false);
  const heavyVideoRef = useRef(false);
  const startedRef = useRef(false);
  const videoDimsRef = useRef({ w: 0, h: 0 });
  useEffect(() => {
    if (orientationApplied.current || position < 0.5) return;
    orientationApplied.current = true;
    const timer = setTimeout(() => {
      const { w, h } = videoDimsRef.current;
      if (w > 0 && h > 0 && w > h) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [position]);

  const toggleOrientation = async () => {
    try {
      const current = await ScreenOrientation.getOrientationAsync();
      const landscape =
        current === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        current === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      await ScreenOrientation.lockAsync(
        landscape
          ? ScreenOrientation.OrientationLock.PORTRAIT_UP
          : ScreenOrientation.OrientationLock.LANDSCAPE,
      );
    } catch {
      // ignore
    }
    showControls();
  };

  const openTracksMenu = async () => {
    setMenu('tracks');
    try {
      const [audio, subs] = await Promise.all([
        ref.current?.getAudioTracks() ?? Promise.resolve([]),
        ref.current?.getSubtitleTracks() ?? Promise.resolve([]),
      ]);
      setAudioTracks(audio);
      setSubtitleTracks(subs);
    } catch {
      // ignore
    }
    showControls();
  };

  const progressRatio = duration > 0 ? clamp((dragging ? dragPos : position) / duration, 0, 1) : 0;
  const bufferedRatio = duration > 0 ? clamp((position + buffered) / duration, 0, 1) : 0;
  const bottomPad = Math.max(insets.bottom, 10) + 8;
  const errorText = sourceError || playerError;

  return (
    <View style={styles.fill}>
      {uri ? (
        <MpvPlayerView
          ref={ref}
          style={StyleSheet.absoluteFill}
          source={mpvSource}
          onProgress={(event) => {
            const { position: p, duration: d, cacheSeconds } = event.nativeEvent;
            if (!draggingRef.current) setPosition(p);
            setBuffered(Math.max(0, cacheSeconds || 0));
            if (p > 0) {
              startedRef.current = true;
              setLoading(false);
            }
            if (d > 0) setDuration(d);
          }}
          onPlaybackStateChange={(event) => {
            if (typeof event.nativeEvent.isPaused === 'boolean') {
              setPaused(event.nativeEvent.isPaused);
            }
          }}
          onError={(event) => {
            setLoading(false);
            setPlayerError(event.nativeEvent.error);
          }}
          onVideoSize={(event) => {
            const { width, height } = event.nativeEvent;
            if (width > 0 && height > 0) {
              videoDimsRef.current = { w: width, h: height };
              const shortSide = Math.min(width, height);
              const longSide = Math.max(width, height);
              // 4K 或超宽视频：解码余量有限，长按加速用 2 倍速避免卡顿
              heavyVideoRef.current = shortSide >= 1440 || longSide >= 2560;
            }
          }}
          onEnd={() => {
            setLoading(false);
            if (!startedRef.current) {
              setPlayerError('无法播放该视频，试试「兼容版」或稍后重试');
            }
          }}
        />
      ) : null}

      {/* 手势层（视频上方、控件下方） */}
      <View style={StyleSheet.absoluteFill} {...gesture.panHandlers} />

      {/* 手势 HUD */}
      {hud ? (
        <View style={[styles.hud, { top: insets.top + 80 }]} pointerEvents="none">
          <Icon
            name={hud.kind === 'volume' ? 'volume_up' : hud.kind === 'brightness' ? 'brightness_6' : 'fast_forward'}
            size={20}
            color={WHITE}
          />
          <ThemedText style={styles.hudText}>{hud.text}</ThemedText>
          <View style={styles.hudTrack}>
            <View style={[styles.hudFill, { width: `${clamp(hud.ratio, 0, 1) * 100}%` }]} />
          </View>
        </View>
      ) : null}

      {errorText ? (
        <View style={styles.center}>
          <ThemedText style={styles.white}>{errorText}</ThemedText>
        </View>
      ) : loading ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color={WHITE} />
          <ThemedText style={styles.white}>正在缓冲…</ThemedText>
        </View>
      ) : null}

      {controlsVisible ? (
        <View style={[styles.bottomPanel, { paddingBottom: bottomPad }]}>
          <View style={styles.seekRow}>
            <ThemedText style={styles.time}>
              {formatTime(dragging ? dragPos : position)}
            </ThemedText>
            <View
              style={styles.seekHit}
              onLayout={(e) => {
                barWidthRef.current = e.nativeEvent.layout.width;
              }}
              {...seekPan.panHandlers}>
              <View style={styles.seekTrack} />
              <View style={[styles.seekBuffered, { width: `${bufferedRatio * 100}%` }]} />
              <View style={[styles.seekFill, { width: `${progressRatio * 100}%` }]} />
              <View style={[styles.seekThumb, { left: `${progressRatio * 100}%` }]} />
              {dragging ? (
                <View style={[styles.seekBubble, { left: `${progressRatio * 100}%` }]}>
                  <ThemedText style={styles.seekBubbleText}>{formatTime(dragPos)}</ThemedText>
                </View>
              ) : null}
            </View>
            <ThemedText style={styles.time}>{formatTime(duration)}</ThemedText>
          </View>

          <View style={styles.btnRow}>
            <CtrlButton
              icon={paused ? 'play_arrow' : 'pause'}
              size={30}
              onPress={() => void togglePlay()}
            />
            <CtrlButton
              icon="replay_10"
              onPress={() => {
                void ref.current?.seekBy(-10);
                showControls();
              }}
            />
            <CtrlButton
              icon="forward_10"
              onPress={() => {
                void ref.current?.seekBy(10);
                showControls();
              }}
            />
            <View style={styles.spacer} />
            <Pressable
              onPress={() => {
                setMenu(menu === 'speed' ? 'none' : 'speed');
                showControls();
              }}
              style={styles.textBtn}>
              <ThemedText style={styles.textBtnLabel}>{speed}×</ThemedText>
            </Pressable>
            <CtrlButton
              icon="tune"
              onPress={() => void (menu === 'tracks' ? setMenu('none') : openTracksMenu())}
            />
            <CtrlButton icon="screen_rotation" onPress={() => void toggleOrientation()} />
          </View>
        </View>
      ) : null}

      {menu === 'speed' ? (
        <View style={[styles.menu, { bottom: bottomPad + 92 }]}>
          {(heavyVideoRef.current ? [0.5, 0.75, 1, 1.25, 1.5, 2] : [0.5, 0.75, 1, 1.25, 1.5, 2, 3]).map((v) => (
            <Pressable
              key={v}
              style={styles.menuItem}
              onPress={() => {
                void setPlaybackSpeed(v);
                setMenu('none');
              }}>
              <ThemedText style={[styles.menuText, v === speed ? styles.menuActive : null]}>
                {v}×
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {menu === 'tracks' ? (
        <View style={[styles.menu, styles.trackMenu, { bottom: bottomPad + 92 }]}>
          {audioTracks.length > 1 ? (
            <>
              <ThemedText style={styles.menuHeader}>音轨</ThemedText>
              {audioTracks.map((track) => (
                <Pressable
                  key={`a${track.id}`}
                  style={styles.menuItem}
                  onPress={() => {
                    void ref.current?.setAudioTrack(track.id);
                    setMenu('none');
                  }}>
                  <ThemedText style={[styles.menuText, track.selected ? styles.menuActive : null]}>
                    {track.title || track.lang || `音轨 ${track.id}`}
                  </ThemedText>
                </Pressable>
              ))}
            </>
          ) : null}
          {subtitleTracks.length > 0 ? (
            <>
              <ThemedText style={styles.menuHeader}>字幕</ThemedText>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  void ref.current?.disableSubtitles();
                  setMenu('none');
                }}>
                <ThemedText style={styles.menuText}>关闭字幕</ThemedText>
              </Pressable>
              {subtitleTracks.map((track) => (
                <Pressable
                  key={`s${track.id}`}
                  style={styles.menuItem}
                  onPress={() => {
                    void ref.current?.setSubtitleTrack(track.id);
                    setMenu('none');
                  }}>
                  <ThemedText style={[styles.menuText, track.selected ? styles.menuActive : null]}>
                    {track.title || track.lang || `字幕 ${track.id}`}
                  </ThemedText>
                </Pressable>
              ))}
            </>
          ) : null}
          {audioTracks.length <= 1 && subtitleTracks.length === 0 ? (
            <ThemedText style={styles.menuText}>没有可切换的音轨/字幕</ThemedText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function CtrlButton({
  icon,
  size = 24,
  onPress,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  size?: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.ctrlButton} hitSlop={8}>
      <Icon name={icon} size={size} color={WHITE} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000000' },
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  white: { color: WHITE, textAlign: 'center' },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  seekRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  seekHit: { flex: 1, height: 32, justifyContent: 'center' },
  seekTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)' },
  seekBuffered: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  seekFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: WHITE,
  },
  seekThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    backgroundColor: WHITE,
  },
  seekBubble: {
    position: 'absolute',
    top: -24,
    marginLeft: -22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  seekBubbleText: { color: WHITE, fontSize: 12 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginTop: 2 },
  spacer: { flex: 1 },
  ctrlButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  textBtn: { minWidth: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  textBtnLabel: { color: WHITE, fontSize: 14, fontWeight: '600' },
  time: { color: WHITE, fontSize: 12, minWidth: 44, textAlign: 'center' },
  hud: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  hudText: { color: WHITE, fontSize: 15 },
  hudTrack: {
    width: 120,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  hudFill: { height: 4, backgroundColor: WHITE },
  menu: {
    position: 'absolute',
    right: Spacing.three,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(16,16,16,0.94)',
    minWidth: 120,
  },
  trackMenu: { maxWidth: 260 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 9 },
  menuText: { color: WHITE, fontSize: 14 },
  menuActive: { color: '#22d3ee', fontWeight: '700' },
  menuHeader: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
});
