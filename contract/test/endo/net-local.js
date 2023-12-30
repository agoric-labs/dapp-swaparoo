/**
 * Usage:
 * $ endo make --UNSAFE src/cosmosFetch.js -n cosmos-fetch
 * Object [Alleged: CosmosFetch] {}
 * $ endo make test/net-local.js -n local -p cosmos-fetch
 * { lcd: Object [Alleged: LCD] {}, rpc: Object [Alleged: RpcClient] {} }
 */
import { E } from '@endo/far';

const loc = {
  lcd: 'http://localhost:1317',
  rpc: 'http://localhost:26657',
};

export const make = async net => {
  const [lcd, rpc] = await Promise.all([
    E(net).makeLCDClient(loc.lcd),
    E(net).makeRPCClient(loc.rpc),
  ]);

  return harden({ lcd, rpc });
};
