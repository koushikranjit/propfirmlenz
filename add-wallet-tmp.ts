import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  adminUserRoles,
  adminUsers,
  blockchainNetworks,
  blockchainTokens,
  propFirms,
  roles,
  trackedWalletTokens,
  trackedWallets,
} from "@/lib/db/schema";
import { ROLES } from "@/lib/auth/permissions";
import { createFirm } from "@/lib/services/firm-admin";
import { saveTrackedWallet } from "@/lib/services/payout-admin";

const ADDRESS = "TMXkM8DthsJc9xVW9GPWvmJsGLkz7fnLfQ";
const db = getDb();

const [admin] = await db
  .select({ id: adminUsers.id, email: adminUsers.email })
  .from(adminUsers)
  .innerJoin(adminUserRoles, eq(adminUserRoles.adminUserId, adminUsers.id))
  .innerJoin(roles, eq(roles.id, adminUserRoles.roleId))
  .where(and(eq(roles.key, ROLES.MASTER_ADMIN), isNull(adminUsers.deletedAt)))
  .limit(1);
if (!admin) throw new Error("no master admin");
console.log("acting as:", admin.email);

// 1. The firm. Name only — every other field stays empty rather than invented.
let [firm] = await db
  .select({ id: propFirms.id })
  .from(propFirms)
  .where(and(eq(propFirms.name, "SharkFunded"), isNull(propFirms.deletedAt)))
  .limit(1);

if (!firm) {
  const created = await createFirm(db, {
    adminUserId: admin.id,
    input: { name: "SharkFunded", slug: "sharkfunded", description: null },
  });
  firm = { id: created.id };
  console.log("created firm SharkFunded (draft, unpublished)");
} else {
  console.log("firm SharkFunded already exists");
}

const [network] = await db
  .select({ id: blockchainNetworks.id })
  .from(blockchainNetworks)
  .where(eq(blockchainNetworks.key, "tron"))
  .limit(1);
if (!network) throw new Error("TRON network not configured");

// 2. The wallet. purpose = unknown, because nobody has shown me evidence that
//    this address pays traders — see the note in the report.
const existing = await db
  .select({ id: trackedWallets.id })
  .from(trackedWallets)
  .where(eq(trackedWallets.addressNormalized, ADDRESS))
  .limit(1);

let walletId: string;
if (existing[0]) {
  walletId = existing[0].id;
  console.log("wallet already tracked");
} else {
  const saved = await saveTrackedWallet(db, {
    adminUserId: admin.id,
    input: {
      propFirmId: firm.id,
      networkId: network.id,
      address: ADDRESS,
      label: "SharkFunded TRON wallet",
      purpose: "unknown",
      verificationStatus: "unverified",
      notes: null,
      isActive: true,
    },
  });
  walletId = saved.id;
  console.log("wallet recorded");
}

// 3. Track it for TRON USDT, the one configured TRC-20 stablecoin.
const [usdt] = await db
  .select({ id: blockchainTokens.id, symbol: blockchainTokens.symbol })
  .from(blockchainTokens)
  .where(
    and(
      eq(blockchainTokens.networkId, network.id),
      eq(blockchainTokens.isEnabled, true),
    ),
  )
  .limit(1);
if (usdt) {
  await db
    .insert(trackedWalletTokens)
    .values({ walletId, tokenId: usdt.id })
    .onConflictDoNothing();
  console.log("tracking token:", usdt.symbol);
}
console.log("walletId:", walletId);
