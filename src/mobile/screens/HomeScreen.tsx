import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, RefreshControl, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useWallet } from '../../shared/contexts/WalletContext'
import { isQrdxChain } from '../../core/chains'
import { formatAddress } from '../../../lib/utils'

const { width } = Dimensions.get('window')

const colors = {
  background: '#080d19',
  card: '#0f1629',
  cardHover: '#151d35',
  primary: '#8A50FF',
  primaryFaded: 'rgba(138, 80, 255, 0.15)',
  primaryBorder: 'rgba(138, 80, 255, 0.25)',
  foreground: '#f8fafc',
  muted: '#94a3b8',
  mutedBg: '#1e293b',
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

export function HomeScreen({ navigation }: any) {
  const {
    currentWallet,
    activeChain,
    balances,
    balancesLoading,
    fetchBalances,
    transactions,
    transactionsLoading,
    refreshTransactions,
    portfolioValue,
    portfolioChange24h,
    lock,
    activeAddress,
  } = useWallet()

  const [balanceVisible, setBalanceVisible] = useState(true)
  const [activeTab, setActiveTab] = useState<'tokens' | 'activity'>('tokens')
  const [refreshing, setRefreshing] = useState(false)

  const isQrdx = isQrdxChain(activeChain)
  const address = activeAddress || currentWallet?.ethAddress || ''
  const pqAddress = currentWallet?.pqAddress ?? ''

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchBalances(), refreshTransactions()])
    setRefreshing(false)
  }, [fetchBalances, refreshTransactions])

  const handleLock = async () => {
    await lock()
    navigation.replace('Unlock')
  }

  // Format portfolio value
  const formattedPortfolio = portfolioValue > 0
    ? `$${portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : balances.length > 0
      ? `${balances[0]?.formattedBalance ?? '0'} ${balances[0]?.symbol ?? activeChain.nativeCurrency.symbol}`
      : '—'

  const change24hSign = portfolioChange24h >= 0 ? '+' : ''
  const change24hColor = portfolioChange24h >= 0 ? colors.green : colors.red
  const change24hBg = portfolioChange24h >= 0 ? colors.greenFaded : colors.redFaded

  // Token icon color map
  const tokenColors: Record<string, { start: string; end: string }> = {
    QRDX: { start: colors.primary, end: 'rgba(138, 80, 255, 0.6)' },
    ETH: { start: colors.blue, end: '#2563eb' },
    USDC: { start: '#38bdf8', end: '#06b6d4' },
    USDT: { start: '#22c55e', end: '#16a34a' },
    BTC: { start: '#fb923c', end: '#f59e0b' },
    WBTC: { start: '#fb923c', end: '#f59e0b' },
    BNB: { start: '#fbbf24', end: '#d97706' },
    POL: { start: '#7c3aed', end: '#4f46e5' },
    MATIC: { start: '#7c3aed', end: '#4f46e5' },
  }

  const getTokenColor = (symbol: string) =>
    tokenColors[symbol] ?? { start: colors.muted, end: '#475569' }

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
            <Text style={styles.walletName}>
              {currentWallet?.name ?? 'QRDX Wallet'}
            </Text>
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

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Network Badge */}
        <View style={styles.networkRow}>
          <View style={styles.networkBadge}>
            <Text style={styles.networkBadgeIcon}>{isQrdx ? '🛡️' : '🌐'}</Text>
            <Text style={styles.networkBadgeText}>
              {isQrdx ? 'Quantum-Safe' : activeChain.shortName}
            </Text>
          </View>
          <Text style={styles.networkName}>{activeChain.name}</Text>
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
          {balancesLoading && balances.length === 0 ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
          ) : (
            <Text style={styles.balanceAmount}>
              {balanceVisible ? formattedPortfolio : '••••••••'}
            </Text>
          )}
          {portfolioValue > 0 && (
            <View style={styles.changeRow}>
              <View style={[styles.changeBadge, { backgroundColor: change24hBg }]}>
                <Text style={[styles.changeText, { color: change24hColor }]}>
                  {change24hSign}{portfolioChange24h.toFixed(2)}%
                </Text>
              </View>
              <Text style={styles.changeTimeframe}>24h</Text>
            </View>
          )}

          {/* PQ address badge on QRDX chains */}
          {isQrdx && pqAddress ? (
            <View style={styles.pqAddressBadge}>
              <Text style={styles.pqAddressLabel}>PQ Address</Text>
              <Text style={styles.pqAddressText} numberOfLines={1}>
                {formatAddress(pqAddress, 8)}
              </Text>
            </View>
          ) : null}
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
            {balancesLoading && balances.length === 0 ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.emptyText}>Loading balances…</Text>
              </View>
            ) : balances.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No tokens found</Text>
              </View>
            ) : (
              balances.map((token) => {
                const tc = getTokenColor(token.symbol)
                return (
                  <TouchableOpacity key={`${token.address}-${token.symbol}`} style={styles.tokenRow}>
                    <View style={styles.tokenLeft}>
                      <View style={[styles.tokenIcon, { backgroundColor: tc.start }]}>
                        <Text style={styles.tokenIconText}>{token.symbol.slice(0, 2)}</Text>
                      </View>
                      <View>
                        <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                        <Text style={styles.tokenName}>{token.name}</Text>
                      </View>
                    </View>
                    <View style={styles.tokenRight}>
                      <Text style={styles.tokenValue}>{token.formattedBalance}</Text>
                      <Text style={styles.tokenBalance}>{token.symbol}</Text>
                    </View>
                  </TouchableOpacity>
                )
              })
            )}
          </View>
        )}

        {/* Activity List */}
        {activeTab === 'activity' && (
          <View style={styles.listCard}>
            <Text style={styles.sectionLabel}>Recent Activity</Text>
            {transactionsLoading && transactions.length === 0 ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.emptyText}>Loading transactions…</Text>
              </View>
            ) : transactions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No transactions yet</Text>
              </View>
            ) : (
              transactions.slice(0, 20).map((tx) => {
                const isSend = tx.type === 'send'
                const isPending = tx.status === 'pending'
                const iconColor = isSend ? colors.red : tx.type === 'receive' ? colors.green : colors.primary
                const iconBg = isSend ? colors.redFaded : tx.type === 'receive' ? colors.greenFaded : colors.primaryFaded
                const icon = isSend ? '↗' : tx.type === 'receive' ? '↙' : '⇄'
                const timeLabel = tx.timestamp > 0
                  ? new Date(tx.timestamp * 1000).toLocaleDateString()
                  : 'Pending'

                return (
                  <TouchableOpacity key={`${tx.hash}-${tx.tokenSymbol ?? ''}`} style={styles.tokenRow}>
                    <View style={styles.tokenLeft}>
                      <View style={[styles.activityIcon, { backgroundColor: iconBg }]}>
                        <Text style={{ fontSize: 16, color: iconColor }}>{icon}</Text>
                      </View>
                      <View>
                        <Text style={styles.tokenSymbol}>
                          {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                          {isPending ? ' (Pending)' : ''}
                        </Text>
                        <Text style={styles.tokenName}>{timeLabel}</Text>
                      </View>
                    </View>
                    <View style={styles.tokenRight}>
                      <Text style={[styles.tokenValue, { color: iconColor }]}>
                        {isSend ? '-' : '+'}{tx.value}
                      </Text>
                      <Text style={styles.tokenBalance} numberOfLines={1}>
                        {formatAddress(isSend ? tx.to : tx.from, 4)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              })
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarContainer: { position: 'relative' },
  avatar: {
    height: 36, width: 36, borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  onlineIndicator: {
    position: 'absolute', bottom: -2, right: -2,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.green,
    borderWidth: 2, borderColor: colors.background,
  },
  walletName: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  addressText: { fontSize: 11, color: colors.muted, fontFamily: 'monospace' },
  headerRight: { flexDirection: 'row', gap: 4 },
  headerButton: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerButtonIcon: { fontSize: 16 },
  content: { flex: 1, paddingHorizontal: 16 },
  networkRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 12, marginBottom: 8,
  },
  networkBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    backgroundColor: colors.primaryFaded,
    borderWidth: 1, borderColor: colors.primaryBorder,
  },
  networkBadgeIcon: { fontSize: 10 },
  networkBadgeText: { fontSize: 10, fontWeight: '600', color: colors.primary },
  networkName: { fontSize: 10, color: colors.muted },
  balanceCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(138, 80, 255, 0.1)',
    marginBottom: 12, overflow: 'hidden',
  },
  balanceGradientOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(138, 80, 255, 0.03)',
  },
  balanceHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 4,
  },
  balanceLabel: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  visibilityIcon: { fontSize: 16 },
  balanceAmount: {
    fontSize: 32, fontWeight: 'bold', color: colors.foreground,
    letterSpacing: -0.5, marginBottom: 8,
  },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  changeText: { fontSize: 11, fontWeight: '600' },
  changeTimeframe: { fontSize: 11, color: colors.muted },
  pqAddressBadge: {
    marginTop: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(138, 80, 255, 0.15)',
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  pqAddressLabel: { fontSize: 10, color: colors.primary, fontWeight: '600' },
  pqAddressText: { fontSize: 10, color: colors.muted, fontFamily: 'monospace', flex: 1 },
  actionsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  actionButton: {
    flex: 1, alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  actionIconContainer: { height: 36, width: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { fontSize: 18, fontWeight: 'bold' },
  actionLabel: { fontSize: 11, color: colors.muted, fontWeight: '500' },
  tabsContainer: {
    flexDirection: 'row', gap: 4, padding: 4,
    backgroundColor: colors.mutedBg + '50',
    borderRadius: 12, marginBottom: 12,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  tabActive: {
    backgroundColor: colors.card,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  tabText: { fontSize: 12, fontWeight: '500', color: colors.muted },
  tabTextActive: { color: colors.foreground, fontWeight: '600' },
  listCard: {
    backgroundColor: colors.card, borderRadius: 16, padding: 4,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  sectionLabel: {
    fontSize: 12, fontWeight: '600', color: colors.muted,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4,
  },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 13, color: colors.muted },
  tokenRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12,
  },
  tokenLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tokenIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tokenIconText: { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  activityIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tokenSymbol: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  tokenName: { fontSize: 11, color: colors.muted },
  tokenRight: { alignItems: 'flex-end' },
  tokenValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  tokenChangeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tokenBalance: { fontSize: 11, color: colors.muted },
  tokenChange: { fontSize: 10, fontWeight: '600' },
})
