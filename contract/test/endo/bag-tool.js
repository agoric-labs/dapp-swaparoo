// @ts-check
import { Far } from '@endo/far';
import { getCopyBagEntries, makeCopyBag } from '@endo/patterns';
import { AmountMath } from '@agoric/ertp/src/amountMath.js';

export const make = () =>
  Far('BagTool', {
    /**
     * @param {Amount<'copyBag'>} amt
     * @param  {number[]} targets
     */
    pick: (amt, ...targets) =>
      AmountMath.make(
        amt.brand,
        makeCopyBag(
          getCopyBagEntries(amt.value).filter((_, ix) => targets.includes(ix)),
        ),
      ),
  });
