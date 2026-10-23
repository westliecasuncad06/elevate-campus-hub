import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { emailFromLink, parseRegistrationCode } from "@/lib/registration";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const params = await searchParams;
  // The invitation email's button links here with the address and the code filled in, so the person only presses Continue.
  const email = emailFromLink(typeof params.email === "string" ? params.email : undefined);
  const code = parseRegistrationCode(typeof params.code === "string" ? params.code : "") ?? "";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Brand className="mb-10" />
        <h1 className="text-3xl font-extrabold tracking-tight">Register</h1>
        <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
          {code
            ? "Your email and registration code are filled in. Press Continue, then tell us your name and choose a password."
            : "Enter the registration code from your invitation email. Next you'll tell us your name and choose a password."}
        </p>
        <RegisterForm email={email} code={code} />
        <p className="mt-6 text-sm text-muted-foreground">
          Already registered?{" "}
          <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
            Sign in
          </Link>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Lost the code, or it stopped working? Ask your Campus Head or IT to send you a new invitation.
        </p>
      </div>
    </main>
  );
}
