// src/screens/Site/SiteScreen.tsx
//
// Container screen for the Site bottom tab. Renders the swipeable top-tab
// strip (Machines / Personnel / Shifts / Templates / Steps) below the
// status bar / notch — SafeAreaView handles that spacing.

import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@theme/theme';

import TopTabs from '@components/shared/TopTabs';
import MachinesScreen from '@/screens/Site/Tabs/MachinesScreen';
import PersonnelScreen from '@/screens/Site/Tabs/PersonnelScreen';
import ShiftsScreen from '@/screens/Site/Tabs/ShiftsScreen';
import TemplatesScreen from '@/screens/Site/Tabs/TemplatesScreen';
import StepsScreen from '@/screens/Site/Tabs/StepsScreen';

export default function SiteScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }} edges={['top']}>
      <TopTabs
        tabs={[
          { name: 'Machines', title: 'Machines', component: MachinesScreen },
          { name: 'Personnel', title: 'Personnel', component: PersonnelScreen },
          { name: 'Shifts', title: 'Shifts', component: ShiftsScreen },
          { name: 'Templates', title: 'Templates', component: TemplatesScreen },
          { name: 'Steps', title: 'Steps', component: StepsScreen },
        ]}
      />
    </SafeAreaView>
  );
}