// Resolves hosts through public DNS (1.1.1.1, 8.8.8.8) instead of the system resolver, for
// recording fixtures on networks whose DNS blocks sites (e.g. Indonesia's "Internet Positif"):
//
//   NODE_OPTIONS="--import $PWD/scripts/public-dns.mjs" MR_RECORD=1 pnpm test
import dns from 'node:dns';

const resolver = new dns.Resolver();
resolver.setServers(['1.1.1.1', '8.8.8.8']);
const systemLookup = dns.lookup;

dns.lookup = function lookup(hostname, options, callback) {
  if (typeof options === 'function') [callback, options] = [options, {}];
  if (typeof options === 'number') options = { family: options };
  if (hostname === 'localhost' || /^[\d.]+$|:/.test(hostname)) return systemLookup(hostname, options, callback);
  resolver.resolve4(hostname, (error, addresses) => {
    if (error || addresses.length === 0) return systemLookup(hostname, options, callback);
    if (options?.all)
      callback(
        null,
        addresses.map((address) => ({ address, family: 4 })),
      );
    else callback(null, addresses[0], 4);
  });
};
