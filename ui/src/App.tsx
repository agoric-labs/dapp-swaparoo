import { useEffect } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import agoricLogo from '/agoric.svg';
import './App.css';
import {
  makeAgoricChainStorageWatcher,
  AgoricChainStoragePathKind as Kind,
} from '@agoric/rpc';
import { create } from 'zustand';
import {
  makeAgoricWalletConnection,
  suggestChain,
} from '@agoric/web-components';
import { subscribeLatest } from '@agoric/notifier';
import { stringifyAmountValue } from '@agoric/ui-components';
import { makeCopyBag } from '@agoric/store';

type Wallet = Awaited<ReturnType<typeof makeAgoricWalletConnection>>;

export const contractName = 'swaparoo';
// const gov1 = 'agoric14t2eagaphnkj33l9hvcrf90t3xffkt0u3xy6uh';
const swappa = 'agoric13whlmf7akvmg05n3zx37v7r0htyasa4m28j9cu';
const recipientAddr = swappa;

const watcher = makeAgoricChainStorageWatcher(
  'http://localhost:26657',
  'agoriclocal'
);

interface CopyBag {
  payload: Array<[string, bigint]>;
}

interface Invitation {
  handle: unknown;
  instance: unknown;
  customDetails: { give: unknown, want: unknown };
}

interface Purse {
  brand: unknown;
  brandPetname: string;
  currentAmount: {
    brand: unknown;
    value: bigint | CopyBag;
  };
  displayInfo: {
    decimalPlaces: number;
    assetKind: unknown;
  };
}

interface AppState {
  wallet?: Wallet;
  contractInstance?: unknown;
  brands?: Array<[string, unknown]>;
  issuers?: Array<[string, unknown]>;
  purses?: Array<Purse>;
}

const useAppStore = create<AppState>(() => ({}));

const setup = async () => {
  watcher.watchLatest<Array<[string, unknown]>>(
    [Kind.Data, 'published.agoricNames.instance'],
    instances => {
      console.log('got instances', instances);
      useAppStore.setState({
        contractInstance: instances.find(([name]) => name === contractName)!.at(1),
      });
      // Object.fromEntries(instances)[APP_NAME]
    }
  );

  watcher.watchLatest<Array<[string, unknown]>>(
    [Kind.Data, 'published.agoricNames.brand'],
    brands => {
      console.log('Got brands', brands);
      useAppStore.setState({
        brands,
      });
    }
  );

  watcher.watchLatest<Array<[string, unknown]>>(
    [Kind.Data, 'published.agoricNames.issuer'],
    issuers => {
      console.log('Got issuers', issuers);
      useAppStore.setState({
        issuers,
      });
    }
  );
};

const connectWallet = async () => {
  await suggestChain('https://local.agoric.net/network-config');
  const wallet = await makeAgoricWalletConnection(watcher);
  useAppStore.setState({ wallet });
  console.log('wallet', wallet);
  const { pursesNotifier } = wallet;
  for await (const purses of subscribeLatest(pursesNotifier)) {
    console.log('got purses', purses);
    useAppStore.setState({ purses });
  }
};

const makeOffer = () => {
  const { wallet, contractInstance, brands, issuers } = useAppStore.getState();
  const istBrand = brands?.find(([name]) => name === 'IST')?.at(1);
  const istIssuer = issuers?.find(([name]) => name === 'IST')?.at(1);
  const bldBrand = brands?.find(([name]) => name === 'BLD')?.at(1);
  const bldIssuer = issuers?.find(([name]) => name === 'BLD')?.at(1);

  const value = makeCopyBag([
    ['FTX Arena', 2n],
    ['Crypto.com Arena', 1n],
  ]);

  // const give = { Price: { brand: istBrand, value: 15_000_000n } };
  const give = { Price: { brand: istBrand, value: 15_000_000n }, Fee: { brand: istBrand, value: 1_000_000n } };
  const want = { Value: { brand: bldBrand, value: 1_000_000n } };

  wallet?.makeOffer(
    {
      source: 'contract',
      instance: contractInstance,
      publicInvitationMaker: 'makeFirstInvitation',
      // HACK setup a trade
      invitationArgs: [[istIssuer, bldIssuer]],
    },
    { give, want },
    { addr: recipientAddr },
    (update: { status: string; data?: unknown }) => {
      if (update.status === 'error') {
        alert(`Offer error: ${update.data}`);
      }
      if (update.status === 'accepted') {
        alert('Offer accepted');
      }
      if (update.status === 'refunded') {
        alert('Offer rejected');
      }
    }
  );
};

function App() {
  useEffect(() => {
    setup();
  }, []);

  const { wallet, purses, contractInstance } = useAppStore(({ wallet, purses, contractInstance }) => ({
    wallet,
    purses,
    contractInstance,
  }));
  const istPurse = purses?.find(p => p.brandPetname === 'IST');
  const bldPurse = purses?.find(p => p.brandPetname === 'BLD');
  const invitationPurse = purses?.find(p => p.brandPetname === 'Invitation');
  console.log("INVITE PURSE", invitationPurse);
  const swaps: Invitation[] = [];
  const invites: Invitation[] = [];
  if (invitationPurse) {
    const rawInvites = invitationPurse?.currentAmount?.value as unknown as Array<Invitation> || [];
    for (const invite of rawInvites) {
      console.log('iHandle', invite.instance, contractInstance);
      (invite.instance === contractInstance ? swaps : invites).push(invite);
    }
  }

  console.log("INVITES", invites);

  const buttonLabel = wallet ? 'Make Offer' : 'Connect Wallet';
  const onClick = () => {
    if (wallet) {
      makeOffer();
    } else {
      connectWallet();
    }
  };

  return (
    <>
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
        <a href="https://agoric.com/develop" target="_blank">
          <img src={agoricLogo} className="logo agoric" alt="Agoric logo" />
        </a>
      </div>
      <h1>Vite + React + Agoric</h1>
      <div className="card">
        <div>
          {wallet && (
            <>
              <div>{wallet.address}</div>
              <h2 style={{ marginTop: 4, marginBottom: 4 }}>Purses</h2>
            </>
          )}
          <div style={{ textAlign: 'left' }}>
            {istPurse && (
              <div>
                <b>IST: </b>
                {stringifyAmountValue(
                  istPurse.currentAmount,
                  istPurse.displayInfo.assetKind,
                  istPurse.displayInfo.decimalPlaces
                )}
              </div>
            )}
            {bldPurse && (
              <div>
                <b>BLD: </b>
                {stringifyAmountValue(
                  bldPurse.currentAmount,
                  bldPurse.displayInfo.assetKind,
                  bldPurse.displayInfo.decimalPlaces
                )}
              </div>
            )}
            {wallet && invitationPurse && (
              <div>
                <b>Pending Swaps:  </b>
                {
                  swaps.length ? (
                    <ul style={{ marginTop: 0, textAlign: 'left' }}>
                      {swaps.map(
                        ({ description, customDetails }, index) => (
                          <li key={index}>
                            <b>{description}</b><br />
                            {JSON.stringify(customDetails, (k, v) => typeof v === 'bigint' ? `${v}` : v, 2)}
                          </li>
                        )
                      )}
                    </ul>
                  ) : (
                    'None'
                  )}
                <b>Invitations:  </b>
                {
                  invites.length ? (
                    <ul style={{ marginTop: 0, textAlign: 'left' }}>
                      {invites.map(
                        ({ description, customDetails }, index) => (
                          <li key={index}>
                            {description} {JSON.stringify(customDetails, (k, v) => typeof v === 'bigint' ? `${v}` : v)}
                          </li>
                        )
                      )}
                    </ul>
                  ) : (
                    'None'
                  )}
              </div>
            )}
          </div>
        </div>
        <button onClick={onClick}>{buttonLabel}</button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">Click on the logos to learn more</p>
    </>
  );
}

export default App;
