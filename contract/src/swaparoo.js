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
  const { brand: feeBrand } = await zcf.saveIssuer(stableIssuer, 'Fee');
  const { zcfSeat: feeSeat } = zcf.makeEmptySeatKit();
  const feeShape = makeNatAmountShape(feeBrand, 1_000_000n);

  /** @type {OfferHandler} */
  const makeSecondInvitation = (firstSeat, id) => {
    const { want, give } = firstSeat.getProposal();

    /** @type {OfferHandler} */
    const secondSeatOfferHandler = secondSeat => {
      try {
        const swapResult = swap(zcf, firstSeat, secondSeat);
        firstSeat.exit('completed swap');
        secondSeat.exit('completed swap');
        return swapResult;
      } catch (e) {
        firstSeat.fail('aborted');
        secondSeat.fail('aborted');
        throw (e);
      };
    };

    const makeSecondProposalShape = (give, want) => {
      return M.any(); // XXX do better
    };

    const secondSeatInvitation = zcf.makeInvitation(
      secondSeatOfferHandler,
      'matchOffer',
      { give, want }, // "give" and "want" are from the proposer's perspective
      makeSecondProposalShape(give, want),
    );

    return secondSeatInvitation;
  };

  // returns an offer to create a specific swap
  const makeFirstInvitation = (issuers) => {
    issuers.forEach(i => zcf.addIssuer(i)); // TODO cleanup
    const proposalShape = M.splitRecord({
      give: M.splitRecord({ fee: feeShape }),
    });
    return zcf.makeInvitation(makeSecondInvitation, 'create a swap', proposalShape);
  };

  const publicFacet = Far('API', {
    makeFirstInvitation,
  });
  return harden({ publicFacet });
};
harden(start);
