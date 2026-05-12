import { Platform } from 'react-native';

export const palette = {
  ink: '#102332',
  inkMuted: '#5F6C75',
  sidebar: '#071E2C',
  sidebarSurface: '#0B2A3C',
  surface: '#FFFFFF',
  canvas: '#F5F8FA',
  border: '#DDE6EB',
  borderStrong: '#C4D0D8',
  primary: '#009B55',
  primaryDark: '#007F45',
  danger: '#E43838',
  dangerSoft: '#FFECEC',
  warning: '#F59E0B',
  warningSoft: '#FFF4D7',
  successSoft: '#E6F7EE',
  criticalSoft: '#FFE8E8',
  info: '#2563EB',
  muted: '#EEF3F6',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: '#0B1D2A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 2,
  },
} as const;

export const statusPalette = {
  inStock: {
    background: palette.successSoft,
    color: palette.primaryDark,
    label: 'In Stock',
  },
  lowStock: {
    background: palette.warningSoft,
    color: '#C66A00',
    label: 'Low Stock',
  },
  critical: {
    background: palette.criticalSoft,
    color: palette.danger,
    label: 'Critical',
  },
  expiringSoon: {
    background: '#FFF0E6',
    color: '#E86C00',
    label: 'Expiring Soon',
  },
  active: {
    background: palette.successSoft,
    color: palette.primaryDark,
    label: 'Active',
  },
  scheduled: {
    background: '#EAF1FF',
    color: palette.info,
    label: 'Scheduled',
  },
  inactive: {
    background: palette.muted,
    color: palette.inkMuted,
    label: 'Inactive',
  },
} as const;

const tintColorLight = palette.primary;
const tintColorDark = palette.surface;

export const Colors = {
  light: {
    text: palette.ink,
    background: palette.canvas,
    tint: tintColorLight,
    icon: palette.inkMuted,
    tabIconDefault: palette.inkMuted,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: palette.sidebar,
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
