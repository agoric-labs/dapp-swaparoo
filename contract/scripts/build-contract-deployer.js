/**
 * @file Proposal Builder: Start Game with non-vbank Place NFT asset
 *
 * Usage:
 *   agoric run build-contract-deployer.js
 */

import { makeHelpers } from '@agoric/deploy-script-support';
import { getManifestForContract } from '../src/start-contract-proposal.js';

const contractName = 'swaparoo';

/** @type {import('@agoric/deploy-script-support/src/externalTypes.js').ProposalBuilder} */
export const contractProposalBuilder = async ({ publishRef, install }) => {
  return harden({
    sourceSpec: '../src/start-contract-proposal.js',
    getManifestCall: [
      getManifestForContract.name,
      {
        [`${contractName}Ref`]: publishRef(
          install(
            '../src/swaparoo.js',
            '../bundles/bundle-contract.js',
            { persist: true },
          ),
        ),
      },
    ],
  });
};

/** @type {DeployScriptFunction} */
export default async (homeP, endowments) => {
  const { writeCoreProposal } = await makeHelpers(homeP, endowments);
  await writeCoreProposal('start-contract', contractProposalBuilder);
};
