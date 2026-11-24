# Interface components: where each is used

The wallet's normal look uses four React Bits components, installed with shadcn
(`pnpm dlx shadcn@latest add @react-bits/<Name>-JS-CSS`) and kept as delivered. Each has a
`.d.ts` beside it for types and is excluded from lint. The liquid bubble look (Settings → Theme →
Material) swaps the buttons for soap bubbles; the loaders, the NFT cards and the slide to pay stay
the same in both.

This is the inventory: every element of its kind is on it. A new one should be too.

## LatticeLoader: every loading state

`components/motion/Loading.tsx`: `Loading` (the lattice with its words) for a section that is
loading, `Spinner` (icon-sized, words for screen readers only) in buttons and lines.

| Where | What | Kind |
| --- | --- | --- |
| `app/wallet/layout.tsx`, `components/WalletHome.tsx` | Opening the wallet | Loading |
| `approval/ApprovalScreen.tsx` | Loading a site's request | Loading |
| `flow/FlowKit.tsx` `PrimaryButton` (all three looks) | A flow step working | Spinner |
| `flow/ConfirmSheet.tsx` | Signing | Spinner |
| `portfolio/PortfolioHome.tsx` | Reading every network (×2), replaying history, refreshing | Loading, Spinner |
| `portfolio/PortfolioActivity.tsx` | Reading activity on every network | Loading |
| `portfolio/TradeSheet.tsx` | Checking the bridge, quoting | Loading, Spinner |
| `ActivityList.tsx` | Loading activity, refreshing, a pending transaction's icon | Loading, Spinner |
| `TokenList.tsx` | Loading tokens | Loading |
| `NftGallery.tsx` | Reading NFTs, an NFT's image loading | Loading, Spinner |
| `Explore.tsx` | Loading markets | Loading |
| `NetworkSelector.tsx` | Checking a network | Spinner |
| `SendModal.tsx` | Looking up a name, estimating the fee, sending | Spinner |
| `OtherSendModal.tsx` | A Solana send confirming | Spinner |
| `SwapModal.tsx` | Quoting | Spinner |
| `TradeModal.tsx` | Checking the exchange, loading markets, loading a market | Loading |
| `trade/AccountTabs.tsx` | Loading the trading account | Loading |
| `trade/MarketData.tsx` | Reading the order book, reading trades | Loading |
| `trade/submit.tsx` | Signing and submitting | Spinner |
| `settings/ApprovalsPage.tsx` | Reading transactions, revoking | Loading, Spinner |
| `settings/NamesPage.tsx` | Checking the network, reading names | Loading |
| `settings/AccountControlPage.tsx` | Reading the account, reading guardians | Loading |
| `settings/QuantumSafetyPage.tsx` | Reading the classic address, moving funds | Loading, Spinner |
| `settings/MultisigPage.tsx` | A submitted transaction pending | Spinner |
| `pay/PaySheet.tsx` | Estimating the fee | Spinner |

## SpecularButton: every main action

`components/motion/CtaButton.tsx`: each screen's one call to act. Configured as given (size,
radius 18, white tint at 4 %, white lines on `#525252`, intensity 1, idle 0.35, shine 10 / 34,
thickness 1.2, glow 1, following the pointer within 250 px) on black, and mirrored in ink on white.
Outline and destructive buttons keep their own looks.

| Where | Action |
| --- | --- |
| `flow/FlowKit.tsx` `PrimaryButton` | Every flow's continue/confirm: welcome, unlock, onboarding, import, security, approvals, accounts, multisig, quantum migration (45 call sites) |
| `flow/ConfirmSheet.tsx` (×2) | Confirm a reviewed operation (not destructive ones) |
| `SendModal.tsx` | Review send |
| `SwapModal.tsx` | Review swap |
| `ShieldModal.tsx` | Send to the quantum-safe account |
| `BuyModal.tsx` | Each funding route's action |
| `NftGallery.tsx` (×2) | Send an NFT, review the transfer |
| `AccountSwitcher.tsx` | Add account |
| `TransactionDetail.tsx` (×2) | Save contact, view on the explorer |
| `settings/NotificationsPage.tsx` | Add a price alert |
| `trade/submit.tsx` | Sign and submit |
| `trade/AccountsView.tsx` (×2) | Create a sub-account, move funds |
| `trade/PerpForm.tsx` (×2) | Set leverage, deposit or withdraw |
| `pay/PayScanner.tsx`, `pay/PaySheet.tsx` | Review a pasted payment, done |
| `src/web/LandingPage.tsx` (×3) | Download (or install on the phone), the chosen browser's extension, open the wallet |

## ReflectiveCard: NFTs

`components/wallet/NftCard.tsx`: every NFT is a card of polished metal that tilts toward the
pointer, in greys; never with the camera (`webcam` stays off). A card in the gallery is live only
near the screen, since each holds a WebGL context and browsers keep only a handful.

| Where | |
| --- | --- |
| `NftGallery.tsx` | Every NFT in the gallery's grid |
| `NftGallery.tsx` `NftDetail` | The NFT, large, above its details |

## SlideCommit: paying a payment request

`components/wallet/pay/PaySheet.tsx`: only there, not in the ordinary Send. Receive → Request an
amount makes a QR of a wallet link with the request in it (`src/core/payment-uri.ts`); scanning it
(Home → More → Pay, or a phone's camera, which opens the link) shows what it costs and a slide to
pay.
