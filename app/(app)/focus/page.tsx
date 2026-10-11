import { redirect } from "next/navigation";

/** Old "Product Focus" link → LOB Target Fokus. */
export default function FocusIndex() {
  redirect("/focus/lob");
}
