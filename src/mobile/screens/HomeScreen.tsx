import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useWallet } from '../../shared/contexts/WalletContext'
import { formatAddress } from '../../../lib/utils'

const { width } = Dimensions.get('window')

// QRDX Theme Colors matching qrdx-trade
const colors = {
  background: '#080d19',       // hsl(222.2, 84%, 4.9%)
  card: '#0f1629',              // hsl(224, 71%, 8%)
  cardHover: '#151d35',
  primary: '#8A50FF',           // hsl(262, 83%, 58%)
  primaryFaded: 'rgba(138, 80, 255, 0.15)',
  primaryBorder: 'rgba(138, 80, 255, 0.25)',
  foreground: '#f8fafc',       // hsl(210, 40%, 98%)
  muted: '#94a3b8',            // hsl(215, 20.2%, 65.1%)
  mutedBg: '#1e293b',          // hsl(217.2, 32.6%, 17.5%)
  border: '#1e293b',
  green: '#22c55e',
  greenFaded: 'rgba(34, 197, 94, 0.1)',
  red: '#ef4444',
  redFaded: 'rgba(239, 68, 68, 0.1)',
  blue: '#3b82f6',
  blueFaded: 'rgba(59, 130, 246, 0.15)',
  orange: '#f97316',
  orangeFaded: 'rgba(249, 115, 22, 0.15)',
}

interface TokenItem {
  symbol: string
  name: string
  balance: string
  value: string
  change24h: number
  gradientStart: string
  gradientEnd: string
}

export function HomeScreen({ navigation }: any) {
  const { currentWallet, lock } = useWallet()
  const [balanceVisible, setBalanceVisible] = useState(true)
  const [activeTab, setActiveTab] = useState<'tokens' | 'activity'>('tokens')
  const address = currentWallet?.address ?? ''
  const totalBalance = '$29,703.62'

  const handleLock = async () => {
    await lock()
    navigation.replace('Unlock')
  }

  const tokens: TokenItem[] = [
    { symbol: 'QRDX', name: 'Quardex', balance: '1,234.56', value: '$12,345.67', change24h: 5.23, gradientStart: colors.primary, gradientEnd: 'rgba(138, 80, 255, 0.6)' },
    { symbol: 'ETH', name: 'Ethereum', balance: '2.5', value: '$8,234.50', change24h: -2.15, gradientStart: colors.blue, gradientEnd: '#2563eb' },
    { symbol: 'USDC', name: 'USD Coin', balance: '5,000.00', value: '$5,000.00', change24h: 0.01, gradientStart: '#38bdf8', gradientEnd: '#06b6d4' },
    { symbol: 'BTC', name: 'Bitcoin', balance: '0.05', value: '$4,123.45', change24h: 3.45, gradientStart: '#fb923c', gradientEnd: '#f59e0b' },
  ]

  const activities = [
    { id: '1', type: 'receive' as const, token: 'QRDX', amount: '+123.45', value: '$1,234.56', time: '5m ago' },
    { id: '2', type: 'send' as const, token: 'ETH', amount: '-0.5', value: '$1,646.90', time: '2h ago' },
    { id: '3', type: 'swap' as const, token: 'USDC → QRDX', amount: '500', value: '$500.00', time: '1d ago' },
  ]

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {address ? address.slice(2, 4).toUpperCase() : 'QR'}
              </Text>
            </View>
            <View style={styles.onlineIndicator} />
          </View>
          <View>
            <Text style={styles.walletName}>QRDX Wallet</Text>
            {address ? (
              <Text style={styles.addressText}>{formatAddress(address, 6)}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerButton} onPress={() => {}}>
            <Text style={styles.headerButtonIcon}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleLock}>
            <Text style={styles.headerButtonIcon}>🔒</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Network Badge */}
        <View style={styles.networkRow}>
          <View style={styles.networkBadge}>
            <Text style={styles.networkBadgeIcon}>🛡️</Text>
            <Text style={styles.networkBadgeText}>Quantum-Safe</Text>
          </View>
          <Text style={styles.networkName}>QRDX Mainnet</Text>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceGradientOverlay} />
          <View style={styles.balanceHeader}>
            <Text style={styles.balanceLabel}>Total Balance</Text>
            <TouchableOpacity onPress={() => setBalanceVisible(!balanceVisible)}>
              <Text style={styles.visibilityIcon}>{balanceVisible ? '👁️' : '🙈'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.balanceAmount}>
            {balanceVisible ? totalBalance : '••••••••'}
          </Text>
          <View style={styles.changeRow}>
            <View style={[styles.changeBadge, { backgroundColor: colors.greenFaded }]}>
              <Text style={[styles.changeText, { color: colors.green }]}>↗ +4.34%</Text>
            </View>
            <Text style={styles.changeTimeframe}>24h</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsGrid}>
          {[
            { icon: '↗', label: 'Send', bg: colors.blueFaded, color: colors.blue, screen: 'Send' },
            { icon: '↙', label: 'Receive', bg: colors.greenFaded, color: colors.green, screen: 'Receive' },
            { icon: '⇄', label: 'Swap', bg: colors.primaryFaded, color: colors.primary, screen: null },
            { icon: '💳', label: 'Buy', bg: colors.orangeFaded, color: colors.orange, screen: null },
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              style={styles.actionButton}
              onPress={() => action.screen && navigation.navigate(action.screen)}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: action.bg }]}>
                <Text style={[styles.actionIcon, { color: action.color }]}>{action.icon}</Text>
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {(['tokens', 'activity'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Token List */}
        {activeTab === 'tokens' && (
          <View style={styles.listCard}>
            {tokens.map((token) => (
              <TouchableOpacity key={token.symbol} style={styles.tokenRow}>
                <View style={styles.tokenLeft}>
                  <View style={[styles.tokenIcon, { backgroundColor: token.gradientStart }]}>
                    <Text style={styles.tokenIconText}>{token.symbol.slice(0, 2)}</Text>
                  </View>
                  <View>
                    <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                    <Text style={styles.tokenName}>{token.name}</Text>
                  </View>
                </View>
                <View style={styles.tokenRight}>
                  <Text style={styles.tokenValue}>{token.value}</Text>
                  <View style={styles.tokenChangeRow}>
                    <Text style={styles.tokenBalance}>{token.balance}</Text>
                    <Text
                      style={[
                        styles.tokenChange,
                        { color: token.change24h >= 0 ? colors.green : colors.red },
                      ]}
                    >
                      {token.change24h >= 0 ? '↗' : '↘'} {Math.abs(token.change24h).toFixed(2)}%
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Activity List */}
        {activeTab === 'activity' && (
          <View style={styles.listCard}>
            <Text style={styles.sectionLabel}>Recent Activity</Text>
            {activities.map((item) => (
              <TouchableOpacity key={item.id} style={styles.tokenRow}>
                <View style={styles.tokenLeft}>
                  <View
                    style={[
                      styles.activityIcon,
                      {
                        backgroundColor:
                          item.type === 'receive'
                            ? colors.greenFaded
                            : item.type === 'send'
                            ? colors.redFaded
                            : colors.primaryFaded,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        color:
                          item.type === 'receive'
                            ? colors.green
                            : item.type === 'send'
                            ? colors.red
                            : colors.primary,
                      }}
                    >
                      {item.type === 'receive' ? '↙' : item.type === 'send' ? '↗' : '⇄'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.tokenSymbol}>{item.type.charAt(0).toUpperCase() + item.type.slice(1)}</Text>
                    <Text style={styles.tokenName}>{item.time}</Text>
                  </View>
                </View>
                <View style={styles.tokenRight}>
                  <Text
                    style={[
                      styles.tokenValue,
                      {
                        color:
                          item.type === 'receive'
                            ? colors.green
                            : item.type === 'send'
                            ? colors.red
                            : colors.foreground,
                      },
                    ]}
                  >
                    {item.amount} {item.token}
                  </Text>
                  <Text style={styles.tokenBalance}>{item.value}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    height: 36,
    width: 36,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.background,
  },
  walletName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  addressText: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: 'monospace',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 4,
  },
  headerButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonIcon: {
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 8,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: colors.primaryFaded,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  networkBadgeIcon: {
    fontSize: 10,
  },
  networkBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primary,
  },
  networkName: {
    fontSize: 10,
    color: colors.muted,
  },
  balanceCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(138, 80, 255, 0.1)',
    marginBottom: 12,
    overflow: 'hidden',
  },
  balanceGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(138, 80, 255, 0.03)',
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  balanceLabel: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  visibilityIcon: {
    fontSize: 16,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.foreground,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  changeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  changeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  changeTimeframe: {
    fontSize: 11,
    color: colors.muted,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  actionIconContainer: {
    height: 36,
    width: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIcon: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: colors.mutedBg + '50',
    borderRadius: 12,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.foreground,
    fontWeight: '600',
  },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  tokenLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tokenIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIconText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 11,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenSymbol: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
  },
  tokenName: {
    fontSize: 11,
    color: colors.muted,
  },
  tokenRight: {
    alignItems: 'flex-end',
  },
  tokenValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
  },
  tokenChangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tokenBalance: {
    fontSize: 11,
    color: colors.muted,
  },
  tokenChange: {
    fontSize: 10,
    fontWeight: '600',
  },
})
