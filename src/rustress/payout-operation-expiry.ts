export const MAXIMUM_NODE_TIMEOUT_MILLISECONDS=2_147_000_000;

/** Node timers are signed 32-bit millisecond values. Long operation grants are
 * rechecked in bounded chunks instead of overflowing into an immediate timer. */
export function payoutOperationExpiryDelay(expiresAt:number,nowMilliseconds=Date.now()){
 const remaining=expiresAt*1000-nowMilliseconds;
 return Math.min(MAXIMUM_NODE_TIMEOUT_MILLISECONDS,Math.max(1,remaining));
}
