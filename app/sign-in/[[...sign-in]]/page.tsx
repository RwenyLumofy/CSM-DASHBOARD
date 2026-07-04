import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { Logo } from "@/components/brand/Logo";
import { authEnabled } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  if (!authEnabled()) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg p-8">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <Logo kind="primary-horizontal" height={30} />
          <p className="p-lead">Running in sample mode — authentication is disabled.</p>
          <Link href="/" className="font-body text-sm font-semibold text-sirius hover:underline">
            Enter the dashboard →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100dvh" }}>

      {/* LEFT — hero image */}
      <div style={{
        flex: "1 1 58%",
        minWidth: 0,
        background: "#0A0A0F url('/brand/login-hero.png') no-repeat center center",
        backgroundSize: "contain",
      }} />

      {/* Hover override for Clerk social button */}
      <style>{`
        .cl-socialButtonsBlockButton:hover {
          background-color: #0C0C0C !important;
          border-color: #0C0C0C !important;
        }
        .cl-socialButtonsBlockButton:hover .cl-socialButtonsBlockButtonText {
          color: #FFFFFF !important;
        }
      `}</style>

      {/* RIGHT — form */}
      <div style={{
        flex: "0 0 42%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 48px",
        position: "relative",
        overflow: "hidden",
        background: "#FFFFFF",
      }}>

        {/* Grid pattern — fades in from bottom */}
        <div aria-hidden="true" style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(33,91,234,0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(33,91,234,0.12) 1px, transparent 1px)
          `,
          backgroundSize: "72px 72px",
          maskImage: "linear-gradient(to top, black 0%, transparent 55%)",
          pointerEvents: "none",
        }} />

        {/* Card — very light gray */}
        <div style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 420,
          background: "#F6F7FA",
          borderRadius: "20px",
          boxShadow: "none",
          padding: "44px 40px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}>

          {/* Logo */}
          <div style={{ marginBottom: 8 }}>
            <Logo kind="primary-horizontal" height={32} />
          </div>

          {/* App label */}
          <p style={{
            fontFamily: "var(--font-body)",
            fontSize: "11px",
            fontWeight: 600,
            color: "#9AA0B4",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            margin: "0 0 32px",
          }}>
            Customer Success Dashboard
          </p>

          {/* Heading */}
          <h1 style={{
            fontFamily: "var(--font-body)",
            fontSize: "24px",
            fontWeight: 700,
            color: "#0C0C0C",
            margin: "0 0 6px",
            lineHeight: 1.2,
          }}>
            Welcome
          </h1>
          <p style={{
            fontFamily: "var(--font-body)",
            fontSize: "14px",
            color: "#6B7280",
            margin: "0 0 28px",
          }}>
            Sign in to your account to continue.
          </p>

          {/* Clerk sign-in */}
          <SignIn
            appearance={{
              layout: { socialButtonsVariant: "blockButton" },
              variables: {
                colorPrimary: "#215BEA",
                colorBackground: "#F6F7FA",
                colorText: "#0C0C0C",
                colorTextSecondary: "#6B7280",
                colorInputBackground: "#FFFFFF",
                colorInputText: "#0C0C0C",
                colorDanger: "#D14B6B",
                fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                borderRadius: "10px",
                fontSize: "14px",
                spacingUnit: "1rem",
              },
              elements: {
                rootBox: { width: "100%" },
                card: { boxShadow: "none", background: "transparent", padding: 0, margin: 0, width: "100%" },
                cardBox: { boxShadow: "none", width: "100%" },
                header: { display: "none" },
                headerTitle: { display: "none" },
                headerSubtitle: { display: "none" },
                footer: { display: "none" },
                dividerRow: { margin: "4px 0" },
                dividerLine: { background: "#E2E5EE" },
                dividerText: { color: "#9AA0B4", fontSize: "12px" },
                socialButtonsBlockButton: {
                  height: "50px",
                  background: "#215BEA",
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: "700",
                  fontSize: "15px",
                },
                socialButtonsBlockButtonText: {
                  color: "#FFFFFF",
                  fontWeight: "700",
                  fontSize: "15px",
                },
                formFieldLabel: { color: "#3A3F50", fontSize: "13px", fontWeight: "600", marginBottom: "5px" },
                formFieldInput: {
                  height: "46px",
                  background: "#FFFFFF",
                  border: "1.5px solid #E2E5EE",
                  borderRadius: "10px",
                  color: "#0C0C0C",
                  fontSize: "14px",
                },
                formFieldAction: { color: "#215BEA", fontSize: "12px", fontWeight: "600" },
                formButtonPrimary: {
                  height: "50px",
                  background: "#215BEA",
                  fontWeight: "700",
                  fontSize: "15px",
                  borderRadius: "10px",
                  boxShadow: "none",
                },
                identityPreviewEditButton: { color: "#215BEA" },
                formResendCodeLink: { color: "#215BEA" },
              },
            }}
          />
          {/* No account message */}
          <p style={{
            fontFamily: "var(--font-body)",
            fontSize: "13px",
            color: "#6B7280",
            margin: "20px 0 0",
            lineHeight: 1.6,
          }}>
            Don&apos;t have an account? Contact{" "}
            <a href="mailto:melrweny@lumofy.com" style={{ color: "#215BEA", fontWeight: 600, textDecoration: "none" }}>
              melrweny@lumofy.com
            </a>
            {" "}to get access.
          </p>
        </div>
      </div>
    </div>
  );
}
