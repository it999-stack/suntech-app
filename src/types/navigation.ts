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
  GeneratePlan: { date?: string; edit?: boolean } | undefined;
  FillActuals: { date?: string } | undefined;
};

// Piles stack
export type PilesStackParamList = {
  PilesScreen: undefined;
};

// Site top tabs — the swipeable tab strip rendered inside SiteScreen.
// These are the ONLY routes inside the TopTab.Navigator.
export type SiteTopTabParamList = {
  Machines: undefined;
  Personnel: undefined;
  Shifts: undefined;
  Steps: undefined;
};

// Profile stack — site settings moved to the Site tab, nothing left here
// beyond the profile screen itself.
export type ProfileStackParamList = {
  ProfileScreen: undefined;
};

// Bottom tabs
export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  PilesTab: NavigatorScreenParams<PilesStackParamList>;
  SiteTab: undefined;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};

// Root (Auth vs Main)
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};