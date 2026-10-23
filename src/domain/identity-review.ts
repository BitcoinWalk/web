import type {CityIdentityHealth,CityIdentityHealthCheck} from "../server/pro-city-identity-health";
/** Automated service checks are operational evidence, never approval requests. */
export function identityApprovalProblems(row:CityIdentityHealth):CityIdentityHealthCheck[]{
 return row.checks.filter(check=>check.key!=="nip05"&&check.key!=="lightning"&&check.state==="fail");
}
