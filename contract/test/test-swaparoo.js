// @ts-check

/* eslint-disable import/order -- https://github.com/endojs/endo/issues/1235 */
import { test as anyTest } from './prepare-test-env-ava.js';
import url from 'url';

import bundleSource from '@endo/bundle-source';

import { E } from '@endo/far';
import { makeCopyBag } from '@endo/patterns';
import { AmountMath, AssetKind, makeIssuerKit } from '@agoric/ertp';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import centralSupplyBundle from '@agoric/vats/bundles/bundle-centralSupply.js';
import { mintStablePayment } from './mintStable.js';

/** @param {string} ref */
const asset = ref => url.fileURLToPath(new URL(ref, import.meta.url));

const contractPath = asset(`../src/swaparoo.js`);

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
// @ts-expect-error tolerate confusion
const test = anyTest;

const UNIT6 = 1_000_000n;
const CENT = UNIT6 / 100n;

/**
 * Facilities such as zoe are assumed to be available.
 */
const makeTestContext = async () => {
    const bundle = await bundleSource(contractPath);
    const { zoeService: zoe, feeMintAccess } = makeZoeKitForTest();

    const centralSupply = await zoe.install(centralSupplyBundle);

    const feeIssuer = await E(zoe).getFeeIssuer();

    /** @param {bigint} value */
    const feeFaucet = async value => {
        const pmt = await mintStablePayment(value, {
            centralSupply,
            feeMintAccess,
            zoe,
        });

        const purse = await E(feeIssuer).makeEmptyPurse();
        await purse.deposit(pmt);
        return purse;
    };

    const cowIssuerKit = makeIssuerKit('cows', AssetKind.COPY_BAG);
    const beanIssuerKit = makeIssuerKit('magic beans');


    return { zoe, bundle, faucet: feeFaucet, cowIssuerKit, beanIssuerKit };
};

test.before(async t => (t.context = await makeTestContext()));

test('basic swap', async t => {
    const { zoe, bundle, faucet, cowIssuerKit, beanIssuerKit } = t.context;

    /** as agreed by BLD staker governance */
    const startContract = async () => {
        const installation = await zoe.install(bundle);
        const feeIssuer = await E(zoe).getFeeIssuer();
        const feeBrand = await E(feeIssuer).getBrand();
        const feeAmount = AmountMath.make(feeBrand, 1n * UNIT6);
        const { instance } = await zoe.startInstance(
            installation,
            { Fee: feeIssuer },
            { feeAmount },
        );
        return instance;
    };

    const beans = x => AmountMath.make(beanIssuerKit.brand, x);
    const fiveBeans = beans(5n);

    const cowAmount = AmountMath.make(
        cowIssuerKit.brand,
        makeCopyBag([['Milky White', 1n]]));

    /**
     * @param {ERef<Instance>} instance
     */
    const startAlice = async (
        instance,
    ) => {
        const publicFacet = zoe.getPublicFacet(instance);
        // @ts-expect-error Promise<Instance> seems to work
        const terms = await E(zoe).getTerms(instance);
        const { issuers, brands, feeAmount } = terms;

        const proposal = {
            give: { MagicBeans: fiveBeans, Fee: feeAmount },
            want: {
                Cow: cowAmount,
            },
        };
        const toJoin = await E(publicFacet).makeFirstInvitation(Object.values([cowIssuerKit.issuer, beanIssuerKit.issuer]));

        const beanPayment = beanIssuerKit.mint.mintPayment(fiveBeans);
        const feePurse = faucet(1_000_000n);
        const feePayment = (await feePurse).withdraw(feeAmount)

        t.log('give', feeAmount);
        const seat = await zoe.offer(toJoin, proposal, {
            Fee: feePayment,
            MagicBeans: beanPayment,
        });
        const jackInvitation = await E(seat).getOfferResult();
        return { aliceSeat: seat, jackInvitation };
    };

    /**
     * @param {ERef<Instance>} instance
     */
    const startJack = async (
        instance,
        jackInvitation,
    ) => {
        const publicFacet = zoe.getPublicFacet(instance);
        // @ts-expect-error Promise<Instance> seems to work
        const terms = await E(zoe).getTerms(instance);
        const { issuers, brands, feeAmount } = terms;

        const fiveBeans = beans(5n);
        const proposal = {
            want: { MagicBeans: fiveBeans },
            give: {
                Cow: cowAmount,
            },
        };

        const cowPayment = cowIssuerKit.mint.mintPayment(cowAmount);

        const seat = await zoe.offer(jackInvitation, proposal, {
            Cow: cowPayment,
        });
        return seat;
    };

    const instance = startContract();
    const { aliceSeat, jackInvitation } = await startAlice(instance);
    const jackSeat = await startJack(instance, jackInvitation);

    const actualCow = await aliceSeat.getPayout('Cow');

    const actualCowAmount = await cowIssuerKit.issuer.getAmountOf(actualCow);
    t.log('cow payout', actualCowAmount);
    t.deepEqual(actualCowAmount, cowAmount);
    const actualBeans = await jackSeat.getPayout('MagicBeans');
    const actualBeansAmount = await beanIssuerKit.issuer.getAmountOf(actualBeans);
    t.log('bean payout', actualBeansAmount);
    t.deepEqual(actualBeansAmount, fiveBeans);
});

test('Jack Pays', async t => {
    const { zoe, bundle, faucet, cowIssuerKit, beanIssuerKit } = t.context;
    const feeIssuer = await E(zoe).getFeeIssuer();
    const feeBrand = await E(feeIssuer).getBrand();
    const feeAmount = AmountMath.make(feeBrand, 1n * UNIT6);

    /** as agreed by BLD staker governance */
    const startContract = async () => {
        const installation = await zoe.install(bundle);
        const { instance } = await zoe.startInstance(
            installation,
            { Fee: feeIssuer },
            { feeAmount },
        );
        return instance;
    };

    const beans = x => AmountMath.make(beanIssuerKit.brand, x);
    const fiveBeans = beans(5n);

    const cowAmount = AmountMath.make(
        cowIssuerKit.brand,
        makeCopyBag([['Milky White', 1n]]));

    /**
     * @param {ERef<Instance>} instance
     */
    const startAlice = async (
        instance,
    ) => {
        const publicFacet = zoe.getPublicFacet(instance);
        // @ts-expect-error Promise<Instance> seems to work
        const terms = await E(zoe).getTerms(instance);
        const { feeAmount } = terms;

        const proposal = {
            give: { MagicBeans: fiveBeans, Fee: feeAmount },
            want: { Cow: cowAmount, Refund: feeAmount },
        };
        const toJoin = await E(publicFacet).makeFirstInvitation(Object.values([cowIssuerKit.issuer, beanIssuerKit.issuer]));

        const beanPayment = beanIssuerKit.mint.mintPayment(fiveBeans);
        const feePurse = faucet(1_000_000n);
        const feePayment = (await feePurse).withdraw(feeAmount)

        t.log('give', feeAmount);
        const seat = await zoe.offer(toJoin, proposal, {
            Fee: feePayment,
            MagicBeans: beanPayment,
        });
        const jackInvitation = await E(seat).getOfferResult();
        return { aliceSeat: seat, jackInvitation };
    };

    /**
     * @param {ERef<Instance>} instance
     */
    const startJack = async (
        instance,
        jackInvitation,
    ) => {
        // @ts-expect-error Promise<Instance> seems to work
        const terms = await E(zoe).getTerms(instance);
        const { feeAmount } = terms;

        const feePurse = faucet(1_000_000n);
        const feePayment = (await feePurse).withdraw(feeAmount)
        const fiveBeans = beans(5n);
        const proposal = {
            want: { MagicBeans: fiveBeans },
            give: {
                Cow: cowAmount,
                Refund: feeAmount,
            },
        };

        const cowPayment = cowIssuerKit.mint.mintPayment(cowAmount);

        const seat = await zoe.offer(jackInvitation, proposal, {
            Cow: cowPayment, Refund: feePayment,
        });
        return seat;
    };

    const instance = startContract();
    const { aliceSeat, jackInvitation } = await startAlice(instance);
    const jackSeat = await startJack(instance, jackInvitation);

    const actualCow = await aliceSeat.getPayout('Cow');
    const actualAliceFee = await aliceSeat.getPayout('Refund');

    const actualCowAmount = await cowIssuerKit.issuer.getAmountOf(actualCow);
    const actualFeeAmount = await feeIssuer.getAmountOf(actualAliceFee);
    t.log('cow payout', actualCowAmount);
    t.deepEqual(actualCowAmount, cowAmount);
    t.deepEqual(actualFeeAmount, feeAmount);

    const {
        Cow: cPayout,
        MagicBeans: bPayout,
        Refund: rPayout,
    } = await jackSeat.getPayouts();
    const actualBeansAmount = await beanIssuerKit.issuer.getAmountOf(bPayout);
    const aliceCowAmount = await cowIssuerKit.issuer.getAmountOf(cPayout);
    const actualRefundAmount = await feeIssuer.getAmountOf(rPayout);
    t.log('bean payout', actualBeansAmount);
    t.deepEqual(actualBeansAmount, fiveBeans);
    t.deepEqual(aliceCowAmount, AmountMath.makeEmpty(cowIssuerKit.brand, AssetKind.COPY_BAG));
    t.deepEqual(actualRefundAmount, AmountMath.makeEmpty(feeBrand));
});
