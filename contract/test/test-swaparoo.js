// @ts-check

/* eslint-disable import/order -- https://github.com/endojs/endo/issues/1235 */
import { test as anyTest } from './prepare-test-env-ava.js';
import { createRequire } from 'node:module';
import { E } from '@endo/far';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';

import bundleSource from '@endo/bundle-source';

import { makeCopyBag } from '@endo/patterns';
import { AmountMath, AssetKind, makeIssuerKit } from '@agoric/ertp';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { makeNameHubKit } from '@agoric/vats';

import { makeStableFaucet } from './mintStable.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
const test = anyTest;

const myRequire = createRequire(import.meta.url);
const contractPath = myRequire.resolve('../src/swaparoo.js');
// const contractName = 'swaparoo';

const ONE_IST = 1_000_000n;
const DEPOSIT_ADDRESS = 'DE6O517_ADD4';
let depositAddress_incr = 0;

const DEPOSIT_FACET_KEY = 'depositFacet';

/** Facilities such as zoe are assumed to be available. */
const makeTestContext = async t => {
    const bundleCache = await makeNodeBundleCache('bundles/', {}, s => import(s));

    const bundle = await bundleSource(contractPath);
    const { zoeService: zoe, feeMintAccess } = makeZoeKitForTest();

    const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });

    const cowIssuerKit = makeIssuerKit('cows', AssetKind.COPY_BAG);
    const beanIssuerKit = makeIssuerKit('magic beans');

    const { nameAdmin } = makeNameHubKit();

    return { zoe, bundle, faucet, cowIssuerKit, beanIssuerKit, nameAdmin };
};

const setupDepositFacet = async context => {
    const { zoe, nameAdmin } = context;
    const depositAddress = `DEPOSIT_ADDRESS_${depositAddress_incr++}`;

    const { nameAdmin: addressAdmin } = await E(
        nameAdmin,
    ).provideChild(depositAddress, [DEPOSIT_FACET_KEY]);

    const invitationPurse =
        await E(E(zoe).getInvitationIssuer()).makeEmptyPurse();
    const depositFacet = await E(invitationPurse).getDepositFacet();
    await E(addressAdmin).default(
        DEPOSIT_FACET_KEY,
        depositFacet,
    );
    return { invitationPurse, addressAdmin, depositAddress };
};

/** as agreed by BLD staker governance */
const startContract = async (zoe, bundle, nameAdmin) => {
    const installation = await zoe.install(bundle);
    const feeIssuer = await E(zoe).getFeeIssuer();
    const feeBrand = await E(feeIssuer).getBrand();
    const feeAmount = AmountMath.make(feeBrand, ONE_IST);
    const { instance, creatorFacet } = await zoe.startInstance(
        installation,
        { Fee: feeIssuer },
        { feeAmount, namesByAddressAdmin: nameAdmin },
    );
    return { instance, creatorFacet };
};

const startAlice = async (context, beansAmount, cowsAmount, depositAddress, alicePays = true) => {
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
    },
        { addr: depositAddress },
    );
    const offerResult = await E(seat).getOfferResult();
    return { aliceSeat: seat, offerResult };
};

const startJack = async (ctx, beansAmount, cowsAmount, invitationPurse, jackPays = false) => {
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

    const invitationAmount = await E(invitationPurse).getCurrentAmount();
    const jackInvitation = await E(invitationPurse).withdraw(invitationAmount);

    return await zoe.offer(jackInvitation, proposal, payments);
};


test.before(async t => (t.context = await makeTestContext(t)));

test('basic swap', async t => {
    const { zoe, bundle, cowIssuerKit, beanIssuerKit, nameAdmin } = t.context;

    const beans = x => AmountMath.make(beanIssuerKit.brand, x);
    const fiveBeans = beans(5n);

    const cowAmount = AmountMath.make(
        cowIssuerKit.brand,
        makeCopyBag([['Milky White', 1n]]));

    const { instance } = await startContract(zoe, bundle, nameAdmin);
    const terms = await E(zoe).getTerms(instance);
    const context = { ...t.context, instance, ...terms };
    const { invitationPurse, depositAddress } = await setupDepositFacet(context);

    const { aliceSeat } = await startAlice(context, fiveBeans, cowAmount, depositAddress);
    const aliceResult = await aliceSeat.getOfferResult();
    t.is(aliceResult, 'invitation sent');

    const jackSeat = await startJack(context, fiveBeans, cowAmount, invitationPurse);

    const actualCow = await aliceSeat.getPayout('Cow');

    const actualCowAmount = await cowIssuerKit.issuer.getAmountOf(actualCow);
    t.deepEqual(actualCowAmount, cowAmount);
    const actualBeans = await jackSeat.getPayout('MagicBeans');
    const actualBeansAmount = await beanIssuerKit.issuer.getAmountOf(actualBeans);
    t.deepEqual(actualBeansAmount, fiveBeans);
});

test('Jack Pays', async t => {
    const { zoe, bundle, cowIssuerKit, beanIssuerKit, nameAdmin } = t.context;
    const feeIssuer = await E(zoe).getFeeIssuer();
    const feeBrand = await E(feeIssuer).getBrand();
    const feeAmount = AmountMath.make(feeBrand, ONE_IST);

    const beans = x => AmountMath.make(beanIssuerKit.brand, x);
    const fiveBeans = beans(5n);

    const cowAmount = AmountMath.make(
        cowIssuerKit.brand,
        makeCopyBag([['Milky White', 1n]]));

    const { instance } = await startContract(zoe, bundle, nameAdmin);
    const terms = await E(zoe).getTerms(instance);
    const context = { ...t.context, instance, ...terms };
    const { invitationPurse, depositAddress } = await setupDepositFacet(context);

    const { aliceSeat } = await startAlice(context, fiveBeans, cowAmount, depositAddress);
    const aliceResult = await aliceSeat.getOfferResult();
    t.is(aliceResult, 'invitation sent');

    const jackSeat = await startJack(context, fiveBeans, cowAmount, invitationPurse, true);

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
    const { zoe, bundle, cowIssuerKit, beanIssuerKit, nameAdmin } = t.context;
    const feeIssuer = await E(zoe).getFeeIssuer();
    const feeBrand = await E(feeIssuer).getBrand();
    const feeAmount = AmountMath.make(feeBrand, ONE_IST);

    const beans = x => AmountMath.make(beanIssuerKit.brand, x);
    const fiveBeans = beans(5n);

    const cowAmount = AmountMath.make(
        cowIssuerKit.brand,
        makeCopyBag([['Milky White', 1n]]));

    const { instance } = await startContract(zoe, bundle, nameAdmin);
    const terms = await E(zoe).getTerms(instance);
    const context = { ...t.context, instance, ...terms };
    const { invitationPurse, depositAddress } = await setupDepositFacet(context);

    const { aliceSeat } = await startAlice(context, fiveBeans, cowAmount, depositAddress, false);
    const aliceResult = await aliceSeat.getOfferResult();
    t.is(aliceResult, 'invitation sent');

    const jackSeat = await startJack(context, fiveBeans, cowAmount, invitationPurse, false);
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

test('re-add Issuers', async t => {
    const { zoe, bundle, cowIssuerKit, beanIssuerKit, nameAdmin } = t.context;

    const beans = x => AmountMath.make(beanIssuerKit.brand, x);

    const milkyWhiteAmount = AmountMath.make(
        cowIssuerKit.brand,
        makeCopyBag([['Milky White', 1n]]));
    const bessyAmount = AmountMath.make(
        cowIssuerKit.brand,
        makeCopyBag([['Bessy', 1n]]));

    const { instance, creatorFacet } = await startContract(zoe, bundle, nameAdmin);
    const terms = await E(zoe).getTerms(instance);
    const context = { ...t.context, instance, ...terms };
    const { invitationPurse, depositAddress } = await setupDepositFacet(context);

    const fiveBeans = beans(5n);
    const { aliceSeat } = await startAlice(context, fiveBeans, milkyWhiteAmount, depositAddress);
    const aliceResult = await aliceSeat.getOfferResult();
    t.is(aliceResult, 'invitation sent');

    const jackSeat = await startJack(context, fiveBeans, milkyWhiteAmount, invitationPurse);
    const actualCow = await aliceSeat.getPayout('Cow');

    const actualCowAmount = await cowIssuerKit.issuer.getAmountOf(actualCow);
    t.deepEqual(actualCowAmount, milkyWhiteAmount);
    const actualBeans = await jackSeat.getPayout('MagicBeans');
    const actualBeansAmount = await beanIssuerKit.issuer.getAmountOf(actualBeans);
    t.deepEqual(actualBeansAmount, fiveBeans);

    const fourBeans = beans(4n);
    const { aliceSeat: alice2ndSeat } = await startAlice(context, fourBeans, bessyAmount, depositAddress);
    const jack2ndSeat = await startJack(context, fourBeans, bessyAmount, invitationPurse);

    const actual2ndCow = await alice2ndSeat.getPayout('Cow');
    const actual2ndCowAmount = await cowIssuerKit.issuer.getAmountOf(actual2ndCow);
    t.deepEqual(actual2ndCowAmount, bessyAmount);
    const actual2ndBeans = await jack2ndSeat.getPayout('MagicBeans');
    const actual2ndBeansAmount = await beanIssuerKit.issuer.getAmountOf(actual2ndBeans);
    t.deepEqual(actual2ndBeansAmount, fourBeans);

    const feeIssuer = await E(zoe).getFeeIssuer();
    const feeBrand = await E(feeIssuer).getBrand();
    const feeInvitation = await E(creatorFacet).makeCollectFeesInvitation();
    const feeSeat = E(zoe).offer(feeInvitation);
    const pmt = await E.get(E(feeSeat).getPayouts()).Fee;
    const amt = await E(feeIssuer).getAmountOf(pmt);
    t.deepEqual(amt, AmountMath.make(feeBrand, 2n * ONE_IST));
});

test.todo('mis-matched offers');
