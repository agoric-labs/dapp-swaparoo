// @ts-check
import { E } from '@endo/far';

export const contractName = 'swaparoo';

export const UNIT6 = 1_000_000n;

// Let's presume the terms are in vstorage somewhere... say... boardAux
export const feeValue = 1n * UNIT6;

const { entries, fromEntries } = Object;

/** @type { <T extends Record<string, ERef<any>>>(obj: T) => Promise<{ [K in keyof T]: Awaited<T[K]>}> } */
export const allValues = async obj => {
  const es = await Promise.all(
    entries(obj).map(([p, vp]) => Promise.resolve(vp).then(v => [p, v])),
  );
  return fromEntries(es);
};

// should be able to factor this out
// const agoricNames = E(vstorage).lookup('agoricNames');
/**
 * @param {import('./ag-trade').QueryTool} vstorage
 */
export const wellKnownIdentities = async vstorage =>
  allValues({
    instance: allValues({
      /** @type {Promise<Instance>} */
      [contractName]: E(vstorage).lookup(
        'agoricNames',
        'instance',
        contractName,
      ),
    }),
    installation: allValues({
      /** @type {Promise<Installation>} */
      [contractName]: E(vstorage).lookup(
        'agoricNames',
        'installation',
        contractName,
      ),
    }),
    brand: allValues({
      /** @type {Promise<Brand<'nat'>>} */
      IST: E(vstorage).lookup('agoricNames', 'brand', 'IST'),
      /** @type {Promise<Brand<'nat'>>} */
      BLD: E(vstorage).lookup('agoricNames', 'brand', 'BLD'),
    }),
    issuer: allValues({
      /** @type {Promise<Issuer<'nat'>>} */
      IST: E(vstorage).lookup('agoricNames', 'issuer', 'IST'),
      /** @type {Promise<Issuer<'nat'>>} */
      BLD: E(vstorage).lookup('agoricNames', 'issuer', 'BLD'),
    }),
  });
