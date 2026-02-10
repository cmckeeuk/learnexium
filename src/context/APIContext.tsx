import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { HomeAPI } from '../api/home/HomeAPI';
import { FirebaseHomeAPI } from '../api/home/FirebaseHomeAPI';
import { CourseAPI } from '../api/course/CourseAPI';
import { FirebaseCourseAPI } from '../api/course/FirebaseCourseAPI';
import { UserAPI } from '../api/user/UserAPI';
import { FirebaseUserAPI } from '../api/user/FirebaseUserAPI';

interface APIContextValue {
  homeAPI: HomeAPI;
  courseAPI: CourseAPI;
  userAPI: UserAPI;
}

const APIContext = createContext<APIContextValue | undefined>(undefined);

interface APIProviderProps {
  children: ReactNode;
}

export const APIProvider: React.FC<APIProviderProps> = ({ children }) => {
  // Use stable instances to avoid recreating API clients on every render.
  const homeAPI = useMemo<HomeAPI>(() => new FirebaseHomeAPI(), []);
  const courseAPI = useMemo<CourseAPI>(() => new FirebaseCourseAPI(), []);
  const userAPI = useMemo<UserAPI>(() => new FirebaseUserAPI(), []);

  return (
    <APIContext.Provider value={{ homeAPI, courseAPI, userAPI }}>
      {children}
    </APIContext.Provider>
  );
};

export const useAPI = () => {
  const context = useContext(APIContext);
  if (!context) {
    throw new Error('useAPI must be used within APIProvider');
  }
  return context;
};
