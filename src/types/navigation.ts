import type { NavigatorScreenParams } from '@react-navigation/native';

// Auth stack
export type AuthStackParamList = {
  Login: undefined;
};

// Home stack (Home → Plan History → Plan Detail)

export type HomeStackParamList = {
  HomeScreen: undefined;
  PlanHistory: undefined;
  PlanDetail: { checklistId: string };
  GeneratePlan: undefined;
  FillActuals: undefined;
};

// Piles stack
export type PilesStackParamList = {
  PilesScreen: { initialView?: 'today' | 'all'; initialFilter?: string } | undefined;
};

// Profile stack (Profile → Site Settings)
export type ProfileStackParamList = {
  ProfileScreen: undefined;
  SiteSettings: undefined;
  Shifts: undefined;
  ShiftWindows: undefined;
  Templates: undefined;
  Machines: undefined;
  Personnel: undefined;
  Steps: undefined;
  StepDetail: { stepId: string; stepName: string };
};

// Bottom tabs
export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  PilesTab: NavigatorScreenParams<PilesStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};

// Root (Auth vs Main)
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};