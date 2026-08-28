import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();

  if (user.roles.includes("org_admin")) redirect("/admin");
  if (user.roles.includes("auctioneer")) redirect("/auctioneer");
  if (user.roles.includes("owner")) redirect("/owner");
  redirect("/player");
}
