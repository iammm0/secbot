// ===================================================================
// Hackbot — React Native 入口 + Tab 导航
// ===================================================================

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform, useWindowDimensions } from 'react-native';

import ChatScreen from './src/screens/ChatScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import DefenseScreen from './src/screens/DefenseScreen';
import NetworkScreen from './src/screens/NetworkScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import { Colors, FontSize } from './src/theme';

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, { focused: keyof typeof Ionicons.glyphMap; default: keyof typeof Ionicons.glyphMap }> = {
  Chat: { focused: 'chatbubble-ellipses', default: 'chatbubble-ellipses-outline' },
  Dashboard: { focused: 'speedometer', default: 'speedometer-outline' },
  Defense: { focused: 'shield-checkmark', default: 'shield-checkmark-outline' },
  Network: { focused: 'git-network', default: 'git-network-outline' },
  History: { focused: 'time', default: 'time-outline' },
};

export default function App() {
  const { width } = useWindowDimensions();
  const isTabletLayout = width >= 820;

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: Colors.primary,
          background: Colors.background,
          card: Colors.surface,
          text: Colors.text,
          border: Colors.border,
          notification: Colors.accent,
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' as const },
          medium: { fontFamily: 'System', fontWeight: '500' as const },
          bold: { fontFamily: 'System', fontWeight: '700' as const },
          heavy: { fontFamily: 'System', fontWeight: '800' as const },
        },
      }}
    >
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            const icons = TAB_ICONS[route.name] ?? TAB_ICONS.Chat;
            const iconName = focused ? icons.focused : icons.default;
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarStyle: {
            backgroundColor: Colors.surface,
            borderTopColor: Colors.border,
            borderTopWidth: 1,
            paddingTop: 6,
            paddingBottom: Platform.OS === 'ios' ? (isTabletLayout ? 12 : 10) : 6,
            height: Platform.OS === 'ios' ? (isTabletLayout ? 78 : 72) : (isTabletLayout ? 70 : 60),
          },
          tabBarItemStyle: {
            paddingVertical: isTabletLayout ? 2 : 0,
          },
          tabBarLabelStyle: {
            fontSize: isTabletLayout ? FontSize.sm : FontSize.xs,
            fontWeight: '600',
          },
          headerStyle: {
            backgroundColor: Colors.surface,
            borderBottomColor: Colors.border,
            borderBottomWidth: 1,
          },
          headerTintColor: Colors.text,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: isTabletLayout ? FontSize.xl : FontSize.lg,
          },
          sceneStyle: {
            backgroundColor: Colors.background,
          },
        })}
      >
        <Tab.Screen
          name="Chat"
          component={ChatScreen}
          options={{ title: '聊天', headerTitle: 'Hackbot' }}
        />
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: '仪表盘' }}
        />
        <Tab.Screen
          name="Defense"
          component={DefenseScreen}
          options={{ title: '防御' }}
        />
        <Tab.Screen
          name="Network"
          component={NetworkScreen}
          options={{ title: '网络' }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{ title: '历史' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
