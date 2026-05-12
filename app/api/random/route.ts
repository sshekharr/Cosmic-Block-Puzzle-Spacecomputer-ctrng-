import { NextResponse } from "next/server";
import { OrbitportSDK } from "@spacecomputer-io/orbitport-sdk-ts";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IPFS_BEACON_PATH = "/ipns/k2k4r8lvomw737sajfnpav0dpeernugnryng50uheyk1k39lursmn09f";
const ORBITPORT_AUTH_URL = "https://auth.spacecomputer.io/oauth/token";
const ORBITPORT_API_URL = "https://op.spacecomputer.io/api/v1/services/trng";

function buildSessionSeed(baseSeed: string): string {
  // API/IPFS can sometimes repeat a value for short periods; mix with local entropy per request.
  return crypto
    .createHash("sha256")
    .update(`${baseSeed}:${Date.now()}:${crypto.randomBytes(16).toString("hex")}`)
    .digest("hex");
}

async function getApiSeedFromOrbitport(): Promise<string | null> {
  const clientId = process.env.ORBITPORT_CLIENT_ID;
  const clientSecret = process.env.ORBITPORT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const tokenResponse = await fetch(ORBITPORT_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience: "https://op.spacecomputer.io/api",
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(3500),
  });

  if (!tokenResponse.ok) return null;
  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenData.access_token) return null;

  const trngResponse = await fetch(`${ORBITPORT_API_URL}?src=aptosorbital&src=derived`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
    signal: AbortSignal.timeout(3500),
  });

  if (!trngResponse.ok) return null;
  const trngData = (await trngResponse.json()) as { data?: string };
  return trngData.data ?? null;
}

export async function GET() {
  const sdk = new OrbitportSDK({
    config: {
      clientId: process.env.ORBITPORT_CLIENT_ID,
      clientSecret: process.env.ORBITPORT_CLIENT_SECRET,
      timeout: 15000,
      retryAttempts: 2,
      ipfs: {
        gateway: "https://ipfs.io",
        defaultBeaconPath: IPFS_BEACON_PATH,
      },
    },
  });

  try {
    const apiSeed = await getApiSeedFromOrbitport();
    if (apiSeed) {
      return NextResponse.json({
        seed: buildSessionSeed(apiSeed),
        source: "orbitport-api",
        usedFallback: false,
      });
    }

    const result = await sdk.ctrng.random();
    return NextResponse.json({
      seed: buildSessionSeed(result.data.data),
      source: result.data.src ?? "orbitport",
      usedFallback: false,
    });
  } catch {
    try {
      const ipfsResult = await sdk.ctrng.random({ src: "ipfs", index: 0 });
      return NextResponse.json({
        seed: buildSessionSeed(ipfsResult.data.data),
        source: "ipfs",
        usedFallback: true,
      });
    } catch {
      const fallbackSeed = crypto.randomBytes(32).toString("hex");
      return NextResponse.json({
        seed: fallbackSeed,
        source: "crypto",
        usedFallback: true,
      });
    }
  }
}
