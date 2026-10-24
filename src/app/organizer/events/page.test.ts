import {createElement} from "react";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import OrganizerEventsPage from "./_screen";

describe("organizer events landing view",()=>{
  it("leaves the single Walks page title to the containing module",()=>{
    const html=renderToStaticMarkup(createElement(OrganizerEventsPage));
    expect(html).not.toContain("<h1>Walks</h1>");
    expect(html).not.toContain("Scheduled walks");
    expect(html).not.toContain("City profile and permissions");
    expect(html).not.toContain("Occurrence schedule");
    expect(html).not.toContain("Preview occurrences");
  });
  it("offers the shared walk status views to every connected role",()=>{
    const source=readFileSync(new URL("./_screen.tsx",import.meta.url),"utf8");
    expect(source).toContain('aria-label="Filter walks"');
    expect(source).toContain('["all","next","upcoming","past"]');
    expect(source).toContain('value==="next"?"Next Walk"');
    expect(source).toContain("className={sponsorStyles.statusToggle}");
    expect(source.indexOf('aria-label="Filter walks"')).toBeLessThan(source.indexOf("{message&&"));
    expect(source).not.toContain('aria-label="Filter walks by status"');
  });
  it("edits published walks in a full-screen modal with persistent actions",()=>{
    const source=readFileSync(new URL("./_screen.tsx",import.meta.url),"utf8");
    const styles=readFileSync(new URL("./walk-image-editor.module.css",import.meta.url),"utf8");
    expect(source).toContain('role="dialog" aria-modal="true" aria-labelledby="walk-edit-title"');
    expect(source).toContain('className={imageStyles.footer}');
    expect(source).toContain('>Cancel</button><button className={imageStyles.primary}');
    expect(source).toContain('"Sign and save changes"');
    expect(source).not.toContain("Edit this published walk</legend><label>Date");
    expect(styles).toContain("grid-template-rows:auto minmax(0,1fr) auto");
    expect(styles).toContain("overflow-y:auto;overscroll-behavior:contain");
  });
  it("lets a published walk use an uploaded hero for its page and sharing preview",()=>{
    const source=readFileSync(new URL("./_screen.tsx",import.meta.url),"utf8");
    expect(source).toContain(">Hero and sharing image</h3>");
    expect(source).toContain('<ImageUploadButton label="Upload hero image"');
    expect(source).toContain('uploadPublishedWalkImage(file,editingPublishedRow.walk.revision.city.cityId,"hero")');
    expect(source).toContain("JPEG, PNG or WebP up to 5 MB");
    expect(source).toContain("Use city hero instead");
    expect(source.indexOf('id="walk-sharing-image-heading"')).toBeLessThan(source.indexOf('id="walk-page-image-heading"'));
  });
  it("previews selected walk images and keeps upload feedback beside the control",()=>{
    const source=readFileSync(new URL("./_screen.tsx",import.meta.url),"utf8");
    const publicPage=readFileSync(new URL("../../../components/walk-event.tsx",import.meta.url),"utf8");
    expect(source).toContain("URL.createObjectURL(file)");
    expect(source).toContain("editImagePreview.content||editContentImageUrl");
    expect(source).toContain("editImageFeedback.content.error?imageStyles.inlineError:imageStyles.inlineStatus");
    expect(source).toContain("Sign and save changes to publish it below the walk description.");
    expect(source).toContain("editContentImageUrlRef.current=result.url");
    expect(source).toContain("contentImageUrl=editContentImageUrlRef.current.trim()");
    expect(source).toContain("<form noValidate");
    expect(publicPage.indexOf("calendarContentImage(event)&&")).toBeGreaterThan(publicPage.indexOf("<WalkDescriptions"));
    expect(publicPage.indexOf("calendarContentImage(event)&&")).toBeLessThan(publicPage.indexOf("<SponsorModule"));
  });
  it("guides new walks through searchable details, schedule, preview and signing",()=>{
    const source=readFileSync(new URL("./_screen.tsx",import.meta.url),"utf8");
    const styles=readFileSync(new URL("./walk-image-editor.module.css",import.meta.url),"utf8");
    expect(source).toContain('type AddWalkStep="details"|"schedule"|"preview"|"sign"');
    expect(source).toContain('<CityFinder items={walks.filter');
    expect(source).toContain('aria-label="Add a walk progress"');
    expect(source).toContain('className={`${imageStyles.modal} ${imageStyles.createModal}`}');
    expect(source).toContain('>Continue to schedule</AdminButton>');
    expect(source).toContain('>Preview occurrences</AdminButton>');
    expect(source).toContain('>Continue to sign</AdminButton>');
    expect(source).toContain('disabled={index>current} aria-current=');
    expect(source).toContain('"Sign and publish selected"');
    expect(source).toContain('preview.length?"Save for later":"Cancel"');
    expect(styles).toContain(".steps{display:grid;grid-template-columns:repeat(4,1fr)");
    expect(styles).toContain(".createModal{grid-template-rows:auto auto minmax(0,1fr) auto}");
    expect(styles).toContain(".footerSpacer{flex:1}");
  });
  it("retains the selected walk view in the URL and restores it on back",()=>{
    const source=readFileSync(new URL("./_screen.tsx",import.meta.url),"utf8");
    expect(source).toContain('searchParams.get("view")');
    expect(source).toContain('window.addEventListener("popstate",sync)');
    expect(source).toContain('url.searchParams.set("view",value)');
    expect(source).toContain('window.history.pushState');
  });
});
