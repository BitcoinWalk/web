import {describe,it} from "vitest";
import {runPayoutAcceptance,scenarios} from "../../scripts/payout-acceptance-fixture";

describe("complete fake-wallet flow through real HTTP journal and recovery",()=>{
 it.each(scenarios)("verifies %s",async scenario=>{await runPayoutAcceptance(scenario);});
});
