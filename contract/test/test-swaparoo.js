// @ts-check

/* eslint-disable import/order -- https://github.com/endojs/endo/issues/1235 */
import {test as anyTest} from './prepare-test-env-ava.js';
import url from 'url';

import bundleSource from '@endo/bundle-source';

import {E} from '@endo/far';
import {makeCopyBag} from '@endo/patterns';
import {AmountMath, AssetKind, makeIssuerKit} from '@agoric/ertp';
import {makeZoeKitForTest} from '@agoric/zoe/tools/setup-zoe.js';
import centralSupplyBundle from '@agoric/vats/bundles/bundle-centralSupply.js';
import {mintStablePayment} from './mintStable.js';

/** @param {string} ref */
const asset = ref => url.fileURLToPath(new URL(ref, import.meta.url));

const contractPath = asset(`../src/swaparoo.js`);

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
const test = anyTest;

const ONE_IST = 1_000_000n;

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

const startAlice = async (context, beansAmount, cowsAmount, alicePays = true) => {
    const { zoe, instance, beanIssuerKit, faucet, cowIssuerKit } = context;
    const publicFacet = zoe.getPublicFacet(instance);
    const terms = await E(zoe).getTerms(instance);
    const { feeAmount } = terms;

    const proposal = {
        give: { MagicBeans: beansAmount, Fee: feeAmount },
        want: {
            Cow: cowsAmount,
            ...(alicePays ? {} : { Refund: feeAmount }),
        },
    };

    const firstInvitation = await E(publicFacet).makeFirstInvitation(
      [cowIssuerKit.issuer, beanIssuerKit.issuer],
    );

    const beanPayment = beanIssuerKit.mint.mintPayment(beansAmount);
    const feePurse = faucet(ONE_IST);
    const feePayment = (await feePurse).withdraw(feeAmount)

    const seat = await zoe.offer(firstInvitation, proposal, {
        Fee: feePayment,
        MagicBeans: beanPayment,
    });
    const jackInvitation = await E(seat).getOfferResult();
    return { aliceSeat: seat, jackInvitation };
};

const startJack = async (ctx, jackInvitation, beansAmount, cowsAmount, jackPays = false) => {
    const { zoe, instance, faucet, cowIssuerKit } = ctx;
    const terms = await E(zoe).getTerms(instance);
    const { feeAmount } = terms;

    const feePurse = faucet(ONE_IST);
    const proposal = {
        want: { MagicBeans: beansAmount },
        give: {
            Cow: cowsAmount,
            ...(jackPays ? { Refund: feeAmount } : {}),
        },
    };

    const cowPayment = cowIssuerKit.mint.mintPayment(cowsAmount);
    const feePayment = (await feePurse).withdraw(feeAmount)
    let payments = {
        Cow: cowPayment,
        ...(jackPays ? { Refund: feePayment } : {}),
    };
    return await zoe.offer(jackInvitation, proposal, payments);
};


test.before(async t => (t.context = await makeTestContext()));

test('basic swap', async t => {
    const { zoe, bundle, faucet, cowIssuerKit, beanIssuerKit } = t.context;

    /** as agreed by BLD staker governance */
    const startContract = async () => {
        const installation = await zoe.install(bundle);
        const feeIssuer = await E(zoe).getFeeIssuer();
        const feeBrand = await E(feeIssuer).getBrand();
        const feeAmount = AmountMath.make(feeBrand, ONE_IST);
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

    const instance = await startContract();
    const terms = await E(zoe).getTerms(instance);
    const context = { ...t.context, instance, ...terms };

    const { aliceSeat, jackInvitation } = await startAlice(context, fiveBeans, cowAmount);
    const jackSeat = await startJack(context, jackInvitation, fiveBeans, cowAmount);

    const actualCow = await aliceSeat.getPayout('Cow');

    const actualCowAmount = await cowIssuerKit.issuer.getAmountOf(actualCow);
    t.deepEqual(actualCowAmount, cowAmount);
    const actualBeans = await jackSeat.getPayout('MagicBeans');
    const actualBeansAmount = await beanIssuerKit.issuer.getAmountOf(actualBeans);
    t.deepEqual(actualBeansAmount, fiveBeans);
});

test('Jack Pays', async t => {
    const { zoe, bundle, faucet, cowIssuerKit, beanIssuerKit } = t.context;
    const feeIssuer = await E(zoe).getFeeIssuer();
    const feeBrand = await E(feeIssuer).getBrand();
    const feeAmount = AmountMath.make(feeBrand, ONE_IST);

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

    const instance = await startContract();
    const terms = await E(zoe).getTerms(instance);
    const context = { ...t.context, instance, ...terms };

    const { aliceSeat, jackInvitation } = await startAlice(context, fiveBeans, cowAmount, false);
    const jackSeat = await startJack(context, jackInvitation, fiveBeans, cowAmount, true);

    const actualCow = await aliceSeat.getPayout('Cow');
    const actualAliceFee = await aliceSeat.getPayout('Refund');

    const actualCowAmount = await cowIssuerKit.issuer.getAmountOf(actualCow);
    const actualFeeAmount = await feeIssuer.getAmountOf(actualAliceFee);
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
    t.deepEqual(actualBeansAmount, fiveBeans);
    t.deepEqual(aliceCowAmount, AmountMath.makeEmpty(cowIssuerKit.brand, AssetKind.COPY_BAG));
    t.deepEqual(actualRefundAmount, AmountMath.makeEmpty(feeBrand));
});

test('Neither Pays', async t => {
    const { zoe, bundle, cowIssuerKit, beanIssuerKit } = t.context;
    const feeIssuer = await E(zoe).getFeeIssuer();
    const feeBrand = await E(feeIssuer).getBrand();
    const feeAmount = AmountMath.make(feeBrand, ONE_IST);

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

    const instance = await startContract();
    const terms = await E(zoe).getTerms(instance);
    const context = { ...t.context, instance, ...terms };

    const { aliceSeat, jackInvitation } = await startAlice(context, fiveBeans, cowAmount, false);

    const jackSeat = await startJack(context, jackInvitation, fiveBeans, cowAmount, false);
    t.falsy(await jackSeat.getOfferResult());

    const alicePayouts = await aliceSeat.getPayouts();
    const aliceCowAmount = await cowIssuerKit.issuer.getAmountOf(alicePayouts.Cow);
    const aliceBeansAmount = await beanIssuerKit.issuer.getAmountOf(alicePayouts.MagicBeans);
    const aliceRefundAmount = await feeIssuer.getAmountOf(alicePayouts.Refund);
    const aliceFeeAmount = await feeIssuer.getAmountOf(alicePayouts.Fee);
    t.deepEqual(aliceBeansAmount, fiveBeans);
    t.deepEqual(aliceCowAmount, AmountMath.makeEmpty(cowIssuerKit.brand, AssetKind.COPY_BAG));
    t.deepEqual(aliceRefundAmount, AmountMath.makeEmpty(feeBrand));
    t.deepEqual(aliceFeeAmount, feeAmount);

    const jackPayouts = await jackSeat.getPayouts();
    t.falsy(jackPayouts.Refund);
    t.falsy(jackPayouts.Fee);
    const jackCowAmount = await cowIssuerKit.issuer.getAmountOf(jackPayouts.Cow);
    const jackBeansAmount = await beanIssuerKit.issuer.getAmountOf(jackPayouts.MagicBeans);
    t.deepEqual(jackBeansAmount, beans(0n));
    t.deepEqual(jackCowAmount, cowAmount);
});

test.todo('re-add issuers');
test.todo('mis-matched offers');
test.todo('Owner collects fees');
