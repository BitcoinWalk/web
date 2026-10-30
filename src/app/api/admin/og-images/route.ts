import { createHash } from "node:crypto";
import type { Event } from "nostr-tools";
import { ogCompositionSchema } from "../../../../domain/og-composer";
import { parseMediaRequest } from "../../../../domain/media-request";
import { serverReadRelays } from "../../../../lib/server-relay-config";
import { isSuperAdmin } from "../../../../nostr/authority";
import {
  loadCalendarWalks,
  retainedCalendarHero,
} from "../../../../nostr/calendar-records";
import {
  querySponsorCatalogue,
  sponsorCatalogueEntries,
} from "../../../../nostr/sponsor-catalogue";
import { OpenAIImageGenerator } from "../../../../server/image-generator";
import {
  assertOgGenerationBudget,
  importOgCitySource,
  importOgSource,
  listSavedOg,
  readOwnedOgSource,
  readSavedOg,
  renderAndSaveOg,
  storeOgSource,
} from "../../../../server/og-composer-store";

export const runtime = "nodejs",
  dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const failure = (error: unknown, status = 400) =>
  Response.json(
    {
      error:
        error instanceof Error ? error.message : "OG image request failed.",
    },
    { status, headers },
  );
function authorized(event: Event | undefined) {
  const command = event && parseMediaRequest(event);
  if (!event || !command || !isSuperAdmin(event.pubkey))
    throw new Error("Signed super-admin authorization required.");
  return { actor: event.pubkey, command };
}

export async function POST(request: Request) {
  try {
    const type = request.headers.get("content-type") || "";
    if (type.startsWith("multipart/form-data")) {
      const declared = Number(request.headers.get("content-length") || 0);
      if (declared > 10.5 * 1024 * 1024)
        return failure(
          new Error("Image uploads must be 10 MB or smaller."),
          413,
        );
      const form = await request.formData(),
        raw = form.get("event"),
        file = form.get("file");
      if (typeof raw !== "string" || !(file instanceof File))
        return failure(new Error("Signed image upload required."), 401);
      const event = JSON.parse(raw) as Event,
        { actor, command } = authorized(event);
      if (command.action !== "og-studio-upload")
        return failure(new Error("Invalid upload authorization."), 403);
      if (file.size !== command.bytes || file.type !== command.mime)
        throw new Error("The selected file does not match the signed upload.");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== command.sha256)
        throw new Error("The selected file changed before upload.");
      return Response.json(
        await storeOgSource(bytes, { source: "upload" }, actor),
        { headers },
      );
    }
    const body = (await request.json()) as { event?: Event },
      { actor, command } = authorized(body.event);
    if (command.action === "og-studio-list") {
      const relays=serverReadRelays(),
        [entries,cityRead]=await Promise.all([
          querySponsorCatalogue(relays).then(sponsorCatalogueEntries),
          loadCalendarWalks(relays).then(walks=>({available:true,walks}),()=>({available:false,walks:[]})),
        ]),walks=cityRead.walks;
      return Response.json(
        {
          items: await listSavedOg(actor),
          entries: entries.map((entry) => ({
            pubkey: entry.pubkey,
            displayName: entry.displayName,
            website: entry.website,
            logoHash: entry.logoHash,
            approvalEventId: entry.approvalEventId,
            url: `/api/sponsors/logo/files/${entry.logoHash}`,
          })),
          cities: walks.flatMap((walk) => {
            const heroImageUrl=retainedCalendarHero(walk);
            return heroImageUrl?[{
              cityId:walk.revision.city.cityId,
              cityName:walk.revision.city.cityName,
              slug:walk.revision.city.slug,
              revisionId:walk.revision.event.id,
              approvalId:walk.approval.event.id,
              heroImageUrl,
            }]:[];
          }),
          cityPhotosAvailable:cityRead.available,
        },
        { headers },
      );
    }
    if (command.action === "og-studio-read") {
      const item = await readSavedOg(actor, command.id);
      return item
        ? Response.json({ item }, { headers })
        : failure(new Error("Saved composition not found."), 404);
    }
    if (command.action === "og-studio-source") {
      const source = await readOwnedOgSource(actor, command.hash);
      return source
        ? Response.json(source, { headers })
        : failure(new Error("Saved source not found."), 404);
    }
    if (command.action === "og-studio-import")
      return Response.json(await importOgSource(command.sourceUrl, actor), {
        headers,
      });
    if(command.action === "og-studio-city-background"){
      const walk=(await loadCalendarWalks(serverReadRelays())).find(row=>
        row.revision.city.cityId===command.cityId&&
        row.revision.event.id===command.revisionId&&
        row.approval.event.id===command.approvalId
      ),heroImageUrl=walk&&retainedCalendarHero(walk);
      if(!walk||!heroImageUrl)throw new Error("This city's approved image changed. Refresh the city photo library and choose it again.");
      return Response.json(await importOgCitySource(heroImageUrl,actor,{
        cityId:walk.revision.city.cityId,
        cityName:walk.revision.city.cityName,
        revisionId:walk.revision.event.id,
        approvalId:walk.approval.event.id,
      }),{headers});
    }
    if (command.action === "og-studio-generate") {
      await assertOgGenerationBudget(actor);
      const generated = await new OpenAIImageGenerator().generateOgBackground(
        command.prompt,
      );
      return Response.json(
        await storeOgSource(
          generated.bytes,
          {
            source: "generated",
            prompt: command.prompt,
            model: generated.model,
          },
          actor,
        ),
        { headers },
      );
    }
    if (command.action === "og-studio-render") {
      const composition = ogCompositionSchema.parse(command.composition);
      if (composition.logo?.source === "catalogue") {
        const approved = sponsorCatalogueEntries(
          await querySponsorCatalogue(serverReadRelays()),
        ).find(
          (entry) =>
            entry.logoHash === composition.logo?.hash &&
            entry.approvalEventId === composition.logo?.approvalEventId,
        );
        if (!approved)
          throw new Error(
            "Choose artwork from the current approved sponsor catalogue.",
          );
      }
      return Response.json(
        {
          item: await renderAndSaveOg(
            actor,
            composition,
          ),
        },
        { headers },
      );
    }
    return failure(new Error("This OG image action is not available."), 403);
  } catch (error) {
    return failure(error, error instanceof SyntaxError ? 400 : 403);
  }
}
