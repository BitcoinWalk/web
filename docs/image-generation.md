# Managed city image generation

City landscape generation is an optional super-admin action during review. The
browser signs a short-lived request, the server re-reads the exact city revision,
and only then sends a prompt derived from the signed city name and meeting pin to
the configured provider. A generated image is never published automatically.

The first provider is OpenAI GPT Image. `BITCOINWALK_IMAGE_MODEL` defaults to
`gpt-image-2.5-flare-2026-09-08`; the provider is isolated behind `ImageGenerator` so it can
later be replaced or benchmarked against another hosted or self-hosted model.
The API key is read from `OPENAI_API_KEY_FILE`, supplied by a systemd credential,
and is never present in the release archive, browser bundle, Nostr event or media
manifest.

Generated output is decoded, limited to 10 MB, validated by Sharp, resized to
1536×1024, converted to metadata-free WebP, SHA-256 addressed, and stored in the
existing persistent managed-media directory. Approval stores that internal URL
in the signed decision. Rejecting a city does not publish the generated image.

Controls:

- only the configured BitcoinWalk super-admin may request generation;
- the exact signed city revision and UUID must still exist on the relay;
- one generation runs per app process at a time;
- default maximum is 10 generated images across the service per rolling 24 hours;
- default maximum is five per signing identity per rolling 24 hours;
- the budget is checked before the paid provider request and again before storage;
- provider failures and invalid output do not approve or alter the city;
- accepted files participate in the existing integrity audit and fallback chain.

`BITCOINWALK_IMAGE_DAILY_LIMIT` can lower the global default. Raising it should be
an explicit operational decision accompanied by an OpenAI project budget alert.

## Staging acceptance

1. Install the API credential and staging release without printing the key.
2. Open a new-city request as the super-admin and choose **Generate realistic city landscape**. The inline panel must immediately show signer/generation progress.
3. Approve the signed request and confirm a preview appears without publishing the city.
4. Confirm city approval is disabled until the inline preview displays a managed image. Reject an unsuitable result and generate a replacement, or paste and explicitly import an external image URL.
5. Approve the city and confirm its first walk uses the selected managed image.
6. Run the media audit and confirm the generated file has no alert.
7. Confirm an organizer, host and anonymous visitor cannot call the generation endpoint.
