// ===================================================================
// Hackbot — React Native 入口 + Tab 导航
// ===================================================================

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

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
            const icons = TAB_ICONS[route.name];
            const iconName = focused ? icons.focused : icons.default;
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarStyle: {
            backgroundColor: Colors.surface,
            borderTopColor: Colors.border,
            paddingBottom: 4,
            height: 56,
          },
          tabBarLabelStyle: {
            fontSize: FontSize.xs,
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
