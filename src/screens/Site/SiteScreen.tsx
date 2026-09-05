// src/screens/Site/SiteScreen.tsx
//
// Container screen for the Site bottom tab. Renders the swipeable top-tab
// strip (Machines / Personnel / Shifts / Steps). The status-bar/notch spacing
// and the backdrop come from App.tsx's AppShell — this screen adds neither.

import { View } from 'react-native';
import { colors } from '@theme/theme';

import TopTabs from '@components/shared/TopTabs';
import MachinesScreen from '@/screens/Site/Tabs/MachinesScreen';
import PersonnelScreen from '@/screens/Site/Tabs/PersonnelScreen';
import ShiftsScreen from '@/screens/Site/Tabs/ShiftsScreen';
import StepsScreen from '@/screens/Site/Tabs/StepsScreen';

export default function SiteScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <TopTabs
        tabs={[
          { name: 'Machines', title: 'Machines', component: MachinesScreen },
          { name: 'Personnel', title: 'Personnel', component: PersonnelScreen },
          { name: 'Shifts', title: 'Shifts', component: ShiftsScreen },
          { name: 'Steps', title: 'Steps', component: StepsScreen },
        ]}
      />
    </View>
  );
}