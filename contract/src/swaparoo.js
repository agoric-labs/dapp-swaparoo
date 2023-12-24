/** @file swap assets */
/* eslint @typescript-eslint/no-floating-promises: "warn" */
// @ts-check

import { M, matches } from '@endo/patterns';
import { E, Far } from '@endo/far';
import '@agoric/zoe/exported.js';
import { atomicRearrange } from '@agoric/zoe/src/contractSupport/atomicTransfer.js';
import '@agoric/zoe/src/contracts/exported.js';
import { makeCollectFeesInvitation } from './collectFees.js';

import { makeTracer } from './debug.js';

const { quote: q } = assert;

const trace = makeTracer('Swaparoo', true);

const makeNatAmountShape = (brand, min) =>
  harden({ brand, value: min ? M.gte(min) : M.nat() });

export const swapWithFee = (zcf, firstSeat, secondSeat, feeSeat, feeAmount) => {
  try {
    const { Fee: _, ...firstGive } = firstSeat.getProposal().give;

    atomicRearrange(
      zcf,
      harden([
        [firstSeat, secondSeat, firstGive],
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
  return 'success';
};

let issuerNumber = 1;

/**
 * ref https://github.com/Agoric/agoric-sdk/issues/8408#issuecomment-1741445458
 *
 * @param {ERef<import('@agoric/vats').NameAdmin>} namesByAddressAdmin
 * @param namesByAddressAdminP
 */
const fixHub = async namesByAddressAdmin => {
  /** @type {import('@agoric/vats').NameHub} */
  // @ts-expect-error mock. no has, keys, ...
  const hub = Far('Hub work-around', {
    lookup: async (addr, key, ...rest) => {
      if (!(addr && key && rest.length === 0)) {
        throw Error('unsupported');
      }
      await E(namesByAddressAdmin).reserve(addr);
      const addressAdmin = await E(namesByAddressAdmin).lookupAdmin(addr);
      assert(addressAdmin, 'no admin???');
      await E(addressAdmin).reserve(key);
      const addressHub = E(addressAdmin).readonly();
      return E(addressHub).lookup(key);
    },
  });
  return hub;
};

/**
 * @param {ZCF<{feeAmount: Amount<'nat'>, namesByAddressAdmin: NamesByAddressAdmin}>} zcf
 */
export const start = async zcf => {
  // set up fee handling
  const { feeAmount, namesByAddressAdmin } = zcf.getTerms();
  /** @type { ERef<Issuer<"nat">> } */
  const stableIssuer = await E(zcf.getZoeService()).getFeeIssuer();
  const feeBrand = await E(stableIssuer).getBrand();
  const { zcfSeat: feeSeat } = zcf.makeEmptySeatKit();
  const feeShape = makeNatAmountShape(feeBrand, 1_000_000n);
  const depositFacetFromAddr = fixHub(namesByAddressAdmin);

  /** @type {OfferHandler} */
  const makeSecondInvitation = async (
    firstSeat,
    { addr: secondPartyAddress },
  ) => {
    const { want, give } = firstSeat.getProposal();

    const makeSecondProposalShape = want => {
      const givePattern = Object.fromEntries(
        Object.keys(want).map(k => [k, M.any()]),
      );

      return M.splitRecord({
        give: M.splitRecord(givePattern),
      });
    };

    /** @type {OfferHandler} */
    const secondSeatOfferHandler = secondSeat => {
      if (!matches(secondSeat.getProposal(), makeSecondProposalShape(want))) {
        // The second invitation was burned; let them both know it didn't work
        const error = Error(
          `Proposals didn't match, first want: ${q(want)}, second give: ${q(
            secondSeat.getProposal().give,
          )}`,
        );
        secondSeat.fail(error);
        firstSeat.fail(error);
        return;
      }

      return swapWithFee(zcf, firstSeat, secondSeat, feeSeat, feeAmount);
    };

    const secondSeatInvitation = await zcf.makeInvitation(
      secondSeatOfferHandler,
      'matchOffer',
      { give, want }, // "give" and "want" are from the proposer's perspective
    );

    const secondDepositFacet = await E(depositFacetFromAddr).lookup(
      secondPartyAddress,
      'depositFacet',
    );

    await E(secondDepositFacet).receive(secondSeatInvitation);
    return 'invitation sent';
  };

  /**
   * returns an offer to create a specific swap
   *
   * @param {Issuer[]} issuers
   */
  const makeFirstInvitation = issuers => {
    issuers.forEach(i => {
      if (!Object.values(zcf.getTerms().issuers).includes(i)) {
        return zcf.saveIssuer(i, `Issuer${issuerNumber++}`);
      }
    });
    const proposalShape = M.splitRecord({
      give: M.splitRecord({ Fee: feeShape }),
    });

    const firstInvitation = zcf.makeInvitation(
      makeSecondInvitation,
      'create a swap',
      undefined,
      proposalShape,
    );
    return firstInvitation;
  };

  const publicFacet = Far('Public', {
    makeFirstInvitation,
  });
  const creatorFacet = Far('Creator', {
    makeCollectFeesInvitation() {
      return makeCollectFeesInvitation(zcf, feeSeat, feeBrand, 'Fee');
    },
  });

  return harden({ publicFacet, creatorFacet });
};
harden(start);
