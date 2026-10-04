import {z} from "zod";
export const FEATURE_FLAGS_KIND=30308;
export const FEATURE_FLAGS_ID="bitcoinwalk-feature-flags";
export const featureFlagsSchema=z.object({paidTierRegistration:z.boolean(),featuredCityWalks:z.boolean().default(false),sponsorships:z.boolean().default(false),previousRevisionId:z.string().regex(/^[0-9a-f]{64}$/).optional()});
export type FeatureFlags=z.infer<typeof featureFlagsSchema>;
export type FeatureFlagsInput=z.input<typeof featureFlagsSchema>;
export const DEFAULT_FEATURE_FLAGS:FeatureFlags={paidTierRegistration:false,featuredCityWalks:false,sponsorships:false};
