import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({load: vi.fn(),cities:vi.fn()}));
vi.mock("../../../logos/serving", () => ({loadPublishedLogoPack: mocks.load}));
vi.mock("../../../server/share-preview",()=>({loadSharedCities:mocks.cities}));
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NOT_FOUND");},redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`);}}));
import CityLogoPage,{generateMetadata} from "./page";

describe("city logo download page", () => {
  beforeEach(() => {mocks.load.mockReset();mocks.cities.mockReset();mocks.cities.mockResolvedValue([{revision:{city:{cityId:"radom-id",slug:"radom",aliases:[]}}}]);});
  it("provides anonymous PNG and ZIP downloads, without a tier or signer gate", async () => {
    mocks.load.mockResolvedValue({jobKey:"a".repeat(64),slug: "radom", cityName: "Radom",publiclyListed:false, manifest:{archive: {name: "radom-logos.zip"}, files: [
      {name: "radom-bitcoinwalk-on-black.png", label: "Dark background", background: "dark", width: 775, height: 604},
    ]}});
    const rendered = renderToStaticMarkup(await CityLogoPage({params: Promise.resolve({city: "radom"})}));
    expect(rendered).toContain("Radom logo pack");
    expect(rendered).toContain("Basic and Pro");
    expect(rendered).toContain(`/api/city-logos/${"a".repeat(64)}/radom-logos.zip`);
    expect(rendered).toContain(`/api/city-logos/${"a".repeat(64)}/radom-bitcoinwalk-on-black.png`);
    expect(rendered).toContain('download=""');
    expect(rendered).not.toContain("Connect signer");
  });
  it("keeps free packs out of search and permits paid ready packs to be indexed",async()=>{mocks.load.mockResolvedValue({publiclyListed:false});expect((await generateMetadata({params:Promise.resolve({city:"radom"})})).robots).toEqual({index:false,follow:false});mocks.load.mockResolvedValue({publiclyListed:true});expect((await generateMetadata({params:Promise.resolve({city:"radom"})})).robots).toEqual({index:true,follow:true});});
  it("does not advertise a pack until its manifest is published", async () => {
    mocks.load.mockResolvedValue(null);
    await expect(CityLogoPage({params: Promise.resolve({city: "radom"})})).rejects.toThrow("NOT_FOUND");
  });
  it("redirects an approved alternative city name to the canonical logo URL",async()=>{
    mocks.cities.mockResolvedValue([{revision:{city:{cityId:"warszawa-id",slug:"warszawa",aliases:["Warsaw"]}}}]);
    await expect(CityLogoPage({params:Promise.resolve({city:"warsaw"})})).rejects.toThrow("REDIRECT:/warszawa/logo");
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
