# Interface components: where each is used

The wallet's controls are React Bits components, installed with shadcn
(`pnpm dlx shadcn@latest add @react-bits/<Name>-JS-CSS`; the shadcn MCP server is configured in
`.mcp.json` for searching the registry). Each sits in `components/` as delivered, with a `.d.ts`
beside it for types, and is excluded from lint. The wallet uses them through small wrappers in
`components/motion/` that set its monochrome (colours are the theme's CSS variables, so light and
dark follow without JavaScript) and sizes. Two are patched, and say so where they are
(`QRDX patch`): JellyRadio leaves every chip unchosen when the value matches none (a custom
slippage, a leverage set on the slider); RubberSegment measures its segments by layout, so a scaled
ancestor cannot skew them, and writes its thumb when it measures, since a remount (React's dev
StrictMode) could cancel the scheduled update and leave the thumb over every segment.

The liquid bubble look (Settings → Theme → Material) swaps the main buttons and switches for soap
bubbles; everything else is the same in both looks. Destructive confirmations hold in both: that
is a safeguard, not a style.

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
| `ActivityList.tsx` | Loading activity, refreshing | Loading, Spinner |
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
Outline buttons keep their own look; destructive ones hold (HoldButton, below).

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

## SquishSwitch: every on/off setting

`components/motion/Switch.tsx` (and `settings/shared.tsx` `Toggle`): the thumb stretches as it
travels and can be dragged across; ink when on. A soap bubble toggle in the bubble look.

| Where | Settings |
| --- | --- |
| `Settings.tsx` | Developer mode, each injected API (EVM and QRDX), Material: liquid bubble |
| `settings/NotificationsPage.tsx` | Transactions, price alerts, account security |
| `settings/NetworksPage.tsx` | Show test networks, show unverified tokens (were checkboxes) |
| `settings/SecurityPage.tsx` | Biometric unlock |
| `NetworkSelector.tsx` | Show test networks (was a checkbox) |

## RubberSegment: every one-of-a-few choice

`components/motion/Segment.tsx` `Segment`: an ink thumb that stretches toward the next choice and
settles with a squash; it can be dragged or flicked, and arrow keys move it (a radio group). Buy
and sell take the bid and ask colours. Its users: `settings/shared.tsx` `Segmented`,
`trade/kit.tsx` `Pills`, `motion/RangeTabs.tsx`, the landing page's `Tabs`.

| Where | Choice |
| --- | --- |
| `Dashboard.tsx` | Home tabs: tokens, NFTs, activity, explore (with the chosen tab's count) |
| `motion/RangeTabs.tsx` | Chart ranges: `TokenDetail.tsx`, `portfolio/AssetPage.tsx`, `portfolio/PortfolioHome.tsx` |
| `Explore.tsx` | Sort markets: volume, gainers, losers |
| `ReceiveModal.tsx` | Quantum-safe or classic address |
| `pay/PaySheet.tsx` | Pay from: quantum-safe or classic |
| `OtherSendModal.tsx` | Bitcoin fee speed (each with its wait and sat/vB) |
| `onboarding/Onboarding.tsx` | 12 or 24 words |
| `settings/SecurityPage.tsx` | Auto-lock, lock when hidden |
| `settings/AccountControlPage.tsx` | Delay on changes |
| `settings/NamesPage.tsx` | Years to register |
| `settings/MultisigPage.tsx` | Request action, bind or unbind, own key on or off |
| `settings/NotificationsPage.tsx` | Alert above or below |
| `trade/SpotForm.tsx`, `trade/PerpForm.tsx` | Buy or sell (long or short), limit or market |
| `trade/PerpForm.tsx` | Cross or isolated margin, deposit or withdraw |
| `trade/AccountsView.tsx` | To the sub-account or back to main |
| `src/web/LandingPage.tsx` | The extension's browser, the phone |

## JellyRadio: presets

`components/motion/Segment.tsx` `Chips`: chips that swell when chosen and nudge their neighbours.

| Where | Presets |
| --- | --- |
| `SwapModal.tsx` | Max slippage (none chosen while a custom value is typed), how long the swap stays valid |
| `trade/PerpForm.tsx` | Leverage presets (none chosen when the slider sits between them) |

## ElasticSlider: leverage

`trade/PerpForm.tsx`: the leverage sheet's slider, 1× to the market's maximum in whole steps; it
stretches when pulled past either end.

## SpringCheck: every checkbox

`components/motion/Check.tsx`: the box fills with ink on a spring and draws its tick; never struck
through. With its words it is one control; without (`aria`), the box alone in a row of its own.

| Where | Checkbox |
| --- | --- |
| `StakeModal.tsx` | I will run a validator and understand slashing |
| `approval/ApprovalScreen.tsx` | Each account a site may see |
| `settings/AccountsPage.tsx` | Each found account to add |
| `settings/MultisigPage.tsx` | Include this account as a member |
| `settings/NamesPage.tsx` | Show it as this account's name |
| `settings/NetworksPage.tsx` | It is a test network |
| `trade/PerpForm.tsx` | Reduce only |

## GlideSelect: every select

`components/motion/Select.tsx`: the menu pops from the field and a highlight glides between rows;
a finger can press and slide to choose. Long lists scroll within the menu.

| Where | Select |
| --- | --- |
| `ReceiveModal.tsx` | The token a request is in |
| `Settings.tsx` | A contact's network (every network) |
| `settings/NotificationsPage.tsx` | The alert's token |
| `settings/MultisigPage.tsx` | Signs for, the waiting change to cancel |
| `trade/AccountsView.tsx` | The asset to move (its balance as the tag) |

## HoldButton: everything that cannot be undone

`components/motion/HoldConfirm.tsx`: acts only after a press held for 1.2 s, filling red as a
wave; let go early and it drains. Enter or Space held does the same. The label says "Hold to …".

| Where | Action |
| --- | --- |
| `flow/FlowKit.tsx` `PrimaryButton variant="danger"` | Erase and restore (`Unlock.tsx`), erase everything (`settings/SecurityPage.tsx`), every password sheet marked danger (remove an account) |
| `flow/ConfirmSheet.tsx` `danger` | Exit a stake (`StakeModal.tsx`), cancel a transaction (`TransactionDetail.tsx`), recover an account (`settings/AccountControlPage.tsx`) |
| `flow/ConfirmSheet.tsx` `useConfirm` danger | Disconnect every site (`Settings.tsx`) |

## FuseButton: removing what this device keeps

`components/motion/UndoButton.tsx`: the press turns it into Undo, whose outline burns down over
4 s; the removal happens when it runs out, or at once if the screen is left. It replaces asking
first for things that are easy to add back.

| Where | Removes |
| --- | --- |
| `Settings.tsx` | A contact, a connected site's access (one site) |
| `settings/NotificationsPage.tsx` | A price alert |
| `settings/NetworksPage.tsx` | A network you added |
| `settings/WatchPage.tsx` | A watched address |
| `settings/MultisigPage.tsx` | A multisig from this device, a signing request |

## StatusMark: where a transaction stands

`components/motion/TxStatus.tsx`: spinning while it waits, a tick when its block lands, a cross if
it fails. A mark that stays on screen morphs from one to the next.

| Where | |
| --- | --- |
| `ActivityList.tsx` | A pending or failed transaction's icon |
| `portfolio/PortfolioActivity.tsx` | The same, across every network |
| `TransactionDetail.tsx` | The status row |
| `SendModal.tsx`, `pay/PaySheet.tsx` | After sending: refreshed until the block, then confirmed |
| `trade/submit.tsx` | Each submitted exchange operation |

## DecryptedText: secrets shown

`components/motion/SecretText.tsx`: characters cycle through the secret's own alphabet and settle
left to right. Screen readers and copying get the real text at once.

| Where | Secret |
| --- | --- |
| `flow/FlowKit.tsx` `PhraseGrid` | Recovery words (onboarding, Settings → Accounts → show phrase) |
| `settings/AccountsPage.tsx` | Exported private key and post-quantum seed |

## PixelSwap: the receive code

`ReceiveModal.tsx`: the address's QR dissolves square by square into a payment request's when an
amount is entered, and back when it is cleared.

## PulseHeart: favourites

`components/motion/Favourite.tsx`, as a star: it fills with ink and beats once.

| Where | |
| --- | --- |
| `AllTokens.tsx` | Favourite a token |
| `Settings.tsx` | Favourite a contact |

## WarmTooltip: icon-only buttons

`components/motion/Tip.tsx`: the button's name on hover, focus or a long press. In a group, the
first waits and the next follow at once.

| Where | |
| --- | --- |
| `Dashboard.tsx` | Header: connect to a site, settings, lock (one group); hide or show balances |
| `portfolio/PortfolioHome.tsx` | Refresh balances |
| `AllTokens.tsx` | Pin to the dashboard |

## Considered and not used

| Component | Why not |
| --- | --- |
| BellToggle | Notification preferences are switch rows like every other setting; there is no standalone "notify me" control |
| CometDial, WakeSlider | One slider in the wallet (leverage); a 250 px dial does not fit a form, ElasticSlider does |
| Counter | `components/motion/RollingText.tsx` already rolls digits, and takes any formatted figure (currency, sign, percent); Counter needs a bare number |
| SwipeRow | FuseButton covers removal with undo on every pointer; a swipe would be a second way to the same thing, on touch only |
| SwipeToast | The wallet has no toasts: results show where the action was taken |
| GooeyNav | The home tabs are a segmented control (RubberSegment); particles would compete with the dithered backdrop |
| AnimatedList, Stepper, Folder, GlassIcons, OptionWheel | Each brings its own frame, layout or menu that would replace the wallet's lists, flows and action grid wholesale |
| ShinyText | Shimmering text reads as loading; the wallet's loading states are the lattice |
| TearTicket | A payment's result is a status that resolves; tearing a stub adds a gesture with no meaning |
| CallChip, PeekRating, and the cursor, background and text-effect components | Agent tool calls and ratings do not exist here; the backdrop is the dithered orb |
| Trade's underline tabs (`trade/kit.tsx` `Tabs`) and the header's 0x/PQ badge switch | Left as they are: the first is the trade site's (Hyperliquid's) tab style, the second a 9 px inline badge |
