import React, { useCallback, useRef } from 'react';
import {
  createNavigationContainerRef,
  NavigationContainer,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TamaguiProvider } from 'tamagui';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import config from './tamagui.config';
import HomeScreen from './screens/HomeScreen';
import CoursesScreen from './screens/CoursesScreen';
import CourseDetailScreen from './screens/CourseDetailScreen';
import LessonScreen from './screens/LessonScreen';
import ProgressScreen from './screens/ProgressScreen';
import { APIProvider } from './context/APIContext';
import {
  RewardAnimationProvider,
  useRewardAnimation,
} from './context/RewardAnimationContext';
import { RewardToastProvider } from './context/RewardToastContext';
import { ProgressTabAnchor } from './components/animations/ProgressTabAnchor';

const Tab = createBottomTabNavigator();
const CourseStack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

function CourseStackNavigator() {
  return (
    <CourseStack.Navigator>
      <CourseStack.Screen 
        name="CoursesList" 
        component={CoursesScreen} 
        options={{ 
          title: 'Courses',
          headerStyle: { backgroundColor: 'white' },
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 20,
            color: '#111827',
          },
          headerShadowVisible: false,
        }} 
      />
      <CourseStack.Screen 
        name="CourseDetail" 
        component={CourseDetailScreen} 
        options={({ route }) => ({
          headerBackTitleVisible: false, 
          title: route.params?.courseTitle || 'Course',
          headerTintColor: '#111827',
          headerStyle: { backgroundColor: 'white' },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 18,
            color: '#111827',
          },
        })} 
      />
      <CourseStack.Screen 
        name="Lesson" 
        component={LessonScreen} 
        options={({ route }) => ({
          headerBackTitleVisible: false, 
          title: route.params?.lessonTitle || 'Lesson',
          headerTintColor: '#111827',
          headerStyle: { backgroundColor: 'white' },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 18,
            color: '#111827',
          },
        })} 
      />
    </CourseStack.Navigator>
  );
}

function ProgressTabIcon({ color, size }: { color: string; size: number }) {
  return (
    <ProgressTabAnchor target="progressTab">
      <Feather name="award" size={size} color={color} />
    </ProgressTabAnchor>
  );
}

function AppNavigation() {
  const { setProgressTabActive } = useRewardAnimation();
  const lastRouteNameRef = useRef<string | null>(null);

  const syncActiveTab = useCallback(() => {
    if (!navigationRef.isReady()) return;
    const route = navigationRef.getCurrentRoute();
    const routeName = route?.name ?? null;
    if (routeName === lastRouteNameRef.current) return;
    lastRouteNameRef.current = routeName;
    setProgressTabActive(routeName === 'Progress');
  }, [setProgressTabActive]);

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={syncActiveTab}
      onStateChange={syncActiveTab}
    >
      <StatusBar style="dark" />
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#111827',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarStyle: {
            borderTopColor: '#E5E7EB',
            backgroundColor: '#ffffff',
            height: 60,
            paddingBottom: 8,
            paddingTop: 8,
          },
          headerStyle: {
            backgroundColor: '#ffffff',
            shadowColor: 'transparent',
            elevation: 0,
            borderBottomWidth: 1,
            borderBottomColor: '#F3F4F6',
          },
          headerTintColor: '#111827',
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 18,
          },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
            tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
          }}
        />
        <Tab.Screen
          name="Courses"
          component={CourseStackNavigator}
          options={{
            headerShown: false,
            popToTopOnBlur: true,
            tabBarIcon: ({ color, size }) => <Feather name="book-open" size={size} color={color} />,
            tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
          }}
          listeners={({ navigation }) => ({
            tabPress: () => {
              // Reset the Courses stack to the root when tab is tapped.
              navigation.navigate('Courses', { screen: 'CoursesList' });
            },
          })}
        />
        <Tab.Screen
          name="Progress"
          component={ProgressScreen}
          options={{
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <ProgressTabIcon color={color} size={size} />
            ),
            tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <TamaguiProvider config={config}>
      <APIProvider>
        <RewardToastProvider>
          <RewardAnimationProvider>
            <AppNavigation />
          </RewardAnimationProvider>
        </RewardToastProvider>
      </APIProvider>
    </TamaguiProvider>
  );
}
