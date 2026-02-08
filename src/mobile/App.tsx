import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as SecureStore from 'expo-secure-store'
import { WalletProvider } from '../shared/contexts/WalletContext'
import { MobileStorage } from '../core/storage'

// Screens
import { HomeScreen } from './screens/HomeScreen'
import { SetupScreen } from './screens/SetupScreen'
import { UnlockScreen } from './screens/UnlockScreen'
import { SendScreen } from './screens/SendScreen'
import { ReceiveScreen } from './screens/ReceiveScreen'

const Stack = createNativeStackNavigator()

// Create mobile storage backed by Expo SecureStore
const mobileStorage = new MobileStorage(SecureStore)

export function App() {
  return (
    <SafeAreaProvider>
      <WalletProvider storage={mobileStorage}>
        <NavigationContainer>
          <StatusBar style="auto" />
          <Stack.Navigator
            initialRouteName="Setup"
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="Setup" component={SetupScreen} />
            <Stack.Screen name="Unlock" component={UnlockScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Send" component={SendScreen} />
            <Stack.Screen name="Receive" component={ReceiveScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </WalletProvider>
    </SafeAreaProvider>
  )
}
