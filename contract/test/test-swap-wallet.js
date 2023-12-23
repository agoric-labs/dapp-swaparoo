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
import {
  installContract,
  startContract,
} from '../src/start-contract-proposal.js';

/** @type {import('ava').TestFn<Awaited<ReturnType<makeTestContext>>>} */
const test = anyTest;

const myRequire = createRequire(import.meta.url);

const assets = {
  swaparoo: myRequire.resolve('../src/swaparoo.js'),
};
const contractName = 'swaparoo';

const makeTestContext = async t => {
  const bundleCache = await makeNodeBundleCache('bundles/', {}, s => import(s));

  return { bundleCache };
};

test.before(async t => (t.context = await makeTestContext(t)));

/**
 * Mock enough powers for startSwaparoo permit.
 * Plus access to load bundles, peek at vstorage, and mint IST.
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

  produce.zoe.resolve(zoe);
  produce.startUpgradable.resolve(startUpgradable);
  produce.feeMintAccess.resolve(feeMintAccess);
  produce.chainStorage.resolve(chainStorage);
  produce.namesByAddressAdmin.resolve(namesByAddressAdmin);
  spaces.issuer.produce.IST.resolve(feeIssuer);
  spaces.brand.produce.IST.resolve(feeBrand);
  const powers = { produce, consume, ...spaces };

  return { powers, vatAdminState, vstorageData: data };
};

test('bootstrap and start contract', async t => {
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
});
