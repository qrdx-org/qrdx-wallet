import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useWallet } from '../../shared/contexts/WalletContext'
import { isQrdxChain } from '../../core/chains'

const colors = {
  background: '#080d19',
  card: '#0f1629',
  primary: '#8A50FF',
  primaryFaded: 'rgba(138, 80, 255, 0.15)',
  primaryBorder: 'rgba(138, 80, 255, 0.25)',
  foreground: '#f8fafc',
  muted: '#94a3b8',
  border: '#1e293b',
  green: '#22c55e',
  greenFaded: 'rgba(34, 197, 94, 0.1)',
  red: '#ef4444',
  redFaded: 'rgba(239, 68, 68, 0.1)',
}

export function SendScreen({ navigation }: any) {
  const {
    currentWallet,
    activeChain,
    balances,
    sendTransaction,
    sendTokenTransaction,
  } = useWallet()

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [selectedTokenIdx, setSelectedTokenIdx] = useState(0)
  const [sending, setSending] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)

  const isQrdx = isQrdxChain(activeChain)
  const nativeCurrency = activeChain.nativeCurrency
  const selectedBalance = balances[selectedTokenIdx]
  const isNative = !selectedBalance?.address

  const validateAddress = (addr: string): boolean => {
    if (!addr) return false
    if (addr.startsWith('0xPQ') && addr.length === 68) return true  // PQ address
    if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return true               // ETH address
    return false
  }

  const handleMaxAmount = () => {
    if (selectedBalance) {
      setAmount(selectedBalance.formattedBalance)
    }
  }

  const handleSend = useCallback(async () => {
    if (!currentWallet) {
      Alert.alert('Error', 'No wallet selected')
      return
    }

    const trimmedRecipient = recipient.trim()
    const trimmedAmount = amount.trim()

    if (!validateAddress(trimmedRecipient)) {
      Alert.alert('Invalid Address', `Please enter a valid ${isQrdx ? '0x or 0xPQ' : '0x'} address.`)
      return
    }

    if (!trimmedAmount || isNaN(parseFloat(trimmedAmount)) || parseFloat(trimmedAmount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than zero.')
      return
    }

    if (!selectedBalance) {
      Alert.alert('Error', 'No token selected')
      return
    }

    Alert.alert(
      'Confirm Transaction',
      `Send ${trimmedAmount} ${selectedBalance.symbol} to ${trimmedRecipient.slice(0, 8)}...${trimmedRecipient.slice(-6)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'default',
          onPress: async () => {
            setSending(true)
            setTxHash(null)
            try {
              let result: { hash: string }
              if (isNative) {
                result = await sendTransaction(trimmedRecipient, trimmedAmount)
              } else {
                result = await sendTokenTransaction(
                  selectedBalance.address,
                  trimmedRecipient,
                  trimmedAmount,
                  selectedBalance.decimals
                )
              }
              setTxHash(result.hash)
              setRecipient('')
              setAmount('')
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Transaction failed'
              Alert.alert('Transaction Failed', msg)
            } finally {
              setSending(false)
            }
          },
        },
      ]
    )
  }, [currentWallet, recipient, amount, selectedBalance, isNative, sendTransaction, sendTokenTransaction, isQrdx])

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Success state */}
        {txHash && (
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Transaction Sent!</Text>
            <Text style={styles.successHash} selectable numberOfLines={2}>
              {txHash}
            </Text>
            <TouchableOpacity onPress={() => setTxHash(null)} style={styles.dismissButton}>
              <Text style={styles.dismissButtonText}>Send Another</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Token selector */}
        {balances.length > 1 && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Token</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tokenSelector}>
              {balances.map((token, idx) => (
                <TouchableOpacity
                  key={`${token.address}-${token.symbol}`}
                  style={[styles.tokenChip, selectedTokenIdx === idx && styles.tokenChipActive]}
                  onPress={() => setSelectedTokenIdx(idx)}
                >
                  <Text style={[styles.tokenChipText, selectedTokenIdx === idx && styles.tokenChipTextActive]}>
                    {token.symbol}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {selectedBalance && (
              <Text style={styles.balanceHint}>
                Balance: {selectedBalance.formattedBalance} {selectedBalance.symbol}
              </Text>
            )}
          </View>
        )}

        {/* Recipient */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Recipient Address</Text>
          {isQrdx && (
            <Text style={styles.inputHint}>Supports both 0x (secp256k1) and 0xPQ (post-quantum) addresses</Text>
          )}
          <TextInput
            style={[styles.input, recipient && !validateAddress(recipient) && styles.inputError]}
            placeholder={isQrdx ? '0x... or 0xPQ...' : '0x...'}
            placeholderTextColor={colors.muted}
            value={recipient}
            onChangeText={setRecipient}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {recipient && !validateAddress(recipient) && (
            <Text style={styles.errorText}>Invalid address format</Text>
          )}
        </View>

        {/* Amount */}
        <View style={styles.inputGroup}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Amount</Text>
            <TouchableOpacity onPress={handleMaxAmount}>
              <Text style={styles.maxButton}>MAX</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.amountInputRow}>
            <TextInput
              style={[styles.input, styles.amountInput]}
              placeholder="0.00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
            <View style={styles.currencyBadge}>
              <Text style={styles.currencyText}>
                {selectedBalance?.symbol ?? nativeCurrency.symbol}
              </Text>
            </View>
          </View>
          {selectedBalance && (
            <Text style={styles.balanceHint}>
              Balance: {selectedBalance.formattedBalance} {selectedBalance.symbol}
            </Text>
          )}
        </View>

        {/* Network info */}
        <View style={styles.networkInfo}>
          <View style={styles.networkRow}>
            <Text style={styles.networkLabel}>Network</Text>
            <Text style={styles.networkValue}>{activeChain.name}</Text>
          </View>
          {isQrdx && (
            <View style={styles.networkRow}>
              <Text style={styles.networkLabel}>Transaction Type</Text>
              <Text style={styles.networkValue}>
                {recipient.startsWith('0xPQ') ? 'PQ (Dilithium)' : 'Web3 (secp256k1)'}
              </Text>
            </View>
          )}
        </View>

        {/* Send button */}
        <TouchableOpacity
          style={[styles.sendButton, (sending || !recipient || !amount) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={sending || !recipient || !amount}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  backButton: { color: colors.primary, fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: colors.foreground },
  content: { flex: 1 },
  contentContainer: { paddingHorizontal: 20, paddingTop: 24, gap: 20, paddingBottom: 40 },
  successCard: {
    backgroundColor: colors.greenFaded,
    borderWidth: 1, borderColor: colors.green,
    borderRadius: 16, padding: 20, alignItems: 'center', gap: 8,
  },
  successIcon: { fontSize: 32, color: colors.green },
  successTitle: { fontSize: 18, fontWeight: 'bold', color: colors.green },
  successHash: { fontSize: 10, color: colors.muted, textAlign: 'center', fontFamily: 'monospace' },
  dismissButton: {
    marginTop: 8, paddingVertical: 10, paddingHorizontal: 24,
    backgroundColor: colors.green, borderRadius: 10,
  },
  dismissButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  inputGroup: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  inputHint: { fontSize: 11, color: colors.muted },
  maxButton: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    fontSize: 15, color: colors.foreground,
  },
  inputError: { borderColor: colors.red },
  errorText: { fontSize: 11, color: colors.red },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amountInput: { flex: 1 },
  currencyBadge: {
    backgroundColor: colors.primaryFaded,
    borderWidth: 1, borderColor: colors.primaryBorder,
    borderRadius: 10, paddingVertical: 14, paddingHorizontal: 14,
  },
  currencyText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  balanceHint: { fontSize: 11, color: colors.muted },
  tokenSelector: { flexDirection: 'row' },
  tokenChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, marginRight: 8,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  tokenChipActive: { backgroundColor: colors.primaryFaded, borderColor: colors.primaryBorder },
  tokenChipText: { fontSize: 12, color: colors.muted, fontWeight: '500' },
  tokenChipTextActive: { color: colors.primary, fontWeight: '700' },
  networkInfo: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 14, gap: 8,
  },
  networkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  networkLabel: { fontSize: 12, color: colors.muted },
  networkValue: { fontSize: 12, color: colors.foreground, fontWeight: '600' },
  sendButton: {
    backgroundColor: colors.primary, paddingVertical: 18, borderRadius: 14,
    alignItems: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
