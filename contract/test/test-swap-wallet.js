// @ts-check
import { test as anyTest } from '@agoric/zoe/tools/prepare-test-env-ava.js';
import { createRequire } from 'node:module';
import { E } from '@endo/far';
import { makeNodeBundleCache } from '@endo/bundle-source/cache.js';
import { makePromiseSpace, makeNameHubKit } from '@agoric/vats';
import { makeWellKnownSpaces } from '@agoric/vats/src/core/utils.js';
import { makeFakeVatAdmin } from '@agoric/zoe/tools/fakeVatAdmin.js';
import { makeZoeKitForTest } from '@agoric/zoe/tools/setup-zoe.js';
import { makeFakeStorageKit } from '@agoric/internal/src/storage-test-utils.js';
import { AmountMath, makeIssuerKit } from '@agoric/ertp';
import {
  installContract,
  startContract,
} from '../src/start-contract-proposal.js';
import { makeStableFaucet } from './mintStable.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
const test = anyTest;

const myRequire = createRequire(import.meta.url);

const assets = {
  swaparoo: myRequire.resolve('../src/swaparoo.js'),
};
const contractName = 'swaparoo';

const makeTestContext = async t => {
  const bundleCache = await makeNodeBundleCache('bundles/', {}, s => import(s));

  return { bundleCache, shared: {} };
};

test.before(async t => (t.context = await makeTestContext(t)));

/**
 * Mock enough powers for startSwaparoo permit.
 * Plus access to load bundles, peek at vstorage, and mint IST and BLD.
 *
 * @param {(...args: unknown[]) => void} log
 */
const mockBootstrap = async log => {
  const { produce, consume } = makePromiseSpace();
  const { admin, vatAdminState } = makeFakeVatAdmin();
  const { zoeService: zoe, feeMintAccess } = makeZoeKitForTest(admin);
  const feeIssuer = await E(zoe).getFeeIssuer();
  const feeBrand = await E(feeIssuer).getBrand();

  const { rootNode: chainStorage, data } = makeFakeStorageKit('published');

  const { nameAdmin: agoricNamesAdmin } = makeNameHubKit();
  const spaces = await makeWellKnownSpaces(agoricNamesAdmin, log, [
    'installation',
    'instance',
    'issuer',
    'brand',
  ]);

  const { nameAdmin: namesByAddressAdmin } = makeNameHubKit();

  const startUpgradable = ({
    installation,
    issuerKeywordRecord,
    terms,
    privateArgs,
    label,
  }) =>
    E(zoe).startInstance(
      installation,
      issuerKeywordRecord,
      terms,
      privateArgs,
      label,
    );

  const bldIssuerKit = makeIssuerKit('BLD', 'nat', { decimalPlaces: 6 });
  produce.bldIssuerKit.resolve(bldIssuerKit);
  produce.zoe.resolve(zoe);
  produce.startUpgradable.resolve(startUpgradable);
  produce.feeMintAccess.resolve(feeMintAccess);
  produce.chainStorage.resolve(chainStorage);
  produce.namesByAddressAdmin.resolve(namesByAddressAdmin);
  spaces.issuer.produce.IST.resolve(feeIssuer);
  spaces.brand.produce.IST.resolve(feeBrand);
  spaces.issuer.produce.BLD.resolve(bldIssuerKit.issuer);
  spaces.brand.produce.BLD.resolve(bldIssuerKit.brand);

  const powers = { produce, consume, ...spaces };

  return { powers, vatAdminState, vstorageData: data };
};

test.serial('bootstrap and start contract', async t => {
  t.log('bootstrap');
  const { powers, vatAdminState } = await mockBootstrap(console.log);

  const { bundleCache } = t.context;
  const bundle = await bundleCache.load(assets.swaparoo, contractName);
  const bundleID = `b1-${bundle.endoZipBase64Sha512}`;
  t.log('publish bundle', bundleID.slice(0, 8));
  vatAdminState.installBundle(bundleID, bundle);

  t.log('install contract');
  const config = { options: { [contractName]: { bundleID } } };
  await installContract(powers, config); // `agoric run` style proposal does this for us
  t.log('start contract');
  await startContract(powers);

  const instance = await powers.instance.consume[contractName];
  t.log(instance);
  t.is(typeof instance, 'object');

  Object.assign(t.context.shared, { powers });
});

/**
 * @param {{ zoe: ERef<ZoeService>, wellKnown: any }} context
 * @param {Amount} beansAmount
 * @param {Amount} cowsAmount
 * @param {string} depositAddress
 * @param {{ feePurse: ERef<Purse>, beansPurse: ERef<Purse> }} purses
 * @param {boolean} [alicePays]
 */
const startAlice = async (
  { zoe, wellKnown },
  beansAmount,
  cowsAmount,
  depositAddress,
  { feePurse, beansPurse },
  alicePays = true,
) => {
  const instance = wellKnown.instance[contractName];
  const publicFacet = E(zoe).getPublicFacet(instance);
  const terms = await E(zoe).getTerms(instance);
  const { feeAmount } = terms;
  console.log('alice found:', { feeAmount });

  const proposal = {
    give: { MagicBeans: beansAmount, Fee: feeAmount },
    want: {
      Cow: cowsAmount,
      ...(alicePays ? {} : { Refund: feeAmount }),
    },
  };

  const firstInvitation = await E(publicFacet).makeFirstInvitation([
    wellKnown.issuer.BLD,
    wellKnown.issuer.IST,
  ]);

  // TODO: factor out walletDriver. Clients don't handle purses.
  const beanPayment = await E(beansPurse).withdraw(beansAmount);
  const feePayment = await E(feePurse).withdraw(feeAmount);

  const seat = await E(zoe).offer(
    firstInvitation,
    proposal,
    {
      Fee: feePayment,
      MagicBeans: beanPayment,
    },
    { addr: depositAddress },
  );
  const offerResult = await E(seat).getOfferResult();
  return { aliceSeat: seat, offerResult };
};

/**
 * @param {{ zoe: ERef<ZoeService>, wellKnown: any }} context
 * @param {Amount} beansAmount
 * @param {Amount} cowsAmount
 * @param {{ feePurse: ERef<Purse>, invitationPurse: ERef<Purse>, cowPurse: ERef<Purse> }} purses
 * @param {boolean} [jackPays]
 */
const startJack = async (
  { zoe, wellKnown },
  beansAmount,
  cowsAmount,
  { feePurse, invitationPurse, cowPurse },
  jackPays = false,
) => {
  const instance = wellKnown.instance[contractName];
  const terms = await E(zoe).getTerms(instance);
  const { feeAmount } = terms;

  const proposal = {
    want: { MagicBeans: beansAmount },
    give: {
      Cow: cowsAmount,
      ...(jackPays ? { Refund: feeAmount } : {}),
    },
  };

  // TODO: factor out walletDriver. Clients don't handle purses.
  const cowPayment = await E(cowPurse).withdraw(cowsAmount);
  const feePayment = await E(feePurse).withdraw(feeAmount);
  let payments = {
    Cow: cowPayment,
    ...(jackPays ? { Refund: feePayment } : {}),
  };

  const invitationAmount = await E(invitationPurse).getCurrentAmount();
  const jackInvitation = await E(invitationPurse).withdraw(invitationAmount);

  return E(zoe).offer(jackInvitation, proposal, payments);
};

let acctSerial = 0;

const provisionAcct = async powers => {
  const DEPOSIT_FACET_KEY = 'depositFacet';
  const { zoe, namesByAddressAdmin } = powers.consume;
  const depositAddress = `agoric1-deposit-${acctSerial++}`;

  const { nameAdmin: addressAdmin } = await E(namesByAddressAdmin).provideChild(
    depositAddress,
    [DEPOSIT_FACET_KEY],
  );

  const invitationPurse = await E(
    E(zoe).getInvitationIssuer(),
  ).makeEmptyPurse();
  const depositFacet = await E(invitationPurse).getDepositFacet();
  await E(addressAdmin).default(DEPOSIT_FACET_KEY, depositFacet);
  return { invitationPurse, addressAdmin, depositAddress };
};

test.serial('basic swap', async t => {
  const ONE_IST = 1_000_000n;
  const DEPOSIT_ADDRESS = 'agoric1DE6O517_ADD4';

  const {
    shared: { powers },
    bundleCache,
  } = t.context;
  // A higher fidelity test would get these from vstorage
  const wellKnown = {
    brand: {
      IST: await powers.brand.consume.IST,
      BLD: await powers.brand.consume.BLD,
    },
    issuer: {
      IST: await powers.issuer.consume.IST,
      BLD: await powers.issuer.consume.BLD,
    },
    instance: {
      [contractName]: await powers.instance.consume[contractName],
    },
  };

  const beans = x => AmountMath.make(wellKnown.brand.IST, x);
  const fiveBeans = beans(5n);

  const cowAmount = AmountMath.make(
    wellKnown.brand.BLD,
    //   makeCopyBag([['Milky White', 1n]]),
    10n,
  );

  const { zoe, feeMintAccess, bldIssuerKit } = powers.consume;
  const terms = await E(zoe).getTerms(wellKnown.instance[contractName]);
  const { faucet } = makeStableFaucet({ bundleCache, feeMintAccess, zoe });
  const bldPurse = E(E.get(bldIssuerKit).issuer).makeEmptyPurse();
  await E(bldPurse).deposit(
    await E(E.get(bldIssuerKit).mint).mintPayment(cowAmount),
  );
  //   const context = { ...t.context, instance, ...terms };
  //   const { invitationPurse, depositAddress } = await setupDepositFacet(context);

  const { depositAddress, invitationPurse } = await provisionAcct(powers);

  const { aliceSeat } = await startAlice(
    { zoe, wellKnown },
    fiveBeans,
    cowAmount,
    // Alice knows Jack's address
    depositAddress,
    { feePurse: faucet(ONE_IST), beansPurse: faucet(fiveBeans.value) },
  );

  t.log(aliceSeat);
  const aliceResult = await aliceSeat.getOfferResult();
  t.is(aliceResult, 'invitation sent');

  const cowPurse = E(wellKnown.issuer.BLD).makeEmptyPurse();
  await E(cowPurse).deposit(
    await E(E.get(bldIssuerKit).mint).mintPayment(cowAmount),
  );
  const jackSeat = await startJack({ zoe, wellKnown }, fiveBeans, cowAmount, {
    feePurse: faucet(ONE_IST),
    invitationPurse,
    cowPurse,
  });

  const actualCow = await aliceSeat.getPayout('Cow');

  const actualCowAmount = await E(wellKnown.issuer.BLD).getAmountOf(actualCow);
  t.deepEqual(actualCowAmount, cowAmount);
  const actualBeans = await jackSeat.getPayout('MagicBeans');
  const actualBeansAmount = await E(wellKnown.issuer.IST).getAmountOf(
    actualBeans,
  );
  t.deepEqual(actualBeansAmount, fiveBeans);
});
