// @ts-check
import { E, Far } from '@endo/far';
import { mustMatch, M } from '@endo/patterns';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { AmountShape } from '@agoric/ertp/src/typeGuards.js';

import {
  contractName,
  feeValue,
  wellKnownIdentities,
} from './well-known.js/index.js';

console.log('***alice-trade worker');

/**
 * @param {import('./ag-trade.js').QueryTool} vstorage
 * @param {import('./ag-trade.js').SmartWallet} wallet
 */
export const alice = async (vstorage, wallet) => {
  /**
   * @param {string|number} id
   * @param {Amount} beansAmount
   * @param {Amount} cowsAmount
   * @param {string} depositAddress
   * @param {boolean} [alicePays]
   */
  const trade = async (
    id,
    beansAmount,
    cowsAmount,
    depositAddress,
    alicePays = true,
  ) => {
    mustMatch(
      harden({ id, beansAmount, cowsAmount, depositAddress, alicePays }),
      harden({
        id: M.string(),
        beansAmount: AmountShape,
        cowsAmount: AmountShape,
        depositAddress: M.string(),
        alicePays: M.boolean(),
      }),
    );

    const wellKnown = await wellKnownIdentities(vstorage);

    const feeAmount = AmountMath.make(wellKnown.brand.IST, feeValue);

    const proposal = {
      give: { MagicBeans: beansAmount, Fee: feeAmount },
      want: {
        Cow: cowsAmount,
        ...(alicePays ? {} : { Refund: feeAmount }),
      },
    };

    /** @type {import('./ag-trade.js').OfferSpec} */
    const offerSpec = {
      id,
      invitationSpec: {
        source: 'contract',
        instance: wellKnown.instance[contractName],
        publicInvitationMaker: 'makeFirstInvitation',
        invitationArgs: [[wellKnown.issuer.BLD, wellKnown.issuer.IST]],
      },
      proposal,
      offerArgs: { addr: depositAddress },
    };

    return E(wallet).executeOffer(offerSpec);
  };

  return Far('Alice', {
    wellKnown: () => wellKnownIdentities(vstorage),
    trade,
  });
};

export const make = async powers => {
  /** @type {import('./ag-trade.js').SmartWalletKit} */
  const kit = await E(powers).request('HOST', 'wallet kit', 'wallet-kit');

  return alice(kit.query, kit.smartWallet);
};
