// cribbed from
// test.serial('--| MINT - Expected flow', ...)
// https://github.com/Kryha/KREAd/blob/develop/agoric/contract/test/test-minting.js#L163
// @ts-check

import { E, Far } from '@endo/far';
import { UNIT6 } from './well-known.js/index.js';

console.log('*** mint-kread worker');

/**
 * @param {import('./ag-trade.js').QueryTool} vstorage
 * @param {import('./ag-trade.js').SmartWallet} wallet
 */
const makeTrader = (vstorage, wallet) => {
  /**
   * @param {string|number} id
   * @param {string} name
   * @param {number} price
   */
  const trade = async (id, name, price = 25) => {
    const instance = await E(vstorage).lookup(
      'agoricNames',
      'instance',
      'kread',
    );
    const brand = {
      IST: await E(vstorage).lookup('agoricNames', 'brand', 'IST'),
    };
    const Price = harden({
      brand: brand.IST,
      value: BigInt(Math.round(price * Number(UNIT6))),
    });

    /** @type {import('./ag-trade.js').OfferSpec} */
    const offerSpec = {
      id,
      invitationSpec: {
        source: 'contract',
        instance,
        publicInvitationMaker: 'makeMintCharacterInvitation',
      },
      proposal: { give: { Price } },
      offerArgs: { name },
    };

    return E(wallet).executeOffer(offerSpec);
  };

  return Far('Trader', { trade });
};

export const make = async powers => {
  /** @type {import('./ag-trade.js').SmartWalletKit} */
  const kit = await E(powers).request('HOST', 'wallet kit', 'wallet-kit');

  return makeTrader(kit.query, kit.smartWallet);
};
