import {redirect} from "next/navigation";

export default function ProSetupRedirect() {
  redirect("/admin/upgrade");
}
