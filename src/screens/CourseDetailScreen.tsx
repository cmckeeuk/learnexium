import React, { useState, useCallback, useEffect } from 'react';
import { ScrollView, ActivityIndicator, ImageBackground, Image, StyleSheet, Platform } from 'react-native';
import { YStack, XStack, Text, View, Button, Separator } from 'tamagui';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useAPI } from '../context/APIContext';
import { CourseSummary, CourseDetail, Lesson } from '../api/course/CourseAPI';
import { CourseProgress, LessonState } from '../api/user/UserAPI';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { buildVersionedImageUri, prefetchImages } from '../utils/imageCache';

type CourseDetailRouteProp = RouteProp<{ params: { courseId: string } }, 'params'>;

const getDifficultyTone = (difficulty?: string) => {
  const value = (difficulty ?? '').toLowerCase();
  if (value.includes('advanced')) {
    return { bg: '#99F6E4', border: '#14B8A6', text: '#115E59' };
  }
  if (value.includes('intermediate')) {
    return { bg: '#CCFBF1', border: '#2DD4BF', text: '#0F766E' };
  }
  if (value.includes('beginner')) {
    return { bg: '#ECFDF5', border: '#6EE7B7', text: '#047857' };
  }
  return { bg: '#F0FDFA', border: '#5EEAD4', text: '#0F766E' };
};

export default function CourseDetailScreen() {
  const { courseAPI, userAPI } = useAPI();
  const route = useRoute<CourseDetailRouteProp>();
  const navigation = useNavigation();
  const { courseId } = route.params;
  const HERO_HEIGHT = 170;
  const titleFontSize = Platform.OS === 'web' ? 30 : 26;
  const titleLineHeight = Platform.OS === 'web' ? 34 : 30;
  const nativeTitleFontFamily = Platform.select({
    ios: 'AvenirNext-Bold',
    android: 'sans-serif-medium',
    default: undefined,
  });

  const [summary, setSummary] = useState<CourseSummary | null>(null);
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [lessonStates, setLessonStates] = useState<Record<string, LessonState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [summaryData, detailData] = await Promise.all([
        courseAPI.getCourseSummary(courseId),
        courseAPI.getCourseDetail(courseId)
      ]);
      setSummary(summaryData);
      setDetail(detailData);

      // Load progress
      const prog = await userAPI.getCourseProgress(courseId, detailData.lessons.length);
      setProgress(prog);

      // Build per-lesson state map
      const states: Record<string, LessonState> = {};
      for (const lesson of detailData.lessons) {
        const status = await userAPI.getLessonStatus(courseId, lesson.lessonId);
        states[lesson.lessonId] = status?.state ?? 'not-started';
      }
      setLessonStates(states);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load course');
    } finally {
      setLoading(false);
    }
  };

  // Refresh progress every time the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [courseId])
  );

  useEffect(() => {
    const imageUris: string[] = [];

    if (summary && typeof summary.thumbnailUrl === 'string') {
      imageUris.push(
        buildVersionedImageUri(
          summary.thumbnailUrl,
          summary.thumbnailVersion,
          summary.thumbnailHash,
        ),
      );
    }
    if (summary?.author?.avatarUrl) {
      if (typeof summary.author.avatarUrl === 'string') {
        imageUris.push(summary.author.avatarUrl);
      }
    }
    if (detail) {
      detail.lessons.forEach((lesson) => {
        lesson.blocks.forEach((block: any) => {
          if (block?.type !== 'image' || typeof block.src !== 'string') return;
          imageUris.push(buildVersionedImageUri(block.src, block.version, block.hash));
        });
      });
    }

    prefetchImages(imageUris);
  }, [summary, detail]);



  if (loading) {
    return (
      <View flex={1} justifyContent="center" alignItems="center" backgroundColor="white">
        <ActivityIndicator size="large" color="#111827" />
      </View>
    );
  }

  if (error || !summary || !detail) {
    return (
      <View flex={1} justifyContent="center" alignItems="center" padding="$4">
        <Text color="#EF4444">{error || 'Course not found'}</Text>
      </View>
    );
  }

  const resumeId = progress?.currentLessonId
    ?? detail.lessons.find(l => (lessonStates[l.lessonId] ?? 'not-started') === 'not-started')?.lessonId;
  const resumeLesson = detail.lessons.find(l => l.lessonId === resumeId);
  const completionPercentage = progress?.completionPercentage ?? 0;
  const completedLessons = progress?.completedCount ?? 0;
  const totalLessonCount = progress?.totalLessons ?? detail.lessons.length;
  const hasStarted = completionPercentage > 0;
  const isComplete = completionPercentage === 100;
  const difficultyTone = getDifficultyTone(summary.difficulty);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      {/* Split hero + overlapping stats card */}
      <View position="relative" paddingBottom="$1">
        <View height={HERO_HEIGHT} width="100%" position="relative" overflow="hidden" zIndex={0}>
          <ImageBackground
            source={typeof summary.thumbnailUrl === 'string'
              ? {
                  uri: buildVersionedImageUri(
                    summary.thumbnailUrl,
                    summary.thumbnailVersion,
                    summary.thumbnailHash,
                  ),
                }
              : summary.thumbnailUrl}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          >
            <LinearGradient
              colors={['rgba(2, 6, 23, 0.00)', 'rgba(2, 6, 23, 0.16)', 'rgba(2, 6, 23, 0.62)']}
              locations={[0, 0.58, 1]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              justifyContent="flex-end"
              paddingHorizontal="$4"
              paddingBottom="$3"
            >
              <Text fontSize={12} color="rgba(255,255,255,0.85)" fontWeight="700" textTransform="uppercase" letterSpacing={1}>
                Course Overview
              </Text>
            </View>
          </ImageBackground>
        </View>

        <View paddingHorizontal="$4" marginTop="$-8" position="relative" zIndex={10}>
          <View
            backgroundColor="white"
            borderRadius={16}
            padding="$4"
            shadowColor="#000"
            shadowOffset={{ width: 0, height: 2 }}
            shadowOpacity={0.08}
            shadowRadius={10}
            borderWidth={1}
            borderColor="#E5E7EB"
          >
            <XStack justifyContent="space-between" alignItems="flex-start" gap="$3">
              <YStack flex={1} gap="$1">
                <Text
                  fontSize={titleFontSize}
                  fontWeight="800"
                  color="#0F172A"
                  lineHeight={titleLineHeight}
                  style={nativeTitleFontFamily ? { fontFamily: nativeTitleFontFamily } : undefined}
                >
                  {summary.title}
                </Text>
                <Text fontSize={13} color="#64748B" numberOfLines={1}>
                  {summary.subtitle}
                </Text>
              </YStack>
              <YStack gap="$2" alignItems="flex-end">
                {summary.premium && (
                  <View backgroundColor="#0F766E" borderRadius={999} paddingHorizontal="$2.5" paddingVertical="$1" borderWidth={1} borderColor="#134E4A">
                    <Text fontSize={11} fontWeight="700" color="#F0FDFA" letterSpacing={0.4}>PREMIUM</Text>
                  </View>
                )}
                <View backgroundColor={difficultyTone.bg} borderRadius={999} paddingHorizontal="$2.5" paddingVertical="$1" borderWidth={1} borderColor={difficultyTone.border}>
                  <Text fontSize={11} fontWeight="700" color={difficultyTone.text} textTransform="capitalize">{summary.difficulty}</Text>
                </View>
              </YStack>
            </XStack>

            <XStack marginTop="$2.5" alignItems="center" justifyContent="space-between">
              <XStack alignItems="center" gap="$2">
                <ProgressRing
                  percentage={completionPercentage}
                  size={48}
                  strokeWidth={5}
                  color={isComplete ? '#0D9488' : '#0891B2'}
                  trackColor="#E2E8F0"
                />
                <YStack gap="$0.5">
                  <Text fontSize={13} color="#64748B" fontWeight="600">
                    {isComplete ? 'Completed' : hasStarted ? 'In Progress' : 'Not Started'}
                  </Text>
                  <Text fontSize={16} color="#0F172A" fontWeight="700">
                    {completedLessons}/{totalLessonCount} lessons
                  </Text>
                </YStack>
              </XStack>
              {isComplete && (
                <XStack alignItems="center" gap="$1.5" backgroundColor="#ECFDF5" borderRadius={999} paddingHorizontal="$2.5" paddingVertical="$1">
                  <Feather name="award" size={14} color="#059669" />
                  <Text fontSize={12} fontWeight="700" color="#059669">Complete</Text>
                </XStack>
              )}
            </XStack>

            <XStack marginTop="$3" gap="$4">
              <DetailBadge icon="book-open" text={`${summary.lessonCount} Lessons`} />
              <DetailBadge icon="clock" text={`${Math.floor(summary.estimatedDurationMinutes / 60)}h ${summary.estimatedDurationMinutes % 60}m`} />
              <DetailBadge icon="bar-chart-2" text={summary.difficulty} cap />
            </XStack>

            <Separator marginTop="$3" marginBottom="$3" />

            <XStack alignItems="center" gap="$3">
              {summary.author.avatarUrl ? (
                <Image
                  source={
                    typeof summary.author.avatarUrl === 'string'
                      ? { uri: summary.author.avatarUrl }
                      : summary.author.avatarUrl
                  }
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E7EB' }}
                />
              ) : (
                <View width={36} height={36} borderRadius={18} backgroundColor="#E5E7EB" justifyContent="center" alignItems="center">
                  <Feather name="user" size={18} color="#9CA3AF" />
                </View>
              )}
              <YStack flex={1}>
                <Text fontSize={14} fontWeight="600" color="#111827">{summary.author.name}</Text>
                <Text fontSize={12} color="#6B7280">{summary.author.organization}</Text>
              </YStack>
            </XStack>

            {resumeId && resumeLesson && (
              <Button
                marginTop="$3"
                backgroundColor="#0D9488"
                color="white"
                fontWeight="700"
                size="$3"
                borderRadius={10}
                pressStyle={{ opacity: 0.9, scale: 0.98 }}
                icon={<Feather name={hasStarted && !isComplete ? 'play-circle' : 'arrow-right-circle'} size={16} color="#ECFEFF" />}
                onPress={() => navigation.navigate('Lesson' as never, {
                  courseId,
                  lessonId: resumeId,
                  lessonTitle: resumeLesson.title,
                } as never)}
              >
                {hasStarted && !isComplete ? `Continue: ${resumeLesson.title}` : `Start: ${resumeLesson.title}`}
              </Button>
            )}
          </View>
        </View>
      </View>

      {/* Course Info */}
      <YStack
        paddingHorizontal="$4"
        paddingTop="$2"
        paddingBottom="$4"
        backgroundColor="white"
        borderBottomWidth={1}
        borderBottomColor="#F3F4F6"
      >
        <Text fontSize={15} color="#4B5563" lineHeight={24}>
          {summary.description}
        </Text>

        {/* Tags */}
        {summary.tags && summary.tags.length > 0 && (
          <XStack marginTop="$3" gap="$2" flexWrap="wrap">
            {summary.tags.map((tag) => (
              <View
                key={tag}
                backgroundColor="#F1F5F9"
                paddingHorizontal="$2.5"
                paddingVertical="$1"
                borderRadius={20}
              >
                <Text fontSize={12} fontWeight="600" color="#475569">
                  {tag}
                </Text>
              </View>
            ))}
          </XStack>
        )}
      </YStack>

      {/* Lessons List */}
      <YStack padding="$4" gap="$3">
        <Text fontSize={12} color="#6B7280" fontWeight="600" marginBottom="$1" textTransform="uppercase" letterSpacing={1}>
          LESSONS
        </Text>
        {detail.lessons.map((lesson, index) => {
          const state = lessonStates[lesson.lessonId] ?? 'not-started';
          const currentId = progress?.currentLessonId
            ?? detail.lessons.find(l => (lessonStates[l.lessonId] ?? 'not-started') !== 'completed')?.lessonId;
          const isCurrent = lesson.lessonId === currentId;

          return (
            <React.Fragment key={lesson.lessonId}>
              {isCurrent && progress && progress.completedCount > 0 && (
                <XStack alignItems="center" gap="$2" marginBottom="$-1">
                  <View flex={1} height={1} backgroundColor="#0D9488" opacity={0.3} />
                  <Text fontSize={11} fontWeight="600" color="#0D9488" textTransform="uppercase" letterSpacing={0.5}>
                    Continue from here
                  </Text>
                  <View flex={1} height={1} backgroundColor="#0D9488" opacity={0.3} />
                </XStack>
              )}
              <LessonItem 
                lesson={lesson} 
                index={index}
                state={state}
                isCurrent={isCurrent && (progress?.completedCount ?? 0) > 0}
                onPress={() => navigation.navigate('Lesson' as never, { 
                  courseId, 
                  lessonId: lesson.lessonId,
                  lessonTitle: lesson.title
                } as never)}
              />
            </React.Fragment>
          );
        })}
      </YStack>
    </ScrollView>
  );
}

function DetailBadge({ icon, text, cap }: { icon: any, text: string, cap?: boolean }) {
  return (
    <XStack alignItems="center" gap="$1.5">
      <Feather name={icon} size={14} color="#6B7280" />
      <Text fontSize={13} color="#4B5563" fontWeight="500" textTransform={cap ? 'capitalize' : 'none'}>
        {text}
      </Text>
    </XStack>
  )
}

function ProgressRing({ percentage, size, strokeWidth, color, trackColor }: { percentage: number; size: number; strokeWidth: number; color: string; trackColor?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <View width={size} height={size} justifyContent="center" alignItems="center">
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor ?? '#E5E7EB'} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      <View position="absolute">
        <Text fontSize={size * 0.24} fontWeight="800" color={color}>
          {percentage}%
        </Text>
      </View>
    </View>
  );
}

function LessonItem({ 
  lesson, 
  index, 
  state,
  isCurrent,
  onPress 
}: { 
  lesson: Lesson, 
  index: number, 
  state: LessonState,
  isCurrent?: boolean,
  onPress: () => void
}) {
  const isCompleted = state === 'completed';

  // Circle colours based on progress state
  const circleStyle = {
    'not-started': { bg: '#F1F5F9', text: '#475569' },
    'in-progress': { bg: '#38BDF8', text: '#FFFFFF' },
    'completed':   { bg: '#0D9488', text: '#FFFFFF' },
  }[state];
  const cardPadding = Platform.OS === 'web' ? '$4' : '$3';
  const textGap = Platform.OS === 'web' ? '$1' : '$0.5';

  return (
    <Button 
      unstyled 
      onPress={onPress}
      backgroundColor={isCompleted ? '#FAFAFA' : 'white'}
      borderRadius={12} 
      borderWidth={1} 
      borderColor={isCurrent ? '#0D9488' : '#E5E7EB'}
      borderLeftWidth={isCurrent ? 3 : 1}
      borderLeftColor={isCurrent ? '#0D9488' : '#E5E7EB'}
      padding={cardPadding}
      opacity={isCompleted ? 0.7 : 1}
      pressStyle={{ backgroundColor: isCompleted ? '#F5F5F5' : '#F9FAFB' }}
    >
      <XStack gap="$3" alignItems="center">
        <View 
          width={36} 
          height={36} 
          borderRadius={18} 
          backgroundColor={circleStyle.bg} 
          justifyContent="center" 
          alignItems="center"
        >
          {isCompleted ? (
            <Feather name="check" size={18} color={circleStyle.text} />
          ) : (
            <Text fontSize={14} fontWeight="700" color={circleStyle.text}>
              {index + 1}
            </Text>
          )}
        </View>
        <YStack flex={1} gap={textGap}>
          <Text fontSize={15} fontWeight="600" color={isCompleted ? '#6B7280' : '#111827'}>
            {lesson.title}
          </Text>
          <XStack gap="$3" alignItems="center">
            <XStack gap="$1" alignItems="center">
              <Feather name="clock" size={12} color="#9CA3AF" />
              <Text fontSize={12} color="#9CA3AF">
                {lesson.estimatedDurationMinutes} min
              </Text>
            </XStack>
            {lesson.premium && (
              <XStack gap="$1" alignItems="center">
                <Feather name="lock" size={12} color="#D97706" />
                <Text fontSize={12} color="#D97706" fontWeight="500">
                  Premium
                </Text>
              </XStack>
            )}
            {state === 'in-progress' && (
              <XStack gap="$1" alignItems="center" backgroundColor="#F0FDFA" paddingHorizontal="$2" paddingVertical="$1" borderRadius={12}>
                <Feather name="play-circle" size={12} color="#0D9488" />
                <Text fontSize={12} color="#0D9488" fontWeight="600">
                  In Progress
                </Text>
              </XStack>
            )}
            {isCompleted && (
              <XStack gap="$1" alignItems="center" backgroundColor="#F1F5F9" paddingHorizontal="$2" paddingVertical="$1" borderRadius={12}>
                <Feather name="check-circle" size={12} color="#94A3B8" />
                <Text fontSize={12} color="#94A3B8" fontWeight="600">
                  Complete
                </Text>
              </XStack>
            )}
          </XStack>
        </YStack>
        <Feather name="chevron-right" size={20} color={isCompleted ? '#E5E7EB' : '#D1D5DB'} />
      </XStack>
    </Button>
  );
}
