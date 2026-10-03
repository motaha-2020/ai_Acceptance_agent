import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useApp } from '../app-context';
import { otherPendingOwners, type PendingOwner } from '../features/auth/pending-owners';
import { Banner, Button, styles as ui } from '../ui/components';
import { colors, radius, space } from '../ui/theme';

export default function LoginScreen() {
  const { t } = useTranslation();
  const { services, user } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leftBehind, setLeftBehind] = useState<PendingOwner[]>([]);

  // Photos of an account whose session ended (e.g. expired) only upload after that account signs in again.
  useEffect(() => {
    void Promise.all([services.store.pendingByUser(), services.session.knownUsers()])
      .then(([pending, known]) => setLeftBehind(otherPendingOwners(pending, known, null)))
      .catch(() => undefined);
  }, [services]);

  if (user) return <Redirect href="/" />;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await services.session.login(email, password);
    setBusy(false);
    if (!r.ok) {
      setError(
        r.reason === 'invalid' ? t('login.invalid') : r.reason === 'role' ? t('login.roleNotAllowed') : r.reason === 'rate_limited' ? t('login.rateLimited') : t('login.network'),
      );
    }
  };

  return (
    <KeyboardAvoidingView style={ui.screen} behavior="height">
      <Stack.Screen options={{ title: t('login.title') }} />
      <ScrollView contentContainerStyle={[ui.content, { paddingTop: 48 }]} keyboardShouldPersistTaps="handled">
        <Text style={s.brand}>{t('appName')}</Text>
        {leftBehind.map((o) => (
          <Banner
            key={o.userId}
            tone="warn"
            text={t('login.pendingOther', { count: o.count, who: o.user ? `${o.user.name} (${o.user.email})` : t('login.unknownAccount') })}
            {...(o.user ? { action: { label: t('login.useAccount'), onPress: () => setEmail(o.user?.email ?? '') } } : {})}
          />
        ))}
        {error ? <Banner text={error} tone="danger" /> : null}
        <Text style={s.label}>{t('login.email')}</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          accessibilityLabel={t('login.email')}
        />
        <Text style={s.label}>{t('login.password')}</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          accessibilityLabel={t('login.password')}
          onSubmitEditing={() => void submit()}
        />
        <Button title={t('login.submit')} onPress={() => void submit()} busy={busy} disabled={!email || !password} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  brand: { fontSize: 26, fontWeight: '800', color: colors.primary, textAlign: 'center', marginBottom: space.xl },
  label: { fontSize: 14, color: colors.muted, marginBottom: space.xs, textAlign: 'left' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    padding: space.md,
    fontSize: 16,
    marginBottom: space.lg,
    textAlign: 'left',
  },
});
