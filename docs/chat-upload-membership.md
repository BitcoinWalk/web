# Chat upload membership rollout

Image uploads remain available with the existing signed-command and size/rate checks
while `BITCOINWALK_CHAT_UPLOAD_MEMBERSHIP` is unset. This compatibility mode does
**not** enforce membership; the audit finding remains open until rollout completes.

## Coordinated activation

1. Deploy the relay endpoint `/api/chat/upload-authorization` to each intended
   chat relay. Dedicated and combined relay modes both register it. Forward that
   exact path in the relay's HTTPS proxy to its existing loopback chat listener.
   Staging and London example proxy files are updated in the relay repository;
   shared and other city production proxy configurations require separate review.
2. Verify a current member succeeds, a nonmember and removed member fail, and
   the returned event ID matches the submitted signed upload event. No roster,
   new credential, model call or image upload is needed for these checks.
3. Deploy the web application and set `BITCOINWALK_CHAT_UPLOAD_RELAYS` to a JSON
   array of the exact trusted `wss://` relay origins (root slash is optional).
   Include every supported city relay, not a wildcard. Each must have public
   IPv4 DNS and valid HTTPS on port 443. IPv6-only relays are not supported yet.
4. Set `BITCOINWALK_CHAT_UPLOAD_MEMBERSHIP=required` in staging first. Test a real
   upload, removal, relay outage, and unchanged text chat. Enable in production
   only after explicit rollout approval. Missing/invalid configuration, DNS,
   timeout, redirect, oversized/malformed response, or non-approval blocks storage.

The web app pins a public IPv4 lookup to the HTTPS connection, verifies TLS for
the approved hostname, and never follows redirects. Checks have a five-second
deadline, eight concurrent slots, and a 4 KiB response bound. Relay admission
has eight slots, 16 KiB request bodies, a five-second read deadline, 120 requests
per minute globally and 20 per authenticated author. Limits reset on restart.
The public endpoint's shared budget can be exhausted by outsiders, temporarily
pausing uploads in required mode. This bounds verification work but is not an
availability guarantee; monitor denials and review proxy-level admission before
wide rollout. Never bypass membership checks to recover capacity.

## Semantics and limitations

The original kind-27235 upload command binds the author, relay, group, image hash,
MIME type and byte count. Both services verify it. The relay checks its current
membership and ban state on every request; successful checks are never cached.
Removal between this check and storage cannot be made atomic across services:
an already admitted upload may finish. Existing image URLs remain public, as
before; this is upload authorization, not private image retrieval.

The signed command can be reused during its existing five-minute freshness
window, but each reuse checks current membership and existing upload rate limits.
This change does not claim to implement durable replay protection or complete
all aspects of M-04.

If enforcement is unhealthy, keep it enabled and repair the relay/proxy. Unsetting
it restores the known vulnerable compatibility behavior and needs an explicit
operator decision. Never silently fall back after failed authorization.

The existing production web Caddy example's 1 MB body limit is lower than the
API's 5 MB image allowance. Review the deployed upload-specific proxy limit
separately; this patch does not change global proxy limits.
