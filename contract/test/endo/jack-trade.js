// @ts-check
import { E, Far } from '@endo/far';
import { mustMatch, M } from '@endo/patterns';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';
import { AmountShape } from '@agoric/ertp/src/typeGuards.js';

import {
  feeValue,
  wellKnownIdentities,
  contractName,
} from './well-known.js/index.js';

/**
 * @param {import('./ag-trade.js').QueryTool} vstorage
 * @param {import('./ag-trade.js').SmartWallet} wallet
 */
const jack = async (vstorage, wallet) => {
  /**
   * @param {string|number} id
   * @param {Amount} beansAmount
   * @param {Amount} cowsAmount
   * @param {boolean} [jackPays]
   */
  const trade = async (id, beansAmount, cowsAmount, jackPays = false) => {
    mustMatch(
      harden({ id, beansAmount, cowsAmount, jackPays }),
      harden({
        id: M.string(),
        beansAmount: AmountShape,
        cowsAmount: AmountShape,
        jackPays: M.boolean(),
      }),
    );
    const wellKnown = await wellKnownIdentities(vstorage);

    const feeAmount = AmountMath.make(wellKnown.brand.IST, feeValue);
    const proposal = {
      want: { MagicBeans: beansAmount },
      give: {
        Cow: cowsAmount,
        ...(jackPays ? { Refund: feeAmount } : {}),
      },
    };

    /** @type {import('./ag-trade.js').OfferSpec} */
    const offerSpec = {
      id,
      invitationSpec: {
        source: 'purse',
        instance: wellKnown.instance[contractName],
        description: 'matchOffer',
      },
      proposal,
    };

    return E(wallet).executeOffer(offerSpec);
  };

  return Far('Jack', { wellKnown: () => wellKnownIdentities(vstorage), trade });
};

export const make = async powers => {
  /** @type {import('./ag-trade.js').SmartWalletKit} */
  const kit = await E(powers).request(
    'HOST',
    'smartWallet kit for alice',
    'walletKit',
  );

  return jack(kit.query, kit.smartWallet);
};
