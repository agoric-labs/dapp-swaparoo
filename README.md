# Agoric App Starter: Swaparoo

This is a simple app for the [Agoric smart contract platform](https://docs.agoric.com/).

The contract lets you give a small amount of [IST](https://inter.trade/) in exchange for
a few NFTs that represent places in a hypothetical game.

The UI is a React app started with the [vite](https://vitejs.dev/) `react-ts` template.
On top of that, we add

- Watching [blockchain state queries](https://docs.agoric.com/guides/getting-started/contract-rpc.html#querying-vstorage)
- [Signing and sending offers](https://docs.agoric.com/guides/getting-started/contract-rpc.html#signing-and-broadcasting-offers)

## Getting started: Deploy to Local Blockchain

Prerequisites: [Agoric SDK](https://docs.agoric.com/guides/getting-started/), `docker-compose`.

Build the contract and a proposal to start it in the /ui directory:

```sh
yarn build:contract
yarn build:proposal
```

`build:proposal` ends with **You can now run a governance submission command
like** and **Remember to install bundles before submitting the proposal**. You
can do that once you've started the chain and connected a wallet.


### Start local chain using docker-compose:

```sh
yarn start:docker
yarn docker:logs
```

The second command will consume this terminal to log the chain's behavior.

### install bundles and run coreeval

We need some IST to pay for contract bundle installation. (We end up
needing to run `mint4k` at least three times.)

```sh
yarn make:help
yarn docker:make balance-q
yarn docker:make mint4k
yarn docker:make balance-q
```

You can install the bundles using the cosgov tool: https://cosgov.org/. The tool
has a few tabs. The first one to use is **Install Bundle**, which lets you
install using drag-and-drop or a file picker. Add the bundles (They're in
$HOME/.agoric/cache/) to the tool, then click on **Sign & Submit**. If it says
you don't have sufficient funds, use the `mint4k` command above again.


Then choose the **CoreEval Proposal** tab of the cosgov tool. Drag or use a file
picker to add each of `contract/start-contract.js` and
`contract/start-contract-permit.js` (one at a time) into appropriate boxes, add
a title and description, then hit **Sign & Submit**. A pop-up will appear and
tell you the proposal number that was submitted. You then have 10 seconds to  

### Smart Wallet

Open https://wallet.agoric.app/wallet/. For demos and debugging, you probably
want to use the gear icon in the upper right to specify a local network. If you
don't have a Keplr wallet configured, it's easiest to use the ones already
configured for the docker environment. They are printed out by the `docker:bash`
command below. Copy the 24 words for **user1**, and use them to initialize a new
wallet in keplr. (**add wallet**, then **Import an existing wallet**)

### Bring up the UI
Prerequisites: `node`, `yarn`

In the `ui` directory:

```sh
yarn
yarn dev
```

This will start up the dapp on a local port. Copy the URL into a browser to
interact with it. This will also consume this terminal window, and monitor the
dApp's code, so if the UI code changes, it will be updated.

### Run a shell under Docker
To explore in the container where the node runs:

```sh
yarn docker:bash
agd query vstorage children published.priceFeed
```
