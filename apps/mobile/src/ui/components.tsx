import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from './theme';

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]} accessibilityRole="button">
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  busy,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const bg = kind === 'primary' ? colors.primary : kind === 'danger' ? colors.danger : colors.card;
  const fg = kind === 'secondary' ? colors.primary : colors.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, kind === 'secondary' && styles.secondary]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'muted';
const toneColors: Record<Tone, [string, string]> = {
  ok: [colors.okBg, colors.ok],
  warn: [colors.warnBg, colors.warn],
  danger: [colors.dangerBg, colors.danger],
  info: [colors.infoBg, colors.info],
  muted: [colors.bg, colors.muted],
};

export function Badge({ label, tone = 'muted' }: { label: string; tone?: Tone }) {
  const [bg, fg] = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Banner({ text, tone = 'info', action }: { text: string; tone?: Tone; action?: { label: string; onPress: () => void } }) {
  const [bg, fg] = toneColors[tone];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={[styles.bannerText, { color: fg }]}>{text}</Text>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button">
          <Text style={[styles.bannerAction, { color: fg }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Progress({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: pct >= 1 ? colors.ok : colors.primary }]} />
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<import('react-native').TextStyle> }) {
  return <Text style={[styles.body, muted && styles.muted, style]}>{children}</Text>;
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, padding: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.85 },
  button: { minHeight: 48, borderRadius: radius, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, marginVertical: space.xs },
  secondary: { borderWidth: 1, borderColor: colors.primary },
  buttonText: { fontSize: 16, fontWeight: '600' },
  badge: { borderRadius: 999, paddingHorizontal: space.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, borderRadius: radius, marginBottom: space.md, gap: space.sm },
  bannerText: { flex: 1, fontSize: 14 },
  bannerAction: { fontWeight: '700', fontSize: 14 },
  track: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden', marginTop: space.sm },
  fill: { height: 6 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: space.xs, textAlign: 'left' },
  body: { fontSize: 15, color: colors.text, lineHeight: 22, textAlign: 'left' },
  muted: { color: colors.muted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xl * 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
