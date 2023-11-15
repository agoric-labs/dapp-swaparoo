// @ts-check
import { E } from '@endo/far';
import { makeMarshal } from '@endo/marshal';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';

console.warn('start-contract-proposal.js module evaluating');

const { Fail } = assert;

// vstorage paths under published.*
const BOARD_AUX = 'boardAux';

const marshalData = makeMarshal(_val => Fail`data only`);

const IST_UNIT = 1_000_000n;
const CENT = IST_UNIT / 100n;

/**
 * Make a storage node for auxilliary data for a value on the board.
 *
 * @param {ERef<StorageNode>} chainStorage
 * @param {string} boardId
 */
const makeBoardAuxNode = async (chainStorage, boardId) => {
  const boardAux = E(chainStorage).makeChildNode(BOARD_AUX);
  return E(boardAux).makeChildNode(boardId);
};

const publishBrandInfo = async (chainStorage, board, brand) => {
  const [id, displayInfo] = await Promise.all([
    E(board).getId(brand),
    E(brand).getDisplayInfo(),
  ]);
  const node = makeBoardAuxNode(chainStorage, id);
  const aux = marshalData.toCapData(harden({ displayInfo }));
  await E(node).setValue(JSON.stringify(aux));
};

const contractName = 'swaparoo';

/**
 * Core eval script to start contract
 *
 * @param {BootstrapPowers} permittedPowers
 */
export const startContract = async permittedPowers => {
  console.error('startContract()...');
  const {
    consume: { agoricNames, board, chainStorage, startUpgradable, zoe },
    brand: {
      // @ts-expect-error dynamic extension to promise space
      produce: { Place: producePlaceBrand },
    },
    issuer: {
      // @ts-expect-error dynamic extension to promise space
      produce: { Place: producePlaceIssuer },
    },
    instance: {
      // @ts-expect-error dynamic extension to promise space
      produce: { game1: produceInstance },
    },
  } = permittedPowers;

  const istBrand = await E(agoricNames).lookup('brand', 'IST');
  const ist = {
    brand: istBrand,
  };
  // NOTE: joinPrice could be configurable
  const terms = { joinPrice: AmountMath.make(ist.brand, 25n * CENT) };

  // agoricNames gets updated each time; the promise space only once XXXXXXX
  const installation = await E(agoricNames).lookup('installation', 'game1');

  const contractName = 'swaparoo';
  const { instance } = await E(startUpgradable)({
    installation,
    label: contractName,
    terms,
  });
  console.log('CoreEval script: started game contract', instance);
  const {
    brands: { Place: brand },
    issuers: { Place: issuer },
  } = await E(zoe).getTerms(instance);

  console.log('CoreEval script: share via agoricNames:', brand);

  produceInstance.reset();
  produceInstance.resolve(instance);

  producePlaceBrand.reset();
  producePlaceIssuer.reset();
  producePlaceBrand.resolve(brand);
  producePlaceIssuer.resolve(issuer);

  await publishBrandInfo(chainStorage, board, brand);
  console.log(`${contractName} (re)installed`);
};

/** @type { import("@agoric/vats/src/core/lib-boot").BootstrapManifest } */
const gameManifest = {
  [startContract.name]: {
    consume: {
      agoricNames: true,
      board: true, // to publish boardAux info for game NFT
      chainStorage: true, // to publish boardAux info for game NFT
      startUpgradable: true, // to start contract and save adminFacet
      zoe: true, // to get contract terms, including issuer/brand
    },
    installation: { consume: { [contractName]: true } },
    issuer: { produce: { Place: true } },
    brand: { produce: { Place: true } },
    instance: { produce: { [contractName]: true } },
  },
};
harden(gameManifest);

export const getManifestForContract = ({ restoreRef }, { game1Ref }) => {
  return harden({
    manifest: gameManifest,
    installations: {
      game1: restoreRef(game1Ref),
    },
  });
};
