import React, { useState, useCallback, useEffect } from 'react';
import { ScrollView, ActivityIndicator, ImageBackground, StyleSheet, Linking, Platform } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { Feather } from '@expo/vector-icons';
import { useAPI } from '../context/APIContext';
import { HomeConfig } from '../api/home/HomeAPI';
import { CourseDetail, CourseSummary } from '../api/course/CourseAPI';
import { CourseProgress } from '../api/user/UserAPI';
import { useNavigation, useFocusEffect, StackActions } from '@react-navigation/native';
import { buildVersionedImageUri, prefetchImages } from '../utils/imageCache';
import { useRewardCelebrate } from '../context/RewardCelebrateContext';

interface CourseWithProgress {
  summary: CourseSummary;
  progress: CourseProgress;
  detail: CourseDetail | null;
}

const nativeCourseTitleFontFamily = Platform.select({
  ios: 'AvenirNext-Bold',
  android: 'sans-serif-medium',
  default: undefined,
});

const nativeHeroHeadingFontFamily = Platform.select({
  ios: 'AvenirNext-Heavy',
  android: 'sans-serif-black',
  default: undefined,
});

export default function HomeScreen() {
  const { homeAPI, courseAPI, userAPI } = useAPI();
  const { clearAnimationDedupe } = useRewardCelebrate();
  const navigation = useNavigation();
  const [config, setConfig] = useState<HomeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resume state
  const [resumeLessonTitle, setResumeLessonTitle] = useState<string | null>(null);
  const [resumeCourseName, setResumeCourseName] = useState<string | null>(null);
  const [resumeCourseId, setResumeCourseId] = useState<string | null>(null);
  const [resumeLessonId, setResumeLessonId] = useState<string | null>(null);
  const [resumeProgress, setResumeProgress] = useState<CourseProgress | null>(null);

  // Dashboard state
  const [hasProgress, setHasProgress] = useState(false);
  const [coursesStarted, setCoursesStarted] = useState(0);
  const [totalCourses, setTotalCourses] = useState(0);
  const [totalLessonsCompleted, setTotalLessonsCompleted] = useState(0);
  const [totalLessons, setTotalLessons] = useState(0);

  // Recommended next course
  const [recommendedCourse, setRecommendedCourse] = useState<CourseSummary | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [homeConfig, summaries] = await Promise.all([
        homeAPI.getHomeConfig(),
        courseAPI.getCourseSummaries(),
      ]);
      setConfig(homeConfig);
      setTotalCourses(summaries.length);

      // Load course details and progress for all courses so lesson counts match
      // Course Detail screen behavior and resume logic stays consistent.
      const courseProgress: CourseWithProgress[] = await Promise.all(
        summaries.map(async (s) => {
          const detail = await courseAPI.getCourseDetail(s.courseId).catch(() => null);
          const lessonCount = detail?.lessons.length ?? s.lessonCount;
          const p = await userAPI.getCourseProgress(s.courseId, lessonCount);
          return { summary: s, progress: p, detail };
        }),
      );

      let completedTotal = 0;
      let lessonsTotal = 0;
      for (const entry of courseProgress) {
        completedTotal += entry.progress.completedCount;
        lessonsTotal += entry.progress.totalLessons;
      }

      setTotalLessonsCompleted(completedTotal);
      setTotalLessons(lessonsTotal);

      const started = courseProgress.filter(c => c.progress.completedCount > 0 || c.progress.inProgressCount > 0).length;
      setCoursesStarted(started);
      setHasProgress(completedTotal > 0 || started > 0);

      // Find resume target — most recently accessed incomplete course
      const allProgress = courseProgress.map(c => c.progress);
      const withActivity = allProgress
        .filter((p: CourseProgress) => p.lastAccessedAt && (p.completedCount > 0 || p.inProgressCount > 0))
        .filter((p: CourseProgress) => p.completedCount < p.totalLessons) // not fully done
        .sort((a: CourseProgress, b: CourseProgress) => (b.lastAccessedAt ?? '').localeCompare(a.lastAccessedAt ?? ''));

      let foundResume = false;
      for (const best of withActivity) {
        const courseEntry = courseProgress.find(c => c.summary.courseId === best.courseId);
        const courseSummary = courseEntry?.summary;
        const courseDetail = courseEntry?.detail;

        if (best.currentLessonId) {
          // Has an in-progress lesson — use it directly
          setResumeCourseId(best.courseId);
          setResumeLessonId(best.currentLessonId);
          setResumeProgress(best);
          setResumeCourseName(courseSummary?.title ?? null);
          const detail = courseDetail ?? await courseAPI.getCourseDetail(best.courseId).catch(() => null);
          const lesson = detail?.lessons.find(l => l.lessonId === best.currentLessonId);
          setResumeLessonTitle(lesson?.title ?? null);
          foundResume = true;
          break;
        }

        // No in-progress lesson — find the first unstarted lesson from course detail
        const detail = courseDetail ?? await courseAPI.getCourseDetail(best.courseId).catch(() => null);
        if (!detail) {
          continue;
        }
        const completedSet = new Set(best.completedLessonIds);
        const nextLesson = detail.lessons.find(l => !completedSet.has(l.lessonId));
        if (nextLesson) {
          setResumeCourseId(best.courseId);
          setResumeLessonId(nextLesson.lessonId);
          setResumeLessonTitle(nextLesson.title);
          setResumeProgress(best);
          setResumeCourseName(courseSummary?.title ?? null);
          foundResume = true;
          break;
        }
      }

      if (!foundResume) {
        setResumeCourseId(null);
        setResumeLessonId(null);
        setResumeLessonTitle(null);
        setResumeCourseName(null);
        setResumeProgress(null);
      }

      // Find recommended next course: first unfinished in order
      // Summaries already sorted by order from the API
      const resumeCourse = foundResume ? withActivity[0]?.courseId : undefined;
      const sorted = [...courseProgress].sort((a, b) => (a.summary.order || 999) - (b.summary.order || 999));
      const rec = sorted.find(c => c.progress.completedCount < c.progress.totalLessons);
      // Don't recommend the same course we're resuming
      if (rec && rec.summary.courseId !== resumeCourse) {
        setRecommendedCourse(rec.summary);
      } else {
        // If resume course IS the recommended, pick the next one
        const alt = sorted.find(c => c.progress.completedCount < c.progress.totalLessons && c.summary.courseId !== resumeCourse);
        setRecommendedCourse(alt?.summary ?? null);
      }

    } catch (err) {
      setError(`Failed to load: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [homeAPI, courseAPI, userAPI]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    const imageUris: string[] = [];
    if (config && typeof config.backgroundImage === 'string') {
      imageUris.push(
        buildVersionedImageUri(
          config.backgroundImage,
          config.backgroundImageVersion,
          config.backgroundImageHash,
        ),
      );
    }
    if (recommendedCourse && typeof recommendedCourse.thumbnailUrl === 'string') {
      imageUris.push(
        buildVersionedImageUri(
          recommendedCourse.thumbnailUrl,
          recommendedCourse.thumbnailVersion,
          recommendedCourse.thumbnailHash,
        ),
      );
    }
    prefetchImages(imageUris);
  }, [config, recommendedCourse]);

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" backgroundColor="#F9FAFB">
        <ActivityIndicator size="large" color="#0D9488" />
      </YStack>
    );
  }

  if (error || !config) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center" padding="$4" backgroundColor="#F9FAFB">
        <Text color="#EF4444">{error || 'Configuration not available'}</Text>
      </YStack>
    );
  }

  const difficultyLabel = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);
  const overallCompletionPct = totalLessons > 0
    ? Math.round((totalLessonsCompleted / totalLessons) * 100)
    : 0;
  const heroTitleFontSize = Platform.OS === 'web' ? 38 : 34;
  const heroTitleLineHeight = Platform.OS === 'web' ? 44 : 40;
  const clearProgressForPreview = async () => {
    await userAPI.clearAllProgress();
    clearAnimationDedupe();
    await loadData();
  };
  const openCoursesList = () => {
    const navState = navigation.getState() as any;
    const coursesRoute = navState?.routes?.find((r: any) => r.name === 'Courses');
    const coursesStackKey = coursesRoute?.state?.key;

    navigation.navigate('Courses' as never, { screen: 'CoursesList' } as never);
    if (coursesStackKey) {
      navigation.dispatch({ ...StackActions.popToTop(), target: coursesStackKey } as any);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Hero Section */}
      <View height={320} width="100%" position="relative">
        <ImageBackground
          source={typeof config.backgroundImage === 'string' 
            ? {
                uri: buildVersionedImageUri(
                  config.backgroundImage,
                  config.backgroundImageVersion,
                  config.backgroundImageHash,
                ),
              }
            : config.backgroundImage}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        >
          <View 
            position="absolute" 
            top={0} left={0} right={0} bottom={0} 
            backgroundColor="rgba(15, 23, 42, 0.36)"
            paddingHorizontal="$4"
            paddingTop="$5"
            paddingBottom="$5"
            justifyContent="flex-start"
          >
            <YStack maxWidth={600} gap="$1.5" marginTop="$6">
              {hasProgress && (
                <Text color="rgba(255,255,255,0.7)" fontSize={13} fontWeight="600" letterSpacing={0.5}>
                  WELCOME BACK
                </Text>
              )}
              <Text 
                color="white" 
                fontSize={heroTitleFontSize} 
                lineHeight={heroTitleLineHeight}
                fontWeight="800"
                letterSpacing={-0.5}
                style={nativeHeroHeadingFontFamily ? { fontFamily: nativeHeroHeadingFontFamily } : undefined}
              >
                {config.title}
              </Text>
              
              <Text 
                color="#D1D5DB" 
                fontSize={14} 
                lineHeight={20}
                numberOfLines={5}
              >
                {config.text}
              </Text>
            </YStack>

            {/* Courses button — top right */}
            <XStack
              position="absolute"
              top={12}
              right={16}
              backgroundColor="#0D9488"
              borderRadius={20}
              paddingHorizontal="$3"
              paddingVertical="$2"
              alignItems="center"
              gap="$1.5"
              pressStyle={{ backgroundColor: '#0F766E', scale: 0.97 }}
              hoverStyle={{ backgroundColor: '#0F766E' }}
              cursor="pointer"
              onPress={openCoursesList}
            >
              <Feather name="book-open" size={14} color="white" />
              <Text color="white" fontSize={13} fontWeight="600">Courses</Text>
            </XStack>

            {/* Hero stats overlay */}
            <View
              position="absolute"
              left={16}
              right={16}
              bottom={20}
              backgroundColor="rgba(15, 23, 42, 0.38)"
              borderWidth={1}
              borderColor="rgba(255,255,255,0.20)"
              borderRadius={14}
              paddingHorizontal="$3"
              paddingVertical="$2.5"
            >
              <XStack justifyContent="space-between" alignItems="center">
                <YStack flex={1} alignItems="center" gap="$0.5">
                  <Text color="white" fontSize={17} fontWeight="800">
                    {totalLessonsCompleted}
                  </Text>
                  <Text color="rgba(255,255,255,0.75)" fontSize={11} fontWeight="600">
                    lessons done
                  </Text>
                </YStack>
                <View width={1} height={26} backgroundColor="rgba(255,255,255,0.22)" />
                <YStack flex={1} alignItems="center" gap="$0.5">
                  <Text color="white" fontSize={17} fontWeight="800">
                    {coursesStarted}/{totalCourses}
                  </Text>
                  <Text color="rgba(255,255,255,0.75)" fontSize={11} fontWeight="600">
                    courses started
                  </Text>
                </YStack>
                <View width={1} height={26} backgroundColor="rgba(255,255,255,0.22)" />
                <YStack flex={1} alignItems="center" gap="$0.5">
                  <Text color="white" fontSize={17} fontWeight="800">
                    {overallCompletionPct}%
                  </Text>
                  <Text color="rgba(255,255,255,0.75)" fontSize={11} fontWeight="600">
                    overall progress
                  </Text>
                </YStack>
              </XStack>
            </View>
          </View>
        </ImageBackground>
      </View>

      <YStack paddingHorizontal="$4" marginTop="$4" gap="$3">
        {__DEV__ && (
          <YStack alignSelf="flex-end" alignItems="flex-end">
            <XStack
              backgroundColor="#F1F5F9"
              borderWidth={1}
              borderColor="#E2E8F0"
              borderRadius={999}
              paddingHorizontal="$2.5"
              paddingVertical="$1"
              alignItems="center"
              gap="$1.5"
              pressStyle={{ opacity: 0.75, scale: 0.98 }}
              onPress={clearProgressForPreview}
            >
              <Feather name="rotate-ccw" size={13} color="#0F766E" />
              <Text fontSize={12} fontWeight="700" color="#0F766E">Reset progress</Text>
            </XStack>
          </YStack>
        )}

        {/* Continue Card — only if resuming */}
        {resumeCourseId && resumeLessonId && (
          <View
            backgroundColor="#0D9488"
            borderRadius={16}
            padding="$4"
            pressStyle={{ scale: 0.98, opacity: 0.9 }}
            cursor="pointer"
            onPress={() => navigation.navigate('Courses' as never, {
              screen: 'Lesson',
              params: {
                courseId: resumeCourseId,
                lessonId: resumeLessonId,
                lessonTitle: resumeLessonTitle ?? 'Lesson',
              },
            } as never)}
          >
            <XStack alignItems="center" gap="$3">
              <View
                width={44} height={44} borderRadius={22}
                backgroundColor="rgba(255,255,255,0.2)"
                justifyContent="center" alignItems="center"
              >
                <Feather name="play" size={20} color="white" />
              </View>
              <YStack flex={1} gap="$0.5">
                <Text color="rgba(255,255,255,0.8)" fontSize={12} fontWeight="600">CONTINUE LESSON</Text>
                <Text color="white" fontSize={16} fontWeight="700" numberOfLines={1}>
                  {resumeLessonTitle ?? 'Resume lesson'}
                </Text>
                <XStack alignItems="center" gap="$1.5">
                  <Text
                    color="rgba(255,255,255,0.7)"
                    fontSize={13}
                    style={nativeCourseTitleFontFamily ? { fontFamily: nativeCourseTitleFontFamily } : undefined}
                  >
                    {resumeCourseName}
                  </Text>
                  {resumeProgress && (
                    <Text color="rgba(255,255,255,0.5)" fontSize={13}>
                      · {resumeProgress.completedCount}/{resumeProgress.totalLessons}
                    </Text>
                  )}
                </XStack>
              </YStack>
              <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.6)" />
            </XStack>
          </View>
        )}

        {/* Up Next / Recommended Course Card */}
        {recommendedCourse && (
          <View
            backgroundColor="white"
            borderRadius={16}
            borderLeftWidth={4}
            borderLeftColor="#0D9488"
            padding="$4"
            shadowColor="#000"
            shadowOffset={{ width: 0, height: 2 }}
            shadowOpacity={0.04}
            shadowRadius={8}
            elevation={2}
            pressStyle={{ scale: 0.98, backgroundColor: '#FAFAFA' }}
            cursor="pointer"
            onPress={() => navigation.navigate('Courses' as never, {
              screen: 'CourseDetail',
              params: { courseId: recommendedCourse.courseId },
            } as never)}
          >
            <XStack alignItems="center" gap="$1.5" marginBottom="$2.5">
              <Feather name="compass" size={14} color="#0D9488" />
              <Text fontSize={12} fontWeight="700" color="#0D9488" letterSpacing={0.5}>
                {hasProgress ? 'NEXT COURSE' : 'START HERE'}
              </Text>
            </XStack>
            <XStack gap="$3" alignItems="flex-start">
              {/* Course Thumbnail */}
              {recommendedCourse.thumbnailUrl ? (
                <View
                  width={64}
                  height={64}
                  borderRadius={10}
                  backgroundColor="#F1F5F9"
                  overflow="hidden"
                >
                  <ImageBackground
                    source={typeof recommendedCourse.thumbnailUrl === 'string'
                      ? {
                          uri: buildVersionedImageUri(
                            recommendedCourse.thumbnailUrl,
                            recommendedCourse.thumbnailVersion,
                            recommendedCourse.thumbnailHash,
                          ),
                        }
                      : recommendedCourse.thumbnailUrl}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </View>
              ) : (
                <View
                  width={64}
                  height={64}
                  borderRadius={10}
                  backgroundColor="#F0FDFA"
                  justifyContent="center"
                  alignItems="center"
                >
                  <Feather name="book-open" size={24} color="#0D9488" />
                </View>
              )}
              <YStack flex={1} gap="$1">
                <Text
                  fontSize={17}
                  fontWeight="700"
                  color="#111827"
                  numberOfLines={2}
                  style={nativeCourseTitleFontFamily ? { fontFamily: nativeCourseTitleFontFamily } : undefined}
                >
                  {recommendedCourse.title}
                </Text>
                <Text fontSize={13} color="#6B7280" lineHeight={19} numberOfLines={2}>
                  {recommendedCourse.subtitle}
                </Text>
              </YStack>
            </XStack>
            <XStack alignItems="center" gap="$3" marginTop="$3">
              <XStack alignItems="center" gap="$1">
                <Feather name="layers" size={13} color="#94A3B8" />
                <Text fontSize={13} color="#94A3B8">{recommendedCourse.lessonCount} lessons</Text>
              </XStack>
              <XStack alignItems="center" gap="$1">
                <Feather name="clock" size={13} color="#94A3B8" />
                <Text fontSize={13} color="#94A3B8">{Math.floor(recommendedCourse.estimatedDurationMinutes / 60)}h {recommendedCourse.estimatedDurationMinutes % 60}m</Text>
              </XStack>
              <View backgroundColor="#F1F5F9" paddingHorizontal="$2" paddingVertical="$0.5" borderRadius={8}>
                <Text fontSize={12} fontWeight="600" color="#475569">{difficultyLabel(recommendedCourse.difficulty)}</Text>
              </View>
            </XStack>
          </View>
        )}

        {/* No progress empty state — welcoming */}
        {!hasProgress && !recommendedCourse && (
          <View
            backgroundColor="white"
            borderRadius={16}
            padding="$5"
            alignItems="center"
            shadowColor="#000"
            shadowOffset={{ width: 0, height: 2 }}
            shadowOpacity={0.04}
            shadowRadius={8}
            elevation={2}
          >
            <View 
              width={56} height={56} borderRadius={28} 
              backgroundColor="#F0FDFA" 
              justifyContent="center" alignItems="center"
              marginBottom="$3"
            >
              <Feather name="book-open" size={24} color="#0D9488" />
            </View>
            <Text fontSize={16} fontWeight="700" color="#111827" marginBottom="$1">
              Ready to start?
            </Text>
            <Text fontSize={14} color="#6B7280" textAlign="center" lineHeight={22}>
              Head to the Courses tab to browse and begin learning.
            </Text>
          </View>
        )}

        {/* Institutions banner — only if configured */}
        {config.bulkPricingUrl && (
        <XStack
          marginTop="$2"
          paddingVertical="$3"
          paddingHorizontal="$4"
          backgroundColor="#F0FDFA"
          borderRadius={12}
          alignItems="center"
          gap="$2.5"
          pressStyle={{ opacity: 0.7 }}
          cursor="pointer"
          onPress={() => Linking.openURL(config.bulkPricingUrl!.startsWith('http') ? config.bulkPricingUrl! : `https://${config.bulkPricingUrl}`)}
        >
          <View
            width={32} height={32} borderRadius={16}
            backgroundColor="white"
            justifyContent="center" alignItems="center"
          >
            <Feather name="users" size={15} color="#0D9488" />
          </View>
          <YStack flex={1}>
            <Text fontSize={13} fontWeight="700" color="#0F766E">{config.title} for Institutions</Text>
            <Text fontSize={12} color="#6B7280">{config.bulkPricingMessage || 'Bulk pricing for studios & institutions'}</Text>
          </YStack>
          <Feather name="external-link" size={14} color="#94A3B8" />
        </XStack>
        )}

      </YStack>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
});
