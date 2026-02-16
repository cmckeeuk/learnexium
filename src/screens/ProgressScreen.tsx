import React, { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View as RNView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { Text, View, XStack, YStack } from 'tamagui';
import type {
  BadgeProgress,
  CertificateRecord,
  RewardsSummary,
} from '../api/user/UserAPI';
import { useAPI } from '../context/APIContext';
import { ProgressTabAnchor } from '../components/animations/ProgressTabAnchor';
import {
  CERTIFICATE_REWARD_IMAGE,
  XP_TOKEN_IMAGE,
  getBadgeImageSource,
} from '../constants/rewardImages';

const NATIVE_TITLE_FONT = Platform.select({
  ios: 'AvenirNext-Bold',
  android: 'sans-serif-medium',
  web: 'Avenir Next, Avenir, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
  default: 'Avenir Next, Avenir, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
});

function formatDateLabel(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export default function ProgressScreen() {
  const { userAPI } = useAPI();
  const [summary, setSummary] = useState<RewardsSummary | null>(null);
  const [badges, setBadges] = useState<BadgeProgress[]>([]);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProgressData = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [nextSummary, nextBadges, nextCertificates] = await Promise.all([
          userAPI.getRewardsSummary(),
          userAPI.getBadges(),
          userAPI.getCertificates(),
        ]);

        setSummary(nextSummary);
        setBadges(nextBadges);
        setCertificates(nextCertificates);
        setError(null);
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load progress';
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userAPI],
  );

  useFocusEffect(
    useCallback(() => {
      void loadProgressData('initial');
      return () => {};
    }, [loadProgressData]),
  );

  const earnedBadges = useMemo(
    () =>
      [...badges]
        .filter((badge) => badge.earned)
        .sort((a, b) => (b.earnedAt ?? '').localeCompare(a.earnedAt ?? '')),
    [badges],
  );

  const totalXp = summary?.totalXp ?? 0;
  const level = summary?.level ?? 1;
  const nextLevelGap = Math.max(0, (summary?.nextLevelXp ?? 200) - totalXp);
  const xpLabel = `${totalXp} XP`;
  const xpFontSize = xpLabel.length >= 8 ? 18 : xpLabel.length >= 6 ? 21 : 24;
  const hasRenderableData =
    summary !== null || badges.length > 0 || certificates.length > 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#FFFFFF' }}
      contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 50, paddingBottom: 22 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadProgressData('refresh')}
          tintColor="#0D9488"
        />
      }
    >
      <ProgressTabAnchor target="progressHeader">
        <YStack alignItems="center">
          <View style={styles.heroImageWrap}>
            <Image
              source={XP_TOKEN_IMAGE}
              style={styles.heroImage}
              resizeMode="contain"
            />
            <View style={styles.heroXpOverlayArea}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                style={[styles.heroXpOverlayText, { fontSize: xpFontSize }]}
              >
                {xpLabel}
              </Text>
            </View>
          </View>
          <XStack marginTop="$0.5" gap="$4" alignItems="center">
            <Text style={styles.levelText}>
              Level {level}
            </Text>
            <Text style={styles.levelSubText}>
              {nextLevelGap} XP to next
            </Text>
          </XStack>
        </YStack>
      </ProgressTabAnchor>

      <RNView style={{ height: 6 }} />

      {loading ? (
        <StateCard message="Loading progress..." />
      ) : null}

      {!loading && error && !hasRenderableData ? (
        <ErrorCard message={error} onRetry={() => void loadProgressData('initial')} />
      ) : null}

      {!loading && hasRenderableData ? (
        <YStack gap="$3">
          {error ? (
            <ErrorInlineBanner message={error} onRetry={() => void loadProgressData('initial')} />
          ) : null}

          <YStack paddingHorizontal="$1">
            <Text style={styles.sectionTitle}>
              Badges
            </Text>
            {earnedBadges.length === 0 ? (
              <Text marginTop="$2" textAlign="center" color="#6B7280" style={styles.bodyText}>
                No badges earned yet. Complete lessons to unlock your first badge.
              </Text>
            ) : (
              <View style={styles.badgeGrid}>
                {earnedBadges.map((badge) => (
                  <View key={badge.badgeId} style={styles.badgeCell}>
                    <View style={styles.badgeImageWrap}>
                        <Image
                          source={getBadgeImageSource(badge.badgeId)}
                          style={styles.badgeImage}
                          resizeMode="contain"
                        />
                    </View>
                    <Text
                      marginTop="$0"
                      textAlign="center"
                      style={styles.badgeTitle}
                    >
                      {badge.title}
                    </Text>
                    <Text textAlign="center" style={styles.badgeDateText}>
                      Earned {formatDateLabel(badge.earnedAt)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </YStack>

          <YStack paddingHorizontal="$1">
            <Text style={styles.sectionTitle}>
              Certificates
            </Text>
            {certificates.length === 0 ? (
              <Text marginTop="$2" textAlign="center" color="#6B7280" style={styles.bodyText}>
                No certificates yet. Complete a full course to earn one.
              </Text>
            ) : (
              <YStack marginTop="$2" gap="$2">
                {certificates.map((certificate) => {
                  return (
                    <View key={certificate.certificateId} style={styles.certificateCard}>
                      <View style={styles.certificateImageWrap}>
                        <Image
                          source={CERTIFICATE_REWARD_IMAGE}
                          style={styles.certificateImage}
                          resizeMode="contain"
                        />
                      </View>
                      <YStack flex={1} gap="$1">
                        <Text style={styles.certificateTitleText}>
                          {certificate.courseTitle || certificate.courseId}
                        </Text>
                        <Text style={styles.certificateMetaText}>
                          Issued {formatDateLabel(certificate.issuedAt)}
                        </Text>
                        <XStack gap="$3" marginTop={2}>
                          <Text style={styles.certificateMetaText}>
                            Lessons: {certificate.lessonsCompleted ?? '-'}
                          </Text>
                          <Text style={styles.certificateMetaText}>
                            Avg quiz: {certificate.averageQuizScore ?? '-'}%
                          </Text>
                        </XStack>
                      </YStack>
                    </View>
                  );
                })}
              </YStack>
            )}
          </YStack>
        </YStack>
      ) : null}
    </ScrollView>
  );
}

function StateCard({ message }: { message: string }) {
  return (
    <View
      backgroundColor="#F8FAFC"
      borderColor="#E2E8F0"
      borderWidth={1}
      borderRadius={14}
      padding="$4"
    >
      <Text color="#4B5563">{message}</Text>
    </View>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View
      backgroundColor="#FEF2F2"
      borderColor="#FECACA"
      borderWidth={1}
      borderRadius={14}
      padding="$4"
      gap="$3"
    >
      <Text fontSize={15} fontWeight="700" color="#991B1B">
        Could not load Progress
      </Text>
      <Text color="#7F1D1D">{message}</Text>
      <TouchableOpacity onPress={onRetry} activeOpacity={0.8}>
        <XStack
          alignItems="center"
          gap="$2"
          backgroundColor="#FEE2E2"
          borderColor="#FCA5A5"
          borderWidth={1}
          borderRadius={10}
          paddingHorizontal="$3"
          paddingVertical="$2"
        >
          <Feather name="refresh-cw" size={14} color="#991B1B" />
          <Text color="#991B1B" fontWeight="700">
            Retry
          </Text>
        </XStack>
      </TouchableOpacity>
    </View>
  );
}

function ErrorInlineBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View
      backgroundColor="#FFFBEB"
      borderColor="#FDE68A"
      borderWidth={1}
      borderRadius={12}
      padding="$3"
      marginBottom="$1"
    >
      <XStack alignItems="center" justifyContent="space-between" gap="$3">
        <Text color="#92400E" flex={1}>
          {message}
        </Text>
        <TouchableOpacity onPress={onRetry} activeOpacity={0.8}>
          <XStack alignItems="center" gap="$1.5">
            <Feather name="refresh-cw" size={13} color="#92400E" />
            <Text color="#92400E" fontWeight="700">
              Retry
            </Text>
          </XStack>
        </TouchableOpacity>
      </XStack>
    </View>
  );
}

const styles = StyleSheet.create({
  heroImageWrap: {
    marginTop: -66,
    marginBottom: -40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroImage: {
    width: 246,
    height: 292,
    transform: [{ scaleX: 0.9 }],
  },
  heroXpOverlayArea: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 130,
    height: 112,
    marginLeft: -65,
    marginTop: -56,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -14 }, { translateY: -4 }],
  },
  heroXpOverlayText: {
    width: '100%',
    color: '#0F172A',
    fontSize: 24,
    lineHeight: 26,
    textAlign: 'center',
    letterSpacing: 0.2,
    fontFamily: NATIVE_TITLE_FONT,
    includeFontPadding: false,
  },
  levelText: {
    fontSize: 18,
    color: '#111827',
    fontFamily: NATIVE_TITLE_FONT,
    includeFontPadding: false,
  },
  levelSubText: {
    fontSize: 15,
    color: '#4B5563',
    fontWeight: '500',
    includeFontPadding: false,
  },
  sectionTitle: {
    textAlign: 'center',
    fontSize: 18,
    color: '#111827',
    fontFamily: NATIVE_TITLE_FONT,
    lineHeight: 28,
    includeFontPadding: false,
  },
  bodyText: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 18,
    includeFontPadding: false,
  },
  badgeGrid: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  badgeCell: {
    width: '31.5%',
    marginBottom: 7,
    backgroundColor: '#EFF8F6',
    borderColor: '#C7DEDA',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  badgeImageWrap: {
    width: '100%',
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeImage: {
    width: 88,
    height: 88,
  },
  badgeTitle: {
    textAlign: 'center',
    fontSize: 15,
    color: '#111827',
    fontFamily: NATIVE_TITLE_FONT,
    lineHeight: 19,
    includeFontPadding: false,
  },
  badgeDateText: {
    textAlign: 'center',
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
    includeFontPadding: false,
  },
  certificateCard: {
    backgroundColor: 'transparent',
    paddingVertical: 4,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  certificateImageWrap: {
    width: 74,
    height: 74,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  certificateImage: {
    width: 68,
    height: 68,
  },
  certificateTitleText: {
    fontSize: 18,
    color: '#111827',
    fontFamily: NATIVE_TITLE_FONT,
    lineHeight: 21,
    includeFontPadding: false,
  },
  certificateMetaText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
    lineHeight: 17,
    includeFontPadding: false,
  },
});
