import { type AndroidSymbol, SymbolView } from 'expo-symbols';
import { type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type IconName = AndroidSymbol;

/** Material 名称 → iOS SF Symbol（iOS 不认识 Material 名称，缺映射会没有图标）。 */
const IOS_SYMBOLS: Record<string, string> = {
  account_circle: 'person.crop.circle',
  add: 'plus',
  add_link: 'link.badge.plus',
  arrow_drop_down: 'chevron.down',
  arrow_forward: 'arrow.forward',
  brightness_6: 'sun.max',
  check: 'checkmark',
  check_circle: 'checkmark.circle.fill',
  chevron_right: 'chevron.right',
  clear_all: 'xmark',
  close: 'xmark',
  content_copy: 'doc.on.doc',
  create_new_folder: 'folder.badge.plus',
  delete: 'trash',
  dns: 'server.rack',
  download: 'arrow.down.circle',
  drive_file_move: 'folder',
  drive_file_rename_outline: 'pencil',
  drive_folder_upload: 'folder.badge.plus',
  error: 'exclamationmark.circle',
  fast_forward: 'forward',
  files: 'folder',
  fingerprint: 'touchid',
  folder_open: 'folder',
  forward_10: 'goforward.10',
  gateway: 'network',
  index: 'list.bullet',
  info: 'info.circle',
  link: 'link',
  lock: 'lock',
  logout: 'rectangle.portrait.and.arrow.right',
  more_vert: 'ellipsis',
  movie: 'film',
  music_note: 'music.note',
  open_in_new: 'arrow.up.right.square',
  password: 'key',
  pause: 'pause.fill',
  pdf: 'doc.text',
  photo_library: 'photo.on.rectangle',
  play_arrow: 'play.fill',
  refresh: 'arrow.clockwise',
  replay_10: 'gobackward.10',
  schedule: 'clock',
  screen_rotation: 'arrow.triangle.2.circlepath',
  select_all: 'checkmark.circle',
  settings: 'gearshape',
  share: 'square.and.arrow.up',
  shares: 'square.and.arrow.up',
  sort: 'arrow.up.arrow.down',
  storage: 'internaldrive',
  swap_horiz: 'arrow.left.arrow.right',
  swap_vert: 'arrow.up.arrow.down',
  switching: 'arrow.left.arrow.right',
  system_update: 'arrow.down.circle',
  tag: 'tag',
  timer: 'timer',
  transfers: 'arrow.up.arrow.down.circle',
  tune: 'slider.horizontal.3',
  upload_file: 'arrow.up.doc',
  viewer: 'eye',
  volume_up: 'speaker.wave.2',
  warning: 'exclamationmark.triangle',
};

type IconProps = {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
};

/** Material Symbols icon, the same icon family the FileBrowser web UI uses. */
export function Icon({ name, size = 24, color, style }: IconProps) {
  const theme = useTheme();

  return (
    <SymbolView
      name={{ android: name, ios: (IOS_SYMBOLS[name] ?? 'questionmark.circle') as never }}
      size={size}
      tintColor={color ?? theme.textPrimary}
      style={[{ width: size, height: size }, style]}
    />
  );
}
