import { db } from "@/lib/db";
import { requirePageUser } from "@/lib/current-user";
import { AccountForms } from "@/components/AccountForms";

export default async function AccountPage() {
  const me = await requirePageUser();
  const u = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  return (
    <>
      <h1>我的帳號</h1>
      <AccountForms email={u.email ?? ""} />
    </>
  );
}
