"use server";

import { redirect } from "next/navigation";

import { data, isCmsConfigured } from "@/data/cms0";

export async function submitContactForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || !email || !message) {
    redirect("/contact?sent=missing");
  }

  let created = false;

  if (isCmsConfigured) {
    try {
      await data.models.ContactSubmission.create({
        name,
        email,
        message,
        submittedAt: new Date().toISOString(),
        status: "new",
      });
      created = true;
    } catch {
      created = false;
    }
  }

  redirect(created ? "/contact?sent=1" : "/contact?sent=demo");
}
