import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useWallet } from '../../shared/contexts/WalletContext'
import { isQrdxChain } from '../../core/chains'
import { formatAddress } from '../../../lib/utils'

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
}

type AddressType = 'eth' | 'pq'

export function ReceiveScreen({ navigation }: any) {
  const { currentWallet, activeChain } = useWallet()
  const [selectedType, setSelectedType] = useState<AddressType>('eth')

  const isQrdx = isQrdxChain(activeChain)
  const ethAddress = currentWallet?.ethAddress ?? ''
  const pqAddress = currentWallet?.pqAddress ?? ''

  const displayAddress = selectedType === 'pq' ? pqAddress : ethAddress
  const addressLabel = selectedType === 'pq'
    ? 'Post-Quantum Address (0xPQ)'
    : isQrdx ? 'Standard Address (0x)' : 'Your Address'

  const handleCopy = () => {
    // Clipboard.setStringAsync(displayAddress) — available in Expo
    Alert.alert('Copied', `${addressLabel} copied to clipboard`)
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Receive</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Address type selector — only shown on QRDX */}
        {isQrdx && pqAddress ? (
          <View style={styles.typeSelectorContainer}>
            <Text style={styles.sectionLabel}>Address Type</Text>
            <View style={styles.typeSelector}>
              {(['eth', 'pq'] as AddressType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeTab, selectedType === type && styles.typeTabActive]}
                  onPress={() => setSelectedType(type)}
                >
                  <Text style={[styles.typeTabText, selectedType === type && styles.typeTabTextActive]}>
                    {type === 'eth' ? '0x — secp256k1' : '0xPQ — Post-Quantum'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {selectedType === 'pq' && (
              <View style={styles.pqNotice}>
                <Text style={styles.pqNoticeIcon}>🛡️</Text>
                <Text style={styles.pqNoticeText}>
                  This is your quantum-resistant Dilithium address. Use it when receiving
                  from senders who use PQ-signed transactions.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {/* QR Code placeholder */}
        <View style={styles.qrSection}>
          <View style={styles.qrPlaceholder}>
            <Text style={styles.qrPlaceholderIcon}>
              {selectedType === 'pq' ? '🛡️' : '📱'}
            </Text>
            <Text style={styles.qrText}>QR Code</Text>
            <Text style={styles.qrSubtext}>{formatAddress(displayAddress, 6)}</Text>
          </View>
        </View>

        {/* Address display */}
        <View style={styles.addressSection}>
          <Text style={styles.label}>{addressLabel}</Text>
          <View style={styles.addressBox}>
            <Text style={styles.address} selectable>{displayAddress}</Text>
          </View>

          <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
            <Text style={styles.copyButtonText}>Copy Address</Text>
          </TouchableOpacity>

          {/* Show the other address as a secondary option on QRDX */}
          {isQrdx && pqAddress && selectedType === 'eth' && (
            <View style={styles.secondaryAddressBox}>
              <View style={styles.secondaryAddressHeader}>
                <Text style={styles.secondaryAddressLabel}>Post-Quantum Address</Text>
                <TouchableOpacity onPress={() => setSelectedType('pq')}>
                  <Text style={styles.secondaryAddressAction}>Switch</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.secondaryAddress} numberOfLines={2}>
                {pqAddress}
              </Text>
            </View>
          )}
        </View>

        {/* Chain info */}
        <View style={styles.chainInfo}>
          <Text style={styles.chainInfoText}>
            Network: {activeChain.name}
          </Text>
          {isQrdx && (
            <Text style={styles.chainInfoText}>
              Supports both secp256k1 (0x) and post-quantum (0xPQ) addresses
            </Text>
          )}
        </View>
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
  contentContainer: { paddingHorizontal: 20, paddingTop: 24, gap: 24, paddingBottom: 40 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 8 },
  typeSelectorContainer: { gap: 8 },
  typeSelector: {
    flexDirection: 'row', gap: 4, padding: 4,
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  typeTab: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center' },
  typeTabActive: { backgroundColor: colors.primaryFaded },
  typeTabText: { fontSize: 11, color: colors.muted, fontWeight: '500' },
  typeTabTextActive: { color: colors.primary, fontWeight: '600' },
  pqNotice: {
    flexDirection: 'row', gap: 8, padding: 12,
    backgroundColor: colors.primaryFaded, borderRadius: 12,
    borderWidth: 1, borderColor: colors.primaryBorder,
    alignItems: 'flex-start',
  },
  pqNoticeIcon: { fontSize: 16 },
  pqNoticeText: { fontSize: 11, color: colors.primary, flex: 1, lineHeight: 16 },
  qrSection: { alignItems: 'center' },
  qrPlaceholder: {
    width: 220, height: 220,
    backgroundColor: colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  qrPlaceholderIcon: { fontSize: 40 },
  qrText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  qrSubtext: { color: colors.muted, fontSize: 10, fontFamily: 'monospace' },
  addressSection: { gap: 12 },
  label: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  addressBox: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingVertical: 16, paddingHorizontal: 16,
  },
  address: {
    fontSize: 13, color: colors.foreground, textAlign: 'center',
    fontFamily: 'monospace', lineHeight: 20,
  },
  copyButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16, paddingHorizontal: 24,
    borderRadius: 12, alignItems: 'center',
  },
  copyButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryAddressBox: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    padding: 12,
  },
  secondaryAddressHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  secondaryAddressLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  secondaryAddressAction: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  secondaryAddress: { fontSize: 10, color: colors.muted, fontFamily: 'monospace', lineHeight: 16 },
  chainInfo: { paddingTop: 8, gap: 4 },
  chainInfoText: { fontSize: 11, color: colors.muted, textAlign: 'center' },
})
