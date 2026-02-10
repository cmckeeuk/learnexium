import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { YStack, Text, Button, View } from 'tamagui';
import { Feather } from '@expo/vector-icons';

interface LockedLessonScreenProps {
  lessonTitle: string;
  courseTitle: string;
  onUpgrade: () => void;
}

export default function LockedLessonScreen({ 
  lessonTitle, 
  courseTitle,
  onUpgrade 
}: LockedLessonScreenProps) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <YStack gap="$6" alignItems="center" paddingHorizontal="$4" paddingVertical="$8">
        {/* Lock Icon */}
        <View
          width={100}
          height={100}
          borderRadius={50}
          backgroundColor="#FFFBEB"
          alignItems="center"
          justifyContent="center"
        >
          <Feather name="lock" size={50} color="#D97706" />
        </View>

        {/* Premium Content Badge */}
        <View
          backgroundColor="#FFD700"
          paddingHorizontal="$4"
          paddingVertical="$2"
          borderRadius="$3"
        >
          <Text color="#000" fontWeight="700" fontSize={14} letterSpacing={1}>
            PREMIUM CONTENT
          </Text>
        </View>

        {/* Lesson Info */}
        <YStack gap="$2" alignItems="center" maxWidth={500}>
          <Text 
            fontSize={28} 
            fontWeight="800" 
            textAlign="center"
            color="#111827"
          >
            {lessonTitle}
          </Text>
          <Text fontSize={16} color="#6B7280" textAlign="center">
            From {courseTitle}
          </Text>
        </YStack>

        {/* Unlock Message */}
        <YStack 
          gap="$3" 
          padding="$5" 
          backgroundColor="white" 
          borderRadius="$4"
          borderWidth={1}
          borderColor="#E5E7EB"
          width="100%"
          maxWidth={500}
        >
          <Text fontSize={18} fontWeight="700" color="#111827">
            Unlock this lesson with Premium
          </Text>
          
          <YStack gap="$2">
            <View flexDirection="row" alignItems="center" gap="$2">
              <Feather name="check-circle" size={20} color="#0D9488" />
              <Text fontSize={16} color="#374151">
                Access all lessons and quizzes
              </Text>
            </View>
            <View flexDirection="row" alignItems="center" gap="$2">
              <Feather name="check-circle" size={20} color="#0D9488" />
              <Text fontSize={16} color="#374151">
                Earn completion certificates
              </Text>
            </View>
            <View flexDirection="row" alignItems="center" gap="$2">
              <Feather name="check-circle" size={20} color="#0D9488" />
              <Text fontSize={16} color="#374151">
                Download lessons for offline study
              </Text>
            </View>
            <View flexDirection="row" alignItems="center" gap="$2">
              <Feather name="check-circle" size={20} color="#0D9488" />
              <Text fontSize={16} color="#374151">
                Support course creators
              </Text>
            </View>
          </YStack>
        </YStack>

        {/* CTA Button */}
        <YStack gap="$3" width="100%" maxWidth={500} alignItems="center">
          <Button
            onPress={onUpgrade}
            size="$5"
            backgroundColor="#0D9488"
            color="white"
            fontWeight="700"
            fontSize={18}
            width="100%"
            pressStyle={{ opacity: 0.8 }}
          >
            Upgrade to Premium - $9.99/month
          </Button>
          
          <Text fontSize={14} color="#9CA3AF">
            Cancel anytime • No commitments
          </Text>
        </YStack>

        {/* Social Proof */}
        <View
          padding="$4"
          backgroundColor="#F9FAFB"
          borderRadius="$3"
          width="100%"
          maxWidth={500}
        >
          <Text fontSize={14} color="#6B7280" textAlign="center">
            ⭐️ Join 10,000+ learners mastering new skills with Premium
          </Text>
        </View>
      </YStack>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    paddingBottom: 40,
  },
});
