export {};

/** @typedef {import('@agoric/smart-wallet/src/offers').OfferSpec} OfferSpec */
/** @typedef {import('@agoric/smart-wallet/src/offers').OfferStatus} OfferStatus */
/** @typedef {import('@agoric/smart-wallet/src/smartWallet').CurrentWalletRecord} CurrentWalletRecord */
/** @typedef {import('@agoric/smart-wallet/src/smartWallet').UpdateRecord} UpdateRecord */

/**
 * @template T
 * @typedef {{
 *   visit: (x: T) => Promise<void>
 * }} Visitor
 */

/**
 * @typedef {{
 *   executeOffer: (offer: OfferSpec, fee?: string) => Promise<{
 *       tx: { transactionHash: string, height: number },
 *       status: OfferStatus
 *     }>;
 *   readOnly: () => Promise<SmartWalletView>
 * }} SmartWallet
 *
 * @typedef {{
 *   current: () => Promise<CurrentWalletRecord>,
 *   history: (vistor: Visitor<UpdateRecord>, minHeight?: number) => Promise<void>
 * }} SmartWalletView
 *
 * @typedef {{
 *   query: QueryTool,
 *   smartWallet: SmartWallet,
 *   tx: unknown,
 * }} SmartWalletKit
 */

/**
 * @typedef {{
 *   queryData: (path: string) => Promise<any>,
 *   queryChildren: (path: string) => Promise<string[]>,
 *   lookup(...path: string[]) => Promise<any>,
 *   invalidate() => Promise<any>,
 * }} QueryTool
 */
