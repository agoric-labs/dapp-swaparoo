/** @file swap assets */
/* eslint @typescript-eslint/no-floating-promises: "warn" */

// deep import to avoid dependency on all of ERTP, vat-data
import { AmountShape } from '@agoric/ertp/src/typeGuards.js';
import { AmountMath, AssetKind } from '@agoric/ertp/src/amountMath.js';
import { M, getCopyBagEntries } from '@endo/patterns';
import { E, Far } from '@endo/far';
import '@agoric/zoe/exported.js';
import { atomicRearrange } from '@agoric/zoe/contractSupport/zoeHelpers.js';

import { makeScalarBigMapStore } from '@agoric/vat-data';

import { makeTracer } from './debug.js';

const { Fail, quote: q } = assert;

const trace = makeTracer('Swaparoo', true);

/** @type {Swap} */
export const swapWithFee = (zcf, firstSeat, secondSeat, feeSeat, feeAmount) => {
  try {
    const { Fee: _, ...firstGive } = firstSeat.getProposal().give;
    atomicRearrange(zcf,
      harden([
        [firstSeat, secondSeat, firstGive]
        [secondSeat, firstSeat, secondSeat.getProposal().give],
        [firstSeat, feeSeat, { Fee: feeAmount }],
      ]),
    );
  } catch (err) {
    firstSeat.fail(err);
    secondSeat.fail(err);
    throw err;
  }

  firstSeat.exit();
  secondSeat.exit();
  return defaultAcceptanceMsg;
};


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

    const makeSecondProposalShape = want => {
      return M.splitRecord({
        give: M.splitRecord(Object.fromEntries(new Map(Object.keys(want).map(k => [k])))),
      });
    };

    const secondSeatInvitation = zcf.makeInvitation(
      secondSeatOfferHandler,
      'matchOffer',
      { give, want }, // "give" and "want" are from the proposer's perspective
      makeSecondProposalShape(want),
    );

    return secondSeatInvitation;
  };

  // returns an offer to create a specific swap
  const makeFirstInvitation = (issuers) => {
    issuers.forEach(i => zcf.addIssuer(i)); // TODO cleanup
    const proposalShape = M.splitRecord({
      give: M.splitRecord({ Fee: feeShape }),
    });
    return zcf.makeInvitation(makeSecondInvitation, 'create a swap', proposalShape);
  };

  const publicFacet = Far('API', {
    makeFirstInvitation,
  });
  return harden({ publicFacet });
};
harden(start);
