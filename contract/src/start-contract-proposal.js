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
    consume: { agoricNames, chainStorage, startUpgradable, zoe },
    // brand: {
    //   // @ts-expect-error dynamic extension to promise space
    //   produce: { Place: producePlaceBrand },
    // },
    // issuer: {
    //   // @ts-expect-error dynamic extension to promise space
    //   produce: { Place: producePlaceIssuer },
    // },
    instance: {
      // @ts-expect-error dynamic extension to promise space
      produce: { [contractName]: produceInstance },
    },
  } = permittedPowers;

  const istBrand = await E(agoricNames).lookup('brand', 'IST');
  const ist = {
    brand: istBrand,
  };
  // NOTE: TODO all terms for the contract go here
  const terms = {};

  // agoricNames gets updated each time; the promise space only once XXXXXXX
  const installation = await E(agoricNames).lookup('installation', contractName);

  const { instance } = await E(startUpgradable)({
    installation,
    label: contractName,
    terms,
  });
  console.log('CoreEval script: started game contract', instance);
  // const {} = await E(zoe).getTerms(instance);

  console.log('CoreEval script: share via agoricNames: none');

  produceInstance.reset();
  produceInstance.resolve(instance);

  console.log(`${contractName} (re)installed`);
};

/** @type { import("@agoric/vats/src/core/lib-boot").BootstrapManifest } */
const contractManifest = {
  [startContract.name]: {
    consume: {
      agoricNames: true,
      // board: true, // to publish boardAux info for the contract
      chainStorage: true, // to publish boardAux info for contract
      startUpgradable: true, // to start contract and save adminFacet
      zoe: true, // to get contract terms, including issuer/brand
    },
    installation: { consume: { [contractName]: true } },
    // issuer: { produce: { Place: true } },
    // brand: { produce: { Place: true } },
    instance: { produce: { [contractName]: true } },
  },
};
harden(contractManifest);

export const getManifestForContract = ({ restoreRef }, { [`${contractName}Ref`]: contractRef }) => {
  return harden({
    manifest: contractManifest,
    installations: {
      [contractName]: restoreRef(contractRef),
    },
  });
};
