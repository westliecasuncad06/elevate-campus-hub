import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { emailFromLink } from "@/lib/registration";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const params = await searchParams;
  // The invitation email links here with the address filled in, so only the code is left to type.
  const email = emailFromLink(typeof params.email === "string" ? params.email : undefined);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <Brand className="mb-10" />
        <h1 className="text-3xl font-extrabold tracking-tight">Register</h1>
        <p className="mt-1.5 mb-6 text-sm text-muted-foreground">
          Enter the registration code from your invitation email. Next you&apos;ll tell us your name and choose a password.
        </p>
        <RegisterForm email={email} />
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
