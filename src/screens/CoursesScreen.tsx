import React, { useState, useCallback, useEffect } from 'react';
import { ScrollView, ActivityIndicator, Image, Pressable, Platform } from 'react-native';
import { YStack, XStack, Text, View } from 'tamagui';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAPI } from '../context/APIContext';
import { CourseSummary } from '../api/course/CourseAPI';
import { CourseProgress } from '../api/user/UserAPI';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { buildVersionedImageUri, prefetchImages } from '../utils/imageCache';

const getDifficultyTone = (difficulty?: string) => {
  const value = (difficulty ?? '').toLowerCase();
  if (value.includes('advanced')) {
    return { bg: '#115E59', border: 'rgba(204, 251, 241, 0.8)', text: '#ECFEFF' };
  }
  if (value.includes('intermediate')) {
    return { bg: '#0D9488', border: 'rgba(204, 251, 241, 0.85)', text: '#ECFEFF' };
  }
  if (value.includes('beginner')) {
    return { bg: '#0F766E', border: 'rgba(204, 251, 241, 0.78)', text: '#ECFEFF' };
  }
  return { bg: '#0F766E', border: 'rgba(204, 251, 241, 0.8)', text: '#ECFEFF' };
};

const nativeCourseTitleFontFamily = Platform.select({
  ios: 'AvenirNext-Bold',
  android: 'sans-serif-medium',
  web: 'Avenir Next, Avenir, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
  default: 'Avenir Next, Avenir, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
});

export default function CoursesScreen() {
  const { courseAPI, userAPI } = useAPI();
  const navigation = useNavigation();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, CourseProgress>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = useCallback(async () => {
    try {
      setLoading(true);
      const data = await courseAPI.getCourseSummaries();
      setCourses(data.sort((a, b) => (a.order || 999) - (b.order || 999)));

      // Load progress for each course
      const map: Record<string, CourseProgress> = {};
      for (const c of data) {
        const p = await userAPI.getCourseProgress(c.courseId, c.lessonCount);
        if (p.completedCount > 0 || p.inProgressCount > 0) {
          map[c.courseId] = p;
        }
      }
      setProgressMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }, [courseAPI, userAPI]);

  // Refresh on every focus so progress updates are visible
  useFocusEffect(
    useCallback(() => {
      loadCourses();
    }, [loadCourses])
  );

  useEffect(() => {
    const imageUris = courses
      .filter((course) => typeof course.thumbnailUrl === 'string')
      .map((course) =>
        buildVersionedImageUri(
          course.thumbnailUrl as string,
          course.thumbnailVersion,
          course.thumbnailHash,
        ),
      );
    prefetchImages(imageUris);
  }, [courses]);

  if (loading) {
    return (
      <View flex={1} justifyContent="center" alignItems="center" backgroundColor="#F9FAFB">
        <ActivityIndicator size="large" color="#111827" />
        <Text marginTop="$4" color="#6B7280" fontSize="$3">Loading courses...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View flex={1} justifyContent="center" alignItems="center" backgroundColor="#F9FAFB" padding="$4">
        <Text color="#EF4444" fontSize="$6" textAlign="center">{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F9FAFB' }} contentContainerStyle={{ paddingBottom: 20 }}>
      <YStack padding="$4" gap="$4">
        {courses.map((course) => (
          <CourseCard 
            key={course.courseId} 
            course={course}
            progress={progressMap[course.courseId]}
            onPress={() => navigation.navigate('CourseDetail' as never, { 
              courseId: course.courseId,
              courseTitle: course.title 
            } as never)}
          />
        ))}
      </YStack>
    </ScrollView>
  );
}

interface CourseCardProps {
  course: CourseSummary;
  progress?: CourseProgress;
  onPress: () => void;
}

const CourseCard: React.FC<CourseCardProps> = ({ course, progress, onPress }) => {
  const difficultyTone = getDifficultyTone(course.difficulty);

  // Get the actual image source based on thumbnailUrl
  const imageSource = typeof course.thumbnailUrl === 'string'
    ? {
        uri: buildVersionedImageUri(
          course.thumbnailUrl,
          course.thumbnailVersion,
          course.thumbnailHash,
        ),
      }
    : course.thumbnailUrl;

  // Format duration for display
  const hours = Math.floor(course.estimatedDurationMinutes / 60);
  const minutes = course.estimatedDurationMinutes % 60;
  const durationText = hours > 0 
    ? `${hours}h ${minutes}m` 
    : `${minutes}m`;

  return (
    <Pressable onPress={onPress}>
      <View
        width="100%"
        backgroundColor="white"
        borderRadius={16}
        shadowColor="#000"
        shadowOffset={{ width: 0, height: 2 }}
        shadowOpacity={0.05}
        shadowRadius={8}
        elevation={2}
        overflow="hidden"
        borderWidth={1}
        borderColor="rgba(0,0,0,0.05)"
      >
        {/* Image Section */}
        <View height={160} width="100%" position="relative" backgroundColor="#E5E7EB">
          <Image
            source={imageSource}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
          {/* Top scrim improves badge readability across light and dark thumbnails */}
          <LinearGradient
            colors={['rgba(2, 6, 23, 0.46)', 'rgba(2, 6, 23, 0.14)', 'rgba(2, 6, 23, 0.00)']}
            locations={[0, 0.45, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 80,
            }}
            pointerEvents="none"
          />
          
          {/* Floating Badges */}
          <XStack position="absolute" top="$3" left="$3" gap="$2">
            {course.premium && (
              <View
                backgroundColor="#0F766E"
                paddingHorizontal="$2.5"
                paddingVertical="$1.5"
                borderRadius={999}
                borderWidth={1}
                borderColor="rgba(204, 251, 241, 0.8)"
                shadowColor="#000"
                shadowOpacity={0.22}
                shadowRadius={6}
                shadowOffset={{ width: 0, height: 2 }}
              >
                <XStack alignItems="center" gap="$1.5">
                  <Feather name="star" size={11} color="#CCFBF1" />
                  <Text fontSize={11} fontWeight="700" color="#ECFEFF" letterSpacing={0.5}>
                    PREMIUM
                  </Text>
                </XStack>
              </View>
            )}
          </XStack>

          <View 
            position="absolute" 
            top="$3" 
            right="$3"
            backgroundColor={difficultyTone.bg}
            paddingHorizontal="$2.5"
            paddingVertical="$1.5"
            borderRadius={8}
            borderWidth={1}
            borderColor={difficultyTone.border}
            shadowColor="#000"
            shadowOpacity={0.26}
            shadowRadius={6}
            shadowOffset={{ width: 0, height: 2 }}
          >
             <Text fontSize={11} fontWeight="700" color={difficultyTone.text} textTransform="capitalize">
              {course.difficulty}
            </Text>
          </View>

          {/* Progress badge — bottom right of image */}
          {progress && progress.completionPercentage === 100 ? (
            <View position="absolute" bottom={8} right={8} backgroundColor="rgba(13,148,136,0.9)" paddingHorizontal="$2.5" paddingVertical="$1.5" borderRadius={12}>
              <XStack alignItems="center" gap="$1.5">
                <Feather name="check-circle" size={12} color="white" />
                <Text fontSize={12} fontWeight="700" color="white">Complete</Text>
              </XStack>
            </View>
          ) : progress && progress.completedCount > 0 ? (
            <View position="absolute" bottom={8} right={8} backgroundColor="rgba(15,23,42,0.75)" paddingHorizontal="$2.5" paddingVertical="$1.5" borderRadius={12}>
              <XStack alignItems="center" gap="$1.5">
                <Feather name="play-circle" size={12} color="#38BDF8" />
                <Text fontSize={12} fontWeight="700" color="white">
                  {progress.completedCount}/{progress.totalLessons} done
                </Text>
              </XStack>
            </View>
          ) : null}
        </View>

        {/* Content Section */}
        <YStack padding="$4" gap="$3">
          <YStack gap="$1">
            <Text
              fontSize={20}
              fontWeight="700"
              color="#111827"
              lineHeight={28}
              style={nativeCourseTitleFontFamily ? { fontFamily: nativeCourseTitleFontFamily } : undefined}
            >
              {course.title}
            </Text>
            <Text fontSize={14} color="#6B7280" numberOfLines={2} lineHeight={20}>
              {course.subtitle}
            </Text>
          </YStack>

          {/* Separator */}
          <View height={1} backgroundColor="#F3F4F6" />

          {/* Footer Info */}
          <XStack justifyContent="space-between" alignItems="center">
            <XStack gap="$3">
              <XStack alignItems="center" gap="$1.5">
                <Feather name="book-open" size={14} color="#6B7280" />
                <Text fontSize={13} fontWeight="500" color="#4B5563">
                  {course.lessonCount} {course.lessonCount === 1 ? 'Lesson' : 'Lessons'}
                </Text>
              </XStack> 
              <XStack alignItems="center" gap="$1.5">
                <Feather name="clock" size={14} color="#6B7280" />
                <Text fontSize={13} fontWeight="500" color="#4B5563">
                  {durationText}
                </Text>
              </XStack>

            </XStack>

            <Text fontSize={12} color="#9CA3AF" fontStyle="italic">
              By {course.author.name.split(' ')[1]}
            </Text>
          </XStack>
        </YStack>
      </View>
    </Pressable>
  );
};
