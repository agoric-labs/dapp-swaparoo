/** @file swap assets */
/* eslint @typescript-eslint/no-floating-promises: "warn" */

// deep import to avoid dependency on all of ERTP, vat-data
import { AmountShape } from '@agoric/ertp/src/typeGuards.js';
import { AmountMath, AssetKind } from '@agoric/ertp/src/amountMath.js';
import { M, getCopyBagEntries } from '@endo/patterns';
import { E, Far } from '@endo/far';
import '@agoric/zoe/exported.js';
import { swap } from '@agoric/zoe/contractSupport/zoeHelpers.js';

import { makeScalarBigMapStore } from '@agoric/vat-data';

import { makeTracer } from './debug.js';

const { Fail, quote: q } = assert;

const trace = makeTracer('Swaparoo', true);

/**
 * @param {ZCF<{joinPrice: Amount}>} zcf
 */
export const start = async zcf => {
  // set up fee handling
  const { joinPrice } = zcf.getTerms();
  const stableIssuer = await E(zcf.getZoeService()).getFeeIssuer();
  zcf.saveIssuer(stableIssuer, 'Fee');
  const { zcfSeat: feeSeat } = zcf.makeEmptySeatKit();

  /** @type {OfferHandler} */
  const makeMatchingInvitation = (firstSeat, id) => {
    const { want, give } = firstSeat.getProposal();

    /** @type {OfferHandler} */
    const matchingSeatOfferHandler = matchingSeat => {
      try {
        const swapResult = swap(zcf, firstSeat, matchingSeat);
        firstSeat.exit('completed swap');
        matchingSeat.exit('completed swap');
        return swapResult;
      } catch (e) {
        firstSeat.fail('aborted');
        matchingSeat.fail('aborted');
        throw (e);
      };
    };

    const matchingSeatInvitation = zcf.makeInvitation(
      matchingSeatOfferHandler,
      'matchOffer',
      { give, want }, // "give" and "want" are from the proposer's perspective
      counterpartyProposalShape,
    );

    return matchingSeatInvitation;
  };

  // returns an offer to create a specific swap
  const makeSwapInvitation = (issuers) => {
    issuers.forEach(i => zcf.addIssuer(i)); // TODO cleanup

    return zcf.makeInvitation(makeMatchingInvitation, 'create a swap'); // XXX need the shape?
  };

  const joinShape = harden({
    give: { Price: AmountShape },
    want: { Places: AmountShape },
    exit: M.any(),
  });

  const publicFacet = Far('API', {
    makeSwapInvitation,
  });
  return harden({ publicFacet });
};
harden(start);
