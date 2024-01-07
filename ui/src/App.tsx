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
  description: string;
  handle: unknown;
  instance: unknown;
  customDetails: { give: object, want: object };
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
  brands?: Map<string, unknown>;
  issuers?: Map<string, unknown>;
  purses?: Array<Purse>;
}

interface Amount {
  brandName: string;
  value: bigint;
}

interface FormState {
  recipient?: string;
  give?: object;
  want?: object;
}

const stringify = (arg) => {
  return JSON.stringify(arg, (_k, v) => typeof v === 'bigint' ? `${v}` : v, 2);
};

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
        brands: new Map(brands),
      });
    }
  );

  watcher.watchLatest<Array<[string, unknown]>>(
    [Kind.Data, 'published.agoricNames.issuer'],
    issuers => {
      console.log('Got issuers', issuers);
      useAppStore.setState({
        issuers: new Map(issuers),
      });
    }
  );
};

const Banner = () => (
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
    <h1>Vite + React + Agoric</h1>
  </div>
);

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

const ConnectWallet = () => (
  <div className="card">
    <button onClick={connectWallet}>Connect Wallet</button>
  </div>
);

const useForm = create<FormState>(() => ({
  recipient: recipientAddr,
  give: undefined,
  want: undefined,
}));

const setFirstOffer = ({ recipient = undefined }) => {
  console.log('ADDRESS', recipient);
  const { brands } = useAppStore.getState();

  const istBrand = brands?.get('IST');
  const bldBrand = brands?.get('BLD');

  useForm.setState({
    recipient,
    give: { Price: { brand: istBrand, value: 15_000_000n }, Fee: { brand: istBrand, value: 1_000_000n } },
    want: { Value: { brand: bldBrand, value: 1_000_000n } },
  });
};

const setMatchOffer = (invite: Invitation) => {
  const { give, want } = invite.customDetails;
  console.log('MATCH', give, want);
  // what if there isn't a Fee?
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { Fee, ...withoutFee } = give;
  useForm.setState({
    recipient: undefined,
    give: want,
    want: withoutFee,
  });
};


const makeSecondOffer = () => {
  const { wallet, contractInstance, } = useAppStore.getState();
  const { give, want } = useForm.getState();
  wallet?.makeOffer(
    {
      source: 'purse',
      instance: contractInstance,
      description: 'matchOffer'
    },
    { give, want },
    undefined,
    (update: { status: string; data?: unknown }) => {
      if (update.status === 'error') {
        alert(`Match offer error: ${update.data}`);
      }
      if (update.status === 'accepted') {
        alert('Match offer accepted');
      }
      if (update.status === 'refunded') {
        alert('Match offer rejected');
      }
    }
  );
};

const makeOffer = () => {
  const { wallet, contractInstance, } = useAppStore.getState();
  const { recipient, give, want } = useForm.getState();
  console.log('ADDRESS', recipient);

  wallet?.makeOffer(
    {
      source: 'contract',
      instance: contractInstance,
      publicInvitationMaker: 'makeFirstInvitation',
      // HACK setup a trade
      invitationArgs: [[]],
    },
    { give, want },
    { addr: recipient },
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

const BuildOffer = wallet => {
  const { purses, contractInstance } = useAppStore(({ purses, contractInstance }) => ({
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
  const { recipient, give, want } = useForm();

  return (
    <div className="card">
      <div>{wallet?.address}</div>
      <h2 style={{ marginTop: 4, marginBottom: 4 }}>Purses</h2>
      <div>
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
          {invitationPurse && (
            <div>
              <h4>Pending Swaps:  </h4>
              {
                swaps.length ? (
                  <ul style={{ marginTop: 0, textAlign: 'left' }}>
                    {swaps.map(
                      ({ description, customDetails }, index) => (
                        <li key={index}>
                          <b>{description}</b><br />
                          {stringify(customDetails)}
                        </li>
                      )
                    )}
                  </ul>
                ) : (
                  'None'
                )}
              <h4>Invitations:  </h4>
              {
                invites.length ? (
                  <ul style={{ marginTop: 0, textAlign: 'left' }}>
                    {invites.map(
                      ({ description, customDetails }, index) => (
                        <li key={index}>
                          {description} {stringify(customDetails)}
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
      <div style={{ textAlign: 'left' }}>
        <h4  >GIVE </h4>
        <p>
        </p>
        <h4 className="want" >WANT </h4>
        <p>
          {stringify(want) || 'Not yet provided'}
        </p>
        <br />
        <label className="address" >Address:
          <input
            type="text"
            value={recipient}
            onChange={(e) => useForm.setState({ recipient: e.target.value })}
            style={{ width: "30em" }}
          />
        </label>

        <br />
        {/* // select give asset
        // fill give amount (with max button?)
        // or drop down to select the notifier
        // select want asset
        // fill give amount
        // or text field to past a description */}
        <button onClick={() => setFirstOffer(useForm.getState())}>First Offer</button>
        <button onClick={() => makeOffer(useForm.getState())}>Make Offer</button>
        <br />
        <button onClick={() => setMatchOffer(swaps[0])} disabled={!swaps.length}>Match First</button>
        <button onClick={() => makeSecondOffer(useForm.getState())} disabled={!swaps.length}>Make Second Offer</button>
      </div>
    </div >
  );
};

const App = () => {
  useEffect(() => {
    setup();
  }, []);

  const wallet = useAppStore(state => state.wallet);

  return (
    <div>
      <Banner />
      {wallet ? (
        <BuildOffer />
      ) :
        <ConnectWallet />
      }
      <div>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">Click on the logos to learn more</p>
    </div>
  );
};

export default App;
